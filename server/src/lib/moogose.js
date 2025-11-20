// lib/mongoose.js
// Serverless-friendly mongoose connection helper for Vercel (CommonJS).
// Caches the connection on the global object to reuse warm containers and prevents
// creating a new connection on every invocation.

const mongoose = require('mongoose');

const DEFAULT_SERVER_SELECTION_TIMEOUT = 10000;
const DEFAULT_SOCKET_TIMEOUT = 45000;
const CACHE_KEY = '__mongoose_cache_v1__';

const defaults = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: DEFAULT_SERVER_SELECTION_TIMEOUT,
  socketTimeoutMS: DEFAULT_SOCKET_TIMEOUT
};

async function connectToDatabase(mongoUri, opts = {}) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI must be provided');
  }

  const globalRef = global;
  if (!globalRef[CACHE_KEY]) {
    globalRef[CACHE_KEY] = { conn: null, promise: null };
  }

  // If there's an active connected mongoose instance, return it
  if (globalRef[CACHE_KEY].conn && globalRef[CACHE_KEY].conn.connection && globalRef[CACHE_KEY].conn.connection.readyState === 1) {
    return globalRef[CACHE_KEY].conn;
  }

  if (!globalRef[CACHE_KEY].promise) {
    const connectOpts = Object.assign({}, defaults, opts);

    globalRef[CACHE_KEY].promise = (async () => {
      // Optional: disable buffering if you want queries to fail fast
      // mongoose.set('bufferCommands', false);

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
          // If final attempt, break and throw
          if (attempt >= maxAttempts) break;
          const wait = baseDelay * Math.pow(2, attempt - 1);
          // exponential backoff
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