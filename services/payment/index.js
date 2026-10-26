// Payment service: pretends to charge a card. No real money, no database.
require('../../shared/tracing')('payment'); // must stay first: starts tracing before express and pg load
const crypto = require('crypto');
const express = require('express');

const PORT = process.env.PORT || 3003;
const app = express();
app.use(express.json());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /payments { amountCents }  ->  201 { paymentId, status: "succeeded", amountCents }
app.post('/payments', async (req, res) => {
  const { amountCents } = req.body ?? {};
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return res.status(400).json({ error: 'amountCents must be a positive integer' });
  }

  // A real payment provider takes a moment to respond; fake 100-300ms of latency.
  await sleep(100 + Math.random() * 200);

  res.status(201).json({ paymentId: `pay_${crypto.randomUUID()}`, status: 'succeeded', amountCents });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(PORT, () => console.log(`payment service listening on :${PORT}`));
