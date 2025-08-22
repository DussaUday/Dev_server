// index.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import multer from 'multer';
import authRoutes from './routes/auth.js';
import portfolioRoutes from './routes/portfolio.js';
import chatRoutes from './routes/chatRoutes.js';
import { embedText, cosineSimilarity } from './utils/embeddingUtils.js';
import { initializePDFData } from './controllers/chatController.js';
import ecommerceRoutes from './routes/ecommerce.js';
import { loadPdfAndChunk } from './utils/pdfUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const server = http.createServer(app);
const pdfPath = path.join(process.cwd(), 'pdfs', 'DevCraftz_Overview.pdf');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All origins are allowed
const allowedOrigins = [
  'https://dev-craftz.github.io/',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://portfolio-website-tau-azure.vercel.app',
  process.env.FRONTEND_URL,
];

// REMOVE CORS RESTRICTIONS
const corsOptions = {
  origin: '*', // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allow these methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow these headers
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const buildPath = path.join(__dirname, '../client/build');
app.use(express.static(buildPath));

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'GITHUB_TOKEN', 'VERCEL_TOKEN', 'GITHUB_USERNAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

async function initializeServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    console.log('📄 Loading PDF and generating embeddings...');
    const chunks = await loadPdfAndChunk(pdfPath);
    console.log(`Loaded ${chunks.length} text chunks from PDF`);
    if (chunks.length > 0) {
      console.log('Sample chunk:', chunks[0].substring(0, 100) + '...');
    }
    const embeddings = await embedText(chunks);
    console.log(`Generated ${embeddings.length} embeddings`);
    initializePDFData(chunks, embeddings);
    console.log('✅ PDF loaded and embeddings ready!');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/ecommerce', ecommerceRoutes);

  app.get('/', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });

  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log('New client connected');
    socket.on('chatMessage', (msg) => {
      io.emit('message', msg);
    });
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

initializeServer();