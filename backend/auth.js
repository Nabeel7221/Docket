// auth.js — everything to do with accounts and sessions:
// username/password signup+login, Google and Apple sign-in
// verification, and the cookie-based session used by entries.js.

require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const store = require('./db');

const router = express.Router();

// Stops brute-force password guessing: 10 attempts per IP per 15
// minutes on the routes that check a password. Signup is limited
// separately (looser) so it doesn't block genuine new sign-ups.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — wait a few minutes and try again.' }
});
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this connection — try again later.' }
});

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'docket_session';
const isProd = process.env.NODE_ENV === 'production';

if (!JWT_SECRET || JWT_SECRET.startsWith('replace_this')) {
  console.warn(
    '\n[docket] WARNING: JWT_SECRET is missing or still the placeholder value.\n' +
      '          Set a real random string in .env before going live.\n'
  );
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd, // requires HTTPS in production
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

// Attach this to any route that needs a logged-in user.
async function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await store.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — log in again.' });
  }
}

function publicUser(user) {
  return { username: user.username, displayName: user.display_name, provider: user.provider };
}

/* ---------------- username / password ---------------- */

router.post('/signup', signupLimiter, async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password needs to be at least 4 characters.' });
  }

  const key = username.trim().toLowerCase();
  const existing = await store.findUserByUsername(key);
  if (existing) {
    return res.status(409).json({
      error: 'That username is already taken — try logging in instead.'
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await store.createLocalUser(key, (displayName || username).trim(), passwordHash);

  setSessionCookie(res, signToken(user));
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = await store.findUserByUsername(username.trim().toLowerCase());
  if (!user || !user.password_hash) {
    return res.status(401).json({
      error: 'No matching account. Try creating one or resetting the password.'
    });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Wrong username or password.' });

  setSessionCookie(res, signToken(user));
  res.json({ user: publicUser(user) });
});

/* ---------------- password reset / change ---------------- */

router.post('/forgot-password', async (req, res) => {
  const { username, newPassword } = req.body || {};

  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and a new password are required.' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password needs to be at least 4 characters.' });
  }

  const user = await store.findUserByUsername(username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ error: 'No account matches that username. Check it and try again.' });
  }

  const isSameAsCurrent = user.password_hash && await bcrypt.compare(newPassword, user.password_hash);
  if (isSameAsCurrent) {
    return res.status(400).json({ error: 'That is your current password. Please try a new one.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await store.updateUserPasswordByUsername(user.username, passwordHash);

  res.json({ ok: true, message: 'Your password has been changed successfully.' });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = req.user;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and a new password are required.' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password needs to be at least 4 characters.' });
  }

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Your current password is incorrect.' });
  }

  const isSameAsCurrent = user.password_hash && await bcrypt.compare(newPassword, user.password_hash);
  if (isSameAsCurrent) {
    return res.status(400).json({ error: 'That is your current password. Please try a new one.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updatedUser = await store.updateUserPasswordById(user.id, passwordHash);
  if (!updatedUser) {
    return res.status(500).json({ error: 'Could not update the password.' });
  }

  res.json({ ok: true, message: 'Your password has been changed successfully.' });
});

/* ---------------- session ---------------- */

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

module.exports = { router, requireAuth };
