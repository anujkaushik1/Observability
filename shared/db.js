// Shared Postgres connection pool. Override with DATABASE_URL if your setup differs.
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/shop';

let pool;

function query(text, params) {
  if (!pool) pool = new Pool({ connectionString: DATABASE_URL });
  return pool.query(text, params);
}

module.exports = { query, DATABASE_URL };
