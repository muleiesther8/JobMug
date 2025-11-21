/**
 * server/api/index.js
 *
 * Safer Vercel serverless wrapper:
 * - Lazy-requires server/src/app so module-load errors are caught and reported.
 * - Attempts optional DB init via server/lib/mongoose only when MONGODB_URI is set.
 * - Emits detailed error logs and returns JSON 500 on init failure.
 */
const serverless = require('serverless-http');

let handler = null;
let initialized = false;

async function init() {
  // Optional DB connection: attempt only if MONGODB_URI / MONGO_URI is present.
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (uri) {
      try {
        // require the helper only if present
        // eslint-disable-next-line global-require
        const { connectToDatabase } = require('../lib/mongoose');
        await connectToDatabase(uri, { maxAttempts: 4, baseDelay: 500 });
      } catch (mErr) {
        // Log and continue — DB ops may still fail but wrapper won't crash on module load
        console.warn('lib/mongoose initialization warning:', mErr && (mErr.message || mErr));
      }
    }
  } catch (err) {
    console.warn('DB init skipped/failed:', err && (err.message || err));
  }

  // Lazy-require app to avoid module-load crashes bubbling up to Vercel as FUNCTION_INVOCATION_FAILED
  let app;
  try {
    // eslint-disable-next-line global-require
    app = require('../src/app');
  } catch (err) {
    // If require fails, throw an error the outer handler can catch and return as JSON
    const e = new Error(`Failed to require server/src/app: ${err && (err.message || err)}`);
    // attach original stack for debugging
    e.original = err;
    throw e;
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
    // Detailed logging so you can see the cause in Vercel function logs
    console.error('Serverless wrapper initialization error:', err && (err.stack || err));
    if (err && err.original) {
      console.error('Original error:', err.original && (err.original.stack || err.original));
    }

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