import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_PUBLIC_KEY = process.env.MONGODB_PUBLIC_KEY;
const MONGODB_PRIVATE_KEY = process.env.MONGODB_PRIVATE_KEY;
const MONGODB_GROUP_ID = process.env.MONGODB_GROUP_ID;
const MONGODB_API_BASE_URL = process.env.MONGODB_API_BASE_URL || 'https://cloud.mongodb.com/api/atlas/v2.0';

const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Authorization': `Basic ${Buffer.from(`${MONGODB_PUBLIC_KEY}:${MONGODB_PRIVATE_KEY}`).toString('base64')}`,
});

export const createMongoDBCluster = async (userId, projectId) => {
  try {
    if (!MONGODB_PUBLIC_KEY || !MONGODB_PRIVATE_KEY || !MONGODB_GROUP_ID) {
      throw new Error('MongoDB Atlas credentials are missing');
    }

    const clusterName = `ecommerce-${userId}-${projectId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    console.log(`Creating MongoDB Atlas cluster: ${clusterName}`);

    // Check if cluster already exists
    const existingClusters = await axios.get(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters`,
      { headers: getAuthHeaders() }
    );
    if (existingClusters.data.results.some(cluster => cluster.name === clusterName)) {
      throw new Error(`Cluster ${clusterName} already exists`);
    }

    // Create cluster
    const clusterResponse = await axios.post(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters`,
      {
        name: clusterName,
        providerSettings: {
          providerName: 'AWS',
          regionName: 'US_EAST_1',
          instanceSize: 'M10',
        },
        clusterType: 'REPLICASET',
        backupEnabled: false,
        diskSizeGB: 10,
      },
      { headers: getAuthHeaders() }
    );

    if (clusterResponse.status !== 201) {
      throw new Error(`Failed to create cluster: ${clusterResponse.data?.error || 'Unknown error'}`);
    }

    // Wait for cluster to be ready (poll status)
    let clusterStatus = 'CREATING';
    const maxRetries = 30;
    let retries = 0;

    while (clusterStatus !== 'IDLE' && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      const statusResponse = await axios.get(
        `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters/${clusterName}`,
        { headers: getAuthHeaders() }
      );
      clusterStatus = statusResponse.data.stateName;
      console.log(`Cluster ${clusterName} status: ${clusterStatus}`);
      retries++;
    }

    if (clusterStatus !== 'IDLE') {
      throw new Error('Cluster creation timed out');
    }

    // Create database user
    const dbUser = `user-${projectId}`.replace(/[^a-zA-Z0-9]/g, '');
    const dbPassword = Math.random().toString(36).slice(-12); // Stronger password
    const userResponse = await axios.post(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/databaseUsers`,
      {
        databaseName: 'admin',
        username: dbUser,
        password: dbPassword,
        roles: [{ roleName: 'readWrite', databaseName: 'ecommerce' }],
      },
      { headers: getAuthHeaders() }
    );

    if (userResponse.status !== 201) {
      throw new Error(`Failed to create database user: ${userResponse.data?.error || 'Unknown error'}`);
    }

    // Configure IP access list (allow all IPs for simplicity)
    await axios.post(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/accessList`,
      [{ ipAddress: '0.0.0.0/0', comment: 'Allow all IPs for ecommerce' }],
      { headers: getAuthHeaders() }
    );

    // Get connection string from cluster response
    const clusterDetails = await axios.get(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters/${clusterName}`,
      { headers: getAuthHeaders() }
    );
    const clusterUri = clusterDetails.data.srvAddress.replace(
      'mongodb+srv://',
      `mongodb+srv://${encodeURIComponent(dbUser)}:${encodeURIComponent(dbPassword)}@`
    ) + '/ecommerce?retryWrites=true&w=majority';

    console.log(`MongoDB cluster created: ${clusterName}, URI: ${clusterUri}`);
    return clusterUri;
  } catch (error) {
    console.error('MongoDB cluster creation error:', error.message, error.response?.data, error.stack);
    throw new Error(`Failed to create MongoDB cluster: ${error.message}`);
  }
};

export const connectToUserDB = async (mongoUri) => {
  try {
    const connection = await mongoose.createConnection(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log('Connected to user MongoDB database');
    return connection;
  } catch (error) {
    console.error('MongoDB connection error:', error.message, error.stack);
    throw new Error(`Failed to connect to MongoDB: ${error.message}`);
  }
};

export const deleteMongoDBCluster = async (userId, projectId) => {
  try {
    const clusterName = `ecommerce-${userId}-${projectId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    console.log(`Deleting MongoDB Atlas cluster: ${clusterName}`);

    await axios.delete(
      `${MONGODB_API_BASE_URL}/groups/${MONGODB_GROUP_ID}/clusters/${clusterName}`,
      { headers: getAuthHeaders() }
    );

    console.log(`Successfully deleted MongoDB cluster: ${clusterName}`);
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Cluster not found, assuming already deleted: ${clusterName}`);
    } else {
      console.error('MongoDB cluster deletion error:', error.message, error.response?.data, error.stack);
      throw new Error(`Failed to delete MongoDB cluster: ${error.message}`);
    }
  }
};