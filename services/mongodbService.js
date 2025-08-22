import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

export const createMongoDBCluster = async (userId, projectId) => {
  try {
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    const dbName = `ecommerce-${userId}-${projectId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    console.log(`Creating MongoDB database: ${dbName}`);

    // Create a connection URI for the new database
    const clusterUri = MONGO_URI.replace(/\/[^?]+/, `/${dbName}`) + '?retryWrites=true&w=majority';

    // Test connection to ensure the database is accessible
    const testConnection = await mongoose.createConnection(clusterUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    // Create required collections and indexes
    await createCollections(testConnection);

    await testConnection.close();

    console.log(`MongoDB database created: ${dbName}, URI: ${clusterUri}`);
    return clusterUri;
  } catch (error) {
    console.error('MongoDB database creation error:', {
      message: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to create MongoDB database: ${error.message}`);
  }
};

async function createCollections(connection) {
  // Users collection
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  });
  userSchema.index({ email: 1 });
  connection.model('User', userSchema);

  // Products collection
  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
    createdAt: { type: Date, default: Date.now },
  });
  connection.model('Product', productSchema);

  // Orders collection
  const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true, min: 0 },
    }],
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'processing', 'shipped', 'delivered'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
  });
  connection.model('Order', orderSchema);

  // Cart collection
  const cartSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
      quantity: { type: Number, required: true, min: 1 },
    }],
    updatedAt: { type: Date, default: Date.now },
  });
  connection.model('Cart', cartSchema);

  console.log('Created all required collections and indexes');
}

export const connectToUserDB = async (mongoUri) => {
  try {
    const connection = await mongoose.createConnection(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log('Connected to user MongoDB database');
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', {
      message: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to connect to MongoDB: ${error.message}`);
  }
};

export const deleteMongoDBCluster = async (userId, projectId) => {
  try {
    const dbName = `ecommerce-${userId}-${projectId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    console.log(`Deleting MongoDB database: ${dbName}`);

    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    const connection = await mongoose.createConnection(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    // Drop the database
    await connection.dropDatabase();
    await connection.close();
    console.log(`Successfully deleted MongoDB database: ${dbName}`);
  } catch (error) {
    console.error('MongoDB database deletion error:', {
      message: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to delete MongoDB database: ${error.message}`);
  }
};