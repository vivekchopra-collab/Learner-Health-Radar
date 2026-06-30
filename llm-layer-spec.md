# Learner-Health Radar — LLM Layer Spec

This sits **on top of the already-verified deterministic engine.** The engine has already decided each learner's `tier`, `archetype`, and `firedSignals`. The LLM's job is **not** to re-decide — it's to write the *why* and the *rescue draft*, following the archetype's play exactly.

Do not let this layer drift into a generic "summarize the learner and suggest reaching out" wrapper. The value is entirely in the plays below being followed faithfully.

---

## A. Per-learner call (runs for each Amber/Red learner)

### Input given to the model
```json
{
  "name": "Imran",
  "tier": "Red",
  "archetype": "Ghost",
  "firedSignals": ["gone_dark_6wk", "nps_detractor", "deferment_x2"],
  "raw": { "recent_ratings": "", "nps_status": "detractor", "weeks_since_manager_contact": 6,
           "fee_status": "extension_requested", "manager_note": "" /* may be blank or useless */ }
}
```

### Required output — strict JSON only, no prose, no markdown fences
```json
{
  "why": "One sentence, plain English, grounded ONLY in the signals present.",
  "archetype_confirm": "Ghost",
  "next_touch": "call",
  "draft": "The rescue message or call talking-points, following the play."
}
```

- `archetype_confirm`: default = repeat the engine's archetype. Override **only** if the `manager_note` plainly contradicts it (rare). Never override based on a blank note.
- `next_touch`: `call` for Ghost/Disappointed; `email` for Wavering/Overwhelmed first contact (then message, then call on silence).

### Hard rules (non-negotiable)
1. **Never invent facts not in the data.** If the note is blank or useless ("NA", "busy"), write from the structured signals only. Do not fabricate a reason for the learner's behaviour.
2. **Never name specific missed modules/sessions** to a learner unless that exact detail is in the data — and never for a Ghost.
3. One-sentence `why`. No hedging, no restating all the numbers.
4. Output valid JSON. Nothing before or after it.

---

## B. The four plays (the moat — follow exactly)

### 👻 Ghost — channel: CALL (talking points, not a script)
Order matters: **the course comes 4th, not 1st.**
1. Establish connection — warm, no agenda, NOT about the course.
2. How have they been — genuine, then listen.
3. Life check — surface the real blocker (work/family/health).
4. *Then* the absence — curiosity, never blame, tie back to their reason.
5. Propose one small catch-up step — not the backlog.
- **Never** open with the course. **Never** list what they missed. **Never** guilt. Diagnose life before coursework. Leave the door open.

### 😤 Disappointed — channel: CALL
1. Signal priority/speed — "I called personally, didn't want this in a queue."
2. Hear them out fully — no defending.
3. Acknowledge with **zero "but"** — own it cleanly.
4. One specific, owned, time-bound fix.
5. Promise a circle-back.
- The word "but" in the acknowledgement is a failure. No excuses. Fix must be concrete + owned + dated.

### 🪙 Wavering — channel: EMAIL → message → call (escalate on silence)
- Re-anchor the goal **before** logistics, every touch.
- Surface the real blocker (money/time).
- Offer flexibility (deferment/plan) as a **bridge to stay in**, never as an exit.
- Secure one dated commitment.
- Empathetic on the constraint, firm on the goal. First touch = a short email.

### 😵 Overwhelmed — channel: EMAIL → message → call (escalate on silence)
- **Reassure first / relieve pressure** before anything else.
- De-shame — they're trying, that counts.
- **Never say "you're behind."**
- Reduce load — a *smaller* plan, not a faster one. One achievable win, not the backlog.
- Follow-up is supportive, not policing. First touch = a short, warm email.

> Ghost vs Overwhelmed look identical on data. Ghost = re-connect (no contact). Overwhelmed = reduce load (in contact, juggling). Opposite drafts. Getting this wrong is the cardinal error.

---

## C. Batch briefing call (runs once over the full classified cohort)

Input: the whole list with tiers/archetypes. Output: a **5-line** Monday briefing, plain and scannable:
- Line 1: tier counts (e.g. "5 Red, 4 Amber, 5 Watch, 14 healthy").
- Line 2–3: who needs a **call today** (Red names + one-clause why each).
- Line 4: any **cohort-level pattern** worth noting (e.g. ratings dipping after a module, a cluster of fee requests) — only if the data actually shows it; otherwise omit.
- Line 5: the **top 3 names** to action first.
No fluff, no motivational filler. Ground every line in the data.

---

## D. Acceptance checks

**Objective (must pass):**
- Ghost draft (Imran, blank note): opens warm with no mention of the course or missed sessions; invents no reason for his absence; `why` cites only silence + prior detractor.
- Disappointed draft (Priya / Sana): acknowledgement contains no "but"; offers a specific, dated fix.
- Overwhelmed draft (Meera): never uses the word "behind"; reduces load; first touch is an email.
- Wavering draft (Vikram): re-anchors the goal before mentioning fees/deferment; frames flexibility as staying in.
- All outputs parse as valid JSON; no invented facts anywhere.

**Subjective (your call, and the real test):**
- Read each draft and ask: *would I actually send this?* If it reads like a template or a generic "just checking in," the play isn't landing — tighten the system prompt, don't accept it.

---

## E. Build note
Keep the system prompt (Sections A–B) in one editable file — it's a moat artifact and you'll tune it as you read real drafts. Use `claude-sonnet-4-6`. Engine stays deterministic; only `why`, `draft`, and the briefing come from the model.
