/**
 * briefing.ts — batch briefing call (llm-layer-spec.md Section C).
 * Runs once over the whole classified cohort, returns a 5-line briefing.
 */
import { callClaude } from "./anthropicClient";
import { BRIEFING_SYSTEM_PROMPT } from "./briefingSystemPrompt";
import type { Archetype, Tier } from "../src/engine";

export interface BriefingCohortEntry {
  name: string;
  tier: Tier;
  archetype: Archetype;
  firedSignals: string[];
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

function buildUserMessage(cohort: BriefingCohortEntry[]): string {
  return JSON.stringify({
    learners: cohort.map((c) => ({
      name: c.name,
      tier: TIER_LABEL[c.tier],
      archetype: ARCHETYPE_LABEL[c.archetype],
      firedSignals: c.firedSignals,
    })),
  });
}

export async function generateBriefing(cohort: BriefingCohortEntry[]): Promise<string> {
  const userMessage = buildUserMessage(cohort);
  const reply = await callClaude(BRIEFING_SYSTEM_PROMPT, userMessage, 400);
  return reply.trim();
}
