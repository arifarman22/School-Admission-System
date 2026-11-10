# School Admission System

An online admission system for a private school where seats are given **first come, first served**.
Each class can have several sections (for example "Class 1", sections A, B and C), each section has
a fixed number of seats, and thousands of guardians can apply at the same moment.

- Applying **holds** a seat in the student's name for 10 minutes.
- Confirming within that time (standing in for paying the admission fee) **confirms** the
  admission.
- A hold that isn't confirmed **expires** and its seat becomes available again.
- An admin creates classes and their sections from the UI. Each class + section pair can exist
  only once, so "Class 1 – A" can't be created twice.
- Guardians apply, confirm, cancel and follow their applications from the UI.

The core guarantee: **a class section never has more held + confirmed seats than its total**, no
matter how many requests arrive at once or how many service instances are running.

Decisions behind the design are in [ASSUMPTIONS.md](ASSUMPTIONS.md). How AI was used is in
[AI_USAGE.md](AI_USAGE.md).

## Technology stack

| Layer            | Technology                                                                          |
| ---------------- | ----------------------------------------------------------------------------------- |
| Frontend         | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Router 8, TanStack Query 5    |
| Public API       | ASP.NET Core 8 Web API (C#), typed `HttpClient`, RFC 9457 ProblemDetails            |
| Database service | Node.js 22, TypeScript 6, Express 5, Zod, Prisma ORM 7 (`@prisma/adapter-pg`), pino |
| Database         | PostgreSQL (Neon by default; PostgreSQL 18 container optional)                      |
| Tests            | Vitest, Supertest, React Testing Library, MSW 3, xUnit                              |
| Runtime          | Docker Compose; nginx (unprivileged) serves the built frontend                      |

## Architecture

```
Browser ── React SPA (nginx :5173)
   │  HTTP + X-Student-Id
   ▼
ASP.NET Core 8 public API (:8080)              validation, identity rules, ProblemDetails, CORS
   │  HTTP + X-Internal-Api-Key  (internal Docker network only)
   ▼
Node.js database service (:4000, no host port)  reservation engine, Prisma transactions
   │  Prisma ORM 7 over TLS
   ▼
PostgreSQL (Neon, or the optional local container)
```

- The browser only ever talks to the .NET API at `VITE_API_BASE_URL`. It never sees the internal
  hostname.
- The .NET API has no database access and no Entity Framework Core. All data access and the
  locking live in the Node service.
- The Node service rejects any request without the shared internal key and publishes no port.

## Folder structure

```
.
├── docker-compose.yml          all services; postgres behind the `local-db` profile
├── docker-compose.debug.yml    optional: exposes postgres/database-service on 127.0.0.1
├── .env.example                compose settings (copy to .env)
├── backend/
│   ├── SchoolAdmission.Api/    Controllers, Contracts, Clients, Errors, Filters, HealthChecks
│   ├── SchoolAdmission.Tests/  xUnit: endpoint, error-mapping and real-stack tests
│   └── Dockerfile              multi-stage: restore, test, publish, aspnet runtime
├── database-service/
│   ├── prisma/                 schema, migrations (incl. hand-written SQL), seed
│   ├── src/                    config, db, middleware, routes, services, types
│   ├── tests/                  unit tests + tests/integration (real PostgreSQL)
│   └── Dockerfile              targets: `migrate` (prisma migrate deploy) and `runtime`
└── frontend/
    ├── src/                    api, components, hooks, pages, types, utils, appRoutes.tsx
    ├── src/integration/        MSW component tests of the full app
    ├── src/e2e/                opt-in UI tests against the real running stack
    ├── nginx.conf              SPA fallback, caching, health endpoint
    └── Dockerfile              Vite build, then nginx
```

## Run with Docker

Only Docker is required.

```bash
cp .env.example .env    # fill in the values (see Environment variables)
docker compose up --build
```

| What          | URL                                  |
| ------------- | ------------------------------------ |
| Frontend      | <http://localhost:5173>              |
| Backend API   | <http://localhost:8080>              |
| API liveness  | <http://localhost:8080/health>       |
| API readiness | <http://localhost:8080/health/ready> |

Start-up order is enforced with health checks:

1. `migrate` runs `prisma migrate deploy` and exits.
2. `database-service` becomes healthy.
3. `backend` starts.
4. `frontend` starts.

The database service and PostgreSQL publish **no** host ports.

**Neon (default).** Set `DATABASE_URL` to the pooled connection string and `DIRECT_URL` to the
direct one, both with `sslmode=verify-full`.

**Local PostgreSQL instead.** Leave `DATABASE_URL` and `DIRECT_URL` empty, set
`POSTGRES_PASSWORD`, and use the profile:

```bash
docker compose --profile local-db up --build
docker compose --profile local-db down     # include the profile, or postgres keeps running
```

**Other commands**

```bash
docker compose run --rm migrate npx prisma db seed   # optional: seed Class 1 A (30), Class 1 B (30), Class 2 A (25)
HOLD_DURATION_SECONDS=30 docker compose up -d         # shorter holds for a demo
docker compose -f docker-compose.yml -f docker-compose.debug.yml --profile local-db up -d
                                                      # debugging: 127.0.0.1:5432 and 127.0.0.1:4000
```

## Screens

| Route                | Who      | What                                                                             |
| -------------------- | -------- | -------------------------------------------------------------------------------- |
| `/classes`           | Guardian | Class sections with live seat counts (every 3 s) and **Apply Now**              |
| `/applications/:id`  | Guardian | Status, countdown, **Confirm Admission**, **Cancel Application** (with a dialog) |
| `/me/applications`   | Guardian | Current applications and history                                                 |
| `/admin/classes/new` | Admin    | Create a class section with its seat count                                       |

When the site opens, a welcome screen asks for the student's 17-digit birth registration number
(spaces and dashes are accepted). It is kept in `localStorage` and shown, masked, at the top of
every page, where it can be changed or cleared. Admin pages don't need it.

The create-class page is a standard admin form: class name (suggesting existing classes), section
(with A–F quick picks; sections that already exist are greyed out and the next free one is
suggested) and total seats. A side panel lists the sections the class already has. Duplicates are
flagged while typing, before anything is sent, and the server rejects them again with
`409 CLASS_SECTION_TAKEN`. After saving, **Add another section** refills the form with the same
class and the next free section.

## API endpoints

Base URL `http://localhost:8080`. Endpoints marked ✔ under "Student ID" require the
`X-Student-Id` header (17 digits).

| Method | Path                       | Student ID | Success | Response body                                                                    |
| ------ | -------------------------- | ---------- | ------- | -------------------------------------------------------------------------------- |
| POST   | `/classes`                 |            | 201     | `{ id, name, section, totalSeats }` + `Location`                                 |
| GET    | `/classes`                 |            | 200     | `[{ id, name, section, totalSeats, heldSeats, confirmedSeats, availableSeats }]` |
| GET    | `/classes/{classId}`       |            | 200     | `{ id, name, section, totalSeats, heldSeats, confirmedSeats, availableSeats }`   |
| POST   | `/classes/{classId}/holds` | ✔          | 201     | `{ holdId, classId, studentId, status, expiresAt }` + `Location`                 |
| GET    | `/holds/{holdId}`          |            | 200     | `{ holdId, classId, status, expiresAt }`                                         |
| POST   | `/holds/{holdId}/confirm`  | ✔          | 200     | `{ holdId, status }`                                                             |
| DELETE | `/holds/{holdId}`          | ✔          | 204     | empty (the hold becomes `CANCELLED`; it is not deleted)                          |
| GET    | `/me/holds`                | ✔          | 200     | `[{ holdId, classId, className, section, status, expiresAt }]`, newest first     |

- `POST /classes` takes `{ "name": string, "section"?: string, "totalSeats": 1–10000 }`.
  - `section` is optional and defaults to `"A"`. It is trimmed, upper-cased, and may contain
    letters, numbers, spaces and hyphens (up to 20 characters).
  - Each (name, section) pair can exist only once, compared case-insensitively: a second
    `Class 1` / `A` returns `409 CLASS_SECTION_TAKEN`, while `Class 1` / `B` is accepted.
- Every class section is a separate class with its own numeric `id` and its own seats. Students
  apply to a specific section.
- Class IDs are positive integers (`1`, `2`, `3`, …) assigned by the database. Hold IDs are UUIDs.
- A student can have only **one confirmed admission** in total. Applying to or confirming another
  class afterwards returns `409 ALREADY_ADMITTED`.
- `status` is one of `HELD`, `CONFIRMED`, `EXPIRED`, `CANCELLED`.
- Timestamps are UTC ISO-8601.

**Errors** are `application/problem+json` with `status`, `title`, `detail`, a stable `code` and a
`traceId`:

| Status | `code`                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR` (with `errors` per field; unknown fields and numbers sent as strings are rejected)                                      |
| 401    | `STUDENT_ID_REQUIRED`                                                                                                                      |
| 403    | `HOLD_NOT_OWNED`                                                                                                                           |
| 404    | `NOT_FOUND`                                                                                                                                |
| 409    | `CLASS_SECTION_TAKEN`, `SEATS_FULL`, `DUPLICATE_APPLICATION`, `ALREADY_ADMITTED`, `HOLD_EXPIRED`, `HOLD_NOT_ACTIVE`, `HOLD_ALREADY_CONFIRMED` |
| 502    | `UPSTREAM_ERROR` (internal service failed; no internal details are returned)                                                               |
| 503    | `SERVICE_BUSY` (with `Retry-After: 1`), `SERVICE_UNAVAILABLE`                                                                              |
| 504    | `UPSTREAM_TIMEOUT`                                                                                                                         |

## Environment variables

Root `.env`, read by Docker Compose (template: [.env.example](.env.example)):

| Variable                              | Default                              | Purpose                                                |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------ |
| `DATABASE_URL`                        | local postgres                       | Runtime connection (Neon pooled URL)                   |
| `DIRECT_URL`                          | `DATABASE_URL`                       | Migrations (Neon direct URL)                           |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` | `admission` / — / `school_admission` | Only for the `local-db` profile                        |
| `INTERNAL_API_KEY`                    | required (≥ 16 chars)                | Shared secret between the API and the database service |
| `HOLD_DURATION_SECONDS`               | `600`                                | How long a hold lasts                                  |
| `VITE_API_BASE_URL`                   | `http://localhost:8080`              | Public API URL baked into the frontend build           |
| `CORS_ALLOWED_ORIGINS`                | `http://localhost:5173`              | Comma-separated browser origins allowed by the API     |
| `BACKEND_PORT` / `FRONTEND_PORT`      | `8080` / `5173`                      | Host ports                                             |
| `RESERVATION_LOCK_TIMEOUT_MS`         | `5000`                               | Max wait for a class lock before `503 SERVICE_BUSY`    |
| `RESERVATION_TX_TIMEOUT_MS`           | `15000`                              | Max seat-transaction time                              |
| `DATABASE_POOL_MAX`                   | `10`                                 | Connections per database-service instance              |

> **Careful with `DIRECT_URL`.** Prisma migrations use `DIRECT_URL` whenever it is set and only fall
> back to `DATABASE_URL` otherwise. When pointing commands at another database (for example a
> disposable test database), override **both** variables, or the migration runs against the
> database in `.env`.

Each service also has its own `.env.example` for running outside Docker:
[database-service](database-service/.env.example), [backend](backend/.env.example) and
[frontend](frontend/.env.example). In the API, `PRISMA_SERVICE_URL` and `INTERNAL_API_KEY` can
also be set through user-secrets.

## Try the API with Postman

1. In Postman choose **Import** and select
   [postman/SchoolAdmission.postman_collection.json](postman/SchoolAdmission.postman_collection.json).
2. Start the stack (`docker compose up --build`). The collection's `baseUrl` variable is
   `http://localhost:8080`.
3. Run the folders in order, or use **Run collection**. _Create class_ stores the new numeric
   `classId`, and _Apply_ stores `holdId`, so later requests use them automatically.
4. Change the `studentId` collection variable (17 digits) to act as a different student.

Every request has tests that check the status code (and the error `code` for the error
examples). The collection creates real classes and holds in whichever database the stack uses.

## Run without Docker (development)

```bash
# 1. database service (127.0.0.1:4000)
cd database-service && cp .env.example .env && npm install
npm run prisma:deploy && npm run db:seed && npm run dev

# 2. API (http://localhost:8080, Swagger at /swagger)
cd backend
dotnet user-secrets --project SchoolAdmission.Api set INTERNAL_API_KEY "<same key>"
dotnet run --project SchoolAdmission.Api --launch-profile http

# 3. frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

## Testing

| Suite                                        | Command (in the project folder)        | Needs                     |
| -------------------------------------------- | -------------------------------------- | ------------------------- |
| Database service unit tests (68)             | `npm test`                             | nothing                   |
| Database service PostgreSQL tests (72)       | `npm test` with the variables below    | a disposable PostgreSQL   |
| .NET API tests (170 + 7 real-stack)          | `dotnet test SchoolAdmission.sln`      | nothing / running service |
| Frontend component + MSW tests (111)         | `npm test`                             | nothing                   |
| Frontend UI tests against the real stack (6) | `E2E_FULL_STACK=true npm run test:e2e` | API on :8080              |

- **PostgreSQL tests:** set `TEST_DATABASE_URL=postgresql://…` and `TEST_DATABASE_DEDICATED=true`.
  Use a database you can throw away: holds can't be deleted, so test rows stay.
  `CONCURRENCY_ROUNDS` (default 5) sets how many times the burst tests repeat. To migrate that
  database first, set `DATABASE_URL` **and** `DIRECT_URL` to it before `npm run prisma:deploy`.
- **Real-stack .NET tests:** set `REAL_PRISMA_SERVICE_URL` and `REAL_INTERNAL_API_KEY`. Without
  them those 7 tests are reported as skipped.
- **.NET runtime:** the API targets .NET 8. On a machine with only a newer runtime, run the tests
  in Docker instead: `docker build --target build backend` runs the whole suite on the .NET 8 SDK.
- **Expiry UI test:** add `E2E_HOLD_SECONDS=8` and start the stack with `HOLD_DURATION_SECONDS=8`.

Static checks:

```bash
# database-service and frontend
npm run typecheck && npm run lint && npm run format:check && npm run build
# backend (warnings are errors; code style enforced)
dotnet build SchoolAdmission.sln -c Release && dotnet format SchoolAdmission.sln --verify-no-changes
```

## Concurrency design

Every operation that changes seat occupancy (apply, confirm, cancel) runs in one READ COMMITTED
transaction in [hold.service.ts](database-service/src/services/hold.service.ts):

1. Set `lock_timeout`, then lock the **class row** with `SELECT … FOR UPDATE`. Requests for the
   same class now run one at a time, in every service instance, because the lock is in PostgreSQL.
2. Read the time with `clock_timestamp()` after getting the lock.
3. Mark this class's expired `HELD` rows as `EXPIRED`.
4. Check for an active application by the same student, then count active `HELD` + `CONFIRMED`
   seats.
5. Reject with `DUPLICATE_APPLICATION`, `ALREADY_ADMITTED` or `SEATS_FULL`, or insert the hold.
   Commit.

Confirming checks that the student has no confirmed admission elsewhere. Two confirms by one
student in different classes lock different class rows, so a partial unique index
`(student_id) WHERE status = 'CONFIRMED'` makes the database refuse the second one; it surfaces as
`ALREADY_ADMITTED`.

**Why overselling can't happen.** The count and the insert happen while holding the class lock, and
every seat change takes that same lock first. So no two transactions can both see the last free
seat. Several safeguards back this up:

- Locks are always taken class row first, then hold row, so operations can't deadlock.
- A partial unique index on `(class_id, student_id) WHERE status IN ('HELD','CONFIRMED')` blocks a
  duplicate even if application logic were wrong.
- Rejections commit the expiry sweep, so stored statuses stay accurate.
- A request that can't get the lock within `RESERVATION_LOCK_TIMEOUT_MS` gets `503 SERVICE_BUSY`
  and changes nothing.

**Verified by:**

- 100 concurrent students for 10 seats, spread over three separate service processes: exactly 10
  holds and 90 `SEATS_FULL`, in every one of 20 rounds.
- Seat counts sampled during each burst never went negative.
- Removing `FOR UPDATE`, or switching to REPEATABLE READ, made those tests fail with overselling.

## Persistence

- All state is in PostgreSQL. The services are stateless and can be restarted or scaled.
- With the `local-db` profile, data lives in the named volume `pgdata`, so
  `docker compose down` / `up --build` keeps it. Only `docker compose down -v` deletes it.
- With Neon, data lives in the Neon project.
- Applications are never deleted (a database trigger blocks it). Status changes keep the full
  history.
- Seat counts are never stored. They are always computed from the rows, using database time.
- Migrations are versioned in `database-service/prisma/migrations` and applied on every start by
  the `migrate` job. `prisma db push` is not used.

## Known limitations

- **No authentication.** The student ID header identifies but does not authenticate. Anyone who
  knows a birth registration number can act for that student, and the admin page is open to
  everyone. Production needs guardian accounts or OTP and an admin role.
- **No payment gateway.** "Confirm Admission" stands in for a successful fee payment.
- **Limited admin features.** The admin can create classes and sections and see live counts, but
  can't rename, edit or close a class section or list its applicants.
- **Lazy expiry.** An expired hold frees its seat immediately in every count and read. Its stored
  status changes to `EXPIRED` at the next seat change for that class, since there is no background
  job.
- **The hold ID is a bearer reference.** `GET /holds/{id}` needs no student ID. It returns no
  personal data, and IDs are random UUIDs.
- **Polling, not push.** Seat counts refresh every 3 seconds. With very large audiences, server-sent
  events or a CDN-cached list would reduce load.
- **No rate limiting** on the public API.
- **No pagination on the class list.** Every class is rendered and refreshed every 3 seconds. That
  is fine for a school (tens of classes) but would need paging for hundreds.
- **`VITE_API_BASE_URL` is fixed at build time.** Changing it means rebuilding the frontend image.
- **Lock waits under extreme contention.** All applications for one class queue behind one row
  lock. Waits are capped by `RESERVATION_LOCK_TIMEOUT_MS` and return `503 SERVICE_BUSY`; they don't
  hang.
- **Browser clock.** The countdown uses the browser clock with the server's `expiresAt`. A wrong
  device clock shifts the display, but the server always decides validity.
- **Dev-only audit warnings.** `npm audit` reports moderate advisories in dev-only tooling
  (`minimatch` via ESLint/MSW). Production dependencies report none.
