import { pipeline } from '@xenova/transformers';

let embedder;

const loadEmbedder = async () => {
  if (!embedder) {
    console.log('⏳ Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ Embedding model loaded!');
  }
  return embedder;
};

export const embedText = async (texts) => {
  const embedderInstance = await loadEmbedder();
  const embeddings = [];
  for (const text of texts) {
    const output = await embedderInstance(text, { pooling: 'mean', normalize: true });
    embeddings.push(output.data);
  }
  return embeddings;
};

export const cosineSimilarity = (vecA, vecB) => {
  const dot = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
};