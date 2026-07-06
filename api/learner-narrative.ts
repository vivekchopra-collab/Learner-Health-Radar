/**
 * api/learner-narrative.ts — Vercel serverless entry point for the
 * per-learner narrative call (llm-layer-spec.md Section A).
 *
 * This is a thin adapter only: all the real logic lives in
 * server/learnerNarrative.ts (shared with local dev via
 * server/devApiPlugin.ts) and server/systemPrompt.ts (untouched). Nothing
 * here re-implements the call or the prompt — it just exposes the same
 * function as a Vercel function so a deployed build has a working
 * same-origin /api/learner-narrative route.
 *
 * ANTHROPIC_API_KEY must be set as an environment variable in the Vercel
 * project (Settings -> Environment Variables) — never committed to a file.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateLearnerNarrative } from "../server/learnerNarrative.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    const input = req.body as Parameters<typeof generateLearnerNarrative>[0];
    const result = await generateLearnerNarrative(input);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
