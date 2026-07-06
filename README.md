# Learner Health Radar

A manager-facing dashboard that classifies learners by engagement health and generates AI-drafted outreach — built with React, TypeScript, and Claude.

![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-000?logo=vercel&logoColor=white)

---

## What It Does

Learner Health Radar ingests a cohort CSV, runs each learner through a deterministic classification engine, and surfaces a Red → Amber → Watch → Healthy tiered dashboard. An optional AI layer (Claude) then drafts personalised outreach messages and a Monday briefing for the whole cohort.

### Core Features

- **Deterministic tier + archetype engine** — rule-based classifier (`src/engine.ts`) assigns every learner a tier (Red / Amber / Watch / Healthy) and an archetype (Ghost / Disappointed / Wavering / Overwhelmed / Healthy) with zero LLM involvement, so the dashboard works without an API key
- **Monday Briefing** — one AI-generated cohort summary fired automatically on load (requires API key)
- **Per-learner AI drafts** — opt-in "Generate AI take" button per card; sends only derived signals (never raw data) to Claude
- **Demo cohort** — pre-loaded sample data so the dashboard works out of the box
- **Bring Your Own Sheet** — upload or paste a CSV with your own cohort; tolerates messy headers (case/whitespace-insensitive), blank rows, and mixed-format fields; downloadable sample template included
- **Privacy-first** — all classification runs client-side; AI calls are opt-in per learner with explicit microcopy

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 5 |
| Classification engine | Pure TypeScript, deterministic rules |
| AI layer | Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| API routes (local) | Vite dev middleware (`server/devApiPlugin.ts`) |
| API routes (production) | Vercel serverless functions (`api/*.ts`) |
| Deployment | Vercel (zero-config, auto-detected) |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Add your Anthropic API key (AI layer is optional — dashboard works without it)
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Start the dev server
npm run dev
```

The dashboard runs at `http://localhost:5173`. The `/api/briefing` and `/api/learner-narrative` routes are served by the Vite dev middleware — no separate server needed.

---

## CSV Schema

Upload a CSV with these columns (order and casing don't matter):

| Column | Type | Notes |
|---|---|---|
| `learner_id` | string | Required; blank rows are skipped |
| `name` | string | |
| `sessions_attended_4wk` | number | |
| `sessions_held_4wk` | number | |
| `assignments_done` | number | |
| `assignments_due` | number | |
| `recent_ratings` | comma-separated numbers | e.g. `4.2,3.8,4.5` |
| `nps_status` | `promoter` / `passive` / `detractor` | |
| `weeks_since_manager_contact` | number | |
| `support_tickets_30d` | number | |
| `fee_status` | `on_time` / `late` / `extension_requested` | |
| `deferment_requests` | number | |
| `whatsapp_active` | `true` / `false` | |
| `manager_note` | string | Optional free text |

A downloadable sample template is available from the "Use my own sheet" panel in the app.

---

## Classification Logic

The engine (`src/engine.ts`) runs a top-down, first-match-wins decision tree:

**Tier**
1. **Red** — gone dark (>4 weeks no contact) OR consecutive rating dips below 4 OR NPS detractor
2. **Amber** — closing-window dark (3–4 weeks) OR mild sentiment dip + confirmation signal (behind on work / commitment wobble)
3. **Watch** — confirmation signal present but no sentiment concern
4. **Healthy** — everything else

**Archetype** (within tier)
- **Ghost** — gone dark
- **Disappointed** — sentiment red trigger, contact still current
- **Wavering** — commitment wobble (late fees / deferment requests)
- **Overwhelmed** — behind on attendance or assignments
- **Healthy** — no flags

---

## Deployment (Vercel)

1. Push this repo to GitHub
2. Import the project at [vercel.com/new](https://vercel.com/new)
3. Add `ANTHROPIC_API_KEY` under **Settings → Environment Variables**
4. Deploy — Vercel auto-detects the Vite framework and bundles the `api/` serverless functions

The `vercel.json` at the project root handles the build configuration.

---

## Project Structure

```
├── src/
│   ├── engine.ts          # Deterministic classifier (frozen — do not edit)
│   ├── csv.ts             # Demo cohort CSV parser
│   ├── byoCsv.ts          # BYO upload parser + validation
│   ├── api.ts             # Client-side fetch wrappers
│   └── App.tsx            # Dashboard UI
├── server/
│   ├── anthropicClient.ts # Anthropic SDK wrapper
│   ├── learnerNarrative.ts# Per-learner AI draft logic
│   ├── briefing.ts        # Monday briefing logic
│   ├── systemPrompt.ts    # LLM system prompt (editable)
│   ├── briefingSystemPrompt.ts
│   └── devApiPlugin.ts    # Vite dev middleware for /api/* routes
├── api/
│   ├── learner-narrative.ts  # Vercel serverless adapter
│   └── briefing.ts           # Vercel serverless adapter
├── public/
│   └── demo-cohort.csv    # Pre-loaded demo data
└── vercel.json
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Optional | Enables the AI briefing and draft generation. Dashboard works without it. |

Never commit `.env` — it's gitignored. For Vercel, set the key via the dashboard.

---

## License

MIT
