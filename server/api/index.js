/**
 * server/api/index.js
 *
 * Vercel serverless wrapper for the Express app (server/src/app.js).
 * - Uses serverless-http to delegate requests to the existing Express app.
 * - Lazily initializes the handler and (optionally) a MongoDB connection via the helper in server/lib/mongoose.js.
 * - Returns JSON 5xx if initialization fails.
 *
 * Notes:
 * - Ensure server/src/app.js exports the Express app (module.exports = app).
 * - If you don't want DB initialization on serverless startup, unset MONGODB_URI in Vercel env.
 */
const serverless = require('serverless-http');
const app = require('../src/app'); // server/src/app.js
let handler = null;
let initialized = false;

async function init() {
  // Optional DB connection: attempt only if MONGODB_URI / MONGO_URI is present.
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (uri) {
      try {
        // require only if present; keep guarded so repo works without the helper too.
        // eslint-disable-next-line global-require
        const { connectToDatabase } = require('../lib/mongoose');
        await connectToDatabase(uri, { maxAttempts: 4, baseDelay: 500 });
      } catch (mErr) {
        // Log and continue: the express app can still handle requests (DB ops may fail if DB missing).
        console.warn('lib/mongoose initialization warning:', mErr && (mErr.message || mErr));
      }
    }
  } catch (err) {
    console.warn('DB init skipped/failed:', err && (err.message || err));
  }

  handler = serverless(app);
  initialized = true;
}

module.exports = async (req, res) => {
  try {
    if (!initialized) {
      await init();
    }
    return handler(req, res);
  } catch (err) {
    console.error('Serverless wrapper initialization error:', err && (err.stack || err));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(
      JSON.stringify({
        error: {
          message: 'Server initialization failed',
          detail: err && (err.message || String(err))
        }
      })
    );
  }
};