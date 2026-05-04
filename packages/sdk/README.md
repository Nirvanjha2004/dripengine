# DripEngine

**Open source, self-hostable email drip engine for developers.**

Stop writing cron jobs. Define email sequences as YAML, enroll contacts with 3 lines of code, and let DripEngine handle the scheduling, conditions, retries, and delivery — on your own infrastructure.

```typescript
import { DripEngine } from '@dripengine/sdk'

const drip = new DripEngine({ apiKey: process.env.DRIP_KEY })

await drip.enroll({
  sequenceId: 'onboarding',
  contact: { email: 'john@gmail.com', plan: 'free' }
})
```

---

## Why DripEngine?

Every SaaS needs drip emails. Most teams end up with the same mess — a cron job querying the database, an if/else chain checking conditions, a retry function that silently fails, and zero visibility into what actually sent.

DripEngine replaces all of that with a config file and an SDK call.

| | DIY approach | DripEngine |
|---|---|---|
| Setup time | Days | 2 minutes |
| Time-based delays | Cron jobs | `delay: 5d` in YAML |
| Condition branching | If/else spaghetti | Declarative conditions |
| Retries | Hope | Exponential backoff |
| Visibility | Grep logs | Dashboard |
| Self-hostable | Yes (you built it) | Yes (one command) |

---
## Features

- **Sequence-as-code** — define entire email flows in YAML. Version control your sequences like any other config.
- **Condition branching** — skip or cancel steps based on contact properties or events they've fired. No code required.
- **Smart cancellation** — when a contact upgrades or completes an action, pending emails that are no longer relevant are automatically cancelled.
- **Any SMTP provider** — works with Nodemailer, Resend, SendGrid, SES, Postmark, or any raw SMTP server.
- **Dashboard included** — built-in Next.js dashboard for sequence health, contact timelines, and delivery logs.
- **Self-hostable** — runs entirely on your infra with one `docker-compose up`. No vendor lock-in, no usage limits.
- **Cloud option** — don't want to manage infra? Use our hosted version at [dripengine.dev](https://dripengine.dev).

---

## Quick start

### Self-hosted (recommended)

**Prerequisites:** Docker Desktop

```bash
git clone https://github.com/nirvanjha2004/dripengine.git
cd dripengine
cp .env.example .env   # fill in your SMTP credentials
docker-compose up
```

That's it. Your API is running at `http://localhost:8000` and your dashboard at `http://localhost:3000`.

### Install the SDK

```bash
npm install @dripengine/sdk
```

---

## Define a sequence

Create a YAML file in the `sequences/` folder:

```yaml
# sequences/onboarding.yaml
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
      event_not_fired: user.completed_profile   # skip if they already did this

  - id: tip-day5
    delay: 5d
    template: second-tip
    condition:
      property: plan
      equals: free                              # skip if they upgraded

  - id: upgrade-nudge
    delay: 10d
    template: upgrade
    condition:
      property: plan
      equals: free
```

No restart needed — sequences are hot-reloaded.

---

## Use the SDK

```typescript
import { DripEngine } from '@dripengine/sdk'

const drip = new DripEngine({
  apiKey: process.env.DRIP_KEY,
  baseUrl: 'http://localhost:8000',   // or your deployed URL
})

// Enroll a contact when they sign up
await drip.enroll({
  sequenceId: 'onboarding',
  contact: {
    email: 'john@gmail.com',
    name: 'John',
    timezone: 'Asia/Kolkata',
    properties: { plan: 'free' }
  }
})

// Fire an event when something happens in your app
// The engine will automatically cancel steps gated on this event
await drip.event({
  eventName: 'user.completed_profile',
  email: 'john@gmail.com'
})

// Unenroll when they upgrade — stops all pending emails
await drip.unenroll({
  sequenceId: 'onboarding',
  email: 'john@gmail.com'
})
```

Or use the REST API directly:

```bash
curl -X POST http://localhost:8000/enroll \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "sequence_id": "onboarding",
    "contact": {
      "email": "john@gmail.com",
      "properties": { "plan": "free" }
    }
  }'
```

---

## Email templates

Templates live in the `templates/` folder. Each template is a folder with three files:

```
templates/
  welcome-email/
    subject.txt    ← subject line (supports {{variables}})
    html.hbs       ← HTML body (Handlebars)
    text.hbs       ← plain text fallback
```

Example `html.hbs`:

```html
<h1>Hey {{name}}</h1>
<p>Welcome! You're on the <strong>{{plan}}</strong> plan.</p>
```

Variables are automatically filled from the contact's properties.

---

## Conditions

Conditions are evaluated at send time — not at schedule time. The engine always checks the contact's current state.

```yaml
# Send only if a property matches
condition:
  property: plan
  equals: free

# Send only if a property does NOT match
condition:
  property: plan
  not_equals: paid

# Send only if an event has NOT been fired
condition:
  event_not_fired: user.completed_profile

# Send only if an event HAS been fired
condition:
  event_fired: user.invited_teammate
```

---

## Email providers

Set `PROVIDER` in your `.env`:

```bash
# Nodemailer — any SMTP server (default)
PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password

# Resend
PROVIDER=resend
RESEND_API_KEY=re_xxxx

# SendGrid
PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxx
```

---

## Dashboard

The built-in dashboard runs at `http://localhost:3000`:

- **Overview** — total contacts, active enrollments, emails sent today
- **Sequences** — per-sequence health with sent / skipped / failed breakdown
- **Contacts** — search any email and see their full timeline
- **Logs** — paginated delivery log with filtering by status and sequence

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Ingestion layer                  │
│   REST API · SDK · Webhook triggers · CLI import │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  Core engine                     │
│  Scheduler · Condition evaluator · Retry manager │
│  Template renderer · Contact state (Postgres)    │
│              Queue: Redis + BullMQ               │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│               Delivery layer                     │
│     Nodemailer · Resend · SendGrid · SES         │
└─────────────────────────────────────────────────┘
```

**Stack:** FastAPI · Node.js · BullMQ · Redis · Postgres · Next.js · Docker

---

## Self-hosting guide

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `API_SECRET_KEY` | Yes | Auth key for all API requests |
| `DATABASE_URL` | Yes | Postgres connection string |
| `REDIS_HOST` | Yes | Redis host |
| `PROVIDER` | Yes | Email provider: `nodemailer`, `resend`, `sendgrid` |
| `SMTP_HOST` | If nodemailer | SMTP server host |
| `SMTP_USER` | If nodemailer | SMTP username |
| `SMTP_PASS` | If nodemailer | SMTP password / app password |
| `RESEND_API_KEY` | If resend | Resend API key |
| `SENDGRID_API_KEY` | If sendgrid | SendGrid API key |

### Scaling

The worker is stateless and horizontally scalable. To handle more volume, spin up more worker containers — BullMQ ensures no job is processed twice:

```yaml
worker:
  deploy:
    replicas: 3
```

---

## API reference

Full interactive docs available at `http://localhost:8000/docs` after starting the server.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/enroll` | Enroll a contact into a sequence |
| `POST` | `/event` | Fire an event for a contact |
| `POST` | `/unenroll` | Remove a contact from a sequence |
| `GET` | `/dashboard/overview` | Summary stats |
| `GET` | `/dashboard/sequences` | Per-sequence health |
| `GET` | `/dashboard/contacts` | Contact timeline |
| `GET` | `/dashboard/logs` | Delivery log feed |
| `GET` | `/health` | Health check |

---

## Roadmap

- [ ] Webhook ingestion (Stripe, GitHub, etc.)
- [ ] A/B testing for email templates
- [ ] Unsubscribe link handling
- [ ] Multi-tenant support
- [ ] Hosted cloud version

---

## Contributing

PRs are welcome. Please open an issue first for anything beyond small fixes.

```bash
git clone https://github.com/nirvanjha2004/dripengine.git
cd dripengine
cp .env.example .env
docker-compose up
```

The API hot-reloads on save. The dashboard hot-reloads on save. The worker requires a restart on code changes.

---

## License

MIT — use it, fork it, build on it.

---

<p align="center">
  Built by <a href="https://github.com/nirvanjha2004">@nirvanjha2004</a> ·
  <a href="https://github.com/nirvanjha2004/dripengine/issues">Report a bug</a> ·
  <a href="https://github.com/nirvanjha2004/dripengine/issues">Request a feature</a>
</p>