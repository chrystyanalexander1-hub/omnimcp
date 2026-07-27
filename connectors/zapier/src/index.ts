import { errorResult, requireEnv, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

export class ZapierError extends Error {}

const triggerZapSchema = z.object({ payload: z.record(z.unknown()) });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof ZapierError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "zapier",
  version: "0.1.0",
  tools: [
    {
      /**
       * Zapier has no general "invoke any of my Zaps" API for third parties — the
       * supported integration surface for this direction (another system triggering
       * a Zap, not a formal published Zapier app) is "Webhooks by Zapier": a unique
       * per-Zap URL that accepts a POST with any JSON body. The credential here IS
       * that URL, not a token — same idea as connectors/telegram embedding its bot
       * token in the request URL instead of a header.
       */
      name: "trigger_zap",
      description: "Trigger a Zap by POSTing a JSON payload to its webhook URL.",
      inputSchema: triggerZapSchema,
      async handler({ payload }) {
        const result = await safe(async () => {
          const webhookUrl = requireEnv("ZAPIER_WEBHOOK_URL");
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new ZapierError(`Zapier webhook error: HTTP ${res.status} ${await res.text()}`);
          }
        });
        return result.ok ? textResult("Zap triggered") : errorResult(result.message);
      },
    },
  ],
});
