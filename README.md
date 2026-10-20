# Observability Shop

Four tiny Express services and a local Postgres database: a playground for learning observability.

## How a checkout flows

```
                        POST /checkout { productId, quantity }
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  order service :3000  │
                          └───────────┬───────────┘
        ┌─────────────────────────────┼─────────────────────────────┐
   1. price?                     2. reserve                    3. charge
        ▼                             ▼                             ▼
┌─────────────────┐       ┌───────────────────────┐       ┌───────────────────┐
│ catalog  :3001  │       │  inventory  :3002     │       │  payment  :3003   │
│ GET /products/  │       │  POST /inventory/     │       │  POST /payments   │
│     :id         │       │      reserve          │       │  (fake, ~200ms)   │
└────────┬────────┘       └───────────┬───────────┘       └───────────────────┘
         │                            │
         ▼                            ▼                   4. order service saves
    [products]                  [inventory]                  the row in [orders]
         └──────────── Postgres database "shop" ──────────────┘
```

| Service   | Port | Endpoint                   | Table       |
|-----------|------|----------------------------|-------------|
| order     | 3000 | `POST /checkout`           | `orders`    |
| catalog   | 3001 | `GET /products/:id`        | `products`  |
| inventory | 3002 | `POST /inventory/reserve`  | `inventory` |
| payment   | 3003 | `POST /payments`           | none (simulated) |

Each service reads and writes only its own table. Services talk to each other over HTTP only.

## Run it

Prerequisites: Node 18+ and a local Postgres running on port 5432.

```bash
npm install
npm run db:setup   # creates the "shop" database, tables, and seed products (safe to re-run)
npm start          # starts all four services in one terminal, with colored log prefixes
```

If your Postgres needs a user or password, set `DATABASE_URL`, e.g.
`DATABASE_URL=postgres://user:pass@localhost:5432/shop npm start`.

## Try it

```bash
# Successful checkout -> 201 { orderId, status, amountCents }
curl -X POST localhost:3000/checkout -H 'content-type: application/json' \
  -d '{"productId": 1, "quantity": 2}'

# See the saved order
psql -d shop -c 'select * from orders;'

# See stock go down after each checkout
psql -d shop -c 'select * from inventory;'

# Restock a product (e.g. USB-C Hub back to 5)
psql -d shop -c 'update inventory set quantity = 5 where product_id = 3;'
```

Seed products:

| id | name                | price  | stock |
|----|---------------------|--------|-------|
| 1  | Mechanical Keyboard | $49.99 | 10    |
| 2  | Wireless Mouse      | $19.99 | 25    |
| 3  | USB-C Hub           | $29.99 | 5     |
| 4  | Sold Out Headphones | $89.99 | 0     |

Failure cases worth trying:

| Request                                  | Response |
|------------------------------------------|----------|
| `{"productId": 99, "quantity": 1}`       | 404 product not found |
| `{"productId": 4, "quantity": 1}`        | 409 not enough stock |
| `{"productId": 3, "quantity": 6}`        | 409 not enough stock |
| `{"productId": "1"}`                     | 400 invalid input |
| Stop the payment service, then check out | 500 internal error |

## Known simplifications (milestone 1)

- Each checkout decreases stock; once it hits 0, checkout returns 409. Stock is checked and
  decreased in one SQL statement, so two buyers can never both get the last unit.
- Stock is not given back if payment or saving the order fails after it was reserved.
- Payment always succeeds after a short random delay.
- When a downstream service is down, the order service logs `TypeError: fetch failed` and nothing
  says *which* service failed. Observability will fix that.
