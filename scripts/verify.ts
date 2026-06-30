/**
 * verify.ts — runs the deterministic engine against the demo cohort and
 * prints every learner's classification, then checks the specific
 * acceptance cases called out for this build.
 *
 * Run with: npm run verify
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { classifyLearner } from "../src/engine";
import { parseLearnerRows } from "../src/csv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, "..", "public", "demo-cohort-realistic.csv");
const csvText = readFileSync(csvPath, "utf-8");

const rows = parseLearnerRows(csvText);
const classified = rows.map((row) => ({ row, result: classifyLearner(row) }));

const TIER_EMOJI: Record<string, string> = {
  red: "🔴",
  amber: "🟠",
  watch: "🟡",
  healthy: "🟢",
};

console.log("\n=== Full classification (CSV order) ===\n");
for (const { row, result } of classified) {
  console.log(
    `${TIER_EMOJI[result.tier]} ${result.tier.padEnd(7)} | ${result.archetype.padEnd(12)} | ${row.learner_id} ${row.name}`
  );
  if (result.firedSignals.length) {
    for (const s of result.firedSignals) console.log(`        - ${s}`);
  }
}

console.log("\n=== Acceptance checks ===\n");

type Check = { id: string; name: string; expectTier: string; expectArchetype: string };
const checks: Check[] = [
  { id: "L22", name: "Rohan", expectTier: "red", expectArchetype: "ghost" },
  { id: "L15", name: "Anjali", expectTier: "watch", expectArchetype: "overwhelmed" },
  { id: "L25", name: "Priya", expectTier: "red", expectArchetype: "disappointed" },
  { id: "L18", name: "Rohit", expectTier: "healthy", expectArchetype: "healthy" },
  { id: "L19", name: "Sana", expectTier: "red", expectArchetype: "disappointed" },
  { id: "L21", name: "Imran", expectTier: "red", expectArchetype: "ghost" },
  { id: "L23", name: "Meera", expectTier: "amber", expectArchetype: "overwhelmed" },
];

let allPass = true;
for (const check of checks) {
  const found = classified.find((c) => c.row.learner_id === check.id);
  if (!found) {
    console.log(`FAIL  ${check.id} ${check.name} — not found in CSV`);
    allPass = false;
    continue;
  }
  const tierOk = found.result.tier === check.expectTier;
  const archOk = found.result.archetype === check.expectArchetype;
  const pass = tierOk && archOk;
  if (!pass) allPass = false;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${check.id} ${check.name} — expected ${check.expectTier}/${check.expectArchetype}, got ${found.result.tier}/${found.result.archetype}`
  );
}

console.log(`\n${allPass ? "ALL ACCEPTANCE CHECKS PASS" : "SOME ACCEPTANCE CHECKS FAILED"}\n`);

if (!allPass) process.exit(1);
