-- One database, one table per service.
-- Each service only reads/writes its own table; they talk to each other over HTTP.

-- Owned by: catalog service
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0)
);

-- Owned by: inventory service
CREATE TABLE IF NOT EXISTS inventory (
  product_id INTEGER PRIMARY KEY,
  quantity   INTEGER NOT NULL CHECK (quantity >= 0)
);

-- Owned by: order service
CREATE TABLE IF NOT EXISTS orders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   INTEGER     NOT NULL,
  quantity     INTEGER     NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER     NOT NULL,
  payment_id   TEXT        NOT NULL,
  status       TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed data (safe to re-run)
INSERT INTO products (id, name, price_cents) VALUES
  (1, 'Mechanical Keyboard', 4999),
  (2, 'Wireless Mouse',      1999),
  (3, 'USB-C Hub',           2999),
  (4, 'Sold Out Headphones', 8999)
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (product_id, quantity) VALUES
  (1, 10),
  (2, 25),
  (3, 5),
  (4, 0)
ON CONFLICT (product_id) DO NOTHING;
