# Learner-Health Radar — v1 Build Spec

> A learner-health triage tool for EdTech customer-success teams. It reads a batch, surfaces who's slipping, classifies *why*, and drafts the exact rescue message — in about a minute, with no setup.

---

## 1. What this is (and isn't)

**Is:** a triage + action tool. For each learner it answers three things — *fine / slipping / gone*, *why*, and *the one right move today* — and drafts the message to send.

**Is not:** a churn-*prediction* model. We never claim accuracy on future drop-off. Language stays in the present: "who needs attention this week," never "who will churn." This is a deliberate framing decision, not a limitation to apologise for.

**Positioning (the four lines):**
- Education-native — built around cohorts/batches and learners, not SaaS "accounts."
- AI-narrative-first — a plain-English briefing and ready-to-send rescue drafts, not 30 dashboard dials.
- Sixty-seconds-to-value — paste a sheet or load the demo; no implementation project.
- Private by design — learner data is processed in-session and not stored.

---

## 2. v1 scope

**In:**
- A built-in **demo cohort** with a multi-week simulation (an "advance week" control) so anyone can watch the engine work with zero data.
- A **bring-your-own-sheet** path (CSV upload or paste).
- A **cohort dashboard**: the batch briefing (hero), a learner list with archetype + severity tags, and a per-learner drill-down with the *why* and the draft message.
- The deterministic scoring + archetype classifier, plus the AI narrative layer.

**Out (v1):**
- Real integrations (LMS/CRM APIs), auth/accounts, persistence of uploaded data, multi-cohort management, team collaboration, analytics over time. All deferred.

---

## 3. Architecture — three layers

1. **Deterministic engine** (no LLM): computes each learner's severity tier and routes them to an archetype using fixed rules (Section 5). Fast, transparent, explainable — this is the answer to "nobody trusts the black-box score."
2. **LLM narrative layer** (Claude): reads the free-text call note / soft-sentiment fields to (a) break genuine archetype ties, (b) write the one-line *why*, (c) generate the rescue message/flow from the matching play. (Section 6.)
3. **UI** (Section 8): renders the briefing, list, and drill-down; runs the demo simulation.

Output per learner = `Archetype` + `Severity tier` + one-line *why* + the matching play + a draft message.

---

## 4. Data model (input columns)

One row per learner per week (long format) so the simulation can advance through time.

| Field | Type | Notes |
|---|---|---|
| `week` | int | Simulation/reporting week |
| `learner_id` | string | Stable ID |
| `name` | string | Display name |
| `sessions_attended` | int | Cumulative or per-week (define once; per-week here) |
| `sessions_held` | int | Per-week sessions available |
| `assignments_done` | int | Cumulative |
| `assignments_due` | int | Cumulative |
| `recent_ratings` | list or blank | Last ~3 session ratings (e.g. "3.6,3.4,3.3"); 1–5 each; often sparse or blank. Needed so the "2 consecutive" rule is computable. |
| `nps_status` | enum | `promoter` / `passive` / `detractor` / blank |
| `weeks_since_manager_contact` | int | The contact-state signal; 0 = contacted this week |
| `support_tickets_30d` | int | Recent queries raised |
| `fee_status` | enum | `on_time` / `late` / `extension_requested` |
| `deferment_requests` | int | Count to date |
| `whatsapp_active` | bool | Active in cohort group this week |
| `call_note` | free text | Soft-sentiment source — tone, what they're looking forward to, juggling signals, etc. May be blank. |

> The `call_note` is load-bearing: it's how sentiment is read when ratings are missing, and how the LLM disambiguates lookalike archetypes.

---

## 5. Deterministic logic

### 5a. Signals (8)
Relationship: `weeks_since_manager_contact > 4`. Engagement: irregular attendance; `support_tickets_30d == 0` over a long span (silent). Sentiment: `recent_ratings` trend; `nps_status == detractor/passive`. Progress: assignments done vs due with no extension ask. Commitment: `fee_status` late/extension; `deferment_requests` rising.

### 5b. Two early-warning roots: sentiment AND silence
There are **two independent root signals**, either of which escalates on its own:
1. **Sentiment going negative** — rating trend / NPS / call-note proxy.
2. **Contact going dark** — prolonged no-contact. Silence is not "missing data"; it *is* a signal. A learner you've lost the channel to is the most dangerous, because you can't see what's on fire inside.

**Confirmation-only signals:** behavioural/commitment signals (missed work, missed assignments, fees, deferments). On their own — with sentiment fine *and* contact current — they stay 🟡 Watch (the false-alarm guardrail: a busy-but-fine learner is not a crisis). They escalate only when a root signal is also present.

**Sentiment-red trigger (v1 threshold):** `recent_ratings` shows `< 4` for **2 consecutive** sessions, OR `nps_status == detractor`. (Tunable. Non-consecutive dips — e.g. 3.8, 4.6, 3.7 — do **not** trigger; this is deliberate noise-rejection.)

**Gone-dark trigger:** `weeks_since_manager_contact > 4` → Red on its own, regardless of sentiment. (3–4 weeks = the closing window, Amber.)

**Soft-sentiment proxy** (when ratings are blank — read from `call_note`): tone (excited/flat/going-through-motions), whether they're consuming recorded content, whether they named anything interesting, WhatsApp engagement, and whether they have a forward-looking "looking forward to ___." *Absence of a forward-looking answer is itself a negative sentiment read.*

### 5c. Severity tier ("how fast")
- 🔴 **Act today:** sentiment-red trigger firing **OR** gone dark (`weeks_since_manager_contact > 4`). Either root, alone.
- 🟠 **This week:** closing-window silence (`weeks_since_manager_contact` 3–4) **OR** a milder sentiment dip combined with a behavioural/commitment symptom.
- 🟡 **Watch:** a behavioural/commitment signal **alone**, with sentiment fine **and** contact current (≤2 weeks).
- 🟢 **Healthy:** no root signal, no stacked symptoms.

### 5d. Archetype classifier ("what to do")
**Primary fork — contact state:**
- `weeks_since_manager_contact > 4` → **Ghost** (gone dark), Red. Overrides everything; you can't diagnose further until contact is re-established.
- `weeks_since_manager_contact` 3–4 → **Ghost** (closing window), Amber. Same play — reach out before they go fully dark.
- Else (≤2 weeks, in contact) → route by **dominant signal**, in this precedence:
  1. Sentiment / value dissatisfaction (rating-driven, detractor, service gripe in note) → **Disappointed**
  2. Else fee late / extension / deferment → **Wavering**
  3. Else behind-on-work **and** note shows juggling/imbalance while still trying → **Overwhelmed**

> The Ghost ⇄ Overwhelmed distinction is the headline test of the engine: identical "behind on work" data, but Ghost = no contact (re-connect first), Overwhelmed = regular contact + heard imbalance (reduce load). Same red score, opposite move.

---

## 6. LLM narrative layer (Claude API)

For each Amber/Red learner, send the learner's row(s) + `call_note` and ask Claude to return JSON only:
- `why`: one sentence, plain English, grounded in the actual signals.
- `archetype_confirm`: confirm or override the deterministic archetype **only** when the call note clearly contradicts it (e.g. note reveals overwhelm behind apparent silence once contact resumes). Default = trust the deterministic route.
- `message`: the rescue draft for that archetype's channel + stage (Section 7), in a warm, Indian-EdTech-real voice, personalised to the note.

Also generate the **batch briefing**: a 5-line Monday summary — counts by tier, who needs a call today, any cohort-level pattern (e.g. "ratings dipped after Module 4"), and the top 3 names to action.

System-prompt rules for the model: never invent data not in the row; keep `why` to one sentence; messages follow the play's drafting rules exactly; output strict JSON, no prose, no markdown fences.

---

## 7. Archetype play library

Each archetype = channel + flow + drafting rules. The LLM fills these with the learner's specifics.

| Archetype | Channel | Flow (ordered) | Drafting rules |
|---|---|---|---|
| 👻 **Ghost** | Call only | 1 connect (no agenda) → 2 how have they been → 3 life check → 4 *then* the absence → 5 one small catch-up step | Never open with the course; never list what they missed; diagnose life before coursework; one re-entry step, not the backlog; leave the door open |
| 😤 **Disappointed** | Call only | 1 signal priority/speed → 2 hear them fully → 3 acknowledge with zero "but" → 4 one specific, owned, time-bound fix → 5 promise a circle-back | Lead with speed; listen before responding; no defending; fix must be concrete + owned + dated; always commit to follow-up |
| 🪙 **Wavering** | Email → message → call (escalate on silence) | Re-anchor the goal → surface the real blocker → offer flexibility as a *bridge* not an exit → secure one dated commitment | Goal before logistics every touch; flexibility framed as staying in; empathetic on constraint, firm on goal; the call is interception before they Ghost |
| 😵 **Overwhelmed** | Email → message → call (escalate on silence) | Reassure / relieve pressure first → de-shame → diagnose the imbalance → reduce load (smaller plan, not faster) → one achievable win + light check-in | Reassure before anything; never "you're behind"; shrink scope, don't accelerate; one win not the backlog; follow-up is supportive, not policing |

**Lifecycle decay (drives escalation):** untreated Wavering and Overwhelmed decay into Ghost/Disappointed — which is why those two escalate email→message→call to intercept early. Ghost and Disappointed are already call-only because they're past text.

---

## 8. UI / screens

**Single-page dashboard.**

1. **Top — Batch briefing** (hero): the 5-line AI summary + tier counts (🔴/🟠/🟡/🟢 as colored counts).
2. **Middle — Learner list:** sortable table. Each row: name, severity tier badge, archetype badge, one-line why, a "view play" action. Default sort: Red → Amber → Watch → Healthy.
3. **Drill-down (row expand or side panel):** the signals that fired, the archetype + tier, the full *why*, the recommended play (flow), and the draft message with a **copy** button. For Wavering/Overwhelmed show the 3-touch sequence.

**Mode switch at top:** `Demo cohort` ↔ `Use my own sheet` (upload/paste). Empty-state on BYO shows the expected columns + a "download sample CSV" link.

**Design:** clean, flat, education-native tone. Tier colors = red/amber/green/neutral. Archetype colors distinct from tier colors (e.g. gray/coral/pink/purple) so the two axes never visually collide.

---

## 9. Demo cohort simulation

- Ships with the demo CSV (≈10 learners × 6 weeks) baked in.
- An **"advance week"** control steps `week` forward; the dashboard recomputes live.
- The narrative: viewers watch healthy learners stay green, a Wavering learner decay toward Ghost if "unattended," ratings dip and flip someone to Disappointed, etc. This is what makes it feel *stateful*, not a one-shot CSV summary.
- Add a one-line honest caption: "Sample cohort — illustrates the workflow, not a validated prediction."

---

## 10. Privacy

- BYO data processed in-session only; nothing persisted server-side. State the policy plainly in the UI.
- If the LLM call needs the row server-side, route through a thin serverless function that forwards to the Anthropic API and returns — no logging of learner content.

---

## 11. Tech notes

- Front end: React/Next (matches existing stack), deployable on Vercel.
- AI: Anthropic API (`claude-sonnet-4-6`) for the narrative layer and briefing; deterministic engine is plain JS/TS — keep it out of the LLM for speed, cost, and explainability.
- API key server-side only (serverless route), never in the client.
- Keep the deterministic engine in a single, well-commented module — it *is* the moat and should be readable.

---

## 12. Build order

1. Deterministic engine module (signals → tier → archetype) + unit-check against the demo CSV.
2. Demo dashboard reading the baked-in cohort (list + drill-down, deterministic only).
3. LLM layer: why + draft messages + batch briefing.
4. "Advance week" simulation.
5. Bring-your-own-sheet path + sample CSV + privacy copy.
6. Polish: tier/archetype badges, sorting, empty states, the honest demo caption.

> Ship 1–4 first as the public showcase. 5–6 turn it into something a real CS lead can use.
