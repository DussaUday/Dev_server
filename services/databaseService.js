import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String },
  whatsapp: { type: String },
  isAdmin: { type: Boolean, default: false },
  address: {
    fullName: { type: String },
    phone: { type: String },
    address: { type: String },
    city: { type: String },
    zip: { type: String },
   country: { type: String },
  },
});

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [{
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  }],
  updatedAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String, required: true },
  items: [
    {
      productId: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true, min: 1 },
    },
  ],
  total: { type: Number, required: true },
  phone: { type: String, required: true },
 address: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
  },
}, { timestamps: true });

// Corrected function to generate a consistent database name
const generateDbName = (userId, projectId) => {
  const shortUserId = userId.substring(userId.length - 6);
 const shortProjectId = projectId.substring(0, 8);
 return `ecom-${shortUserId}-${shortProjectId}`;
};

export async function createMongoDBCluster(userId, projectId) {
  try {
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
   }

    const dbName = generateDbName(userId, projectId);
   console.log(`Creating MongoDB database: ${dbName}`);

    const queryIndex = MONGO_URI.indexOf('?');
    const baseUri = (queryIndex !== -1) ? MONGO_URI.substring(0, queryIndex) : MONGO_URI;
   const query = (queryIndex !== -1) ? MONGO_URI.substring(queryIndex) : '';
    const newBaseUri = baseUri.endsWith('/') ? baseUri.slice(0, -1) : baseUri;
   const mongoUri = `${newBaseUri}/${dbName}${query}`;

    const connection = await mongoose.createConnection(mongoUri);

    connection.model('User', userSchema);
    connection.model('Cart', cartSchema);
    connection.model('Order', orderSchema);

    await connection.close();
   console.log(`MongoDB database created: ${dbName}, URI: ${mongoUri}`);
    return { mongoUri };
 } catch (error) {
    console.error('Error creating MongoDB cluster:', error);
    const errorMessage = error.errorResponse?.errmsg || error.message;
   throw new Error(errorMessage);
  }
}

export async function connectToEcommerceDB(mongoUri) {
  try {
    const connection = await mongoose.createConnection(mongoUri);
   connection.model('User', userSchema);
    connection.model('Cart', cartSchema);
    connection.model('Order', orderSchema);

    return connection;
  } catch (error) {
    console.error('Error connecting to e-commerce database:', error);
   throw new Error('Failed to connect to e-commerce database');
  }
}

export const deleteMongoDBCluster = async (userId, projectId) => {
  try {
    const dbName = generateDbName(userId, projectId);

    console.log(`Deleting MongoDB database: ${dbName}`);
    if (!MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
   }

    const queryIndex = MONGO_URI.indexOf('?');
    const baseUri = (queryIndex !== -1) ? MONGO_URI.substring(0, queryIndex) : MONGO_URI;
   const query = (queryIndex !== -1) ? MONGO_URI.substring(queryIndex) : '';
    const newBaseUri = baseUri.endsWith('/') ? baseUri.slice(0, -1) : baseUri;
   const dbUriToDelete = `${newBaseUri}/${dbName}${query}`;

    const connection = await mongoose.createConnection(dbUriToDelete);
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