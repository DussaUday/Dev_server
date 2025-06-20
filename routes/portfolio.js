import express from 'express';
import jwt from 'jsonwebtoken';
import Portfolio from '../models/Portfolio.js';
import { createRepoAndDeploy, deleteRepo } from '../services/githubService.js';

const router = express.Router();

router.use(express.json({ limit: '5mb' }));

router.post('/create', async (req, res) => {
  console.log('Received POST /api/portfolio/create with body:', {
    templateId: req.body.templateId,
    profilePicUrl: req.body.profilePicUrl,
    componentsLength: req.body.components?.length,
    htmlContentLength: req.body.htmlContent?.length,
  });

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', { userId: decoded.userId });
    } catch (err) {
      console.log('Invalid token:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { templateId, components, profilePicUrl, resumeUrl, htmlContent } = req.body;
    if (!templateId || !components || !htmlContent) {
      console.log('Missing required fields:', { templateId, components, htmlContent });
      return res.status(400).json({ error: 'Missing required fields: templateId, components, htmlContent' });
    }

    if (typeof htmlContent !== 'string' || htmlContent.length < 100) {
      console.log('Invalid htmlContent: too short or not a string');
      return res.status(400).json({ error: 'Invalid htmlContent: must be a non-empty string' });
    }

    const imgTags = htmlContent.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/g) || [];
    const imgTagCount = imgTags.length;
    const imgUrls = imgTags.map(tag => tag.match(/src=["']([^"']+)["']/)[1]);
    console.log('htmlContent snippet:', htmlContent.slice(0, 500) + '...');
    console.log('Number of <img> tags:', imgTagCount);
    console.log('Image URLs in htmlContent:', imgUrls);

    let parsedComponents;
    try {
      parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
    } catch (err) {
      console.log('Invalid components JSON:', err.message);
      return res.status(400).json({ error: 'Invalid components JSON format' });
    }

    if (!parsedComponents.name || !parsedComponents.bio || !parsedComponents.email) {
      console.log('Required component fields missing:', parsedComponents);
      return res.status(400).json({ error: 'Name, bio, and email are required in components' });
    }

    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeObject);
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        } else if (typeof value === 'object') {
          sanitized[key] = sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    const sanitizedComponents = sanitizeObject(parsedComponents);

    const portfolio = new Portfolio({
      userId: decoded.userId,
      templateId,
      components: sanitizedComponents,
      profilePicUrl,
      resumeUrl,
      htmlContent, // Save htmlContent in the database
    });

    try {
      await portfolio.save();
      console.log('Portfolio saved to MongoDB:', { id: portfolio._id, userId: portfolio.userId });
    } catch (err) {
      console.error('MongoDB save error:', err.message);
      return res.status(500).json({ error: 'Failed to save portfolio to database' });
    }

    let repoUrl, githubPagesUrl, deploymentNote;
    try {
      const deployResult = await createRepoAndDeploy(decoded.userId, templateId, htmlContent);
      repoUrl = deployResult.repoUrl;
      githubPagesUrl = deployResult.githubPagesUrl;
      deploymentNote = deployResult.deploymentNote;
      console.log('GitHub repo created and deployed:', { repoUrl, githubPagesUrl });
    } catch (err) {
      console.error('GitHub deployment error:', err.message);
      await Portfolio.findByIdAndDelete(portfolio._id); // Rollback portfolio creation
      return res.status(500).json({ error: `Failed to deploy to GitHub Pages: ${err.message}` });
    }

    try {
      portfolio.githubRepo = repoUrl;
      portfolio.githubPagesUrl = githubPagesUrl;
      await portfolio.save();
      console.log('Portfolio updated with githubRepo:', { id: portfolio._id, githubRepo: repoUrl });
    } catch (err) {
      console.error('MongoDB update error:', err.message);
      return res.status(500).json({ error: 'Failed to update portfolio with GitHub details' });
    }

    res.status(201).json({
      message: 'Portfolio created successfully',
      portfolioId: portfolio._id,
      repoUrl,
      githubPagesUrl,
      deploymentNote,
    });
  } catch (error) {
    console.error('Error in /api/portfolio/create:', error.message, error.stack);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const portfolios = await Portfolio.find({ userId: decoded.userId });
    res.status(200).json(portfolios);
  } catch (error) {
    console.error('Error fetching portfolios:', error.message);
    res.status(500).json({ error: 'Failed to fetch portfolios' });
  }
});

router.put('/:id', async (req, res) => {
  console.log('Received PUT /api/portfolio/:id with body:', {
    id: req.params.id,
    templateId: req.body.templateId,
    profilePicUrl: req.body.profilePicUrl,
    componentsLength: req.body.components?.length,
    htmlContentLength: req.body.htmlContent?.length,
    repoUrl: req.body.repoUrl,
  });

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', { userId: decoded.userId });
    } catch (err) {
      console.log('Invalid token:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { templateId, components, profilePicUrl, resumeUrl, htmlContent, repoUrl } = req.body;
    if (!templateId || !components || !htmlContent) {
      console.log('Missing required fields:', { templateId, components, htmlContent });
      return res.status(400).json({ error: 'Missing required fields: templateId, components, htmlContent' });
    }

    if (typeof htmlContent !== 'string' || htmlContent.length < 100) {
      console.log('Invalid htmlContent: too short or not a string');
      return res.status(400).json({ error: 'Invalid htmlContent: must be a non-empty string' });
    }

    let parsedComponents;
    try {
      parsedComponents = typeof components === 'string' ? JSON.parse(components) : components;
    } catch (err) {
      console.log('Invalid components JSON:', err.message);
      return res.status(400).json({ error: 'Invalid components JSON format' });
    }

    if (!parsedComponents.name || !parsedComponents.bio || !parsedComponents.email) {
      console.log('Required component fields missing:', parsedComponents);
      return res.status(400).json({ error: 'Name, bio, and email are required in components' });
    }

    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      if (Array.isArray(obj)) return obj.map(sanitizeObject);
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
          sanitized[key] = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        } else if (typeof value === 'object') {
          sanitized[key] = sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    };

    const sanitizedComponents = sanitizeObject(parsedComponents);

    const portfolio = await Portfolio.findOne({ _id: req.params.id, userId: decoded.userId });
    if (!portfolio) {
      console.log('Portfolio not found or unauthorized:', { id: req.params.id, userId: decoded.userId });
      return res.status(404).json({ error: 'Portfolio not found or unauthorized' });
    }

    let newRepoUrl = portfolio.githubRepo;
    let githubPagesUrl = portfolio.githubPagesUrl;
    let deploymentNote;
    try {
      const deployResult = await createRepoAndDeploy(decoded.userId, templateId, htmlContent, repoUrl || portfolio.githubRepo);
      newRepoUrl = deployResult.repoUrl;
      githubPagesUrl = deployResult.githubPagesUrl;
      deploymentNote = deployResult.deploymentNote;
      console.log('Portfolio redeployed:', { repoUrl: newRepoUrl, githubPagesUrl });
    } catch (err) {
      console.error('GitHub redeployment error:', err.message);
      return res.status(500).json({ error: `Failed to redeploy to GitHub Pages: ${err.message}` });
    }

    try {
      portfolio.templateId = templateId;
      portfolio.components = sanitizedComponents;
      portfolio.profilePicUrl = profilePicUrl || portfolio.profilePicUrl;
      portfolio.resumeUrl = resumeUrl || portfolio.resumeUrl;
      portfolio.htmlContent = htmlContent;
      portfolio.githubRepo = newRepoUrl;
      portfolio.githubPagesUrl = githubPagesUrl;
      portfolio.updatedAt = new Date();
      await portfolio.save();
      console.log('Portfolio updated in MongoDB:', { id: portfolio._id, githubRepo: newRepoUrl });
    } catch (err) {
      console.error('MongoDB update error:', err.message);
      return res.status(500).json({ error: 'Failed to update portfolio in database' });
    }

    res.status(200).json({
      message: 'Portfolio updated successfully',
      portfolioId: portfolio._id,
      repoUrl: newRepoUrl,
      githubPagesUrl,
      deploymentNote,
    });
  } catch (error) {
    console.error('Error in /api/portfolio/:id:', error.message, error.stack);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

router.delete('/:id', async (req, res) => {
  console.log('Received DELETE /api/portfolio/:id:', { id: req.params.id });

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token decoded:', { userId: decoded.userId });
    } catch (err) {
      console.log('Invalid token:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const portfolio = await Portfolio.findOne({ _id: req.params.id, userId: decoded.userId });
    if (!portfolio) {
      console.log('Portfolio not found or unauthorized:', { id: req.params.id, userId: decoded.userId });
      return res.status(404).json({ error: 'Portfolio not found or unauthorized' });
    }

    if (portfolio.githubRepo) {
      try {
        await deleteRepo(portfolio.githubRepo);
        console.log('GitHub repository deleted:', { repoUrl: portfolio.githubRepo });
      } catch (err) {
        console.error('GitHub deletion error:', err.message);
        // Continue with MongoDB deletion even if GitHub deletion fails
      }
    }

    try {
      await Portfolio.findByIdAndDelete(req.params.id);
      console.log('Portfolio deleted from MongoDB:', { id: req.params.id });
    } catch (err) {
      console.error('MongoDB deletion error:', err.message);
      return res.status(500).json({ error: 'Failed to delete portfolio from database' });
    }

    res.status(200).json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Error in /api/portfolio/:id:', error.message, error.stack);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  }
});

export default router;