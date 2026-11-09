# School Admission System

Take-home assignment for the Assistant Software Engineer role. Students reserve a seat in a class,
then confirm it before the hold expires. An admin creates classes. Seats can never be oversold,
even when many students apply for the last seat at the same moment.

## Features

- **Admin:** create a class with a name and a fixed number of seats.
- **Students:**
  - Browse classes with live seat counts (total, held, confirmed, available), refreshed every 3
    seconds.
  - Apply for a class. This creates a 10-minute **hold** on one seat.
  - See the application with a live countdown, then **confirm** it or **cancel** it (a
    confirmation dialog is shown first).
  - See current applications and history under **My applications**.
- **Rules enforced by the server:**
  - A class never has more held + confirmed seats than its total.
  - A student has at most one active application per class.
  - An expired hold frees its seat automatically.
  - Only the student who made an application can confirm or cancel it.

## Architecture

```
React (Vite, :5173)
   │  HTTP (public), X-Student-Id header identifies the student
   ▼
ASP.NET Core 8 API (:8080)
   │  HTTP + X-Internal-Api-Key (internal network only)
   ▼
Node.js / TypeScript database service (:4000, not published)
   │  Prisma ORM 7 (pg driver adapter)
   ▼
PostgreSQL on Neon (TLS, pooled URL at runtime / direct URL for migrations)
```

| Folder              | Stack                                                                      | Purpose                                           |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| `frontend/`         | React 19, Vite 8, TypeScript 6, Tailwind CSS 4, TanStack Query 5, Router 8 | UI; talks **only** to the .NET API                |
| `backend/`          | ASP.NET Core 8 Web API, xUnit                                              | Public API, validation, ownership, ProblemDetails |
| `database-service/` | Node 22, Express 5, TypeScript 6, Prisma 7, Zod, Vitest                    | Internal data access and the reservation engine   |

The .NET API does not use EF Core and never connects to PostgreSQL. All data access goes through
the internal service, which is not reachable from the browser.

## Prerequisites

- Node.js **22.18+** (Prisma 7 requirement)
- .NET SDK **8.0**
- A [Neon](https://neon.tech) project (verified on PostgreSQL 18.6; also tested on 17)
- Docker Desktop (optional, for the full stack)

## Neon setup

1. Create a Neon project and database.
2. In **Connect**, copy two connection strings:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`, used by the running service.
   - **Direct** (pooling toggled off) → `DIRECT_URL`, used by the Prisma CLI for migrations.
3. Change `sslmode=require` to `sslmode=verify-full`. `pg` treats them the same but warns about
   `require`. Channel binding is enabled in code.

## Run everything with Docker

```bash
cp .env.example .env        # paste the Neon URLs, set INTERNAL_API_KEY
docker compose up --build   # the `migrate` job runs `prisma migrate deploy` first
docker compose run --rm migrate npm run db:seed   # optional: seed the two classes
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:8080/health> and <http://localhost:8080/health/ready>
- The database service publishes **no** host port.

## Run locally (without Docker for the apps)

**1. Database service** (port 4000, bound to 127.0.0.1):

```bash
cd database-service
cp .env.example .env          # Neon DATABASE_URL + DIRECT_URL, INTERNAL_API_KEY
npm install
npm run prisma:deploy         # apply committed migrations (prisma migrate deploy)
npm run db:seed               # idempotent: creates "Class 1" (30) and "Class 2" (25)
npm run dev
```

**2. API** (port 8080). ASP.NET Core does not read `.env` files. Use user-secrets for the key:

```bash
cd backend
dotnet user-secrets --project SchoolAdmission.Api set "DatabaseService:ApiKey" "<same INTERNAL_API_KEY>"
dotnet run --project SchoolAdmission.Api --launch-profile http
```

In Development the API calls the database service at `http://localhost:4000`. Override it with
`PRISMA_SERVICE_URL`. The key can also come from the `INTERNAL_API_KEY` environment variable.
Swagger UI is available at <http://localhost:8080/swagger> in Development.

**3. Frontend** (port 5173):

```bash
cd frontend
cp .env.example .env.local    # optional; defaults to http://localhost:8080
npm install
npm run dev
```

## Screens

| Route                | Screen                                                             |
| -------------------- | ------------------------------------------------------------------ |
| `/classes`           | Class list with live seat counts and **Apply now**                 |
| `/applications/:id`  | Application details: status, countdown, **Confirm** and **Cancel** |
| `/me/applications`   | The student's current applications and history                     |
| `/admin/classes/new` | Create a class                                                     |

A student enters their 17-digit student ID once. It is saved in the browser and sent as the
`X-Student-Id` header. This is identification only, not authentication. See
[ASSUMPTIONS.md](ASSUMPTIONS.md).

- **Live data:** the class list polls every 3 seconds and never starts a new request while one is
  still running. If a refresh fails, the page keeps the last data and says it may be out of date.
- **Server is the source of truth:** a status such as `CONFIRMED` or `EXPIRED` is shown only after
  the server reports it. When the countdown reaches zero, the page asks the server again.

## Public API (.NET)

| Method | Path                       | Student ID | Result                                               |
| ------ | -------------------------- | ---------- | ---------------------------------------------------- |
| POST   | `/classes`                 | —          | 201 created class; 409 `CLASS_NAME_TAKEN`            |
| GET    | `/classes`                 | —          | All classes with held, confirmed and available seats |
| GET    | `/classes/{classId}`       | —          | One class; 404 if unknown                            |
| POST   | `/classes/{classId}/holds` | required   | 201 hold (`HELD`, `expiresAt`)                       |
| GET    | `/holds/{holdId}`          | —          | The hold with its current status                     |
| POST   | `/holds/{holdId}/confirm`  | required   | 200 hold with status `CONFIRMED`                     |
| DELETE | `/holds/{holdId}`          | required   | 204 No Content; the hold becomes `CANCELLED`         |
| GET    | `/me/holds`                | required   | The student's holds, newest first                    |

A missing `X-Student-Id` returns 401 `STUDENT_ID_REQUIRED`; an invalid one returns 400.

Errors are [RFC 9457 ProblemDetails](https://www.rfc-editor.org/rfc/rfc9457)
(`application/problem+json`) with a machine-readable `code` and a `traceId`:

| Status | Codes                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR` (unknown JSON fields and numbers sent as strings are rejected)                  |
| 403    | `HOLD_NOT_OWNED`                                                                                   |
| 404    | `NOT_FOUND`                                                                                        |
| 409    | `SEATS_FULL`, `DUPLICATE_APPLICATION`, `HOLD_EXPIRED`, `HOLD_NOT_ACTIVE`, `HOLD_ALREADY_CONFIRMED` |
| 503    | `SERVICE_BUSY` (lock wait timed out, safe to retry), `DATABASE_UNAVAILABLE`                        |

CORS allows only the origins in `Cors:AllowedOrigins` (`CORS_ALLOWED_ORIGINS` in Docker).

## Internal database service API

Every route requires `X-Internal-Api-Key`, checked before the body is read. Request and response
contracts live in [database-service/src/types/](database-service/src/types/).

| Method | Path                         | Notes                                                   |
| ------ | ---------------------------- | ------------------------------------------------------- |
| POST   | `/classes`                   | `{ name, totalSeats }` → 201 `{ data: Class }`          |
| GET    | `/classes`                   | `{ data: Class[] }` with held/confirmed/available seats |
| GET    | `/classes/:classId`          | `{ data: Class }`                                       |
| POST   | `/holds`                     | `{ classId, studentId }` → 201 `{ data: Hold }`         |
| GET    | `/holds/:holdId`             | `{ data: Hold }`                                        |
| POST   | `/holds/:holdId/confirm`     | `{ studentId }`                                         |
| POST   | `/holds/:holdId/cancel`      | `{ studentId }`                                         |
| GET    | `/students/:studentId/holds` | `{ data: Hold[] }`                                      |

Errors always look like
`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "path": "name", "message": "..." }] }, "requestId": "..." }`.

## Seat reservation engine

The engine is in [database-service/src/services/hold.service.ts](database-service/src/services/hold.service.ts).
Every operation that changes seats runs in one READ COMMITTED transaction:

1. Set `lock_timeout`, then lock the class row with `SELECT … FOR UPDATE`. Requests for the same
   class wait in line; other classes are not affected.
2. Read the time from the database (`clock_timestamp()`), after the lock.
3. Mark this class's expired `HELD` rows as `EXPIRED`.
4. Count active holds and confirmations, and reject with `SEATS_FULL` if none are left.
5. Insert the hold.

Locks are always taken in the same order (class row, then hold row), so operations cannot
deadlock. A partial unique index blocks a second active application by the same student, and
triggers stop holds being deleted. Reads report a past-expiry `HELD` hold as `EXPIRED` without
waiting for a write.

Tests prove the locking matters: removing `FOR UPDATE` oversold 13 holds for 10 seats, and so did
switching to REPEATABLE READ.

| Variable                      | Default | Meaning                                |
| ----------------------------- | ------- | -------------------------------------- |
| `HOLD_DURATION_SECONDS`       | 600     | How long a hold lasts                  |
| `RESERVATION_LOCK_TIMEOUT_MS` | 5000    | Max wait for the class lock (then 503) |
| `RESERVATION_TX_TIMEOUT_MS`   | 15000   | Max transaction time                   |
| `DATABASE_POOL_MAX`           | 10      | Connection pool size                   |

## Health endpoints

| Service          | Endpoint            | Meaning                                                    |
| ---------------- | ------------------- | ---------------------------------------------------------- |
| API              | `GET /health`       | Liveness: the process is up, no dependency checks          |
| API              | `GET /health/ready` | Readiness: the database service (and so Postgres) is ready |
| Database service | `GET /health`       | Liveness (requires `X-Internal-Api-Key`)                   |
| Database service | `GET /health/ready` | Runs `SELECT 1` through Prisma; 503 if the DB is down      |

## Database

Schema: [database-service/prisma/schema.prisma](database-service/prisma/schema.prisma).
Migrations: [database-service/prisma/migrations/](database-service/prisma/migrations/).

| Object                                | Purpose                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `admission_classes`                   | Classes with a fixed `total_seats` (> 0) and a unique, non-blank `name` |
| `admission_holds`                     | Seat holds and confirmations. Never deleted, so history is kept         |
| `admission_class_availability` (view) | `held_seats`, `confirmed_seats`, `available_seats` from DB time         |

| Command                    | What it does                                                    |
| -------------------------- | --------------------------------------------------------------- |
| `npm run prisma:migrate`   | Dev only: create and apply a new migration (`migrate dev`)      |
| `npm run prisma:deploy`    | Apply committed migrations (`migrate deploy`, production)       |
| `npm run prisma:status`    | Show applied and pending migrations                             |
| `npm run db:seed`          | Seed the two classes (safe to re-run)                           |
| `npm run test:integration` | Schema tests. Needs `TEST_DATABASE_URL` with migrations applied |

`prisma db push` is not used. All schema changes go through committed migrations. See
[ASSUMPTIONS.md](ASSUMPTIONS.md#database-schema) for constraint details.

## Tests and quality checks

| Suite                              | Count | What it covers                                                          |
| ---------------------------------- | ----- | ----------------------------------------------------------------------- |
| Database service unit tests        | 62    | Routes, validation, auth, error envelope, config                        |
| Database service integration tests | 44    | Schema constraints, concurrent applications, hold lifecycle on Postgres |
| .NET API tests                     | 65    | All endpoints, ProblemDetails, student ID rules, CORS, strict JSON      |
| Frontend component tests           | 45    | Workflow screens plus countdown, expiry, focus, reconnect, cleanup      |
| Frontend full-stack tests (opt-in) | 6     | Real pages against the real API, database service and PostgreSQL        |

```bash
# database-service
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
TEST_DATABASE_URL=postgresql://... npm run test:integration   # use a disposable database

# frontend
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
E2E_FULL_STACK=true npm run test:e2e   # needs the API on :8080 with the database service running
E2E_FULL_STACK=true E2E_HOLD_SECONDS=8 npm run test:e2e   # also runs the expiry test; start the database service with HOLD_DURATION_SECONDS=8

# backend
dotnet build SchoolAdmission.sln -c Release      # warnings are errors, code style enforced
dotnet test SchoolAdmission.sln
dotnet format SchoolAdmission.sln --verify-no-changes
```

The full-stack tests create classes and holds with an `E2E` name prefix, so run them against a
test database, not production.

## Configuration

All configuration comes from environment variables. Each service has a `.env.example`. Real `.env`
files are git-ignored. See [ASSUMPTIONS.md](ASSUMPTIONS.md) for design decisions and
[AI_USAGE.md](AI_USAGE.md) for how AI tools were used.
