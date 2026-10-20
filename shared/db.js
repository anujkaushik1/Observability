// Shared Postgres connection pool. Override with DATABASE_URL if your setup differs.
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/shop';

// Opens connections only when a query needs one (up to 10), so creating it here is cheap.
const pool = new Pool({ connectionString: DATABASE_URL });

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query, DATABASE_URL };
