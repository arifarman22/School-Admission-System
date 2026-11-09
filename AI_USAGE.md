# AI Usage

## Tools used

- **Claude Code** (Anthropic, model Claude Opus 5.5), running as an agent in VS Code on Windows. It
  read and edited files, ran shell commands (npm, dotnet, docker, git) and ran the test suites.
- No other AI tools were used.

The work was done in stages, each started by a written instruction from the author: scaffolding,
Neon, schema, internal service, reservation engine, public API, frontend foundation, screens,
admission workflow, real-time behaviour, test suites, Docker, final review. The author reviewed
each stage's result before asking for the next, chose Neon, and decided when to commit and push.

## Where AI contributed

AI wrote almost all of the code and documentation, following the author's stage instructions:

- **Scaffolding:** project structure for the three services, configuration, linting, Dockerfiles.
- **Database:** the Prisma 7 schema, the hand-written constraint migration (CHECKs, partial unique
  index, history triggers, availability view), and the seed.
- **Database service:** the Express service (Zod contracts, error envelope, internal auth,
  graceful shutdown) and the reservation engine (class-row lock, database time, expiry sweep).
- **Public API:** the ASP.NET Core API with eight endpoints, ProblemDetails mapping, the
  `X-Student-Id` filter, strict JSON, CORS and health checks.
- **Frontend:** the React app: student identity bar, class list with live counts, create class,
  admission details with countdown, confirm/cancel, my applications, real-time revalidation.
- **Tests:** all automated tests. Node unit and PostgreSQL integration tests including the
  multi-process concurrency tests; xUnit endpoint and real-stack tests; Vitest, React Testing
  Library and MSW frontend tests; the opt-in full-stack UI tests.
- **Docker:** Compose, health checks, the Neon/local-database switch.
- **Documentation:** `README.md`, `ASSUMPTIONS.md` and this file. The assumptions follow the
  brief's instruction to state them with reasons. The author supplied the brief and reviewed them.

## Mistakes found, and how they were caught and fixed

These actually happened during development.

| #   | Mistake                                                                                                                                                                                       | How it was caught                                                                        | Fix                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Assumed Prisma's interactive-transaction `timeout` would stop a statement blocked on a row lock.                                                                                              | A probe that held the class lock in another connection hung instead of failing.          | Set PostgreSQL `lock_timeout` inside each transaction; map lock timeouts to `503 SERVICE_BUSY`.                                                               |
| 2   | A domain rejection (e.g. confirming an expired hold) rolled back the expiry sweep in the same transaction, so the row stayed `HELD` in the database.                                          | A new service-level test asserted the stored status after a rejected confirm and failed. | Rejections are returned out of the transaction and thrown after commit (`runSeatChange`).                                                                     |
| 3   | The .NET API accepted `"totalSeats": "30"` (string coerced to number).                                                                                                                        | Contract tests for strict JSON.                                                          | `NumberHandling.Strict` and `UnmappedMemberHandling.Disallow`.                                                                                                |
| 4   | `[Produces("application/json")]` forced error responses to `application/json` instead of `application/problem+json`.                                                                          | Error-contract tests checked the media type.                                             | Removed the attribute.                                                                                                                                        |
| 5   | 415 responses had no `traceId`.                                                                                                                                                               | Error-contract tests.                                                                    | Added `traceId` in `CustomizeProblemDetails`.                                                                                                                 |
| 6   | An empty class name produced two validation errors.                                                                                                                                           | Unit test for the error details.                                                         | Fixed the Zod regex.                                                                                                                                          |
| 7   | The admission page subscribed to the same hold query twice, causing an extra GET.                                                                                                             | A component test whose mocked responses were consumed out of order.                      | Fetch once and pass the data down as props.                                                                                                                   |
| 8   | When the last seat was taken just before Apply, the "this class just filled up" message disappeared as soon as the list refreshed.                                                            | An MSW test for the 409 `SEATS_FULL` flow.                                               | `ApplyButton` stays mounted for full classes and shows the full notice plus the message.                                                                      |
| 9   | `DIRECT_URL                                                                                                                                                                                   |                                                                                          | DATABASE_URL`was first written with`??`, so an empty `DIRECT_URL` didn't fall back.                                                                           | Migration run failed. | Use `\|\|`. |
| 10  | The configured `DIRECT_URL` pointed at Neon's pooled host.                                                                                                                                    | URL shape check before migrating (values never printed).                                 | Corrected in the git-ignored `.env`.                                                                                                                          |
| 11  | A schema test expected SQLSTATE `23503`; PostgreSQL 18 (Neon) reports `23001` for RESTRICT.                                                                                                   | Integration tests failed on Neon.                                                        | The test accepts either code; the code doesn't depend on it.                                                                                                  |
| 12  | Some AI-written test assertions could never fail: a string compared to itself, a camel-case check on hard-coded names, a `size >= 1` check, and a race test that only asserted `created ≤ 1`. | Reviewing the new tests before reporting.                                                | Removed or replaced with exact assertions (the seat is freed exactly once, the hold ends `CANCELLED`).                                                        |
| 13  | Flaky tests: a .NET startup test raced with other test servers; a UI test matched the class-list heading during navigation; a test navigated the router outside `act()`.                      | Repeated runs (1 failure in 5; 1 in 4).                                                  | Isolated the startup test in a non-parallel collection; wait for elements only the details page has; wrap navigation in `act()`. Re-run 6–8 times, all green. |
| 14  | Documentation drifted: `ASSUMPTIONS.md` still said there was no database container and that hold operations returned 501.                                                                     | Final review.                                                                            | Rewrote README, ASSUMPTIONS and this file from the current code and test results.                                                                             |
| 15  | Tooling: the original `README.md` was UTF-16 and got corrupted by text tools; the .NET SDK failed to extract to a long temp path; MSW 3 renamed `onUnhandledRequest`.                         | Corrupt output, install error, typecheck error.                                          | Rewrote as UTF-8; installed the SDK under the user profile; used `onUnhandledFrame`.                                                                          |

## Verification actually performed

All of these were run by the agent on the author's machine; counts are from the final runs.

- **Database service:**
  - typecheck, ESLint, Prettier, build.
  - **129 / 129 tests:** 62 unit tests, plus 67 PostgreSQL integration tests on a local
    PostgreSQL 18 container: schema, services, reservations, concurrency.
- **Concurrency:** 100 students for 10 seats across three separate service processes gave exactly
  10 holds and 90 `SEATS_FULL` in each of 20 rounds; 50 students for 1 seat across 20 rounds;
  same-student bursts; confirm/cancel races.
- **Mutation checks:**
  - Removing `FOR UPDATE` made 5 concurrency tests fail (12 holds sold for 10 seats).
  - REPEATABLE READ also oversold.
  - Dropping the partial unique index failed the duplicate tests.
- **.NET:** Release build with warnings as errors, `dotnet format --verify-no-changes`, and
  **165 / 165 xUnit tests**, including 6 real-stack tests against the Dockerised database service
  and PostgreSQL.
- **Frontend:** typecheck, ESLint, Prettier, production build, and **98 / 98 component and MSW
  tests**. The **6 full-stack UI tests** passed against the Docker stack 8 times in a row after the
  flake fix.
- **Docker:**
  - `docker compose up --build` started healthy, in order, on both Neon and the local PostgreSQL
    profile.
  - Backend on 8080 and frontend on 5173 answered; SPA deep links worked; the bundle calls
    `localhost:8080`.
  - The database service and PostgreSQL were unreachable from the host.
  - Data survived `down` / `up --build`.
  - The seed command worked in the `migrate` image.
- **Black-box API audit:** a script against the running containers checked 32 behaviours. All 8
  endpoints with exact JSON keys and status codes, error codes, ownership, idempotency, an 8-second
  expiry releasing the seat, and 100 concurrent requests for 10 seats through the public API. All
  32 passed.
- **Neon:** only read-only checks were run against the real Neon database: migrations up to date,
  health ready, class list readable. Write tests were deliberately kept off Neon, because holds
  can't be deleted.
- **Secrets:** the full git history was searched for the Neon host, connection strings with
  passwords, and the internal key. Nothing was found; only `.env.example` templates are tracked.

**Not verified:** the UI was not clicked through in a real browser. UI behaviour was tested with
React Testing Library in jsdom (against MSW, and against the real API in the full-stack tests).
Visual layout and responsiveness on real devices still need a manual check.

## Human responsibility

The author directed every stage, reviewed the results, and is responsible for the submission. AI
output was accepted only after the checks above passed.
