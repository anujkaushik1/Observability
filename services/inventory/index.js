// Inventory service: knows how many units of each product are in stock.
const express = require('express');
const db = require('../../shared/db');

const PORT = process.env.PORT || 3002;
const app = express();

// GET /inventory/:productId  ->  200 { productId, available }
// Products with no inventory row count as 0 in stock.
app.get('/inventory/:productId', async (req, res) => {
  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: 'product id must be an integer' });
  }

  const { rows } = await db.query('SELECT quantity FROM inventory WHERE product_id = $1', [productId]);
  res.json({ productId, available: rows.length ? rows[0].quantity : 0 });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`inventory service listening on :${PORT}`));
