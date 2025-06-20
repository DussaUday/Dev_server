import express from 'express';
import getChatResponse from '../controllers/chatController.js';

const router = express.Router();

router.post('/predict', getChatResponse);

export default router;