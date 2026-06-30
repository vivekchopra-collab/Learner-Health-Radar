/**
 * anthropicClient.ts — the one place that talks to the Anthropic API.
 *
 * Server-side only. ANTHROPIC_API_KEY is read from process.env (populated
 * from a project-root .env file — see .env.example). Nothing under src/
 * imports this file, so the key can never end up in the browser bundle.
 */
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key " +
        "(it's gitignored and read server-side only — never bundled to the client)."
    );
  }
  if (!cachedClient) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** Sends one system+user turn to Claude and returns the raw text reply. */
export async function callClaude(
  system: string,
  userContent: string,
  maxTokens = 700
): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Claude returned no text content block.");
  }
  return block.text;
}
