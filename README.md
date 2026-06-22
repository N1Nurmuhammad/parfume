# Perfume Store

A small management dashboard for a perfume seller: clients, products (with stock
& cost), orders made of line items, selling on debt, and analytics with
date-range filters.

Built with FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL, with a
single-file vanilla-JS frontend (Chart.js for charts). Admin auth uses JWT with
bcrypt-hashed passwords.

The frontend supports **three languages** (English, Russian, Uzbek-Cyrillic),
**light & dark themes**, searchable client/product pickers, and inline
quick-add-client during order creation.

## Domain

- **Admin** — logs in to the dashboard (JWT).
- **Client** — `name`, `phone_number`, `birth_date`, and a `balance`
  (`< 0` = owes us / debt, `> 0` = prepaid credit).
- **Product** — `name`, `quantity` (stock), `price`, `cargo_price` (purchase cost).
- **PaymentType** — dynamic table with `name` + `is_debt` flag.
- **Order** — `client`, `discount` (percent), `subtotal`, `total`, and the admin
  who created it (`created_by` + timestamp).
- **OrderItem** — line item; snapshots `price` **and** `cargo_price` at sale time
  so profit stays accurate after product cost edits. Creating an order decrements
  product stock.
- **OrderPayment** — one payment line (payment type + amount). An order can be
  **split across several payment types** (e.g. part card, part cash); the amounts
  must sum to the order total. A debt-type line charges that amount to the client.
- **BalanceLog** — append-only audit ledger of every balance change: the delta,
  resulting balance, reason (`order_debt` / `payment` / `adjustment`), linked
  order, note, **which admin made it, and when**.

Money math: `total = subtotal·(1 − discount/100)`, `profit = total − Σ(cargo·qty)`.
Each debt-type payment line subtracts its amount from the client's balance (logged).

## Run with Docker (recommended)

```bash
cp .env.example .env          # then edit JWT_SECRET / ADMIN_* / DB creds
docker compose up --build
```

The app container runs migrations, bootstraps the first admin + default payment
types, then serves on http://localhost:8090. Log in with `ADMIN_LOGIN` /
`ADMIN_PASSWORD` from `.env`.

## Run locally (without Docker)

Requires a reachable PostgreSQL. Point `DATABASE_URL` at it, then:

```bash
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://parfume:parfume@localhost:5432/parfume"
export JWT_SECRET="..." ADMIN_LOGIN="admin" ADMIN_PASSWORD="..."
alembic upgrade head
python -m app.scripts.create_admin     # seeds admin + payment types (idempotent)
uvicorn app.main:app --reload --port 8090
```

## Layout

```
app/
  main.py            FastAPI app + static frontend
  config.py          env-driven configuration
  database/          models, async engine/session, repository layer
  schemas/           Pydantic request/response contracts
  api/               HTTP routers (auth, clients, products, payment-types,
                     orders, analytics, health)
  services/          security (bcrypt + JWT)
  scripts/           create_admin bootstrap
  static/index.html  single-file dashboard
alembic/             migrations
```

## API

All routes are under `/api`. `POST /api/auth/login` is public and returns a JWT;
every other route requires `Authorization: Bearer <token>`. See `/docs` for the
full interactive schema. Analytics endpoints (`/api/analytics/*`) and
`GET /api/orders` accept optional `date_from` / `date_to` (YYYY-MM-DD) query
params; the window is half-open and inclusive of `date_to`'s day.

Resource routers: `auth`, `admins` (list/create/delete — can't delete yourself or
the last admin), `clients` (+ `/{id}/balance`, `/{id}/balance-logs`), `products`,
`payment-types`, `orders`, `analytics`.

Constraint violations (duplicate phone / payment-type name / admin login, or
deleting a record still referenced by an order) return **409** with a stable
`code` (`duplicate` / `in_use` / `conflict`) that the frontend translates — never
a 500.

## Development note

`docker-compose.yml` bind-mounts `app/static`, so **frontend** edits show on a
page refresh. **Backend** (Python) changes require `docker compose up --build`.
Because the project is pre-release, the schema ships as a single regenerated
initial migration — if you change models and hit "Can't locate revision", reset
the dev DB with `docker compose down -v`. Switch to additive migrations once you
have real data.
# parfume
