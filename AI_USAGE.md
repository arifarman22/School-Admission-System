# AI Usage

## Tools

- **Claude Code** (Anthropic, Claude Opus 5.5), used in VS Code as an agentic coding assistant.

## What AI was used for (scaffolding step)

- Generating the project structure, configuration files, and boilerplate for the three services
  (ASP.NET Core API, Node/Prisma database service, React/Vite frontend).
- Checking current package versions and compatibility on npm. For example, it found that
  `prisma@latest` is an 8.0 RC (so Prisma 7.10.1 is pinned) and that `typescript-eslint` does not
  yet support TypeScript 7.
- Writing the health endpoints, the typed `HttpClient`, configuration validation, Dockerfiles,
  `docker-compose.yml`, and the initial tests.
- Drafting `README.md` and `ASSUMPTIONS.md`.

## How the output was verified

Every project was built and checked locally:

- `database-service`: `tsc` typecheck, ESLint, Prettier check, 6 Vitest/Supertest tests, production
  build, and a manual smoke run of the compiled server: 401 without the key, 200 on `/health`, 503
  on `/health/ready` with no database.
- `backend`: Release build with warnings as errors (0 warnings), 7 xUnit tests, and
  `dotnet format --verify-no-changes`.
- `frontend`: `tsc -b` typecheck, ESLint, Prettier check, and `vite build`.
- `docker-compose.yml`: validated with `docker compose config`.

## Neon + database schema step

- AI switched PostgreSQL to Neon (pooled/direct URLs, TLS, channel binding, compose egress network).
  It then designed the Prisma 7 schema, the hand-written constraint migration, the capacity view,
  the seed script, and the schema integration tests.
- Verification, all on a throwaway local PostgreSQL 17 (no Neon credentials were available):
  - `prisma migrate deploy` on an empty database, then `migrate status` reported up to date.
  - The seed was run twice to confirm it is idempotent.
  - 13 integration tests passed, run in rolled-back transactions.
  - A mutation check: dropping the partial unique index made the two related tests fail.
  - A `prisma migrate diff` drift check showed Prisma ignores the custom SQL objects.
  - The Docker `migrate` image applied the migrations, and the runtime image reported
    `/health/ready` 200 against the migrated database.

- Then verified on the real Neon database (PostgreSQL 18.6):
  - `migrate deploy` and `migrate status` over the direct URL.
  - The seed.
  - 13/13 integration tests. One assertion was relaxed because PostgreSQL 18 changed the SQLSTATE
    for RESTRICT violations.
  - `/health/ready` 200 over the pooled URL, with no data left behind by the tests.

## Internal database service step

- AI built the layered Express service: Zod contracts, centralized error envelope, request-id
  logging, internal auth before body parsing, graceful shutdown, `PrismaClassService`
  (create/list), and the prepared hold routes (501).
- Verification:
  - Typecheck, lint and format checks.
  - 52 unit/HTTP tests covering name and seat validation, unknown fields, malformed JSON, 413/415,
    auth, and error mapping.
  - 19 integration tests on Neon, including a concurrent duplicate-name test. The test data was
    cleaned up.
  - A container end-to-end run against Neon, ending with `docker stop`, which confirmed the
    graceful SIGTERM shutdown (exit 0).
- The test suite caught one bug before it shipped: an empty class name produced two validation
  errors.

## Human responsibility

The author reviews all AI-generated code, owns the design decisions in `ASSUMPTIONS.md`, and is
accountable for the final submission.
