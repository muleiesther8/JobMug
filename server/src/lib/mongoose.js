// lib/mongoose.js
// Serverless-friendly mongoose connection helper (CommonJS).
const mongoose = require('mongoose');

const DEFAULT_SERVER_SELECTION_TIMEOUT = 10000;
const CACHE_KEY = '__mongoose_cache_v1__';

const defaults = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT
};

async function connectToDatabase(mongoUri, opts = {}) {
  if (!mongoUri) throw new Error('MONGODB_URI must be provided');

  const globalRef = global;
  if (!globalRef[CACHE_KEY]) globalRef[CACHE_KEY] = { conn: null, promise: null };

  // Return if already connected
  if (globalRef[CACHE_KEY].conn && globalRef[CACHE_KEY].conn.connection && globalRef[CACHE_KEY].conn.connection.readyState === 1) {
    return globalRef[CACHE_KEY].conn;
  }

  if (!globalRef[CACHE_KEY].promise) {
    const connectOpts = Object.assign({}, defaults, opts);

    globalRef[CACHE_KEY].promise = (async () => {
      const maxAttempts = opts.maxAttempts || 4;
      const baseDelay = opts.baseDelay || 500;
      let attempt = 0;
      let lastErr = null;
      while (attempt < maxAttempts) {
        attempt += 1;
        try {
          await mongoose.connect(mongoUri, connectOpts);
          globalRef[CACHE_KEY].conn = mongoose;
          return mongoose;
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts) break;
          const wait = baseDelay * Math.pow(2, attempt - 1);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      throw lastErr;
    })();
  }

  globalRef[CACHE_KEY].conn = await globalRef[CACHE_KEY].promise;
  return globalRef[CACHE_KEY].conn;
}

module.exports = { connectToDatabase };