// api/health.js
const { connectToDatabase } = require('../lib/mongoose');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) {
    return res.status(500).json({ status: 'error', message: 'MONGODB_URI not set' });
  }

  try {
    const mongoose = await connectToDatabase(MONGODB_URI, { serverSelectionTimeoutMS: 8000, maxAttempts: 3, baseDelay: 500 });
    const readyState = mongoose.connection.readyState; // 1 = connected
    return res.status(readyState === 1 ? 200 : 503).json({ status: readyState === 1 ? 'ok' : 'degraded', readyState });
  } catch (err) {
    console.error('Health DB connect error:', err && err.message ? err.message : err);
    return res.status(503).json({ status: 'error', message: 'DB connection failed', detail: err?.message });
  }
};