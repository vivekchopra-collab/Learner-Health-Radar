/**
 * api/briefing.ts — Vercel serverless entry point for the batch Monday
 * briefing call (llm-layer-spec.md Section C).
 *
 * Thin adapter only, same pattern as api/learner-narrative.ts: real logic
 * stays in server/briefing.ts and server/briefingSystemPrompt.ts
 * (untouched). Exposes the same /api/briefing route in a deployed build
 * that server/devApiPlugin.ts exposes for local dev.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateBriefing } from "../server/briefing";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    const body = req.body as { cohort?: Parameters<typeof generateBriefing>[0] };
    const briefing = await generateBriefing(body.cohort ?? []);
    res.status(200).json({ briefing });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
