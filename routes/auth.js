import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import emailjs from '@emailjs/nodejs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import dns from 'dns';
import { Agent } from 'https';

// Initialize dotenv
dotenv.config();

// Force IPv4 for DNS resolution and HTTP requests
dns.setDefaultResultOrder('ipv4first');

// Create HTTPS agent to enforce IPv4 and increase timeout
const httpsAgent = new Agent({
  family: 4, // Force IPv4
  timeout: 10000, // 10 seconds timeout
});

// Initialize EmailJS with public and private keys
emailjs.init({
  publicKey: process.env.EMAILJS_PUBLIC_KEY,
  privateKey: process.env.EMAILJS_PRIVATE_KEY,
});

const router = express.Router();

// OTP storage (in production, use Redis or database)
const otpStore = new Map();

// Generate OTP
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

// Retry function for EmailJS send
const sendWithRetry = async (serviceId, templateId, templateParams, retries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Log templateParams for debugging
      console.log(`Attempt ${attempt} templateParams:`, JSON.stringify(templateParams, null, 2));
      const response = await emailjs.send(serviceId, templateId, templateParams, {
        httpsAgent, // Use custom HTTPS agent
      });
      console.log(`OTP sent successfully on attempt ${attempt}:`, response);
      return response;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message, error);
      if (attempt === retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

// Send OTP via EmailJS
// Send OTP via EmailJS
const sendOTPEmail = async (email, otp) => {
  try {
    // Validate and normalize email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new Error('Invalid or missing email address');
    }
    const normalizedEmail = email.trim().toLowerCase();
    console.log('Normalized email:', normalizedEmail);

    // Calculate expiration time (15 minutes as per the template)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    const formattedTime = expiresAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    await sendWithRetry(
      process.env.EMAILJS_SERVICE_ID,
      process.env.EMAILJS_TEMPLATE_ID,
      {
        to_email: normalizedEmail,
        recipient_email: normalizedEmail,
        email: normalizedEmail,
        user_email: normalizedEmail,
        to: normalizedEmail,
        passcode: otp, // Match the {{passcode}} placeholder in the template
        time: formattedTime, // Match the {{time}} placeholder in the template
      }
    );
  } catch (error) {
    console.error('Failed to send OTP:', error.message, JSON.stringify(error, null, 2));
    throw new Error(`Failed to send OTP: ${error.message}`);
  }
};

// Initiate Signup - Send OTP
router.post('/signup/initiate', async (req, res) => {
  const { email } = req.body;

  try {
    // Log request body for debugging
    console.log('Signup request body:', req.body);

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Generate and store OTP
    const otp = generateOTP();
    otpStore.set(email.trim().toLowerCase(), { otp, purpose: 'signup', expiresAt: Date.now() + 300000 }); // 5 minutes expiry

    // Send OTP
    await sendOTPEmail(email.trim().toLowerCase(), otp);

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error('Signup initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate signup' });
  }
});

// Verify OTP and Complete Signup
router.post('/signup/verify', async (req, res) => {
  const { email, otp, password } = req.body;

  try {
    // Validate inputs
    if (!email || !otp || !password) {
      return res.status(400).json({ error: 'Email, OTP, and password are required' });
    }

    // Check OTP
    const normalizedEmail = email.trim().toLowerCase();
    const storedOtpData = otpStore.get(normalizedEmail);
    if (!storedOtpData || storedOtpData.otp !== otp || storedOtpData.purpose !== 'signup') {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check expiry
    if (Date.now() > storedOtpData.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Create user
    const user = new User({ email: normalizedEmail, password });
    await user.save();

    // Generate token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    // Cleanup OTP
    otpStore.delete(normalizedEmail);

    res.status(201).json({ token });
  } catch (error) {
    console.error('Signup verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Login (no OTP required)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '3h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    res.status(400).json({ error: error.message });
  }
});

// Initiate Password Reset - Send OTP
router.post('/password-reset/initiate', async (req, res) => {
  const { email } = req.body;

  try {
    // Log request body for debugging
    console.log('Password reset request body:', req.body);

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Check if user exists
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate and store OTP
    const otp = generateOTP();
    otpStore.set(email.trim().toLowerCase(), { otp, purpose: 'password-reset', expiresAt: Date.now() + 300000 }); // 5 minutes expiry

    // Send OTP
    await sendOTPEmail(email.trim().toLowerCase(), otp);

    res.status(200).json({ message: 'OTP sent to email' });
  } catch (error) {
    console.error('Password reset initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate password reset' });
  }
});

// Verify OTP and Reset Password
router.post('/password-reset/verify', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Validate inputs
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    // Check OTP
    const normalizedEmail = email.trim().toLowerCase();
    const storedOtpData = otpStore.get(normalizedEmail);
    if (!storedOtpData || storedOtpData.otp !== otp || storedOtpData.purpose !== 'password-reset') {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Check expiry
    if (Date.now() > storedOtpData.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ error: 'OTP expired' });
    }

    // Update password
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    // Cleanup OTP
    otpStore.delete(normalizedEmail);

    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;