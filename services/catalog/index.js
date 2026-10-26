// Catalog service: knows what products exist and what they cost.
require('../../shared/tracing')('catalog'); // must stay first: starts tracing before express and pg load
const { recordError } = require('../../shared/tracing');
const express = require('express');
const db = require('../../shared/db');

const PORT = process.env.PORT || 3001;
const app = express();

// GET /products/:id  ->  200 { id, name, priceCents }  |  404
app.get('/products/:id', async (req, res) => {
  // Demo only: wait 10 seconds so the slow step stands out in Jaeger.
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'product id must be an integer' });
  }

  const { rows } = await db.query('SELECT id, name, price_cents FROM products WHERE id = $1', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: `product ${id} not found` });
  }

  const product = rows[0];
  res.json({ id: product.id, name: product.name, priceCents: product.price_cents });
});

app.use((err, req, res, next) => {
  console.error(err);
  recordError(err); // shows the error message and stack trace in Jaeger
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`catalog service listening on :${PORT}`));
