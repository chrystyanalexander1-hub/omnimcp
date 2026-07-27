import { errorResult, requireEnv, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

export class MakeError extends Error {}

const triggerScenarioSchema = z.object({ payload: z.record(z.unknown()) });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof MakeError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "make",
  version: "0.1.0",
  tools: [
    {
      /** Same reasoning as connectors/zapier's trigger_zap: Make's supported way for
       * another system to invoke a scenario is a custom webhook URL, not a general
       * "run any of my scenarios" API. The credential IS that URL. */
      name: "trigger_scenario",
      description: "Trigger a Make scenario by POSTing a JSON payload to its webhook URL.",
      inputSchema: triggerScenarioSchema,
      async handler({ payload }) {
        const result = await safe(async () => {
          const webhookUrl = requireEnv("MAKE_WEBHOOK_URL");
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            throw new MakeError(`Make webhook error: HTTP ${res.status} ${await res.text()}`);
          }
        });
        return result.ok ? textResult("Scenario triggered") : errorResult(result.message);
      },
    },
  ],
});
