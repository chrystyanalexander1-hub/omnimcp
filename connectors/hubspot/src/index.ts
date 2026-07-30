import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { hubspotRequest } from "./hubspot-client.js";

const listContactsSchema = z.object({ limit: z.number().default(20) });

const createContactSchema = z.object({
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const searchDealsSchema = z.object({ query: z.string(), limit: z.number().default(20) });

const updateDealStageSchema = z.object({ dealId: z.string(), dealStage: z.string() });

await startConnector({
  name: "hubspot",
  version: "0.1.0",
  tools: [
    {
      name: "list_contacts",
      description: "List CRM contacts.",
      inputSchema: listContactsSchema,
      async handler({ limit }) {
        const { results } = await hubspotRequest<{ results: unknown[] }>(`/crm/v3/objects/contacts?limit=${limit}`);
        return jsonResult(results);
      },
    },
    {
      name: "create_contact",
      description: "Create a new CRM contact.",
      inputSchema: createContactSchema,
      async handler({ email, firstName, lastName }) {
        const { id } = await hubspotRequest<{ id: string }>(
          "/crm/v3/objects/contacts",
          { properties: { email, ...(firstName ? { firstname: firstName } : {}), ...(lastName ? { lastname: lastName } : {}) } },
          "POST",
        );
        return jsonResult({ contactId: id });
      },
    },
    {
      name: "search_deals",
      description: "Search deals by name.",
      inputSchema: searchDealsSchema,
      async handler({ query, limit }) {
        const { results } = await hubspotRequest<{ results: unknown[] }>(
          "/crm/v3/objects/deals/search",
          { query, limit, properties: ["dealname", "dealstage", "amount"] },
          "POST",
        );
        return jsonResult(results);
      },
    },
    {
      name: "update_deal_stage",
      description: "Move a deal to a different pipeline stage.",
      inputSchema: updateDealStageSchema,
      async handler({ dealId, dealStage }) {
        await hubspotRequest(`/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: dealStage } }, "PATCH");
        return textResult(`Deal ${dealId} moved to stage ${dealStage}`);
      },
    },
  ],
});
