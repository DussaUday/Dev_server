import { loadPdfAndChunk } from './pdfLoader.js';
import { embedText, cosineSimilarity } from './embeddingUtils.js';
import path from 'path';
import OpenAI from 'openai';
const openai = new OpenAI();

const pdfPath = path.join(process.cwd(), 'pdfs', 'DevCraftz_Overview.pdf');
console.log('PDF Path:', pdfPath);
let chunks = [];
let chunkEmbeddings = [];

// Load and embed at startup
(async () => {
  chunks = await loadPdfAndChunk(pdfPath);
  chunkEmbeddings = await embedText(chunks);
  console.log('PDF loaded and embeddings generated!');
})();

export default async function getResponse(userQuestion) {
  // Embed the question
  const questionEmbeddingArr = await embedText([userQuestion]);
  const questionEmbedding = questionEmbeddingArr[0];

  // Find top 3 relevant chunks
  const similarities = chunkEmbeddings.map(chunkEmbedding => cosineSimilarity(chunkEmbedding, questionEmbedding));
  const topIndexes = similarities
    .map((sim, idx) => ({ sim, idx }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 3)
    .map(item => item.idx);

  const retrievedTexts = topIndexes.map(idx => chunks[idx]).join('\n\n');

  // Generate final answer using OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. Answer user questions using the following context from a PDF file.`
      },
      {
        role: 'user',
        content: `Context:\n${retrievedTexts}\n\nQuestion:\n${userQuestion}`
      }
    ]
  });

  return completion.choices[0].message.content;
}
