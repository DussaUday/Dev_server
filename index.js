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
import ecommerceRoutes from './routes/ecommerce.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { initWhatsApp, getWhatsAppStatus, sendWhatsAppText, getCurrentQR, getQRCodeURL } from './services/whatsappService.js'; // Import all WhatsApp functions

dotenv.config();

const app = express();
const server = http.createServer(app);
const pdfPath = path.join(process.cwd(), 'pdfs', 'DevCraftz_Overview.pdf');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize WhatsApp
initWhatsApp();

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'GITHUB_TOKEN', 'VERCEL_TOKEN', 'GITHUB_USERNAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Missing environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ecommerce', ecommerceRoutes);

// WhatsApp QR Code routes
app.get('/api/whatsapp/qr', (req, res) => {
  const status = getWhatsAppStatus();
  const qrCode = getCurrentQR();
  
  if (qrCode) {
    const qrUrl = getQRCodeURL();
    
    res.json({
      status: 'QR_AVAILABLE',
      message: 'Scan this QR code with WhatsApp',
      qrUrl: qrUrl,
      instructions: [
        '1. Open WhatsApp on your phone',
        '2. Tap Menu → Linked Devices → Link a Device',
        '3. Scan the QR code',
        '4. Or open this URL on your phone: ' + qrUrl
      ],
      timestamp: new Date().toISOString()
    });
  } else if (status.isReady) {
    res.json({
      status: 'AUTHENTICATED',
      message: 'WhatsApp is already connected and ready',
      timestamp: new Date().toISOString()
    });
  } else {
    res.json({
      status: 'NO_QR',
      message: 'No QR code available. Please check server logs.',
      timestamp: new Date().toISOString()
    });
  }
});

// WhatsApp status endpoint
app.get('/api/whatsapp/status', (req, res) => {
  const status = getWhatsAppStatus();
  
  res.json({
    whatsapp: {
      isReady: status.isReady,
      isConnected: status.isConnected,
      hasQR: status.hasQR,
      qrUrl: status.qrUrl,
      authenticationRequired: status.authenticationRequired
    },
    server: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// Test WhatsApp connection
app.post('/api/whatsapp/test', async (req, res) => {
  try {
    const { phone = '916304478845', message } = req.body;
    
    const testMessage = message || `✅ Test message from DevCraftz Server\nTime: ${new Date().toLocaleString()}\nServer: ${process.env.NODE_ENV || 'development'}`;
    
    const result = await sendWhatsAppText(phone, testMessage);
    
    res.json({
      success: result.success,
      message: result.success ? 'Test message sent successfully' : 'Failed to send message',
      error: result.error,
      recipient: phone,
      timestamp: new Date().toISOString(),
      status: getWhatsAppStatus()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: getWhatsAppStatus()
    });
  }
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
