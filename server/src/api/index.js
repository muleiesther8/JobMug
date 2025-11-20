// api/index.js
// Vercel serverless wrapper for your Express app (CommonJS).
// Ensures DB is connected before forwarding requests to the Express app using serverless-http.

const serverless = require('serverless-http');
const app = require('../app'); // path to your Express app (app.js)
const { connectToDatabase } = require('../lib/mongoose');

let isConnected = false;
let handler = null;

// Export the function expected by Vercel (default export)
module.exports = async (req, res) => {
  // Quick allow for OPTIONS preflight for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    return res.status(200).end();
  }

  if (!isConnected) {
    try {
      await connectToDatabase(process.env.MONGODB_URI || process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxAttempts: 4,
        baseDelay: 500
      });
      isConnected = true;
      // build serverless handler lazily after DB is ready to avoid early require-time DB calls
      handler = serverless(app);
    } catch (err) {
      console.error('DB connection failed in wrapper:', err && err.message ? err.message : err);
      // Return 503 so the client sees DB problem but function doesn't crash
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: 'DB connection failed', detail: err && err.message ? err.message : String(err) }));
    }
  }

  // Delegate to serverless handler
  return handler(req, res);
};