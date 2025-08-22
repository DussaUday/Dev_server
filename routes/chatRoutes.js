import express from 'express';
import { getChatResponse } from '../controllers/chatController.js';
import rateLimit from 'express-rate-limit';
const router = express.Router();
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
router.post('/predict', getChatResponse);

export default router;
