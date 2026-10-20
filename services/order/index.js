// Order service: the entry point. Orchestrates catalog -> inventory -> payment, then saves the order.
const express = require("express");
const client = require("prom-client");
const db = require("../../shared/db");

const PORT = process.env.PORT || 3000;
const CATALOG_URL = process.env.CATALOG_URL || "http://localhost:3001";
const INVENTORY_URL = process.env.INVENTORY_URL || "http://localhost:3002";
const PAYMENT_URL = process.env.PAYMENT_URL || "http://localhost:3003";

const app = express();

// Counts every finished request, e.g. http_requests_total{method="POST",route="/checkout",status="201"}
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

// How long each request took. Every request lands in each bucket it fits:
// le="0.1" counts requests that took <= 0.1s, le="0.3" those <= 0.3s, and so on.
// Also keeps _sum (total seconds) and _count (number of requests).
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "How long HTTP requests take, in seconds",
  labelNames: ["route"],
  buckets: [0.1, 0.3, 1, 2],
});

// PostgreSQL connection pool, right now. Gauges, not counters, because these go up and down.
// Each one is read fresh from the pool every time /metrics is scraped.
function poolGauge(name, help, read) {
  new client.Gauge({
    name,
    help,
    collect() {
      this.set(read());
    },
  });
}
poolGauge(
  "pg_pool_max_connections",
  "Most connections the pool is allowed to open",
  () => db.pool.options.max,
);
poolGauge(
  "pg_pool_connections",
  "Connections currently open (active + idle)",
  () => db.pool.totalCount,
);
poolGauge(
  "pg_pool_active_connections",
  "Connections currently running a query",
  () => db.pool.totalCount - db.pool.idleCount,
);
poolGauge(
  "pg_pool_idle_connections",
  "Connections open but not in use",
  () => db.pool.idleCount,
);
poolGauge(
  "pg_pool_waiting_requests",
  "Requests waiting for a free connection",
  () => db.pool.waitingCount,
);

// PostgreSQL connection pool, since the service started. Counted from the pool's own events.
const poolOpened = new client.Counter({
  name: "pg_pool_connections_opened_total",
  help: "Connections opened to PostgreSQL",
});
const poolClosed = new client.Counter({
  name: "pg_pool_connections_closed_total",
  help: "Connections closed (idle timeout or broken)",
});
const poolErrors = new client.Counter({
  name: "pg_pool_errors_total",
  help: "Idle connections that failed, e.g. dropped by the database",
});
db.pool.on("connect", () => poolOpened.inc());
db.pool.on("remove", () => poolClosed.inc());
db.pool.on("error", (err) => {
  poolErrors.inc();
  console.error("idle PostgreSQL connection failed:", err.message);
});

app.use((req, res, next) => {
  // Don't count Prometheus scraping /metrics, only real traffic.
  if (req.path === "/metrics") return next();

  const stopTimer = httpRequestDuration.startTimer(); // starts the clock now

  res.on("finish", () => {
    // Use the route pattern, not the raw URL, so labels stay a small fixed set.
    const route = req.route ? req.route.path : "unmatched";
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: String(res.statusCode),
    });
    stopTimer({ route }); // stops the clock and puts the time in the right buckets
  });
  next();
});

// GET /metrics  ->  all metrics in Prometheus text format
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.send(await client.register.metrics());
});

// Calls another service and returns { status, body }. Throws if the service is unreachable.
async function callService(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json" },
    body: options.body && JSON.stringify(options.body),
  });
  return { status: res.status, body: await res.json() };
}

// POST /checkout { productId, quantity }  ->  201 { orderId, status, amountCents }
app.post("/checkout", express.json(), async (req, res) => {
  // Step 1. Check the request is valid.
  const { productId, quantity } = req.body ?? {};
  if (
    !Number.isInteger(productId) ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return res
      .status(400)
      .json({ error: "productId and quantity must be integers, quantity > 0" });
  }

  // Step 2. Ask catalog for the product and its price.
  const product = await callService(`${CATALOG_URL}/products/${productId}`);
  if (product.status === 404) {
    return res.status(404).json(product.body);
  }
  if (product.status !== 200) {
    return res.status(502).json({ error: "catalog lookup failed" });
  }

  // Step 3. Ask inventory to reserve the stock. This decreases it, or fails with 409 if there isn't enough.
  const stock = await callService(`${INVENTORY_URL}/inventory/reserve`, {
    method: "POST",
    body: { productId, quantity },
  });
  if (stock.status === 409) {
    return res.status(409).json(stock.body);
  }
  if (stock.status !== 200) {
    return res.status(502).json({ error: "inventory reservation failed" });
  }

  // Step 4. Work out the total.
  const amountCents = product.body.priceCents * quantity;

  // Step 5. Ask payment to charge the customer.
  const payment = await callService(`${PAYMENT_URL}/payments`, {
    method: "POST",
    body: { amountCents },
  });
  if (payment.status !== 201 || payment.body.status !== "succeeded") {
    return res.status(402).json({ error: "payment failed" });
  }

  // Step 6. Save the order, then reply with its id.
  const { rows } = await db.query(
    `INSERT INTO orders (product_id, quantity, amount_cents, payment_id, status)
     VALUES ($1, $2, $3, $4, 'confirmed')
     RETURNING id, status`,
    [productId, quantity, amountCents, payment.body.paymentId],
  );

  res
    .status(201)
    .json({ orderId: rows[0].id, status: rows[0].status, amountCents });
});

app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .json({ error: err.expose ? err.message : "internal error" });
});

app.listen(PORT, () => console.log(`order service listening on :${PORT}`));
