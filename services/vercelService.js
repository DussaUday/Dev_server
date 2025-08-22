import axios from 'axios';
import dotenv from "dotenv";
dotenv.config();

export const deployToVercel = async (repoName, repoId) => {
  try {
    console.log(`🚀 Initiating Vercel deployment for repo: ${repoName} (ID: ${repoId})`);
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId) throw new Error('VERCEL_TEAM_ID is not set in the .env file.');

    const response = await axios.post(
      `https://api.vercel.com/v13/deployments?teamId=${teamId}`,
      {
        name: repoName,
        gitSource: {
          type: 'github',
          repoId: repoId,
          ref: 'main',
        },
        projectSettings: {
          framework: 'create-react-app',
          buildCommand: 'npm run build',
          outputDirectory: 'build',
          installCommand: 'npm install',
          rootDirectory: './',
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

    const deploymentUrl = `https://${response.data.url}`;
    console.log('✅ Vercel deployment initiated. URL:', deploymentUrl);
    return deploymentUrl;

  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error('❌ Vercel deployment error:', errorMessage);
    throw new Error(`Vercel deployment failed: ${errorMessage}`);
  }
};

export const deleteVercelProject = async (projectName) => {
  try {
    console.log(`🗑️ Deleting Vercel project: ${projectName}`);
    const teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId) throw new Error('VERCEL_TEAM_ID is not set in the .env file.');

    await axios.delete(
      `https://api.vercel.com/v9/projects/${projectName}?teamId=${teamId}`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } }
    );

    console.log(`✅ Vercel project ${projectName} deleted successfully.`);
  } catch (error) {
    if (error.response?.status !== 404) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error(`❌ Vercel project deletion error: ${errorMessage}`);
      throw new Error(`Vercel project deletion failed: ${errorMessage}`);
    } else {
      console.log(`🔶 Vercel project ${projectName} not found. Assuming it was already deleted.`);
    }
  }
};