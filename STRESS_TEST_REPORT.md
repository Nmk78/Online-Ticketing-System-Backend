# Stress Test Report: Hardened Ticket System

## Test Configuration
- **Database**: SQLite with WAL mode
- **Concert**: "Acoustic Horizons Unplugged" (4 tickets available)
- **Concurrent Users**: 5 simultaneous requests
- **Rate Limit**: 5 requests per minute per IP

## Method B — Pessimistic Locking Results

| User | Status | Result |
|------|--------|--------|
| user-1 | 201 | Reserved successfully |
| user-2 | 201 | Reserved successfully |
| user-3 | 201 | Reserved successfully |
| user-4 | 201 | Reserved successfully |
| user-5 | 409 | `Insufficient stock: 0 available, 1 requested` |

**Summary**: 4 succeeded, 1 failed (exactly matching available stock)

## Did the Locking Work?

**YES.** The in-memory request queue (SQLite-compatible fallback for pessimistic locking) ensured:

1. **Sequential processing**: All 5 requests hit the server simultaneously, but the queue serialized them
2. **Atomic stock check**: Each request checked stock before decrementing
3. **No over-booking**: When stock reached 0, the 5th request was rejected with a clean 409 Conflict response

### Why this happens with SQLite

SQLite doesn't support `SELECT ... FOR UPDATE` (pessimistic row locking). The assignment requirement for `setLock("pessimistic_write")` is designed for PostgreSQL/MySQL. For SQLite, I implemented:

- **In-memory request queue** — serializes all reservation requests per-process
- **Atomic SQL UPDATE** — `UPDATE concerts SET availableStock = availableStock - 1 WHERE availableStock >= 1`
- **Transaction rollback** — any failure rolls back the entire operation

### Production note

In production with PostgreSQL, the same code path uses `SELECT ... FOR UPDATE SKIP LOCKED` which provides true row-level locking at the database level — no application queue needed.

## Validation Flow Logs

```json
{"level":"warn","correlation_id":"validation-demo","error_code":"VALIDATION_ERROR","status":400,"msg":"Request validation failed"}
```

The same `correlation_id` ("validation-demo") appears across the entire request lifecycle:
1. Request received → correlation_id set
2. Validation error → correlation_id preserved
3. Error response → correlation_id returned as `ref` field

## Correlation ID Tracking

- Custom header `X-Correlation-ID: test-123` → preserved in all logs
- Auto-generated UUID → assigned when header missing, echoed in response headers
- Every log entry includes `correlation_id` field automatically via AsyncLocalStorage
