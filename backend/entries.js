// entries.js — CRUD for a logged-in user's own dockets. Every route
// here runs requireAuth first, so req.user is always the account
// making the request, and every query is scoped to that user's id —
// nobody can read or delete another account's entries.

const express = require('express');
const store = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

router.use(requireAuth);

// Wraps an async route handler so a rejected promise is forwarded to
// Express's error-handling middleware instead of crashing the process.
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const rows = await store.listEntries(req.user.id);
    res.json({ entries: rows });
  })
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const { category, provider, item, amount, date, time, notes } = req.body || {};
    const amt = parseFloat(amount);

    if (!category) return res.status(400).json({ error: 'Category is required.' });
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be greater than £0.00.' });
    }
    if (!date || !time) return res.status(400).json({ error: 'Date and time are required.' });

    const entry = await store.createEntry(req.user.id, {
      category,
      provider: provider || '',
      item: item || '',
      amount: Math.round(amt * 100) / 100,
      date,
      time,
      notes: notes || ''
    });

    res.status(201).json({ entry });
  })
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const ok = await store.deleteEntry(req.user.id, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Docket not found.' });
    res.json({ ok: true });
  })
);

module.exports = router;
