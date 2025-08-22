// db.js
import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_API_BASE_URL = process.env.MONGODB_API_BASE_URL || 'https://cloud.mongodb.com/api/atlas/v1.0';
const MONGODB_PUBLIC_KEY = process.env.MONGODB_PUBLIC_KEY;
const MONGODB_PRIVATE_KEY = process.env.MONGODB_PRIVATE_KEY;
const MONGODB_GROUP_ID = process.env.MONGODB_GROUP_ID;

export const createMongoDBCluster = async (userId, projectId) => {
  try {
    if (!MONGODB_PUBLIC_KEY || !MONGODB_PRIVATE_KEY || !MONGODB_GROUP_ID) {
      throw new Error('MongoDB Atlas credentials are missing');
    }

    const clusterName = `ecommerce-${userId}-${projectId}`;
    const auth = Buffer.from(`${MONGODB_PUBLIC_KEY}:${MONGODB_PRIVATE_KEY}`).toString('base64');

    // Create cluster
    const clusterResponse = await axios.post(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters`,
      {
        name: clusterName,
        providerSettings: {
          providerName: 'AWS',
          regionName: 'US_EAST_1',
          instanceSizeName: 'M0',
        },
        autoScaling: { diskGBEnabled: false },
        backupEnabled: false,
        clusterType: 'REPLICASET',
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Create database user
    const dbUserResponse = await axios.post(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/databaseUsers`,
      {
        databaseName: 'admin',
        username: `user-${userId}-${projectId}`,
        password: `pass-${Date.now()}`,
        roles: [{ roleName: 'readWrite', databaseName: 'ecommerce' }],
      },
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const clusterUri = `mongodb+srv://${dbUserResponse.data.username}:${dbUserResponse.data.password}@${clusterName}.mongodb.net/ecommerce?retryWrites=true&w=majority`;
    return clusterUri;
  } catch (error) {
    console.error('Error creating MongoDB cluster:', error.response?.data || error.message);
    throw new Error(`Failed to create MongoDB cluster: ${error.response?.data?.error || error.message}`);
  }
};

export const connectToUserDB = async (mongoUri) => {
  try {
    const userDB = await mongoose.createConnection(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to user MongoDB database');
    return userDB;
  } catch (error) {
    console.error('Error connecting to user MongoDB:', error.message);
    throw error;
  }
};

export const deleteMongoDBCluster = async (userId, projectId) => {
  try {
    const clusterName = `ecommerce-${userId}-${projectId}`;
    const auth = Buffer.from(`${MONGODB_PUBLIC_KEY}:${MONGODB_PRIVATE_KEY}`).toString('base64');

    await axios.delete(`${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters/${clusterName}`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    console.log(`Successfully deleted MongoDB cluster: ${clusterName}`);
  } catch (error) {
    console.error('Error deleting MongoDB cluster:', error.response?.data || error.message);
    throw new Error(`Failed to delete MongoDB cluster: ${error.response?.data?.error || error.message}`);
  }
};

export const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to main MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw error;
  }
};