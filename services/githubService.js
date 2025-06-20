import { Octokit } from '@octokit/core';
import dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const createRepoAndDeploy = async (userId, templateId, htmlContent, existingRepoUrl = null) => {
  let repoName, owner, repoUrl, githubPagesUrl;

  try {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not set in environment variables');
    }

    console.log('Checking GitHub token and rate limit...');
    const { data: rateLimit } = await octokit.request('GET /rate_limit');
    if (rateLimit.resources.core.remaining === 0) {
      throw new Error(`GitHub API rate limit exceeded. Resets at ${new Date(rateLimit.resources.core.reset * 1000).toISOString()}`);
    }

    console.log('Fetching authenticated user info...');
    const { data: user } = await octokit.request('GET /user').catch(err => {
      throw new Error(`Failed to fetch user info: ${err.message} (Status: ${err.status})`);
    });
    owner = user.login;

    if (existingRepoUrl) {
      const urlMatch = existingRepoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!urlMatch) {
        throw new Error(`Invalid repository URL: ${existingRepoUrl}`);
      }
      owner = urlMatch[1];
      repoName = urlMatch[2];
      repoUrl = existingRepoUrl;
      console.log(`Using existing repository: ${owner}/${repoName}`);
    } else {
      repoName = `portfolio-${userId}-${Date.now()}`;
      console.log('Creating GitHub repo:', repoName);
      const repo = await octokit.request('POST /user/repos', {
        name: repoName,
        private: false,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }).catch(err => {
        throw new Error(`Failed to create repository: ${err.message} (Status: ${err.status})`);
      });
      repoUrl = repo.data.html_url;
    }

    let sha;
    try {
      const { data: fileData } = await octokit.request('GET /repos/{owner}/{repo}/contents/index.html', {
        owner,
        repo: repoName,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      });
      sha = fileData.sha;
    } catch (err) {
      if (err.status !== 404) {
        throw new Error(`Failed to fetch index.html: ${err.message} (Status: ${err.status})`);
      }
    }

    console.log(`Pushing index.html to repo: ${repoName}${sha ? ' (updating)' : ''}`);
    await octokit.request('PUT /repos/{owner}/{repo}/contents/index.html', {
      owner,
      repo: repoName,
      path: 'index.html',
      message: sha ? 'Update portfolio content' : 'Initial portfolio commit',
      content: Buffer.from(htmlContent).toString('base64'),
      sha,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    }).catch(err => {
      throw new Error(`Failed to push index.html: ${err.message} (Status: ${err.status})`);
    });

    let workflowSha;
    try {
      const { data: workflowData } = await octokit.request('GET /repos/{owner}/{repo}/contents/.github/workflows/pages.yml', {
        owner,
        repo: repoName,
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      });
      workflowSha = workflowData.sha;
    } catch (err) {
      if (err.status !== 404) {
        throw new Error(`Failed to fetch workflow file: ${err.message} (Status: ${err.status})`);
      }
    }

    const workflowContent = `
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
    - uses: actions/checkout@v4
    - name: Setup Pages
      uses: actions/configure-pages@v5
    - name: Upload artifact
      uses: actions/upload-pages-artifact@v3
      with:
        path: .
    - name: Deploy to GitHub Pages
      id: deployment
      uses: actions/deploy-pages@v4
`;

    console.log(`Pushing GitHub Actions workflow to repo: ${repoName}${workflowSha ? ' (updating)' : ''}`);
    await octokit.request('PUT /repos/{owner}/{repo}/contents/.github/workflows/pages.yml', {
      owner,
      repo: repoName,
      path: '.github/workflows/pages.yml',
      message: workflowSha ? 'Update GitHub Pages workflow' : 'Add GitHub Pages workflow',
      content: Buffer.from(workflowContent).toString('base64'),
      sha: workflowSha,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    }).catch(err => {
      throw new Error(`Failed to push workflow file: ${err.message} (Status: ${err.status})`);
    });

    if (!existingRepoUrl) {
      console.log('Enabling GitHub Pages for repo:', repoName);
      await octokit.request('POST /repos/{owner}/{repo}/pages', {
        owner,
        repo: repoName,
        source: { branch: 'main', path: '/' },
        headers: { 'X-GitHub-Api-Version': '2022-11-28' },
      }).catch(err => {
        if (err.status !== 409) {
          throw new Error(`Failed to enable GitHub Pages: ${err.message} (Status: ${err.status})`);
        }
      });
    }

    githubPagesUrl = `https://${owner.toLowerCase()}.github.io/${repoName}/`;
    console.log('GitHub Pages URL:', githubPagesUrl);

    return {
      repoUrl,
      githubPagesUrl,
      deploymentNote: 'GitHub Pages may take a few minutes to deploy. Check the repository Actions tab for status.',
    };
  } catch (error) {
    console.error('GitHub error:', error.message, error.stack);
    throw new Error(`Failed to create or update repo: ${error.message}`);
  }
};

export const deleteRepo = async (repoUrl) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN is not set in environment variables');
    }

    console.log('Checking GitHub token and rate limit for deletion...');
    const { data: rateLimit } = await octokit.request('GET /rate_limit');
    if (rateLimit.resources.core.remaining === 0) {
      throw new Error(`GitHub API rate limit exceeded. Resets at ${new Date(rateLimit.resources.core.reset * 1000).toISOString()}`);
    }

    const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) {
      throw new Error(`Invalid repository URL: ${repoUrl}`);
    }
    const owner = urlMatch[1];
    const repo = urlMatch[2];

    console.log(`Deleting GitHub repo: ${owner}/${repo}`);
    await octokit.request('DELETE /repos/{owner}/{repo}', {
      owner,
      repo,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    }).catch(err => {
      throw new Error(`Failed to delete repository: ${err.message} (Status: ${err.status})`);
    });

    console.log(`Successfully deleted repo: ${owner}/${repo}`);
  } catch (error) {
    console.error('GitHub deletion error:', error.message, error.stack);
    throw new Error(`Failed to delete repo: ${error.message}`);
  }
};