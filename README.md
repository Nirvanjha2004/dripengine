# 💧 DripEngine

**A self-hostable, developer-first email drip and sequence engine.**

DripEngine allows you to declaratively define email sequences in YAML, write templates using Handlebars, and self-host the entire infrastructure on your own servers via Docker. 

Designed for intermediate to advanced developers, it gives you complete data ownership and deep integration with your app without being locked into expensive SaaS pricing tiers.

---

## ✨ Features

- **Declarative YAML Sequences:** Version-control your marketing automation. Define steps, delays, and conditions entirely in code.
- **Smart Interruption & Cancellation:** Built-in "condition evaluation at fire time." If a user upgrades or completes a task, DripEngine automatically cancels pending nudges from the background queue.
- **Handlebars Templates:** Define clean, reusable email templates with injected variables (`{{name}}`, `{{plan}}`).
- **Delivery Provider Agnostic:** Ship with Amazon SES, Gmail, etc. via standard SMTP (`nodemailer`), or easily switch to `resend` or `sendgrid` via environment variables.
- **Developer First:** Built with a FastAPI ingestion server, a high-performance Node.js / BullMQ worker, and a plug-and-play TypeScript SDK.

---

## 🏗️ Architecture

DripEngine operates on four core services:
1. **API (FastAPI & Python):** Handles incoming web requests (`/enroll`, `/event`, `/unenroll`), token authentication, and pushing jobs to the queue.
2. **Worker (Node.js & BullMQ):** Polls the distributed queue, evaluates step conditions (checking if the user still qualifies for the email), renders the `.hbs` template, and sends the email via the selected provider adapter.
3. **Database (PostgreSQL):** Stores enrollment states, fired events, and delivery logs. This ensures condition evaluation uses fresh data at *fire time*, rather than stale data from enqueue time.
4. **Queue (Redis):** Acts as the messaging broker storing delayed BullMQ jobs.

---

## 🚀 Getting Started (Local Setup)

DripEngine is designed to be completely containerized. 

### 1. Configure Environment Variables
Create an `.env` file at the root of your project:
```env
# API Authentication
API_SECRET_KEY=supersecretkey

# Database & Queue (Docker will use the internal network names)
DATABASE_URL=postgresql://drip:drip@postgres:5432/dripengine
REDIS_HOST=redis
REDIS_PORT=6379

# Email Delivery Configuration (Default: nodemailer/SMTP)
PROVIDER=nodemailer
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=you@gmail.com
```

### 2. Start the Infrastructure
Run the complete stack using Docker Compose:
```bash
docker-compose up --build
```
This will start PostgreSQL, Redis, the FastAPI ingestion server (Port `8000`), and the Node.js email worker.

*(Note: The `docker-compose.yml` mounts your local `./sequences` and `./templates` directories directly into the containers, allowing for hot-swapping during development.)*

---

## 🛤️ Writing Sequences

Sequences are defined strictly in YAML. Create a file like `sequences/onboarding.yaml`:

```yaml
id: onboarding
trigger: user.signup

steps:
  - id: welcome
    delay: 0
    template: welcome-email

  # Send 1 day later, UNLESS the user triggered 'user.completed_profile'
  - id: tip-day2
    delay: 1d
    template: first-tip
    condition:
      event_not_fired: user.completed_profile

  # Send 5 days later, ONLY IF the user's plan is still 'free'
  - id: tip-day5
    delay: 5d
    template: second-tip
    condition:
      property: plan
      equals: free
```

**Supported Delays:** `0`, `10m` (10 minutes), `12h` (12 hours), `5d` (5 days).

---

## 📝 Templates

Templates use [Handlebars](https://handlebarsjs.com) and must be placed in a directory matching the `template:` name in your sequence. 

Directory structure:
```text
templates/
  welcome-email/
    subject.txt  (Subject line: "Welcome to our app, {{name}}!")
    html.hbs     (HTML body)
    text.hbs     (Plaintext fallback)
```

You can use any variables passed into the `properties` object during enrollment inside these templates.

---

## 🔧 SDK & Integration

You can interact with the engine using the official `@dripengine/sdk` or raw HTTP requests.

### Using the TypeScript SDK

Install the SDK:
```bash
npm install @dripengine/sdk
```

Initialize and enroll a user:
```typescript
import { DripEngine } from "@dripengine/sdk";

const drip = new DripEngine({
  apiKey: "supersecretkey",           // Same as your API_SECRET_KEY
  baseUrl: "http://localhost:8000"    // URL of your FastAPI service
});

// 1. Enroll a user into a sequence
await drip.enroll({
  sequence_id: "onboarding",
  contact: {
    email: "john@example.com",
    name: "John Doe",
    timezone: "America/New_York",
    properties: {
      plan: "free"
    }
  }
});

// 2. Fire an event (This can auto-cancel pending queue items)
await drip.event({
  email: "john@example.com",
  event_name: "user.completed_profile",
  properties: { method: "github_oauth" }
});

// 3. Manually unenroll a user entirely
await drip.unenroll({
  email: "john@example.com",
  sequence_id: "onboarding"
});
```

### Using Raw cURL
```bash
curl -X POST http://localhost:8000/enroll \
  -H "Authorization: Bearer supersecretkey" \
  -H "Content-Type: application/json" \
  -d '{
    "sequence_id": "onboarding",
    "contact": {
        "email": "john@example.com",
        "name": "John Doe",
        "properties": { "plan": "free" }
    }
}'
```

---

## 📬 Delivery Providers

The worker dynamically delegates emailing to providers based on the `PROVIDER` env variable.

**Nodemailer (Default):**
To use standard SMTP, leave `PROVIDER=nodemailer` and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`.

**Resend:**
```env
PROVIDER=resend
RESEND_API_KEY=re_123456789
SMTP_FROM=you@yourdomain.com
```

**SendGrid:**
```env
PROVIDER=sendgrid
SENDGRID_API_KEY=SG.123456789
SMTP_FROM=you@yourdomain.com
```

*(Adding a new provider is as simple as adding a new adapter class implementing the `DeliveryAdapter` interface in `worker/src/delivery/`).*