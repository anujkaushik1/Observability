// Creates the `shop` database (if missing), then creates tables and seed data.
// Safe to run more than once.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { DATABASE_URL } = require('../shared/db');

async function main() {
  const target = new URL(DATABASE_URL);
  const dbName = target.pathname.slice(1);

  // Connect to the default `postgres` database to create ours.
  const admin = new URL(DATABASE_URL);
  admin.pathname = '/postgres';
  const adminClient = new Client({ connectionString: admin.toString() });
  await adminClient.connect();
  const { rowCount } = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount === 0) {
    await adminClient.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database "${dbName}"`);
  } else {
    console.log(`Database "${dbName}" already exists`);
  }
  await adminClient.end();

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8'));
  await client.end();
  console.log('Tables and seed data ready');
}

main().catch((err) => {
  console.error('DB setup failed:', err.message);
  process.exit(1);
});
