import { embedText, cosineSimilarity } from '../utils/embeddingUtils.js';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import dotenv, { config } from 'dotenv';
dotenv.config();
const cache = new NodeCache({ stdTTL: 3600 });

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'your-free-api-key';

let chunks = [];
let chunkEmbeddings = [];
let isInitialized = false;

export const initializePDFData = (loadedChunks, loadedEmbeddings) => {
  chunks = loadedChunks;
  chunkEmbeddings = loadedEmbeddings;
  isInitialized = true;
  console.log(`PDF data initialized with ${chunks.length} chunks`);
};

export const getChatResponse = async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'System is initializing, please try again shortly' });
    }

    const { message } = req.body;
    const cacheKey = `question:${message}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log('Serving from cache');
      return res.json(cached);
    }
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Invalid message format' });
    }

    // Embed the question and find relevant chunks
    const questionEmbeddingArr = await embedText([message]);
    const questionEmbedding = questionEmbeddingArr[0];
    
    const MIN_SIMILARITY = 0.3;
    const similarities = chunkEmbeddings.map((e, idx) => ({
      score: cosineSimilarity(e, questionEmbedding),
      index: idx
    }));

    const relevantChunks = similarities
      .filter(item => item.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (relevantChunks.length === 0) {
      const noMatchResponse = { 
        answer: "I couldn't find relevant information to answer that question in my documents.",
        context: null
      };
      cache.set(cacheKey, noMatchResponse);
      return res.json(noMatchResponse);
    }

    // Generate response using DeepSeek API
    try {
      const retrievedTexts = relevantChunks.map(item => chunks[item.index]).join('\n\n---\n\n');
      
      const response = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { 
              role: 'system', 
              content: `Answer concisely based only on the provided context. 
                       If the answer isn't in the context, say "I don't know".` 
            },
            { 
              role: 'user', 
              content: `Context:\n${retrievedTexts}\n\nQuestion: ${message}`
            }
          ],
          max_tokens: 150,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`);
      }

      const completion = await response.json();
      const answer = completion.choices[0]?.message?.content || "I couldn't generate an answer.";
      const responseData = { answer, context: retrievedTexts };
      cache.set(cacheKey, responseData);
      return res.json(responseData);
      
    } catch (apiError) {
      console.error('API Error:', apiError);
      
      // Fallback to local chunks when API fails
      const mostRelevantChunk = chunks[relevantChunks[0].index];
      const fallbackResponse = {
        answer: "Here's the most relevant information I found in my documents:",
        context: mostRelevantChunk.substring(0, 500) + (mostRelevantChunk.length > 500 ? "..." : "")
      };
      cache.set(cacheKey, fallbackResponse);
      return res.json(fallbackResponse);
    }
  } catch (error) {
    console.error('Error in getChatResponse:', error);
    return res.status(500).json({ 
      error: 'Error processing your question',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};