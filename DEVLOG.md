# DripEngine — Project Deep Dive

A complete record of how DripEngine was designed, built, and published. Written as a reference for future projects and as a portfolio document.

---

## Table of contents

1. [What is DripEngine](#what-is-dripengine)
2. [The problem it solves](#the-problem-it-solves)
3. [Design decisions](#design-decisions)
4. [Architecture](#architecture)
5. [How each layer works](#how-each-layer-works)
6. [Tech stack rationale](#tech-stack-rationale)
7. [Project structure](#project-structure)
8. [Building the ingestion layer](#building-the-ingestion-layer)
9. [Building the worker](#building-the-worker)
10. [Building the dashboard](#building-the-dashboard)
11. [How to publish an npm package](#how-to-publish-an-npm-package)
12. [How to self-host](#how-to-self-host)
13. [Key engineering challenges](#key-engineering-challenges)
14. [Lessons learned](#lessons-learned)

---

## What is DripEngine

DripEngine is an open source, self-hostable email drip and sequence engine for developers. It lets you define email sequences as YAML files and send them to contacts with time-based delays, condition branching, and smart cancellation — all with 3 lines of SDK code.

It is inspired by tools like Supabase and Cal.com — fully open source and self-hostable for free, with a cloud hosted tier as the monetization path.

---

## The problem it solves

Every SaaS product needs to send sequences of emails. A welcome email when someone signs up. A tip email two days later. An upgrade nudge after ten days — but only if they're still on the free plan.

The DIY approach looks like this:

- A cron job that runs every hour
- Queries the database for "who signed up X days ago"
- A chain of if/else conditions checking their state
- A call to an email function with no retry logic
- Zero visibility into what fired and when

This breaks silently. Users stop getting emails. The developer only finds out when a user complains. And every new project rebuilds the same broken wheel.

DripEngine replaces this with:

```yaml
id: onboarding
trigger: user.signup

steps:
  - id: welcome
    delay: 0
    template: welcome-email

  - id: tip-day2
    delay: 1d
    template: first-tip
    condition:
      event_not_fired: user.completed_profile

  - id: upgrade-nudge
    delay: 10d
    template: upgrade
    condition:
      property: plan
      equals: free
```

And three lines of code:

```typescript
await drip.enroll({
  sequenceId: 'onboarding',
  contact: { email: 'john@gmail.com', plan: 'free' }
})
```

---

## Design decisions

### 1. Sequences as YAML, not code

The developer writes *what* to do, not *how* to do it. Conditions, delays, and template names are declared in a config file. The engine handles all the logic internally. This is the same philosophy as GitHub Actions, Docker Compose, and Kubernetes — configuration over code.

### 2. Self-hostable first, cloud second

The open source playbook used by Supabase and Cal.com. Build the product so it runs entirely on the developer's own infrastructure with one command. Attract a community. Then offer a hosted version for developers who don't want to manage infra. The product is identical — the API key is the only difference.

### 3. Conditions evaluated at fire time, not enqueue time

When a contact enrolls, all their steps are scheduled into the queue immediately. But conditions are not checked at that point — they are checked at the moment the job fires. This means the engine always uses the contact's current state, not a stale snapshot from 10 days ago. If a contact upgrades on day 3, the upgrade nudge scheduled for day 10 will see their current plan and skip correctly.

### 4. Separate API and worker processes

The FastAPI server (ingestion layer) and the BullMQ worker (delivery layer) are completely separate processes. If the worker crashes, the API still accepts enrollments. If the API goes down, the worker keeps processing scheduled jobs. They share a Postgres database and a Redis queue but nothing else. This makes the system resilient and independently scalable.

### 5. Redis as a timer, not a database

Redis stores only the job metadata — a small ticket (~300 bytes) per scheduled email. The actual contact data, properties, events, and delivery history all live in Postgres. Redis is the alarm clock. Postgres is the source of truth. This keeps Redis lean and makes it easy to inspect, debug, and recover data.

### 6. Provider-agnostic delivery layer

The delivery layer is a set of thin adapters. The worker says "send this email" and the adapter translates it into whatever the provider expects. Switching from Gmail SMTP to Resend is one environment variable change. This was a deliberate decision to avoid vendor lock-in, which is core to the self-hostable philosophy.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Ingestion layer                    │
│                                                      │
│   REST API    SDK       Webhook      CLI import       │
│   /enroll   3 lines   Stripe/GH     CSV bulk         │
│   /event    of code   triggers      enroll           │
│   /unenroll                                          │
└────────────────────────┬────────────────────────────┘
                         │ jobs written to Redis
┌────────────────────────▼────────────────────────────┐
│                    Core engine                       │
│                                                      │
│   ┌─────────────┐   ┌──────────────┐                │
│   │  Event queue │   │  Scheduler   │                │
│   │  Redis+BullMQ│   │  delay calc  │                │
│   └──────┬──────┘   └──────┬───────┘                │
│          │                 │                         │
│   ┌──────▼──────────────────▼───────┐               │
│   │       Condition evaluator        │               │
│   │  checks Postgres at fire time    │               │
│   └──────────────┬──────────────────┘               │
│                  │                                   │
│   ┌──────────────▼──────────────────┐               │
│   │        Template renderer         │               │
│   │     Handlebars + contact data    │               │
│   └──────────────┬──────────────────┘               │
│                  │                                   │
│   ┌──────────────▼──────────────────┐               │
│   │          Retry manager           │               │
│   │  exponential backoff, dead-letter│               │
│   └──────────────┬──────────────────┘               │
└──────────────────┼──────────────────────────────────┘
                   │ send
┌──────────────────▼──────────────────────────────────┐
│                  Delivery layer                      │
│                                                      │
│   Nodemailer    Resend    SendGrid    SES/Postmark   │
│   (any SMTP)                                        │
└──────────────────┬──────────────────────────────────┘
                   │ logs result
┌──────────────────▼──────────────────────────────────┐
│             Observability + dashboard                │
│                                                      │
│   Overview    Sequences    Contacts    Logs          │
│   stats       health       timeline    feed          │
└─────────────────────────────────────────────────────┘
```

---

## How each layer works

### Ingestion layer

The front door. Every way a contact can enter the system feeds into the event queue.

**REST API** — three endpoints built with FastAPI. Every request is authenticated with a bearer token checked against `API_SECRET_KEY` using timing-safe comparison (`secrets.compare_digest`) to prevent timing attacks.

**SDK** — a TypeScript npm package (`@nirvanjha/sdk`) that wraps the REST API. Developers install it with npm, instantiate `DripEngine` with their API key, and call `enroll()`, `event()`, and `unenroll()`. The SDK handles auth headers, JSON serialization, and readable error messages.

**Auth middleware** — a FastAPI `BaseHTTPMiddleware` that checks every request except `/health`, `/docs`, and `/openapi.json`. Runs before any route handler.

### Core engine

**Event queue** — Redis + BullMQ. Jobs are written by the FastAPI producer and consumed by the Node.js worker. BullMQ stores jobs as Redis hashes with a score in a sorted set equal to the fire timestamp in milliseconds. The worker polls this sorted set and picks up jobs when `now >= score`.

**Scheduler** — calculates `enrollment_timestamp + step_delay = fire_datetime` for each step. Delays are defined as human-readable strings (`1d`, `12h`, `30m`) and converted to seconds by the `parse_delay` function. All steps are enqueued at enrollment time as delayed jobs. One step at a time is processed — after each step fires, the next one is already sitting in the queue waiting.

**Condition evaluator** — runs immediately before every email sends. Reads the contact's current state from Postgres, not from the job data. Supports four condition types: `property equals`, `property not_equals`, `event_not_fired`, and `event_fired`. Returns `{ shouldSend: boolean, reason: string }` — the reason is logged to the delivery table for full auditability.

**Template renderer** — loads Handlebars templates from the `templates/` folder. Each template is a folder with `subject.txt`, `html.hbs`, and `text.hbs`. Templates are compiled once and cached in memory. Contact properties are injected as template variables automatically.

**Retry manager** — BullMQ handles retries natively. Failed jobs are retried with exponential backoff: 1 minute, then 5 minutes, then 30 minutes. After 3 failed attempts, the job moves to the dead-letter queue and is kept in Redis for 7 days for manual inspection.

**Smart cancellation** — the most complex piece. When `/event` is called, the engine finds all active enrollments for that contact, loads each sequence YAML, scans for steps gated on `event_not_fired: {this_event}`, and removes those jobs from the BullMQ delayed sorted set in Redis. This is done in a single Redis pipeline call for atomicity.

### Delivery layer

Three provider adapters — Nodemailer, Resend, and SendGrid — all implementing the same `DeliveryAdapter` interface. The worker calls `getAdapter()` which reads the `PROVIDER` env variable and dynamically imports the correct adapter. Adding a new provider means creating one new file that implements `send(payload: EmailPayload): Promise<void>`.

### Observability layer

A Next.js dashboard served at port 3000. All data fetching is server-side — Next.js server components call the FastAPI dashboard endpoints directly using the API key stored in server environment variables. The API key never touches the browser. The contact search page is a client component that proxies through a Next.js API route (`/app/api/contact/route.ts`) to keep the key server-side.

Four pages: Overview (summary stats), Sequences (per-sequence health with progress bars), Contacts (search by email, full timeline), Logs (paginated delivery feed with status filters).

---

## Tech stack rationale

| Technology | Why |
|---|---|
| FastAPI (Python) | Async, fast, auto-generates Swagger docs, Pydantic models give free validation |
| asyncpg | Fastest async Postgres driver for Python, significantly faster than psycopg2 for concurrent requests |
| BullMQ + Redis | Battle-tested job queue, handles delayed jobs natively, concurrency control, retry logic, dead-letter queuing |
| Node.js worker | BullMQ is a Node.js library — running the worker in Node keeps it idiomatic and avoids cross-language queue compatibility issues |
| Handlebars | Simple, logic-less templating — appropriate for email where complex logic in templates is an anti-pattern |
| Next.js (App Router) | Server components enable server-side data fetching without exposing the API key to the browser |
| Tailwind CSS | Fast to build dark UI without writing custom CSS |
| Docker Compose | Single command to run the entire stack locally. Postgres, Redis, API, worker, and dashboard all wired together with health checks |
| TypeScript (SDK) | Type safety for SDK consumers, better autocomplete, catches bugs at compile time |
| tsup | Bundles the SDK into CJS + ESM + `.d.ts` in one command — necessary for compatibility with both `require()` and `import` |

---

## Project structure

```
dripengine/
├── apps/
│   ├── api/                        FastAPI backend
│   │   └── src/
│   │       ├── main.py             App entry point, router registration
│   │       ├── middleware/
│   │       │   └── auth.py         Bearer token auth on all routes
│   │       ├── models/
│   │       │   ├── contact.py      Pydantic schemas for enroll/unenroll
│   │       │   └── event.py        Pydantic schemas for event firing
│   │       ├── routes/
│   │       │   ├── enroll.py       POST /enroll
│   │       │   ├── events.py       POST /event
│   │       │   ├── unenroll.py     POST /unenroll
│   │       │   └── dashboard.py    GET /dashboard/*
│   │       ├── services/
│   │       │   ├── db.py           asyncpg pool, table init
│   │       │   ├── sequence_loader.py   YAML loading + delay parsing
│   │       │   ├── enroll_service.py    Enrollment logic
│   │       │   ├── event_service.py     Event logging + cancellation
│   │       │   ├── unenroll_service.py  Unenrollment logic
│   │       │   └── dashboard_service.py Dashboard DB queries
│   │       └── queue/
│   │           └── producer.py     BullMQ job writer (Redis)
│   │
│   └── dashboard/                  Next.js frontend
│       ├── app/
│       │   ├── layout.tsx          Sidebar + nav
│       │   ├── page.tsx            Overview page
│       │   ├── sequences/page.tsx  Sequence health
│       │   ├── contacts/page.tsx   Contact timeline (client component)
│       │   ├── logs/page.tsx       Delivery log feed
│       │   └── api/contact/
│       │       └── route.ts        Proxy route (keeps API key server-side)
│       └── lib/
│           └── api.ts              Typed fetch wrapper for FastAPI
│
├── packages/
│   └── sdk/                        npm package @nirvanjha/sdk
│       └── src/
│           ├── index.ts            DripEngine class (enroll/event/unenroll)
│           └── types.ts            TypeScript interfaces
│
├── worker/                         BullMQ worker (Node.js)
│   └── src/
│       ├── index.ts                Entry point, BullMQ Worker setup
│       ├── db.ts                   pg Pool, delivery_log table init
│       ├── conditionEvaluator.ts   Condition checking logic
│       ├── sequenceLoader.ts       YAML loading (Node.js)
│       ├── templateRenderer.ts     Handlebars rendering
│       ├── processors/
│       │   └── email.ts            Job processor (7-step flow)
│       └── delivery/
│           ├── index.ts            DeliveryAdapter interface + getAdapter()
│           ├── nodemailer.ts       SMTP adapter
│           ├── resend.ts           Resend API adapter
│           └── sendgrid.ts         SendGrid API adapter
│
├── sequences/                      YAML sequence definitions
│   └── onboarding.yaml
│
├── templates/                      Email templates (Handlebars)
│   └── welcome-email/
│       ├── subject.txt
│       ├── html.hbs
│       └── text.hbs
│
├── docker-compose.yml              Full stack: Postgres + Redis + API + Worker + Dashboard
├── .env.example                    Environment variable reference
├── test-sdk.js                     SDK integration test script
└── README.md                       Public-facing documentation
```

---

## Building the ingestion layer

The ingestion layer was built first because it is the foundation everything else depends on. No worker, no dashboard, no SDK can exist without the API accepting enrollments.

**Order of construction:**

1. Database models (`db.py`) — created three tables: `contacts`, `enrollments`, `contact_events`. Used `CREATE TABLE IF NOT EXISTS` so the API self-initializes on first boot, no migration tool needed.

2. Pydantic models (`contact.py`, `event.py`) — defined the shape of every request and response. Pydantic validates incoming JSON automatically — if a required field is missing or the wrong type, FastAPI returns a 422 before the route handler even runs.

3. Sequence loader (`sequence_loader.py`) — reads YAML files from the `sequences/` folder. In-memory cache after first load so disk isn't hit on every request. `parse_delay()` converts human-readable strings (`1d`, `12h`) to seconds.

4. Services (`enroll_service.py`, `event_service.py`, `unenroll_service.py`) — one file per operation, each with a single async function. Routes are thin wrappers that call these functions and handle exceptions.

5. Queue producer (`producer.py`) — writes BullMQ-compatible job structures directly to Redis. Each job is stored as a Redis hash at `bull:{queue}:{job_id}` and added to the delayed sorted set with a score equal to the fire timestamp in milliseconds.

6. Routes (`enroll.py`, `events.py`, `unenroll.py`) — three files, each with one route. Routes catch `ValueError` (business logic errors like duplicate enrollment) and return 400, catch everything else and return 500.

7. Auth middleware (`auth.py`) — added last, after all routes were working. Uses `secrets.compare_digest` for timing-safe key comparison.

8. Main (`main.py`) — registers all routers, adds middleware, runs `init_db()` on startup via lifespan context manager.

---

## Building the worker

The worker is a completely separate Node.js process. It connects to the same Redis and Postgres as the API but shares no code with it.

**Order of construction:**

1. `db.ts` — `pg.Pool` for Postgres. Creates the `delivery_log` table. Four functions: `getContact()`, `hasEventFired()`, `isEnrolled()`, `updateCurrentStep()`, `logDeliveryEvent()`.

2. `sequenceLoader.ts` — reads YAML files using `js-yaml`. In-memory cache. `findStep()` locates a specific step within a sequence by ID.

3. `conditionEvaluator.ts` — evaluates conditions against current contact state. Always reads from Postgres at the moment of evaluation, not from the job data. Returns `{ shouldSend, reason }`.

4. `templateRenderer.ts` — compiles Handlebars templates, caches compiled versions, renders with contact properties.

5. Delivery adapters — `nodemailer.ts`, `resend.ts`, `sendgrid.ts` each implement the `DeliveryAdapter` interface. `delivery/index.ts` exports `getAdapter()` which reads `PROVIDER` env var and dynamically imports the right adapter.

6. `processors/email.ts` — the job processor. Seven steps: load sequence → find step → check enrollment → evaluate condition → render template → send → log. Every step has a guard clause that logs and returns early rather than throwing.

7. `index.ts` — creates the BullMQ `Worker`, connects to Redis, sets concurrency to 10, attaches event listeners for logging, handles graceful shutdown on `SIGTERM` so in-flight emails finish before the process exits.

**Key insight — why the queue name must not contain a colon:**

BullMQ uses the queue name as part of Redis key prefixes (`bull:{queue_name}:delayed`). If the queue name itself contains a colon, it breaks this key structure. The queue was initially named `drip:email` which caused `Error: Queue name cannot contain :`. Renamed to `drip-email`.

---

## Building the dashboard

The dashboard was built after the engine was fully working so there was real data to display.

**Architecture decision — server components vs client components:**

Most pages are Next.js server components. They fetch data from FastAPI at render time, server-side, using the API key stored in `process.env.API_SECRET_KEY`. The API key never reaches the browser.

The one exception is the Contacts page — it has a search input, which requires interactivity. It is a client component that calls a Next.js API route (`/app/api/contact/route.ts`) which proxies the request to FastAPI server-side. This is the standard Next.js pattern for keeping secrets out of the browser while enabling client-side interactivity.

**FastAPI dashboard endpoints:**

Four new endpoints were added under the `/dashboard` prefix, all `GET`:

- `/dashboard/overview` — aggregate stats across all sequences and contacts
- `/dashboard/sequences` — per-sequence breakdown joined from `enrollments` and `delivery_log`
- `/dashboard/contacts` — full timeline for one contact: properties, enrollments, events, delivery history
- `/dashboard/logs` — paginated delivery log with dynamic `WHERE` clause for filtering

Dynamic `WHERE` clause construction in Python without an ORM:

```python
conditions = []
params = []
param_count = 0

if status:
    param_count += 1
    conditions.append(f"status = ${param_count}")
    params.append(status)

where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
```

This avoids SQL injection by using parameterized queries while still allowing dynamic filters.

---

## How to publish an npm package

This is a detailed walkthrough of every step taken to publish `@nirvanjha/sdk` to npm.

### 1. Structure your package correctly

An npm package needs at minimum:
- `package.json` — metadata, entry points, scripts
- Source files — your actual code
- Built output — what consumers actually import

### 2. Configure package.json

The critical fields:

```json
{
  "name": "@nirvanjha/sdk",
  "version": "0.1.0",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "files": ["dist", "README.md"],
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  }
}
```

- `main` — used when someone does `require('@nirvanjha/sdk')` (CommonJS)
- `module` — used when someone does `import ... from '@nirvanjha/sdk'` (ESM)
- `types` — TypeScript declaration file for autocomplete
- `files` — whitelist of what gets uploaded to npm. Everything not in this list is excluded.
- `exports` — modern way to define entry points. Takes precedence over `main` and `module` in modern Node.js.

### 3. Use tsup to build

`tsup` compiles TypeScript and outputs multiple formats in one command:

```bash
tsup src/index.ts --format cjs,esm --dts
```

- `cjs` → `dist/index.js` (CommonJS for `require()`)
- `esm` → `dist/index.mjs` (ES modules for `import`)
- `--dts` → `dist/index.d.ts` (TypeScript types)

Without `--dts`, TypeScript consumers get no autocomplete or type checking.

### 4. Create .npmignore

Without `.npmignore`, npm uploads everything including source files and config:

```
src/
tsconfig.json
*.ts
!dist/
```

The `!dist/` line is important — it un-ignores the dist folder which might otherwise be caught by `*.ts` negation issues.

### 5. Add README.md to the package

npm displays the `README.md` from the package folder, not from the project root. Copy it in:

```bash
cp ../../README.md README.md
```

And add it to the `files` array in `package.json`:

```json
"files": ["dist", "README.md"]
```

### 6. Create an npm account and login

```bash
# Create account at npmjs.com, then:
npm login
# Enter username, password, OTP from email
```

### 7. Dry run before publishing

Always do a dry run first. It shows exactly what files will be uploaded:

```bash
npm publish --dry-run
```

Check the output carefully. You should only see `dist/` files and `README.md`. If you see source files, fix `.npmignore`.

### 8. Publish

```bash
npm publish --access public
```

`--access public` is required for scoped packages (`@username/packagename`). Without it, npm defaults to private which requires a paid account.

### 9. Verify

```bash
npm view @nirvanjha/sdk
```

Or visit `https://www.npmjs.com/package/@nirvanjha/sdk`. The README can take 2-3 minutes to appear.

### 10. Subsequent releases

```bash
npm version patch   # 0.1.0 → 0.1.1  (bug fix)
npm version minor   # 0.1.0 → 0.2.0  (new feature, backward compatible)
npm version major   # 0.1.0 → 1.0.0  (breaking change)
npm run build
npm publish --access public
```

Never manually edit the version number. `npm version` updates `package.json`, commits the change, and creates a git tag automatically.

### Scoped vs unscoped packages

`@nirvanjha/sdk` is a scoped package — the `@nirvanjha/` prefix is the scope, usually your npm username or organization name. Scoped packages:
- Are private by default (need `--access public` to publish publicly)
- Avoid name collisions with other packages named `sdk`
- Signal to consumers who maintains the package

Unscoped packages like `dripengine-sdk` are public by default but need globally unique names.

---

## How to self-host

### Prerequisites

- Docker Desktop installed and running
- Git
- An SMTP provider (Gmail, Resend, SendGrid, etc.)

### Steps

```bash
# Clone the repo
git clone https://github.com/nirvanjha/dripengine.git
cd dripengine

# Copy env file and fill in your credentials
cp .env.example .env

# Start everything
docker-compose up --build
```

On first run Docker will:
1. Pull `postgres:16-alpine` and `redis:7-alpine` images
2. Build the FastAPI API image
3. Build the Node.js worker image
4. Build the Next.js dashboard image
5. Start all five services with health checks

When you see these lines, everything is ready:

```
api     | INFO:     Application startup complete.
worker  | [worker] Listening on queue 'drip-email' with concurrency 10
```

- API: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`
- Dashboard: `http://localhost:3000`

### Resetting the database

```bash
docker-compose down -v   # -v removes the Postgres volume
docker-compose up --build
```

---

## Key engineering challenges

### 1. BullMQ queue name cannot contain a colon

Discovered during Docker testing. BullMQ uses the queue name as part of Redis key prefixes (`bull:{queue_name}:delayed`). A colon in the queue name breaks this structure. The queue was named `drip:email` initially — renamed to `drip-email`.

**Lesson:** test inside Docker early. Local Node.js may be more permissive than the BullMQ version inside the container.

### 2. TypeScript not finding modules in subdirectories

`tsconfig.json` had `"include": ["src"]` which only looked at the top level of `src/`. Files in `src/processors/` and `src/delivery/` were invisible to the compiler.

**Fix:** change to `"include": ["src/**/*"]` to recursively include all subdirectories.

### 3. npm ci failing in Docker — no lockfile

The worker Dockerfile used `npm ci` which requires a `package-lock.json`. The lockfile didn't exist because `npm install` had never been run locally.

**Fix:** run `npm install` locally first to generate the lockfile, then commit it. Changed Dockerfile to `npm install` during development and switch to `npm ci` once the lockfile is committed.

### 4. Postgres database not found

`DATABASE_URL` pointed to a database named `drip` but the Postgres container was configured with `POSTGRES_DB: dripengine`. Connection failed with `database "drip" does not exist`.

**Fix:** align all three — `POSTGRES_DB`, `DATABASE_URL`, and the worker's connection string — to use `dripengine`. Then `docker-compose down -v` to wipe the old volume so Postgres reinitializes correctly.

### 5. API key never reaching the browser

The dashboard contact search is a client component, so it runs in the browser. The API key cannot be exposed there. The solution is a Next.js API route (`/app/api/contact/route.ts`) that runs server-side and proxies the request to FastAPI with the key attached. The browser calls `/api/contact?email=...` and never sees the FastAPI key.

---

## Lessons learned

**Build the simplest thing that proves the concept works before adding complexity.** The queue producer was built before the worker existed. The routes were built before auth was added. Each layer was independently testable before the next one was started.

**Docker surfaces bugs that local development hides.** Case-sensitive file paths, missing lockfiles, environment variable mismatches — all of these only appeared inside Docker. Running `docker-compose up --build` early and often saves hours of debugging later.

**The data model is the most important design decision.** The three Postgres tables (`contacts`, `enrollments`, `contact_events`) and the Redis job structure were defined at the start and never needed to change. A good data model absorbs feature additions cleanly.

**Separate processes for separate concerns.** The API and worker being separate processes means they can crash, scale, and deploy independently. This constraint forced cleaner boundaries — the worker has no knowledge of HTTP and the API has no knowledge of email delivery.

**Conditions evaluated at fire time is the right call.** Evaluating conditions at enqueue time would be simpler to implement but fundamentally broken — a contact's state can change significantly between enrollment and when an email fires ten days later.

**The README is part of the product.** A working tool nobody knows how to use is not a product. The README was written to answer the question "why would I use this instead of building it myself?" before explaining how to use it.