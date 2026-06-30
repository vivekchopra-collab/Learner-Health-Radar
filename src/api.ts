/**
 * api.ts — client-side fetch wrappers for the local /api/* routes.
 *
 * This file never touches the Anthropic API or an API key directly — it
 * only calls same-origin endpoints served by server/devApiPlugin.ts. Keep
 * it that way: any Claude-calling code belongs under server/, not here.
 */
import type { Archetype, LearnerRow, Tier } from "./engine";

export interface LearnerNarrative {
  why: string;
  archetype_confirm: string;
  next_touch: string;
  draft: string;
}

export interface LearnerNarrativeRequest {
  name: string;
  tier: Tier;
  archetype: Archetype;
  firedSignals: string[];
  raw: LearnerRow;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as { error?: string }).error ?? `Request to ${url} failed (HTTP ${res.status})`
    );
  }
  return res.json() as Promise<T>;
}

export function fetchLearnerNarrative(input: LearnerNarrativeRequest): Promise<LearnerNarrative> {
  return postJson<LearnerNarrative>("/api/learner-narrative", input);
}

export interface BriefingCohortEntry {
  name: string;
  tier: Tier;
  archetype: Archetype;
  firedSignals: string[];
}

export async function fetchBriefing(cohort: BriefingCohortEntry[]): Promise<string> {
  const data = await postJson<{ briefing: string }>("/api/briefing", { cohort });
  return data.briefing;
}
