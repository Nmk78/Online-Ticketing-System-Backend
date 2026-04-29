# Concert Ticketing API

A Node.js/Express concert ticket reservation system with ACID transaction guarantees, SQLite + TypeORM, and scheduled cleanup of expired holds.

## Quick Start

```bash
npm install
npx ts-node src/scripts/migrate.ts
npx ts-node src/seed.ts
npx ts-node-dev src/index.ts
```

API runs on `http://localhost:3000`. Web UI tester at `http://localhost:3000/test-ui.html`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/concerts` | List all concerts with stock |
| `POST` | `/reserve` | Reserve a ticket (5-min hold) |
| `POST` | `/purchase` | Confirm a reservation |
| `POST` | `/cleanup` | Manual expired-reservation cleanup |
| `GET` | `/reservations` | List reservations (filter by userId, status) |

---

## 1. Schema Evolution — Migrations

### Migration 1: `InitialSchema` (1714000000000)

Creates the three core tables:

- **concerts** — event metadata with `totalStock` / `availableStock` counters
- **tickets** — individual ticket rows with `status` (AVAILABLE → RESERVED → SOLD)
- **reservations** — 5-minute holds with `expiresAt` and `status` (PENDING → COMPLETED/CANCELLED)

Indexes created:
- `IDX_ticket_concertId` on `tickets(concertId)` — B-Tree for fast ticket lookup per concert
- `IDX_reservation_pending_status` on `reservations(status, expiresAt) WHERE status = 'PENDING'` — partial index for the cleanup job

### Migration 2: `AddTicketCategory` (1714000001000)

Adds a `category` column (`'VIP' | 'General'`) to the `tickets` table via `ALTER TABLE ... ADD COLUMN` with a `DEFAULT 'General'` so existing rows are backfilled automatically. The `down()` migration demonstrates full SQLite rollback support by recreating the table without the column.

---

## 2. Index Verification — EXPLAIN QUERY PLAN

SQLite does not have `EXPLAIN ANALYZE` — the equivalent is `EXPLAIN QUERY PLAN`. The output below proves both indexes are hit:

### Ticket Lookup (used by `/reserve`)

```sql
EXPLAIN QUERY PLAN SELECT * FROM tickets WHERE concertId = 1 AND status = 'AVAILABLE';
```

```
QUERY PLAN
`--SEARCH tickets USING INDEX IDX_ticket_concertId (concertId=?)
```

**Result:** Uses `IDX_ticket_concertId` — O(log n) instead of a full table scan.

### Cleanup Scan (used by the cron job every minute)

```sql
EXPLAIN QUERY PLAN SELECT * FROM reservations WHERE status = 'PENDING' AND expiresAt < datetime('now');
```

```
QUERY PLAN
`--SEARCH reservations USING INDEX IDX_reservation_pending_status (status=? AND expiresAt<?)
```

**Result:** Uses the **partial index** `IDX_reservation_pending_status`. Only PENDING rows are in the index, so the cleanup query stays fast even after months of completed/cancelled reservations accumulate.

---

## 3. The Double-Selling Problem

### The Problem

Two users simultaneously request the last ticket for the same concert. Without protection, both could read `availableStock = 1`, both pass the stock check, and both create a reservation — resulting in overselling.

### The Solution

**ACID Transactions via TypeORM `QueryRunner`:**

Every reservation runs inside a single transaction (`BEGIN ... COMMIT / ROLLBACK`):

1. **Read the concert row** inside the transaction to get `availableStock`
2. **Check stock > 0** — if not, throw and rollback
3. **Find an AVAILABLE ticket** and lock it within the same transaction
4. **Decrement `availableStock`** and save
5. **Mark ticket as RESERVED**
6. **Insert the Reservation** record with `expiresAt`
7. **COMMIT** — only now are the changes visible to other transactions

Because SQLite serializes all writes at the WAL level, two concurrent transactions cannot interleave their reads and writes. The second transaction will wait until the first commits or rolls back, at which point it reads the updated stock value.

**Additional safety layers:**

- **`UNIQUE("ticketId")`** on the reservations table prevents the same ticket from being double-reserved at the database level
- **Transaction rollback** on any failure restores stock automatically — no manual recovery needed
- **Purchasing validation** re-checks ownership, status, and expiry before marking a ticket SOLD

---

## 4. Index Design Decisions

### `IDX_ticket_concertId` on `tickets(concertId)`

**Why:** Every reservation starts by finding an available ticket for a specific concert. Without this index, the database must scan the entire `tickets` table (O(n)). With the B-Tree index, it jumps directly to the matching concert's tickets (O(log n)).

**Why not compound index on `(concertId, status)`?** The status filter is a simple equality check on a small set of values, and SQLite's query planner can handle it efficiently on the single-column index. Adding status would increase index size without meaningful benefit since `concertId` already narrows the search dramatically.

### `IDX_reservation_pending_status` — Partial Index

**Why partial:** The cleanup job only cares about `PENDING` reservations. COMPLETED and CANCELLED rows are never queried again. A full index on `(status, expiresAt)` would grow with every historical reservation, wasting memory and disk. The partial index only contains active holds, keeping it tiny.

**Why both `status` and `expiresAt`:** The cleanup query filters on both columns (`WHERE status = 'PENDING' AND expiresAt < ?`). Including both in the index lets SQLite satisfy the entire query from the index without touching the table data.

---

## 5.(AI) — Helped vs Hindered

### Helped

- **Boilerplate generation:** TypeORM entity definitions, migration scaffolding, and Express route handlers were produced rapidly, letting me focus on the transaction logic and index strategy rather than decorator syntax.
- **Edge case surfacing:** AI prompted me to think about what happens when a purchase fails mid-transaction, leading to the explicit rollback + stock-restoration pattern.
- **EXPLAIN verification:** AI helped construct the correct SQLite `EXPLAIN QUERY PLAN` syntax and interpret the output to confirm indexes were actually being used (not just created).

### Hindered

- **Over-engineering temptation:** AI initially suggested adding Redis-based distributed locks and `SELECT ... FOR UPDATE` — unnecessary complexity for a SQLite-backed service where write serialization is built in. I had to push back and keep the solution proportional to the stack.
- **SQLite limitations:** AI sometimes assumed PostgreSQL features (`FOR UPDATE`, concurrent transaction isolation levels) that don't exist in SQLite. Understanding the actual database capabilities required manual verification.
- **Index overkill:** AI suggested composite indexes on every foreign key. I had to evaluate which queries actually needed them and avoid adding indexes that would slow down writes without improving reads.

**Bottom line:** AI accelerated implementation but required human judgment to stay grounded in the actual constraints of SQLite and avoid unnecessary architectural complexity.
