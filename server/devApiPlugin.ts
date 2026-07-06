/**
 * devApiPlugin.ts — local /api/* routes, dev-server only.
 *
 * This is the "thin serverless route" the original build spec calls for:
 * ANTHROPIC_API_KEY lives only in this Node process's environment (loaded
 * from .env). The browser bundle never imports anything under server/ and
 * only ever calls these same-origin /api/* paths, so the key can't leak to
 * the client no matter what the dashboard code does.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { generateLearnerNarrative } from "./learnerNarrative.js";
import { generateBriefing } from "./briefing.js";

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function devApiPlugin(): Plugin {
  return {
    name: "lhr-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/learner-narrative", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
        try {
          const input = (await readJsonBody(req)) as Parameters<typeof generateLearnerNarrative>[0];
          const result = await generateLearnerNarrative(input);
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use("/api/briefing", async (req, res) => {
        if (req.method !== "POST") return sendJson(res, 405, { error: "POST only" });
        try {
          const body = (await readJsonBody(req)) as { cohort?: Parameters<typeof generateBriefing>[0] };
          const briefing = await generateBriefing(body.cohort ?? []);
          sendJson(res, 200, { briefing });
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
