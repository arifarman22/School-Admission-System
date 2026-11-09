# Assumptions

The brief (section 1.1, translated from Bengali):

> A private school is taking admissions online for the new academic year. Admission is
> **first come, first served — there is no lottery**. Every **shift of every class has a limited
> number of seats** (for example "Class 6 – Morning Shift" has 120). As soon as admission opens,
> **thousands of guardians apply at the same time**.
>
> When someone applies, a seat is **held** in the student's name **for a limited time**. If the
> admission fee is paid within that time, the admission is **confirmed**. If it is not paid in time,
> the seat **opens up for others** again.
>
> Build both the backend and the React UI. The **school admin and guardians do everything from the
> UI**.
>
> The brief does not spell everything out. Assume whatever is reasonable and record it in
> `ASSUMPTIONS.md` with reasons.

Each assumption below names the part of the brief it interprets and why it was chosen.

## Admission model

### A class-and-shift is one "class"

- **Brief:** seats are limited per shift of each class, e.g. "Class 6 – Morning Shift" (120).
- **Assumption:** every class/shift combination is its own `AdmissionClass` with its own name and
  `totalSeats`, for example `Class 6 – Morning Shift` and `Class 6 – Day Shift`. There is no
  separate Shift entity.
- **Why:** seats are counted per shift, so the shift is the unit of capacity. One flat entity keeps
  the locking unit, the capacity rule and the UI identical for every class. A Class → Shift
  hierarchy would only add joins without changing any rule. Splitting them later is a schema
  migration, not a redesign.
- Class names are unique and case-sensitive after trimming and collapsing whitespace.

### "First come, first served" means first to reach the database

- **Brief:** first come, first served, no lottery, thousands applying at once.
- **Assumption:** "first" is the order in which applications reach the class's database row lock.
  Each class row acts as a queue: PostgreSQL grants `SELECT … FOR UPDATE` to waiting transactions
  approximately in the order they asked. This is not a strict FIFO guarantee, but it is never a
  random draw. Once the seats are gone, everyone after that gets `409 SEATS_FULL`.
- **Why:** there is no fair clock across thousands of browsers. Client timestamps can be forged,
  and network delay before the server is outside the school's control. The database lock is the
  first point where requests are strictly ordered. There is no waiting list or lottery, as the
  brief rules them out.

### The student is identified by a 17-digit birth registration number

- **Brief:** the seat is held "in the student's name"; guardians apply.
- **Assumption:** the student is identified by their Bangladeshi **birth registration number**:
  exactly 17 ASCII digits, stored as text so leading zeros survive. A guardian types it once; the
  browser keeps it in `localStorage` and sends it as the `X-Student-Id` header.
- **Why:** it is the identifier every applicant already has, and it is unique per child. That
  makes "one application per student per class" enforceable without accounts.
- Only the format is checked. The number is not verified against a government registry.

### No login

- **Brief:** guardians and the admin use the UI; accounts are not mentioned.
- **Assumption:** there is no authentication. The student ID header is identification, not proof
  of identity. The admin screen is open as well.
- **Why:** authentication is out of scope for the exercise, and it would hide the core problem
  (seat reservation). The trade-off is listed in the README's known limitations: anyone who knows
  a birth registration number can act for that student. Production would need guardian accounts
  (or OTP) and an admin role. The API keeps the identity check in one filter so this can be added
  in one place.

### Default hold duration is 600 seconds

- **Brief:** the seat is held "for a limited time"; no duration given.
- **Assumption:** 10 minutes, set by `HOLD_DURATION_SECONDS` (default `600`).
- **Why:** long enough to pay a fee online, short enough that abandoned holds come back during an
  admission rush. It is configuration, so the school can change it without code. Tests use 1–8
  seconds.

### Confirming stands in for paying the fee; there is no payment gateway

- **Brief:** admission is confirmed when the fee is paid within the hold time.
- **Assumption:** the **Confirm Admission** button represents a successful fee payment. No real
  payment gateway, amount or receipt is involved.
- **Why:** a gateway needs merchant credentials and callbacks that a take-home can't have. What
  matters for the seat rules is that confirmation is server-checked, rejected after expiry, and
  safe to repeat. A real integration would call the same `confirm` operation from the gateway's
  success webhook, which is why confirmation is idempotent (below).

### Applications are never deleted

- **Brief:** a seat not paid for in time "opens up for others".
- **Assumption:** a hold is never deleted. It moves through
  `HELD → CONFIRMED`, `HELD → EXPIRED` or `HELD → CANCELLED`, and the row stays as history. A
  database trigger blocks `DELETE` on holds, and another trigger blocks changes to a hold's id,
  class, student and creation time.
- **Why:** an admission office needs an audit trail of who applied, when, and what happened. A
  released seat is shown by the status, not by removing the row. My applications shows current
  and past applications.

### One active application per student per class

- **Assumption:** a student may have at most one `HELD` or `CONFIRMED` application per class.
  Another attempt gets `409 DUPLICATE_APPLICATION`, and the UI links to the existing application.
  The same student may apply to different classes, and may apply again to the same class after an
  earlier hold expired or was cancelled.
- **Why:** one child can't take two seats in one shift, but guardians often apply to more than one
  shift as a backup. The brief doesn't forbid that, so the school decides at enrolment.
- **Enforced twice:**
  1. Inside the locked transaction.
  2. By a partial unique index `(class_id, student_id) WHERE status IN ('HELD','CONFIRMED')`, which
     also stops duplicates from concurrent requests and bugs.

### One confirmed admission per student

- **Assumption:** a student may hold seats in several classes at once (as backups), but can be
  **confirmed in only one class**. Once confirmed:
  - confirming another class returns `409 ALREADY_ADMITTED`;
  - applying to another class also returns `409 ALREADY_ADMITTED`.
- **Why:** a child is admitted to one class and shift. Letting an admitted student hold more seats
  would take seats from other children for nothing. Their other held seats can still be cancelled
  and otherwise expire normally.
- **Enforced twice:**
  1. Inside the locked transaction, before applying or confirming.
  2. By a partial unique index `(student_id) WHERE status = 'CONFIRMED'`. Confirms in different
     classes lock different class rows, so only the index can stop a student confirming two
     classes at the same instant. A test confirms one student's four holds simultaneously across
     three service processes and gets exactly one admission.
- The UI shows this up front: an "Admission confirmed" banner on the class list, "Already admitted
  to …" instead of Apply Now on other classes, and a disabled Confirm (with Cancel still allowed) on
  any other held seat.

### Class IDs are numbers

- **Assumption:** classes are identified by a database-generated positive integer (`1`, `2`, …)
  instead of a UUID. Hold IDs stay UUIDs.
- **Why:** staff and guardians read and say class numbers ("Class #3"); a UUID is unusable for
  that. Hold IDs remain UUIDs because they act as unguessable references.
- Existing data was migrated in place: classes were numbered in creation order and every hold was
  remapped in one transaction. The migration was rehearsed on a copy of the Neon database first.

### Confirming is idempotent

- **Assumption:** confirming an already-confirmed application returns `200` with the same body. It
  doesn't fail, and the confirmation time doesn't change.
- **Why:** a guardian may double-click, or retry after a network timeout without knowing whether
  the first attempt worked. A payment webhook is usually delivered at least once. All of these
  should be safe.
- Confirming an `EXPIRED` application returns `409 HOLD_EXPIRED`. Confirming a `CANCELLED` one
  returns `409 HOLD_NOT_ACTIVE`. Confirming another student's application returns
  `403 HOLD_NOT_OWNED`.

### Cancellation rules

- **Assumption:** only the student who made the application can cancel it, and only while it is
  `HELD`. Cancelling releases the seat immediately. Cancelling again is idempotent (`204`).
  A `CONFIRMED` application can't be cancelled (`409 HOLD_ALREADY_CONFIRMED`), and an `EXPIRED`
  one can't either (`409 HOLD_EXPIRED`).
- **Why:** once the fee is paid, giving up a seat is a refund and withdrawal process with the
  school, not a button. Cancelling a hold lets a guardian who changed their mind free the seat for
  someone else without waiting out the timer. The UI asks for confirmation first.

### Expiry uses database time, stored in UTC

- **Assumption:** every time decision uses the **database server's clock**:
  - `created_at`/`expires_at` are set from `clock_timestamp()` inside the transaction.
  - Seat counts treat a hold as active only while `expires_at > now()`.
- All timestamps are `timestamptz` and the API returns them as UTC ISO-8601 (`…Z`). The browser
  only formats them in local time.
- **Why:** with several service instances and thousands of browsers, only one clock can be
  trusted. The browser countdown is shown for convenience and is computed from the server's
  `expiresAt`. The UI never treats a hold as expired until the server says so.
- **Expiry is lazy; there is no background job.** An expired hold stops counting toward capacity
  the moment its time passes, because every count compares `expires_at` with database time. Reads
  report it as `EXPIRED` straight away. The stored status changes to `EXPIRED` during the next seat
  change for that class, including a rejected one. A scheduled job isn't needed for correctness
  and would be one more moving part.

### Admin capabilities

- **Brief:** the admin does everything from the UI.
- **Assumption:** the admin creates classes, setting name and seats, and watches live seat counts.
  There is no admin login, and no screens for editing or closing a class or listing a class's
  applicants.
- **Why:** these are the admin actions the admission rules depend on. The others are listed as
  known limitations.

## Concurrency strategy (PostgreSQL)

- **Brief:** thousands of guardians apply at the same moment.
- **Rule:** for every class, `active HELD + CONFIRMED ≤ totalSeats`, across any number of requests
  and any number of service instances.
- **How:** every operation that can change seat occupancy (apply, confirm, cancel) runs in one
  READ COMMITTED transaction:
  1. Set `lock_timeout`.
  2. `SELECT … FOR UPDATE` on the **class row**. This makes requests for the same class run one at
     a time.
  3. Read `clock_timestamp()` after the lock.
  4. Mark this class's expired holds as `EXPIRED`.
  5. Check for a duplicate application and count the occupied seats.
  6. Insert or update the hold, then commit.
- **Lock order is always class row, then hold row**, so operations can't deadlock. Different classes
  lock different rows and proceed in parallel.
- **Why a row lock:**
  - Not an in-memory mutex or Redis: those don't protect multiple instances or need extra
    infrastructure.
  - Not optimistic retries: under thousands of competing requests these would mostly fail and
    retry.
  - Not SERIALIZABLE: equivalent here, but it gives serialization errors instead of a simple wait.
  - The lock lives in the database every instance already shares, so correctness doesn't depend on
    how many service instances run.
- **Evidence:**
  - Tests run against real PostgreSQL with three separate service processes. 100 students
    applying for 10 seats produced exactly 10 holds and 90 `SEATS_FULL`, repeated for 20 rounds.
  - Removing `FOR UPDATE` made those tests fail: 12 holds were sold for 10 seats. Switching to
    REPEATABLE READ also oversold.
- **Overload:** if a request waits longer than `RESERVATION_LOCK_TIMEOUT_MS` (default 5 s), it fails
  with `503 SERVICE_BUSY` and `Retry-After: 1`, and nothing is written. It is never queued
  indefinitely.

## Architecture

### .NET API in front of a Node.js + Prisma database service

- **Stack used:** React (Vite, TypeScript, Tailwind CSS) → ASP.NET Core 8 public API → Node.js 22
  TypeScript service using Prisma ORM 7 → PostgreSQL. This follows the technology list and
  architecture diagram I was asked to build: ASP.NET Core 8 and Node.js/Prisma, with no Entity
  Framework Core.
- **Responsibilities:**
  - The **.NET API** is the only public backend. It does HTTP validation, the student-identity
    rules, the RFC 9457 error format, CORS and health checks.
  - The **Node service** is internal. It owns all database access and the reservation engine.
  - They talk over HTTP with a shared `X-Internal-Api-Key`. The Node service has no public port.
- **Possible compliance concern:** if the reviewers' original brief expected the backend to be a
  single ASP.NET Core application with direct database access, this hybrid adds an extra network
  hop and a second runtime for the same feature set.
  - The two layers are deliberately thin and separate. The reservation logic and its locking are
    in one place (`database-service/src/services/hold.service.ts`).
  - The .NET layer only translates contracts and errors.
  - Collapsing it into one .NET service would mean porting that one transaction to ADO.NET or
    Dapper with the same SQL. The public API and the UI would not change.
  - This is flagged so reviewers can judge it rather than discover it.

### Data-access details

- No Entity Framework Core. The .NET API never connects to PostgreSQL.
- Prisma 7 with the `pg` driver adapter. Seat-changing operations use parameterised `$queryRaw`
  inside an interactive transaction, because Prisma's query API can't express `FOR UPDATE`.
- Capacity is never stored. `heldSeats`, `confirmedSeats` and `availableSeats` are computed by
  counting rows (view `admission_class_availability`), so there's no counter that can drift.
- Constraints Prisma can't express are written as SQL in a migration: CHECKs on seats, name and
  student ID, the partial unique index, history triggers and the availability view. Migrations
  are applied with `prisma migrate deploy`; `db push` is never used.
- PostgreSQL is Neon by default (pooled URL at runtime, direct URL for migrations, TLS
  `verify-full`). A local PostgreSQL 18 container is available through the `local-db` compose
  profile. The schema is tested on PostgreSQL 17 and 18.

## Public API decisions

- Eight endpoints. The response bodies are kept minimal; for example `GET /holds/{id}` does not
  return the student ID. See the README for the full contracts.
- Errors are `application/problem+json` (RFC 9457) with a stable `code`, so the UI never has to
  parse messages. Unknown JSON fields and numbers sent as strings are rejected, not ignored.
- `DELETE /holds/{id}` cancels. It returns `204` and doesn't remove the record (see Applications
  are never deleted).
- `GET /holds/{id}` doesn't need the student ID, so a confirmation link can be opened on another
  device. It returns no personal data. Only confirm, cancel and "my applications" need the ID.

## UI decisions

- Seat counts on the class list refresh every 3 seconds, never with overlapping requests. A failed
  refresh keeps the last numbers with a clear "may be out of date" warning, so stale counts are
  never shown as live.
- A held application rechecks the server every 5 seconds, immediately when the countdown reaches
  zero, then every 2 seconds until the server reports a final status. Data is also rechecked when
  the tab regains focus or the network reconnects.
- After a browser refresh, the student ID comes back from `localStorage` and the application from
  the server via the URL. Nothing about an application's state is kept only in the browser.
- The site opens on a welcome screen that asks for the birth registration number before any
  student page is shown. It explains the three steps (apply, seat held, confirm), counts digits as
  they are typed, and accepts spaces and dashes. Admin pages are reachable without a number.
- The class list has search (by name or number), Open/Full filters and sorting, a low-seats
  warning, and summary counts. The application page shows a three-step progress tracker and the
  next action to take.

## Versions

- Prisma **7.10.1** is pinned, because npm's `latest` tag pointed to an 8.0 release candidate.
- TypeScript **6.0.x**, because `typescript-eslint` 8 doesn't support 6.1+ yet.
- React **19** satisfies "React 18+". Tailwind CSS **4** via the official Vite plugin. .NET **8**
  LTS.
- MSW **3.0.3** (tests only), pinned one release behind the newest, which was 3 days old.
