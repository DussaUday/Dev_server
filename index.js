// index.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import http from 'http';
import authRoutes from './routes/auth.js';
import portfolioRoutes from './routes/portfolio.js';
import chatRoutes from './routes/chatRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Allow CORS origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://portfolio-website-tau-azure.vercel.app',
  process.env.FRONTEND_URL,
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Environment variable validation
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'GITHUB_TOKEN', 'VERCEL_TOKEN', 'GITHUB_USERNAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/chat', chatRoutes);

// Socket.IO config
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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
