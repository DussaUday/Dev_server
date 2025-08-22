import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import Ecommerce from '../models/Ecommerce.js';
import { createMongoDBCluster, connectToEcommerceDB, deleteMongoDBCluster } from '../services/databaseService.js';
import { createRepoAndDeploy, deleteRepo } from '../services/githubService.js';
import { sendWhatsAppText } from "../services/whatsappService.js";
const router = express.Router();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const validateEcommerceId = (req, res, next) => {
  const { ecommerceId } = req.params;
  if (!ecommerceId || !isValidObjectId(ecommerceId)) {
    return res.status(400).json({ error: 'Invalid e-commerce ID' });
  }
  next();
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const ecommerces = await Ecommerce.find({ userId: req.user.userId });
    res.json(ecommerces);
  } catch (error) {
    console.error('Error fetching e-commerce sites:', error);
    res.status(500).json({ error: 'Failed to fetch e-commerce sites' });
  }
});

// ecommerce.js
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { templateId, components, htmlContent } = req.body;
    if (!templateId || !components || !htmlContent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const projectId = uuidv4();
    const userId = req.user.userId;

    // create DB & temp ecommerceId
    const tempEcommerceId = new mongoose.Types.ObjectId();
    const { mongoUri } = await createMongoDBCluster(userId, projectId);

    // Put temp ecommerceId into HTML for first deploy
    const tempHtmlContent = htmlContent.replace(
      /const ecommerceId = 'null';/,
      `const ecommerceId = '${tempEcommerceId}';`
    );

    // initial deploy
    const { repoUrl, githubPagesUrl } = await createRepoAndDeploy(
      userId,
      templateId,
      tempHtmlContent
    );

    // persist ecommerce document
    const ecommerce = new Ecommerce({
      _id: tempEcommerceId,
      userId,
      templateId,
      components,
      htmlContent,
      githubRepo: repoUrl,
      githubPagesUrl,
      mongoUri,
      projectId,
    });
    await ecommerce.save();

    // seed admin user in tenant DB
    const connection = await connectToEcommerceDB(mongoUri);
    const User = connection.model('User');
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await User.create({
      name: 'Admin',
      email: 'admin@shop.com',
      password: hashedPassword,
      isAdmin: true
    });
    await connection.close();

    // re-deploy with final ecommerceId
    const finalHtmlContent = htmlContent.replace(
      /const ecommerceId = 'null';/,
      `const ecommerceId = '${ecommerce._id}';`
    );
    await createRepoAndDeploy(userId, templateId, finalHtmlContent, repoUrl);

    // Build WhatsApp message NOW (after we have url & creds)
    const message = [
      '✅ E-commerce site created successfully!',
      `🔗 Link: ${githubPagesUrl}`,
      '👤 Admin: admin@shop.com',
      `🔑 Password: ${adminPassword}`
    ].join('\n');

    // Extract owner number from components (support both object/string storage)
    let ownerNumber = null;
    try {
      const compData = typeof components === 'string' ? JSON.parse(components) : components;
      ownerNumber = compData.whatsapp || compData.phone || compData.phoneNumber;
    } catch (e) {
      console.error('Error parsing components:', e);
    }

    // Fallback to admin phone if no number found in components
    if (!ownerNumber) {
      ownerNumber = process.env.ADMIN_PHONE;
      console.warn('No WhatsApp number found in components, using ADMIN_PHONE');
    }

    // Ensure proper WhatsApp format (add 'whatsapp:' prefix if missing)
    if (ownerNumber && !ownerNumber.startsWith('whatsapp:')) {
      ownerNumber = `whatsapp:${ownerNumber}`;
    }

    // Try sending WhatsApp
    try {
      if (ownerNumber) {
        const sent = await sendWhatsAppText(ownerNumber, message);
        if (!sent) {
          console.warn(`WhatsApp failed for ${ownerNumber}. Probably sandbox issue.`);
        }
      } else {
        console.warn('No WhatsApp number available to send notification');
      }
    } catch (wErr) {
      console.error('WhatsApp (create) failed:', wErr?.response?.data || wErr?.message || wErr);
      // Attach sandbox join instructions in response
      return res.status(201).json({
        message: 'E-commerce site created successfully, but WhatsApp notification not delivered',
        sandboxInfo: {
          note: 'If you are using Twilio Sandbox, please join first.',
          action: `Send the keyword "join bright-tiger" to +14155238886 on WhatsApp.`,
          yourNumber: ownerNumber?.replace('whatsapp:', '') || 'Not provided',
        },
        githubPagesUrl,
        repoUrl,
        ecommerceId: ecommerce._id,
        adminCredentials: { username: 'admin@shop.com', password: adminPassword },
      });
    }

    // final response
    res.status(201).json({
      message: 'E-commerce site created successfully',
      githubPagesUrl,
      repoUrl,
      ecommerceId: ecommerce._id,
      adminCredentials: { username: 'admin@shop.com', password: adminPassword },
    });

  } catch (error) {
    console.error('Error creating e-commerce site:', error);
    res.status(500).json({ error: `Failed to create e-commerce site: ${error.message}` });
  }
});


router.put('/:ecommerceId', authenticateToken, validateEcommerceId, async (req, res) => {
  try {
    const { ecommerceId } = req.params;
    const { components, htmlContent, templateId, repoUrl } = req.body;

    // The htmlContent from the frontend is already prepared.
    const { githubPagesUrl } = await createRepoAndDeploy(req.user.userId, templateId, htmlContent, repoUrl);

    const updatedEcommerce = await Ecommerce.findByIdAndUpdate(ecommerceId, {
      components,
      htmlContent, // Store the original template HTML
      githubPagesUrl,
    }, { new: true });

    res.status(200).json({
      message: 'E-commerce site updated successfully!',
      githubPagesUrl,
      ecommerce: updatedEcommerce,
    });
  } catch (error) {
    console.error('Error updating e-commerce site:', error);
    res.status(500).json({ error: `Failed to update e-commerce site: ${error.message}` });
  }
});

// ... rest of your ecommerce.js routes remain the same ...

router.delete('/:ecommerceId', authenticateToken, validateEcommerceId, async (req, res) => {
  try {
    const { ecommerceId } = req.params;
    const site = await Ecommerce.findOne({ _id: ecommerceId, userId: req.user.userId });
    if (!site) {
      return res.status(404).json({ error: 'E-commerce site not found or user unauthorized' });
    }

    if (site.githubRepo) await deleteRepo(site.githubRepo);
    await deleteMongoDBCluster(site.userId, site.projectId);
    await Ecommerce.findByIdAndDelete(ecommerceId);

    res.status(200).json({ message: 'E-commerce site and all associated resources deleted successfully.' });
  } catch (error) {
    console.error('Error deleting e-commerce site:', error);
    res.status(500).json({ error: 'Failed to delete e-commerce site.' });
  }
});

// --- SITE-SPECIFIC PUBLIC API ROUTES ---

router.post('/:ecommerceId/login', validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });

      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const user = await User.findOne({ email });
      if (!user) {
          await connection.close();
          return res.status(401).json({ error: 'Invalid credentials' });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
          await connection.close();
          return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign(
        { userId: user._id, ecommerceId, isAdmin: user.isAdmin || false },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      await connection.close();
      res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin || false,
          address: user.address || null,
        },
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({ error: 'Failed to log in' });
    }
});

router.post('/:ecommerceId/signup', validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const { name, email, password, phoneNumber, whatsapp } = req.body;
      if (!name || !email || !password || !phoneNumber || !whatsapp) {
        return res.status(400).json({ error: 'All fields are required' });
      }
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const existingUser = await User.findOne({ email });
      if (existingUser) {
          await connection.close();
          return res.status(400).json({ error: 'Email already exists' });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({
        name,
        email,
        password: hashedPassword,
        phoneNumber,
        whatsapp,
        isAdmin: false,
      });
      await user.save();
      const token = jwt.sign(
        { userId: user._id, ecommerceId, isAdmin: false },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      await connection.close();
      res.status(201).json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: false,
          address: null,
        },
      });
    } catch (error) {
      console.error('Error signing up:', error);
      res.status(500).json({ error: 'Failed to sign up' });
    }
});

router.get('/:ecommerceId/user', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const user = await User.findById(req.user.userId);
      await connection.close();
      if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin || false,
          address: user.address || null,
        },
      });
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
});

router.put('/:ecommerceId/address', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const { fullName, phone, address, city, zip, country } = req.body;
      if (!fullName || !phone || !address || !city || !zip || !country) {
        return res.status(400).json({ error: 'All address fields are required' });
      }
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const user = await User.findById(req.user.userId);
      if (!user) {
          await connection.close();
          return res.status(404).json({ error: 'User not found' });
      }
      user.address = { fullName, phone, address, city, zip, country };
      await user.save();
        await connection.close();
      res.json({ message: 'Address updated successfully', address: user.address });
    } catch (error) {
      console.error('Error updating address:', error);
      res.status(500).json({ error: 'Failed to update address' });
    }
});

router.get('/:ecommerceId/cart', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
        const { ecommerceId } = req.params;
        const ecommerce = await Ecommerce.findById(ecommerceId);
        if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
        const connection = await connectToEcommerceDB(ecommerce.mongoUri);
        const Cart = connection.model('Cart');
        const cart = await Cart.findOne({ userId: req.user.userId }) || { items: [] };

        await connection.close();
        res.json(cart);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

router.post('/:ecommerceId/cart', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
        const { ecommerceId } = req.params;
        const { productId, quantity } = req.body;
        if (!productId || !quantity) {
          return res.status(400).json({ error: 'Product ID and quantity are required' });
        }
        const ecommerce = await Ecommerce.findById(ecommerceId);
        if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
        const connection = await connectToEcommerceDB(ecommerce.mongoUri);
        const Cart = connection.model('Cart');
        let cart = await Cart.findOne({ userId: req.user.userId });
        if (!cart) {
          cart = new Cart({ userId: req.user.userId, items: [] });
        }
        const existingItem = cart.items.find((item) => item.productId.toString() === productId);

        if (existingItem) {
          existingItem.quantity += quantity;
        } else {
          cart.items.push({ productId, quantity });
        }
        await cart.save();
        await connection.close();
        res.json(cart);
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Failed to add to cart' });
    }
});

router.put('/:ecommerceId/cart', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const { productId, quantityChange } = req.body;
      if (!productId || !quantityChange) {
        return res.status(400).json({ error: 'Product ID and quantity change are required' });
      }
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const Cart = connection.model('Cart');
      const cart = await Cart.findOne({ userId: req.user.userId });
      if (!cart) {
          await connection.close();
          return res.status(404).json({ error: 'Cart not found' });
      }
      const item = cart.items.find((item) => item.productId.toString() === productId);
      if (!item) {
          await connection.close();
          return res.status(404).json({ error: 'Item not found in cart' });
      }
      item.quantity += quantityChange;
      if (item.quantity <= 0) {
        cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
      }
      await cart.save();
      await connection.close();
      res.json(cart);
    } catch (error) {
      console.error('Error updating cart:', error);
      res.status(500).json({ error: 'Failed to update cart' });
    }
});

router.delete('/:ecommerceId/cart/:productId', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId, productId } = req.params;
      const ecommerce = await Ecommerce.findById( ecommerceId );
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const Cart = connection.model('Cart');
      const cart = await Cart.findOne({ userId: req.user.userId });
      if (!cart) {
          await connection.close();
          return res.status(404).json({ error: 'Cart not found' });
      }
      cart.items = cart.items.filter((item) => item.productId.toString() !== productId);
      await cart.save();
      await connection.close();
      res.json(cart);
    } catch (error) {
      console.error('Error removing from cart:', error);
      res.status(500).json({ error: 'Failed to remove from cart' });
    }
});

router.post('/:ecommerceId/order', authenticateToken, validateEcommerceId, async (req, res) => {
  try {
    const { ecommerceId } = req.params;
    const ecommerce = await Ecommerce.findById(ecommerceId);
    if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });

    const connection = await connectToEcommerceDB(ecommerce.mongoUri);
    const Cart = connection.model('Cart');
    const User = connection.model('User');
    const Order = connection.model('Order');

    const user = await User.findById(req.user.userId);
    if (!user) {
      await connection.close();
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.address?.address) {
      await connection.close();
      return res.status(400).json({ error: 'Address is required to place an order' });
    }

    const cart = await Cart.findOne({ userId: req.user.userId });
    if (!cart || cart.items.length === 0) {
      await connection.close();
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const components = typeof ecommerce.components === "string"
      ? JSON.parse(ecommerce.components)
      : ecommerce.components;

    const products = components.products;

    const items = cart.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error(`Product with ID ${item.productId} not found`);
      return {
        productId: item.productId,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
      };
    });

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = new Order({
      userId: req.user.userId,
      customerName: user.name,
      items,
      total,
      phone: user.address.phone,
      address: user.address,
    });

    await order.save();
    await Cart.findOneAndDelete({ userId: req.user.userId });
    await connection.close();

    const orderMsg = `
🛒 New Order Received!
👤 Customer: ${user.name}
📞 Phone: ${user.address.phone}
🏠 Address: ${user.address.address}, ${user.address.city}, ${user.address.zip}, ${user.address.country}
📦 Items: ${items.map(i => `${i.name} x${i.quantity}`).join(", ")}
💰 Total: $${total}
    `;

    // Extract WhatsApp number from template components
    let ownerNumber = null;
    try {
      const compData = typeof ecommerce.components === "string" 
        ? JSON.parse(ecommerce.components) 
        : ecommerce.components;
      ownerNumber = compData.whatsapp || compData.phone || compData.phoneNumber;
    } catch (e) {
      console.error('Error parsing components for order notification:', e);
    }

    // Fallback to admin phone if no number found
    if (!ownerNumber) {
      ownerNumber = process.env.ADMIN_PHONE;
    }

    // Ensure proper WhatsApp format
    if (ownerNumber && !ownerNumber.startsWith("whatsapp:")) {
      ownerNumber = `whatsapp:${ownerNumber}`;
    }

    // Send WhatsApp notification if number is available
    if (ownerNumber) {
      try {
        await sendWhatsAppText(ownerNumber, orderMsg);
      } catch (wErr) {
        console.error("WhatsApp (order) failed:", wErr?.message || wErr);
      }
    } else {
      console.warn('No WhatsApp number available for order notification');
    }

    res.status(201).json({ message: 'Order placed successfully', order });
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

router.get('/:ecommerceId/orders', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
        const { ecommerceId } = req.params;
        const ecommerce = await Ecommerce.findById(ecommerceId);
        if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
        const connection = await connectToEcommerceDB(ecommerce.mongoUri);
        const User = connection.model('User');
        const Order = connection.model('Order');
        const user = await User.findById(req.user.userId);

        if (!user || !user.isAdmin) {
            await connection.close();
            return res.status(403).json({ error: 'Admin access required' });
        }
        const orders = await Order.find().sort({ createdAt: -1 });
        await connection.close();
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);

        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

router.post('/:ecommerceId/add-product', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId } = req.params;
      const { name, description, price, image } = req.body;
      if (!name || !description || !price || !image) {
        return res.status(400).json({ error: 'All product fields are required' });
      }
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });

        const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const user = await User.findById(req.user.userId);
      await connection.close();
      if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
      const components = JSON.parse(ecommerce.components);
      const newProduct = {
        id: uuidv4(),
        name,
        description,
        price: parseFloat(price),
        image,
      };
      components.products.push(newProduct);
      ecommerce.components = JSON.stringify(components);
      await ecommerce.save();
      res.json({ message: 'Product added successfully', product: newProduct });
    } catch (error) {
      console.error('Error adding product:', error);
      res.status(500).json({ error: 'Failed to add product' });
    }
});

router.delete('/:ecommerceId/product/:productId', authenticateToken, validateEcommerceId, async (req, res) => {
    try {
      const { ecommerceId, productId } = req.params;
      const ecommerce = await Ecommerce.findById(ecommerceId);
      if (!ecommerce) return res.status(404).json({ error: 'E-commerce site not found' });
      const connection = await connectToEcommerceDB(ecommerce.mongoUri);
      const User = connection.model('User');
      const user = await User.findById(req.user.userId);
      await connection.close();
      if (!user || !user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
      const components = JSON.parse(ecommerce.components);
      components.products = components.products.filter((product) => product.id !== productId);
      ecommerce.components = JSON.stringify(components);
      await ecommerce.save();
      res.json({ message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
