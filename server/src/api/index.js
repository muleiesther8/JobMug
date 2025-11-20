// api/index.js
// Vercel serverless wrapper for your Express app. Do NOT call app.listen() anywhere in app.js.
const serverless = require('serverless-http');
const app = require('../app'); // adjust path if your express app is in a different location
const { connectToDatabase } = require('./lib/mongoose');

let isConnected = false;
let handler = null;

module.exports = async (req, res) => {
  // Quick preflight handling
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
      handler = serverless(app);
    } catch (err) {
      console.error('DB connection failed in wrapper:', err && err.message ? err.message : err);
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: 'DB connection failed', detail: err && err.message ? err.message : String(err) }));
    }
  }

  return handler(req, res);
};