// db.js — connects to MongoDB and exposes plain helper functions for
// everything the rest of the app needs to read or write. Nothing
// outside this file talks to Mongoose/MongoDB directly.

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/docket';

mongoose.set('strictQuery', true);

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('[docket] Connected to MongoDB at ' + MONGODB_URI))
  .catch((err) => {
    console.error('[docket] Could not connect to MongoDB:', err.message);
    console.error('          Make sure MongoDB is running and MONGODB_URI in .env is correct.');
    process.exit(1);
  });

/* ---------------- schemas ---------------- */

const idTransform = {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    if (ret && ret._id) {
      ret.id = ret._id.toString();
    }
  }
};

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    passwordHash: { type: String, default: null },
    provider: { type: String, required: true, default: 'local' },
    providerId: { type: String, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: idTransform, toObject: idTransform }
);
userSchema.index({ provider: 1, providerId: 1 });

const entrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    provider: { type: String, default: '' },
    item: { type: String, default: '' },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    notes: { type: String, default: '' }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: idTransform, toObject: idTransform }
);
entrySchema.index({ userId: 1 });

const User = mongoose.model('User', userSchema);
const Entry = mongoose.model('Entry', entrySchema);

// Mongo ObjectIds are 24-char hex strings. Anything else can never
// match a document, so we short-circuit instead of letting Mongoose
// throw a CastError.
function isValidId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

function usernameMatchExpression(username) {
  const value = (username || '').trim();
  if (!value) return null;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: '^' + escaped + '$', $options: 'i' };
}

// Converts a Mongoose document to a plain object shaped like the old
// SQLite rows, so auth.js/entries.js don't need to change field names
// (id, display_name, password_hash, etc).
function toPlain(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject({ virtuals: false }) : doc;
  const rawId = obj && obj._id !== undefined ? obj._id : obj && obj.id;
  const userId = obj && obj.userId !== undefined ? obj.userId : undefined;

  return {
    id: rawId ? rawId.toString() : undefined,
    username: obj.username,
    display_name: obj.displayName,
    password_hash: obj.passwordHash,
    provider: obj.provider,
    provider_id: obj.providerId,
    created_at: obj.created_at,
    // entry-only fields (undefined on user docs, harmless either way)
    user_id: userId ? userId.toString() : undefined,
    item: obj.item,
    amount: obj.amount,
    date: obj.date,
    time: obj.time,
    notes: obj.notes,
    category: obj.category
  };
}

/* ---------------- exported helpers (all async) ---------------- */

module.exports = {
  mongoose,
  User,
  Entry,

  async findUserByUsername(username) {
    const match = usernameMatchExpression(username);
    const user = match ? await User.findOne({ username: match }) : null;
    return toPlain(user);
  },

  async findUserByProviderId(provider, providerId) {
    const user = await User.findOne({ provider, providerId });
    return toPlain(user);
  },

  async findUserById(id) {
    if (!isValidId(id)) return null;
    const user = await User.findById(id);
    return toPlain(user);
  },

  async createLocalUser(username, displayName, passwordHash) {
    const user = await User.create({ username, displayName, passwordHash, provider: 'local' });
    return toPlain(user);
  },

  async createFederatedUser(username, displayName, provider, providerId) {
    const user = await User.create({ username, displayName, provider, providerId });
    return toPlain(user);
  },

  async updateUserPasswordByUsername(username, passwordHash) {
    const key = (username || '').trim().toLowerCase();
    const match = usernameMatchExpression(key);
    const user = match ? await User.findOneAndUpdate(
      { username: match },
      { passwordHash },
      { new: true }
    ) : null;
    return toPlain(user);
  },

  async updateUserPasswordById(userId, passwordHash) {
    if (!isValidId(userId)) return null;
    const user = await User.findByIdAndUpdate(
      userId,
      { passwordHash },
      { new: true }
    );
    return toPlain(user);
  },

  async listEntries(userId) {
    const rows = await Entry.find({ userId }).sort({ date: -1, time: -1, _id: -1 });
    return rows.map(toPlain);
  },

  async createEntry(userId, entry) {
    const doc = await Entry.create({ userId, ...entry });
    return toPlain(doc);
  },

  async deleteEntry(userId, entryId) {
    if (!isValidId(entryId)) return false;
    const result = await Entry.deleteOne({ _id: entryId, userId });
    return result.deletedCount > 0;
  }
};
