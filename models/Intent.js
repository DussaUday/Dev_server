import mongoose from 'mongoose';

const intentSchema = new mongoose.Schema({
  category: String,
  topic: String,
  tags: [String],
  answer: String
});

export default mongoose.model('Intent', intentSchema);