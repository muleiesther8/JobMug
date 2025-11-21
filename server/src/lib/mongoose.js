/**
 * server/lib/mongoose.js
 *
 * Lightweight mongoose connection helper with caching and retries.
 * - Caches connection promise on global to avoid reconnecting on warm invocations.
 * - Retries with exponential backoff.
 */
const mongoose = require('mongoose');

const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000;
const CACHE_KEY = '__mongoose_connection_cache__';

const defaults = {
  // mongoose v7 uses sensible defaults; explicit values kept for clarity
  serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT_MS,
  socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000
};

if (!global[CACHE_KEY]) {
  global[CACHE_KEY] = { conn: null, promise: null };
}

// Connection event handlers for clearer logs
mongoose.connection.on('error', (err) => {
  console.error('[mongoose] connection error:', err && (err.message || err));
});
mongoose.connection.on('disconnected', () => {
  console.warn('[mongoose] disconnected');
});
mongoose.connection.on('connected', () => {
  console.info('[mongoose] connected');
});

/**
 * Connect to MongoDB with retries and caching.
 * Throws if all attempts fail.
 */
async function connectToDatabase(mongoUri, { maxAttempts = 4, baseDelay = 500, ...opts } = {}) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI must be provided');
  }

  // Return existing established connection
  if (global[CACHE_KEY].conn && global[CACHE_KEY].conn.connection && global[CACHE_KEY].conn.connection.readyState === 1) {
    console.info('[mongoose] reusing cached connection');
    return global[CACHE_KEY].conn;
  }

  // If connection promise already exists, reuse it
  if (!global[CACHE_KEY].promise) {
    const connectOpts = Object.assign({}, defaults, opts);
    global[CACHE_KEY].promise = (async () => {
      let attempt = 0;
      let lastErr = null;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          mongoose.set('strictQuery', false);
          await mongoose.connect(mongoUri, connectOpts);
          global[CACHE_KEY].conn = mongoose;
          return mongoose;
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts) break;
          const wait = baseDelay * Math.pow(2, attempt - 1);
          console.warn(`[mongoose] connect attempt ${attempt} failed; retrying in ${wait}ms.`, err && (err.message || err));
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      throw lastErr;
    })();
  }

  global[CACHE_KEY].conn = await global[CACHE_KEY].promise;
  return global[CACHE_KEY].conn;
}

module.exports = { connectToDatabase };