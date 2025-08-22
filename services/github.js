import { Octokit } from '@octokit/core';
import dotenv from 'dotenv';
import { deployToVercel } from './vercelService.js';

dotenv.config();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const getPackageJsonContent = (repoName, owner) => `{
  "name": "${repoName}",
  "version": "0.1.0",
  "private": true,
  "dependencies": { "axios": "^1.4.0", "react": "^18.2.0", "react-dom": "^18.2.0", "react-scripts": "5.0.1" },
  "scripts": { "start": "react-scripts start", "build": "react-scripts build" },
  "eslintConfig": { "extends": ["react-app"] },
  "browserslist": { "production": [">0.2%", "not dead", "not op_mini all"], "development": ["last 1 chrome version"] }
}`;

const getLockfileContent = (repoName) => `{
  "name": "${repoName}",
  "version": "0.1.0",
  "lockfileVersion": 2,
  "requires": true,
  "packages": {
    "": {
      "name": "${repoName}",
      "version": "0.1.0",
      "dependencies": { "axios": "^1.4.0", "react": "^18.2.0", "react-dom": "^18.2.0", "react-scripts": "5.0.1" }
    }
  }
}`;

const getIndexJsContent = () => `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
`;

const getIndexHtmlContent = (repoName) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script src="https://cdn.tailwindcss.com"></script>
    <title>${repoName}</title>
  </head>
  <body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div></body>
</html>`;

const getAppJsContent = (ecommerceId, apiBaseUrl) => `
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// The App component IS the full template now
function App() {
  const [ecommerceId, setEcommerceId] = useState('${ecommerceId}');
  const [components, setComponents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState(null);

  useEffect(() => {
    const API_BASE_URL = '${apiBaseUrl}';

    if (!ecommerceId || ecommerceId === 'undefined') {
      setInitialError('E-commerce ID is not configured.');
      setLoading(false);
      return;
    }

    axios.get(\`\${API_BASE_URL}/api/ecommerce/\${ecommerceId}/components\`)
      .then(response => {
        setComponents(JSON.parse(response.data.components));
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching components:", err);
        setInitialError('Failed to load store configuration.');
        setLoading(false);
      });
  }, [ecommerceId]);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your store...</div>;
  if (initialError) return <div style={{ padding: '2rem', color: 'red', textAlign: 'center' }}>Error: {initialError}</div>;
  if (!components) return <div style={{ padding: '2rem', textAlign: 'center' }}>Store configuration could not be loaded.</div>;
  
  return <TemplateEcommerce1 initialComponents={components} ecommerceId={ecommerceId} />;
}

// Your full TemplateEcommerce1 component
function TemplateEcommerce1({ initialComponents, ecommerceId }) {
  const [components, setComponents] = useState(initialComponents);
  const {
    shopName = 'ShopEase',
    shopDescription = 'Your one-stop shop for all your needs.',
    products = [],
    design = {},
  } = components;
  
  const API_BASE_URL = '${apiBaseUrl}';

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [cart, setCart] = useState({ items: [] });
  const [user, setUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUser(null);
    setCart({ items: [] });
    setShowLogin(false);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && ecommerceId) {
      setIsLoggedIn(true);
      axios.get(\`\${API_BASE_URL}/api/ecommerce/\${ecommerceId}/user\`, { headers: { Authorization: \`Bearer \${token}\` } })
        .then(res => setUser(res.data.user))
        .catch(err => console.error('Error fetching user data:', err));
      axios.get(\`\${API_BASE_URL}/api/ecommerce/\${ecommerceId}/cart\`, { headers: { Authorization: \`Bearer \${token}\` } })
        .then(res => setCart(res.data))
        .catch(err => console.error('Error fetching cart:', err));
    }
  }, [ecommerceId, isLoggedIn]);
  
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    const email = e.target.querySelector('#login-email').value;
    const password = e.target.querySelector('#login-password').value;
    try {
      const res = await axios.post(\`\${API_BASE_URL}/api/ecommerce/\${ecommerceId}/login\`, { email, password });
      localStorage.setItem('token', res.data.token);
      setIsLoggedIn(true);
      setShowLogin(false);
    } catch (err) {
      setError(err.response?.data.error || 'Login failed.');
    }
  };
  
  const addToCart = async (productId) => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    try {
      const res = await axios.post(
        \`\${API_BASE_URL}/api/ecommerce/\${ecommerceId}/cart\`,
        { productId, quantity: 1 },
        { headers: { Authorization: \`Bearer \${localStorage.getItem('token')}\` } }
      );
      setCart(res.data);
    } catch (err) {
      setError(err.response?.data.error || 'Failed to add to cart.');
    }
  };
  
  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
     <div style={{ fontFamily: design.fontFamily, background: design.backgroundColor, color: design.textColor }} className="min-h-screen">
      <header style={{ background: 'white', boxShadow: design.cardShadow }} className="shadow-md sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <h1 style={{ color: design.primaryColor }} className="text-2xl font-bold">{shopName}</h1>
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <>
                <button onClick={() => alert('Show Cart!')} className="relative">
                  <i className="fas fa-shopping-cart text-xl"></i>
                  {cart?.items?.length > 0 && 
                    <span style={{ background: design.secondaryColor }} className="absolute -top-2 -right-2 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {cart.items.reduce((sum, item) => sum + item.quantity, 0)}
                    </span>
                  }
                </button>
                <button onClick={handleLogout}>Logout</button>
              </>
            ) : (
              <button onClick={() => setShowLogin(true)}>Login</button>
            )}
          </div>
        </div>
      </header>

      <main style={{ padding: design.sectionPadding }} className="container mx-auto flex-1 p-4">
        <div className="bg-white rounded-lg p-6" style={{ boxShadow: design.cardShadow }}>
          <h2 className="text-2xl font-bold mb-4">{shopName}</h2>
          <p className="text-gray-700 mb-4">{shopDescription}</p>
        </div>
        
        <div className="bg-white rounded-lg p-6 mt-6" style={{ boxShadow: design.cardShadow }}>
          <h2 className="text-2xl font-bold mb-6">Our Products</h2>
          <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ borderRadius: design.borderRadius }}
              className="w-full mb-6 px-4 py-2 border rounded-lg"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-lg overflow-hidden" style={{ boxShadow: design.cardShadow }}>
                <img src={product.image || 'https://via.placeholder.com/150'} alt={product.name} className="w-full h-48 object-cover"/>
                <div className="p-4">
                  <h3 className="font-bold text-lg mb-2">{product.name}</h3>
                  <p className="text-gray-600 mb-3 text-sm">{product.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">\${product.price.toFixed(2)}</span>
                    <button onClick={() => addToCart(product.id)} style={{ background: design.primaryColor, borderRadius: design.borderRadius }} className="text-white px-3 py-1 rounded-lg">
                      Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {showLogin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-lg w-full max-w-sm" style={{ borderRadius: design.borderRadius }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Login</h2>
              <button onClick={() => setShowLogin(false)}>&times;</button>
            </div>
            {error && <p className="text-red-500 mb-4">{error}</p>}
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className="block mb-2">Email</label>
                <input type="email" id="login-email" required className="w-full p-2 border rounded" />
              </div>
              <div className="mb-4">
                <label className="block mb-2">Password</label>
                <input type="password" id="login-password" required className="w-full p-2 border rounded" />
              </div>
              <button type="submit" style={{ background: design.primaryColor }} className="w-full text-white py-2 px-4 rounded-lg">Login</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
`;

export const createRepoAndDeploy = async (userId, ecommerceId, apiBaseUrl) => {
  try {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set.');
    const { data: user } = await octokit.request('GET /user');
    const owner = user.login.toLowerCase();
    const repoName = `store-${userId}-${Date.now()}`;
    const repoUrl = `https://github.com/${owner}/${repoName}`;
    console.log(`Creating new repository: ${repoName}`);
    const repoResponse = await octokit.request('POST /user/repos', { name: repoName, private: false });
    const repoId = repoResponse.data.id;
    const filesToPush = [
      { path: 'package.json', content: getPackageJsonContent(repoName, owner) },
      { path: 'package-lock.json', content: getLockfileContent(repoName) },
      { path: 'public/index.html', content: getIndexHtmlContent(repoName) },
      { path: 'src/index.js', content: getIndexJsContent() },
      { path: 'src/App.js', content: getAppJsContent(ecommerceId, apiBaseUrl) },
    ];
    for (const file of filesToPush) {
      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner, repo: repoName, path: file.path, message: `feat: add ${file.path}`, content: Buffer.from(file.content).toString('base64'),
      });
    }
    const deploymentUrl = await deployToVercel(repoName, repoId);
    return { repoUrl, deploymentUrl };
  } catch (error) {
    console.error('GitHub/Vercel error:', error.message, error.stack);
    throw new Error(`Failed to create repo or deploy: ${error.message}`);
  }
};

export const deleteRepo = async (repoUrl) => {
  try {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not set.');
    const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!urlMatch) throw new Error(`Invalid repository URL: ${repoUrl}`);
    const owner = urlMatch[1];
    const repo = urlMatch[2].replace('.git', '');
    console.log(`Deleting GitHub repo: ${owner}/${repo}`);
    await octokit.request('DELETE /repos/{owner}/{repo}', { owner, repo });
    console.log(`Successfully deleted repo: ${owner}/${repo}`);
  } catch (error) {
     if (error.status !== 404) {
      console.error('GitHub deletion error:', error.message);
      throw new Error(`Failed to delete repo: ${error.message}`);
    } else {
      console.log(`GitHub repo not found, assuming already deleted.`);
    }
  }
};