// backup.js — dumps the users and entries collections to a
// timestamped JSON file under data/backups/, and deletes backups
// older than 30 days. Run it by hand (`node backup.js` or
// `npm run backup`) or on a schedule — see the setup guide for the
// cron/Task Scheduler instructions.
//
// (Passwords are stored as bcrypt hashes, never plain text, so it's
// safe for this file to include the users collection.)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { mongoose, User, Entry } = require('./db');

const KEEP_DAYS = 30;
const backupDir = path.join(__dirname, 'data', 'backups');

async function run() {
  // Wait for the connection db.js kicked off to actually be ready.
  await mongoose.connection.asPromise();

  const [users, entries] = await Promise.all([
    User.find({}).lean(),
    Entry.find({}).lean()
  ]);

  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `docket-${stamp}.json`);
  fs.writeFileSync(dest, JSON.stringify({ users, entries }, null, 2));
  console.log('Backed up database to ' + dest);

  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(backupDir)) {
    const full = path.join(backupDir, file);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      console.log('Removed old backup: ' + file);
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
