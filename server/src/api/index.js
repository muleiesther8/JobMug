/**
 * server/api/index.js
 *
 * Safe Vercel serverless wrapper:
 * - Lazy-requires the Express app.
 * - Attempts DB init but only waits a short bounded time so cold-starts don't time out.
 * - If DB init times out, we continue to serve requests; DB will be connected in background when possible.
 * - Emits clear timestamped logs for debugging.
 *
 * Env vars:
 * - MONGODB_URI or MONGO_URI
 * - DB_INIT_TIMEOUT_MS (optional, default 2000)
 */
const serverless = require('serverless-http');

let handler = null;
let initialized = false;

function now() {
  return new Date().toISOString();
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Attempt to connect to DB but only wait for "initTimeoutMs". If the connection
 * promise resolves within the timeout, we mark connected. If it times out,
 * we continue and let the connection promise continue in background.
 *
 * This avoids blocking the function startup on slow network / DNS / Atlas whitelisting.
 */
async function tryInitDb(uri, initTimeoutMs = 2000) {
  if (!uri) {
    console.info(`${now()} [db] no MONGODB_URI provided; skipping DB init`);
    return false;
  }

  let connectPromise;
  try {
    // require the helper lazily
    // eslint-disable-next-line global-require
    const { connectToDatabase } = require('../lib/mongoose');
    connectPromise = connectToDatabase(uri, {
      maxAttempts: 2,
      baseDelay: 200,
      // also set a short serverSelectionTimeoutMS to make connect attempts fail faster
      serverSelectionTimeoutMS: 2000
    });
  } catch (err) {
    console.warn(`${now()} [db] require('../lib/mongoose') failed:`, err && (err.message || err));
    return false;
  }

  // Race between connect and timeout
  try {
    const res = await Promise.race([
      connectPromise.then(() => 'connected'),
      (async () => {
        await wait(initTimeoutMs);
        return 'timeout';
      })()
    ]);

    if (res === 'connected') {
      console.info(`${now()} [db] connected within ${initTimeoutMs}ms`);
      return true;
    }

    // If we hit the timeout, the connectPromise may still be running — do not await it.
    console.warn(`${now()} [db] init timed out after ${initTimeoutMs}ms — continuing startup; DB may connect in background`);
    // attach a catch to log if background connect fails later
    connectPromise.catch((err) => {
      console.error(`${now()} [db] background connection failed:`, err && (err.stack || err));
    });
    return false;
  } catch (err) {
    // connectPromise rejected quickly
    console.error(`${now()} [db] connect attempt failed:`, err && (err.stack || err));
    return false;
  }
}

async function init() {
  console.info(`${now()} [init] starting serverless init`);
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  // Allow configuring how long init may wait before proceeding (ms)
  const initTimeoutMs = Number(process.env.DB_INIT_TIMEOUT_MS) || 2000;

  // Try DB init but bounded
  let dbConnected = false;
  try {
    dbConnected = await tryInitDb(uri, initTimeoutMs);
  } catch (err) {
    console.warn(`${now()} [init] DB init threw:`, err && (err.stack || err));
  }

  // Now lazy-require the app (do this after DB init attempt so module-load errors are caught here)
  let app;
  try {
    // eslint-disable-next-line global-require
    app = require('../src/app');
  } catch (err) {
    const msg = `Failed to require server/src/app: ${err && (err.message || err)}`;
    const e = new Error(msg);
    e.original = err;
    throw e;
  }

  // Expose DB connection state to the app if it wants to use it
  try {
    if (!app.locals) app.locals = {};
    app.locals.dbConnected = !!dbConnected;
  } catch (err) {
    console.warn(`${now()} [init] failed to set app.locals.dbConnected:`, err && (err.message || err));
  }

  handler = serverless(app);
  initialized = true;
  console.info(`${now()} [init] serverless init finished`);
}

module.exports = async (req, res) => {
  try {
    if (!initialized) {
      await init();
    }
    return handler(req, res);
  } catch (err) {
    console.error(`${now()} [handler] Serverless wrapper initialization error:`, err && (err.stack || err));
    if (err && err.original) {
      console.error(`${now()} [handler] Original error:`, err.original && (err.original.stack || err.original));
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