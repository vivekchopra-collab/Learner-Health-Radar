/**
 * generate-drafts.ts — produces the four sample per-learner narratives
 * (Imran, Priya, Meera, Vikram) called out in llm-layer-spec.md, then runs
 * Section D's objective checks against them.
 *
 * If ANTHROPIC_API_KEY is set (project-root .env, see .env.example), this
 * calls the real claude-sonnet-4-6 endpoint through the same
 * server/learnerNarrative.ts module the dashboard uses. If no key is
 * configured, it falls back to scripts/simulated-drafts.json — hand
 * -authored stand-ins that follow the system prompt and plays exactly,
 * clearly labeled SIMULATED, so the plays can be eyeballed before wiring
 * a live key.
 *
 * Run with: npm run drafts
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyLearner } from "../src/engine";
import type { LearnerRow, Tier, Archetype } from "../src/engine";
import { parseLearnerRows } from "../src/csv";
import { generateLearnerNarrative } from "../server/learnerNarrative";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "public", "demo-cohort-realistic.csv");
const csvText = readFileSync(csvPath, "utf-8");

const TARGET_NAMES = ["Imran", "Priya", "Meera", "Vikram"];

const rows = parseLearnerRows(csvText);
const targets = TARGET_NAMES.map((name) => {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`Could not find ${name} in the demo CSV`);
  return { row, result: classifyLearner(row) };
});

const hasLiveKey = !!process.env.ANTHROPIC_API_KEY;

interface NarrativeResult {
  why: string;
  archetype_confirm: string;
  next_touch: string;
  draft: string;
}

let simulated: Record<string, NarrativeResult> = {};
if (!hasLiveKey) {
  const simPath = path.join(__dirname, "simulated-drafts.json");
  simulated = JSON.parse(readFileSync(simPath, "utf-8"));
}

async function getNarrative(
  row: LearnerRow,
  result: { tier: Tier; archetype: Archetype; firedSignals: string[] }
): Promise<NarrativeResult> {
  if (hasLiveKey) {
    return generateLearnerNarrative({
      name: row.name,
      tier: result.tier,
      archetype: result.archetype,
      firedSignals: result.firedSignals,
      raw: row,
    });
  }
  const sim = simulated[row.learner_id];
  if (!sim) throw new Error(`No simulated draft on file for ${row.name} (${row.learner_id})`);
  return sim;
}

// ---------------------------------------------------------------------------
// Section D objective checks. These are text-pattern proxies for the
// spec's rules — "no invented facts" and overall tone still need the human
// eyeball call per Section D's subjective check ("would I actually send
// this?"). The raw row is printed alongside each draft so that comparison
// is easy to do by hand.
// ---------------------------------------------------------------------------

type CheckFn = (n: NarrativeResult, row: LearnerRow) => { pass: boolean; detail: string };

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(text);
}

function firstIndexOfAny(text: string, words: string[]): number {
  let best = -1;
  for (const w of words) {
    const m = new RegExp(`\\b${w}\\b`, "i").exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const CHECKS: Record<string, CheckFn[]> = {
  Imran: [
    (n) => ({
      pass:
        !hasWord(n.draft, "course") &&
        !hasWord(n.draft, "session") &&
        !hasWord(n.draft, "module") &&
        !hasWord(n.draft, "class") &&
        !hasWord(n.draft, "missed"),
      detail: "draft never names the course / missed sessions",
    }),
    (n) => ({
      pass: hasWord(n.why, "detractor") || hasWord(n.why, "feedback") || hasWord(n.why, "rating"),
      detail: "why cites the prior detractor signal",
    }),
    (n) => ({
      pass:
        hasWord(n.why, "weeks") ||
        hasWord(n.why, "quiet") ||
        hasWord(n.why, "silence") ||
        hasWord(n.why, "contact"),
      detail: "why cites the silence / gone-dark signal",
    }),
    (n) => ({ pass: n.next_touch === "call", detail: "next_touch is call" }),
  ],
  Priya: [
    (n) => ({ pass: !hasWord(n.draft, "but"), detail: 'acknowledgement contains no "but"' }),
    (n) => ({
      pass: /\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|by \w+)\b/i.test(
        n.draft
      ),
      detail: "fix is specific and dated",
    }),
    (n) => ({ pass: n.next_touch === "call", detail: "next_touch is call" }),
  ],
  Meera: [
    (n) => ({ pass: !hasWord(n.draft, "behind"), detail: 'draft never says "behind"' }),
    (n) => ({
      pass: /\b(smaller|lighter|fewer|one|pause|simpler|reduce)\b/i.test(n.draft),
      detail: "draft reduces load rather than speeding up",
    }),
    (n) => ({ pass: n.next_touch === "email", detail: "first touch is email" }),
  ],
  Vikram: [
    (n) => {
      const goalIdx = firstIndexOfAny(n.draft, ["goal", "certificate", "cert", "finish", "career"]);
      const feeIdx = firstIndexOfAny(n.draft, ["fee", "payment", "defer", "deferment", "installment", "money"]);
      return {
        pass: goalIdx !== -1 && (feeIdx === -1 || goalIdx < feeIdx),
        detail: "goal is re-anchored before fees / deferment",
      };
    },
    (n) => ({
      pass: /\b(stay|staying|bridge|enrolled|in this)\b/i.test(n.draft),
      detail: "flexibility framed as staying in, not an exit",
    }),
    (n) => ({ pass: n.next_touch === "email", detail: "first touch is email" }),
  ],
};

function checkValidShape(n: NarrativeResult): { pass: boolean; detail: string } {
  const okFields =
    typeof n.why === "string" &&
    n.why.length > 0 &&
    typeof n.draft === "string" &&
    n.draft.length > 0 &&
    typeof n.archetype_confirm === "string" &&
    (n.next_touch === "call" || n.next_touch === "email");
  return { pass: okFields, detail: "valid JSON shape (why/archetype_confirm/next_touch/draft)" };
}

async function main() {
  console.log(
    `\n=== Per-learner drafts (${hasLiveKey ? "LIVE claude-sonnet-4-6" : "SIMULATED — no ANTHROPIC_API_KEY set"}) ===\n`
  );
  if (!hasLiveKey) {
    console.log(
      "No ANTHROPIC_API_KEY found. Showing hand-authored stand-ins that follow systemPrompt.ts\n" +
        "exactly, for an eyeball check against the plays. Add a key to .env and re-run to get\n" +
        "live model output through the same code path.\n"
    );
  }

  let allPass = true;
  const results: {
    name: string;
    row: LearnerRow;
    result: ReturnType<typeof classifyLearner>;
    narrative: NarrativeResult;
  }[] = [];

  for (const { row, result } of targets) {
    const narrative = await getNarrative(row, result);
    results.push({ name: row.name, row, result, narrative });

    console.log(`--- ${row.name} (${row.learner_id}) — ${result.tier}/${result.archetype} ---`);
    console.log(`Raw row: ${JSON.stringify(row)}`);
    console.log(`Fired signals: ${result.firedSignals.join("; ") || "(none)"}`);
    console.log(`why: ${narrative.why}`);
    console.log(`archetype_confirm: ${narrative.archetype_confirm}`);
    console.log(`next_touch: ${narrative.next_touch}`);
    console.log(`draft:\n${narrative.draft}\n`);
  }

  console.log("=== Section D objective checks ===\n");
  for (const { name, row, narrative } of results) {
    const allChecks = [checkValidShape(narrative), ...(CHECKS[name] ?? []).map((fn) => fn(narrative, row))];
    for (const { pass, detail } of allChecks) {
      if (!pass) allPass = false;
      console.log(`${pass ? "PASS" : "FAIL"}  ${name} — ${detail}`);
    }
  }

  console.log(
    `\nNote: "no invented facts" is checked by eye, not regex — compare each draft above against its raw row.\n`
  );
  console.log(allPass ? "ALL OBJECTIVE CHECKS PASS\n" : "SOME OBJECTIVE CHECKS FAILED\n");
  if (!allPass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
