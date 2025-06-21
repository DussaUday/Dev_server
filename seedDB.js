import mongoose from 'mongoose';
import Intent from './models/Intent.js';
import intents from './intents.json' assert { type: 'json' };
import dotenv from 'dotenv';
dotenv.config();
mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB connected for seeding'))
  .catch(err => console.error('MongoDB connection error:', err.message, err.stack));

const seedDB = async () => {
  try {
    await Intent.deleteMany({});
    await Intent.insertMany(intents.intents);
    console.log('Database seeded!');
  } catch (err) {
    console.error('Error seeding database:', err.message, err.stack);
  } finally {
    mongoose.connection.close();
  }
};

seedDB();