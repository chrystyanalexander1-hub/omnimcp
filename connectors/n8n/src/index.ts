import { errorResult, jsonResult, requireEnv, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

export class N8nError extends Error {}

const listWorkflowsSchema = z.object({ baseUrl: z.string() });
const triggerWebhookSchema = z.object({ webhookUrl: z.string(), payload: z.record(z.unknown()) });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof N8nError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "n8n",
  version: "0.1.0",
  tools: [
    {
      /**
       * n8n's self-hosted REST API (X-N8N-API-KEY header) is a genuinely different
       * surface from Zapier/Make's "no third-party API, only per-workflow webhook
       * URLs" — it can actually list what's on the instance, not just fire a
       * pre-built trigger blindly. baseUrl is a tool argument, not fixed config,
       * because it's the tenant's own instance (same reasoning as shopDomain in
       * connectors/shopify).
       */
      name: "list_workflows",
      description: "List workflows on a self-hosted n8n instance.",
      inputSchema: listWorkflowsSchema,
      async handler({ baseUrl }) {
        const result = await safe(async () => {
          const apiKey = requireEnv("N8N_API_KEY");
          const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/workflows`, {
            headers: { "X-N8N-API-KEY": apiKey },
          });
          if (!res.ok) throw new N8nError(`n8n API error: HTTP ${res.status} ${await res.text()}`);
          return (await res.json()) as { data: unknown[] };
        });
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "trigger_webhook",
      description: "Trigger an n8n workflow by POSTing a JSON payload to its Webhook node URL.",
      inputSchema: triggerWebhookSchema,
      async handler({ webhookUrl, payload }) {
        const result = await safe(async () => {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new N8nError(`n8n webhook error: HTTP ${res.status} ${await res.text()}`);
        });
        return result.ok ? textResult("Workflow triggered") : errorResult(result.message);
      },
    },
  ],
});
