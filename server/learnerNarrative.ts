/**
 * learnerNarrative.ts — per-learner call (llm-layer-spec.md Section A).
 *
 * Takes the deterministic engine's already-decided tier/archetype/
 * firedSignals plus the learner's raw row, and asks Claude for the `why`
 * and the rescue `draft`. Never re-derives tier/archetype/firedSignals —
 * those arrive as a frozen input here, not recomputed.
 */
import { callClaude } from "./anthropicClient.js";
import { LEARNER_NARRATIVE_SYSTEM_PROMPT } from "./systemPrompt.js";
import type { Archetype, LearnerRow, Tier } from "../src/engine.js";

export interface LearnerNarrativeInput {
  name: string;
  tier: Tier;
  archetype: Archetype;
  firedSignals: string[];
  raw: LearnerRow;
}

export interface LearnerNarrativeResult {
  why: string;
  archetype_confirm: string;
  next_touch: string;
  draft: string;
}

const TIER_LABEL: Record<Tier, string> = {
  red: "Red",
  amber: "Amber",
  watch: "Watch",
  healthy: "Healthy",
};

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  ghost: "Ghost",
  disappointed: "Disappointed",
  wavering: "Wavering",
  overwhelmed: "Overwhelmed",
  healthy: "Healthy",
};

function buildUserMessage(input: LearnerNarrativeInput): string {
  return JSON.stringify({
    name: input.name,
    tier: TIER_LABEL[input.tier],
    archetype: ARCHETYPE_LABEL[input.archetype],
    firedSignals: input.firedSignals,
    raw: {
      recent_ratings: input.raw.recent_ratings,
      nps_status: input.raw.nps_status,
      weeks_since_manager_contact: input.raw.weeks_since_manager_contact,
      sessions_attended_4wk: input.raw.sessions_attended_4wk,
      sessions_held_4wk: input.raw.sessions_held_4wk,
      assignments_done: input.raw.assignments_done,
      assignments_due: input.raw.assignments_due,
      fee_status: input.raw.fee_status,
      deferment_requests: input.raw.deferment_requests,
      support_tickets_30d: input.raw.support_tickets_30d,
      whatsapp_active: input.raw.whatsapp_active,
      manager_note: input.raw.manager_note,
    },
  });
}

function stripFences(text: string): string {
  // Defensive only — the system prompt forbids fences, but models slip.
  const fenced = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : text.trim();
}

function parseStrictJson(text: string): LearnerNarrativeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    throw new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`);
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.why !== "string" ||
    typeof obj.archetype_confirm !== "string" ||
    typeof obj.next_touch !== "string" ||
    typeof obj.draft !== "string"
  ) {
    throw new Error(`Model JSON is missing required fields: ${text.slice(0, 200)}`);
  }
  return obj as unknown as LearnerNarrativeResult;
}

export async function generateLearnerNarrative(
  input: LearnerNarrativeInput
): Promise<LearnerNarrativeResult> {
  const userMessage = buildUserMessage(input);
  const firstReply = await callClaude(LEARNER_NARRATIVE_SYSTEM_PROMPT, userMessage);
  try {
    return parseStrictJson(firstReply);
  } catch {
    // One retry per Section A hard rule #4 ("valid JSON, nothing before or
    // after it") — occasionally a model wraps the JSON in a sentence.
    const retryMessage = `${userMessage}\n\nYour previous reply was not valid JSON on its own. Reply again with ONLY the JSON object — no prose, no markdown fences.`;
    const retryReply = await callClaude(LEARNER_NARRATIVE_SYSTEM_PROMPT, retryMessage);
    return parseStrictJson(retryReply);
  }
}
