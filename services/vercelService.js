import axios from 'axios';
import dotenv from "dotenv";
dotenv.config();

export const deploy = async (repoName) => {
  try {
    console.log('🚀 Initiating Vercel deployment for repo:', repoName);

    const response = await axios.post(
      'https://api.vercel.com/v13/deployments',
      {
        name: repoName,
        gitRepository: {
          type: 'github',
          repoId: `${process.env.GITHUB_USERNAME}/${repoName}`,
          ref: 'main',
        },
        target: 'production',
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Vercel deployment successful:', response.data.url);
    return `https://${response.data.url}`;
  } catch (error) {
    console.error('❌ Vercel deployment error:', error.response?.data || error.message);
    throw new Error(`Vercel deployment failed: ${error.response?.data?.message || error.message}`);
  }
};
