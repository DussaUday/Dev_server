import mongoose from 'mongoose';

const ecommerceSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  templateId: { type: String, required: true },
  components: { type: String, required: true },
  logoUrl: { type: String },
  htmlContent: { type: String, required: true }, // Stores the HTML template string
  githubRepo: { type: String },
  githubPagesUrl: { type: String },
  mongoUri: { type: String, required: true },
  projectId: { type: String, required: true },
}, { timestamps: true });

export default mongoose.model('Ecommerce', ecommerceSchema);

