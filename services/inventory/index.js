// Inventory service: knows how many units of each product are in stock.
require('../../shared/tracing')('inventory'); // must stay first: starts tracing before express and pg load
const express = require('express');
const db = require('../../shared/db');

const PORT = process.env.PORT || 3002;
const app = express();
app.use(express.json());

// POST /inventory/reserve { productId, quantity }
//   -> 200 { productId, reserved, remaining }   stock was decreased
//   -> 409 { error, available }                 not enough stock, nothing changed
app.post('/inventory/reserve', async (req, res) => {
  const { productId, quantity } = req.body ?? {};
  if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'productId and quantity must be integers, quantity > 0' });
  }

  // Check and decrease in one statement, so two buyers can never both take the last unit.
  const { rows } = await db.query(
    `UPDATE inventory SET quantity = quantity - $2
     WHERE product_id = $1 AND quantity >= $2
     RETURNING quantity`,
    [productId, quantity]
  );

  if (rows.length === 0) {
    const current = await db.query('SELECT quantity FROM inventory WHERE product_id = $1', [productId]);
    const available = current.rows.length ? current.rows[0].quantity : 0;
    return res.status(409).json({ error: 'not enough stock', available });
  }

  res.json({ productId, reserved: quantity, remaining: rows[0].quantity });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`inventory service listening on :${PORT}`));
