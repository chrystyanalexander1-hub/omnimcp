import { errorResult, jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { GraphApiError, graphRequest } from "./graph-client.js";

const listAdAccountsSchema = z.object({});

const listCampaignsSchema = z.object({ adAccountId: z.string() });

const getCampaignInsightsSchema = z.object({
  campaignId: z.string(),
  datePreset: z.string().optional(),
});

const createCampaignSchema = z.object({
  adAccountId: z.string(),
  name: z.string(),
  objective: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  specialAdCategories: z.array(z.string()).default([]),
});

const updateCampaignStatusSchema = z.object({
  campaignId: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

async function safe<T>(fn: () => Promise<T>) {
  try {
    return { ok: true as const, value: await fn() };
  } catch (err) {
    const message = err instanceof GraphApiError || err instanceof Error ? err.message : String(err);
    return { ok: false as const, message };
  }
}

await startConnector({
  name: "meta-ads",
  version: "0.1.0",
  tools: [
    {
      name: "list_ad_accounts",
      description: "List Meta Ads accounts accessible to the authenticated token.",
      inputSchema: listAdAccountsSchema,
      async handler() {
        const result = await safe(() =>
          graphRequest<{ data: unknown[] }>("me/adaccounts", { fields: "id,name,account_status,currency" }),
        );
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "list_campaigns",
      description: "List campaigns in a Meta Ads account.",
      inputSchema: listCampaignsSchema,
      async handler({ adAccountId }) {
        const result = await safe(() =>
          graphRequest<{ data: unknown[] }>(`${adAccountId}/campaigns`, {
            fields: "id,name,objective,status,effective_status",
          }),
        );
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "get_campaign_insights",
      description: "Get performance metrics (impressions, clicks, spend, ctr) for a campaign.",
      inputSchema: getCampaignInsightsSchema,
      async handler({ campaignId, datePreset }) {
        const result = await safe(() =>
          graphRequest<{ data: unknown[] }>(`${campaignId}/insights`, {
            fields: "impressions,clicks,spend,ctr,cpc",
            ...(datePreset ? { date_preset: datePreset } : {}),
          }),
        );
        return result.ok ? jsonResult(result.value.data) : errorResult(result.message);
      },
    },
    {
      name: "create_campaign",
      description: "Create a new advertising campaign.",
      inputSchema: createCampaignSchema,
      async handler({ adAccountId, name, objective, status, specialAdCategories }) {
        const result = await safe(() =>
          graphRequest<{ id: string }>(
            `${adAccountId}/campaigns`,
            {
              name,
              objective,
              status,
              special_ad_categories: JSON.stringify(specialAdCategories),
            },
            "POST",
          ),
        );
        return result.ok ? jsonResult({ campaignId: result.value.id }) : errorResult(result.message);
      },
    },
    {
      name: "update_campaign_status",
      description: "Pause or reactivate an existing campaign.",
      inputSchema: updateCampaignStatusSchema,
      async handler({ campaignId, status }) {
        const result = await safe(() => graphRequest(campaignId, { status }, "POST"));
        return result.ok ? textResult(`Campaign ${campaignId} status set to ${status}`) : errorResult(result.message);
      },
    },
  ],
});
