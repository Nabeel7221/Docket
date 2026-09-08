# Docket — expense tracker

Two folders:

- **frontend/** — `index.html`. The whole UI. Talks to the API using `fetch`, nothing else.
- **backend/** — a small Node.js/Express API backed by MongoDB. Handles accounts (username+password, Google, Apple) and stores every user's dockets.

## Quick start

```bash
cd backend
npm install
```

Make sure MongoDB is running locally (`mongod`, or MongoDB Compass/Atlas), then:

```bash
npm start
```

The `.env` file is already set up to connect to `mongodb://localhost:27017/docket` — MongoDB creates the `docket` database automatically the first time data is written. The app is served at http://localhost:4000.
