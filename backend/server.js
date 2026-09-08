// server.js — the entry point. Wires the database, auth routes and
// entries routes into one Express app, and (by default) serves the
// frontend too, so `node server.js` is the whole product.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const { router: authRouter } = require('./auth');
const entriesRouter = require('./entries');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 4000;
const localNetworkPattern = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/i;

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin(origin, callback) {
      const configuredOrigin = process.env.CLIENT_ORIGIN;
      const allowedOrigins = new Set([
        'http://localhost:4000',
        'http://127.0.0.1:4000',
        'http://0.0.0.0:4000'
      ]);

      if (configuredOrigin) allowedOrigins.add(configuredOrigin);
      if (!origin || allowedOrigins.has(origin) || localNetworkPattern.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS policy denied this origin.'));
    },
    credentials: true
  })
);

app.use('/api/auth', authRouter);
app.use('/api/entries', entriesRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the frontend from the same server. Delete this block (and
// the CORS options above become more important) if you're hosting
// the frontend on a different domain/service instead.
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Catch-all error handler — keeps a bug in one route from crashing
// the whole server and from leaking stack traces to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, HOST, () => {
  console.log(`Docket API + frontend running at http://${HOST}:${PORT}`);
});
