import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { HubSpotApiError, hubspotRequest } from "./hubspot-client.js";

const listContactsSchema = z.object({ limit: z.number().default(20) });

const createContactSchema = z.object({
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const searchDealsSchema = z.object({ query: z.string(), limit: z.number().default(20) });

const updateDealStageSchema = z.object({ dealId: z.string(), dealStage: z.string() });

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof HubSpotApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "hubspot",
  version: "0.1.0",
  tools: [
    {
      name: "list_contacts",
      description: "List CRM contacts.",
      inputSchema: listContactsSchema,
      async handler({ limit }) {
        const result = await safe(() =>
          hubspotRequest<{ results: unknown[] }>(`/crm/v3/objects/contacts?limit=${limit}`),
        );
        return result.ok ? jsonResult(result.value.results) : errorResult(result.message);
      },
    },
    {
      name: "create_contact",
      description: "Create a new CRM contact.",
      inputSchema: createContactSchema,
      async handler({ email, firstName, lastName }) {
        const result = await safe(() =>
          hubspotRequest<{ id: string }>(
            "/crm/v3/objects/contacts",
            { properties: { email, ...(firstName ? { firstname: firstName } : {}), ...(lastName ? { lastname: lastName } : {}) } },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ contactId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "search_deals",
      description: "Search deals by name.",
      inputSchema: searchDealsSchema,
      async handler({ query, limit }) {
        const result = await safe(() =>
          hubspotRequest<{ results: unknown[] }>(
            "/crm/v3/objects/deals/search",
            { query, limit, properties: ["dealname", "dealstage", "amount"] },
            "POST",
          ),
        );
        return result.ok ? jsonResult(result.value.results) : errorResult(result.message);
      },
    },
    {
      name: "update_deal_stage",
      description: "Move a deal to a different pipeline stage.",
      inputSchema: updateDealStageSchema,
      async handler({ dealId, dealStage }) {
        const result = await safe(() =>
          hubspotRequest(`/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: dealStage } }, "PATCH"),
        );
        return result.ok ? textResult(`Deal ${dealId} moved to stage ${dealStage}`) : errorResult(result.message);
      },
    },
  ],
});
