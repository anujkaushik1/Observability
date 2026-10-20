// Order service: the entry point. Orchestrates catalog -> inventory -> payment, then saves the order.
const express = require('express');
const db = require('../../shared/db');

const PORT = process.env.PORT || 3000;
const CATALOG_URL = process.env.CATALOG_URL || 'http://localhost:3001';
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:3002';
const PAYMENT_URL = process.env.PAYMENT_URL || 'http://localhost:3003';

const app = express();
app.use(express.json());

// Calls another service and returns { status, body }. Throws if the service is unreachable.
async function callService(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json' },
    body: options.body && JSON.stringify(options.body),
  });
  return { status: res.status, body: await res.json() };
}

// POST /checkout { productId, quantity }  ->  201 { orderId, status, amountCents }
app.post('/checkout', async (req, res) => {
  // Step 1. Check the request is valid.
  const { productId, quantity } = req.body ?? {};
  if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'productId and quantity must be integers, quantity > 0' });
  }

  // Step 2. Ask catalog for the product and its price.
  const product = await callService(`${CATALOG_URL}/products/${productId}`);
  if (product.status === 404) {
    return res.status(404).json(product.body);
  }
  if (product.status !== 200) {
    return res.status(502).json({ error: 'catalog lookup failed' });
  }

  // Step 3. Ask inventory if there is enough stock.
  const stock = await callService(`${INVENTORY_URL}/inventory/${productId}`);
  if (stock.status !== 200) {
    return res.status(502).json({ error: 'inventory check failed' });
  }
  if (stock.body.available < quantity) {
    return res.status(409).json({ error: 'not enough stock', available: stock.body.available });
  }

  // Step 4. Work out the total.
  const amountCents = product.body.priceCents * quantity;

  // Step 5. Ask payment to charge the customer.
  const payment = await callService(`${PAYMENT_URL}/payments`, { method: 'POST', body: { amountCents } });
  if (payment.status !== 201 || payment.body.status !== 'succeeded') {
    return res.status(402).json({ error: 'payment failed' });
  }

  // Step 6. Save the order, then reply with its id.
  const { rows } = await db.query(
    `INSERT INTO orders (product_id, quantity, amount_cents, payment_id, status)
     VALUES ($1, $2, $3, $4, 'confirmed')
     RETURNING id, status`,
    [productId, quantity, amountCents, payment.body.paymentId]
  );

  res.status(201).json({ orderId: rows[0].id, status: rows[0].status, amountCents });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`order service listening on :${PORT}`));
