
// server/models/Portfolio.js
import mongoose from 'mongoose';

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  templateId: {
    type: String,
    required: true,
  },
  components: {
    type: Object,
    required: true,
  },
  profilePicUrl: {
    type: String,
    default: null,
  },
  githubRepo: {
    type: String,
    default: null,
  },
  githubPagesUrl: {
    type: String,
    default: null,
  },
  repoUrl: { type: String },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model('Portfolio', portfolioSchema);