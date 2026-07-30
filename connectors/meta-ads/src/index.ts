import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { graphRequest } from "./graph-client.js";

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

await startConnector({
  name: "meta-ads",
  version: "0.1.0",
  tools: [
    {
      name: "list_ad_accounts",
      description: "List Meta Ads accounts accessible to the authenticated token.",
      inputSchema: listAdAccountsSchema,
      async handler() {
        const { data } = await graphRequest<{ data: unknown[] }>("me/adaccounts", { fields: "id,name,account_status,currency" });
        return jsonResult(data);
      },
    },
    {
      name: "list_campaigns",
      description: "List campaigns in a Meta Ads account.",
      inputSchema: listCampaignsSchema,
      async handler({ adAccountId }) {
        const { data } = await graphRequest<{ data: unknown[] }>(`${adAccountId}/campaigns`, {
          fields: "id,name,objective,status,effective_status",
        });
        return jsonResult(data);
      },
    },
    {
      name: "get_campaign_insights",
      description: "Get performance metrics (impressions, clicks, spend, ctr) for a campaign.",
      inputSchema: getCampaignInsightsSchema,
      async handler({ campaignId, datePreset }) {
        const { data } = await graphRequest<{ data: unknown[] }>(`${campaignId}/insights`, {
          fields: "impressions,clicks,spend,ctr,cpc",
          ...(datePreset ? { date_preset: datePreset } : {}),
        });
        return jsonResult(data);
      },
    },
    {
      name: "create_campaign",
      description: "Create a new advertising campaign.",
      inputSchema: createCampaignSchema,
      async handler({ adAccountId, name, objective, status, specialAdCategories }) {
        const { id } = await graphRequest<{ id: string }>(
          `${adAccountId}/campaigns`,
          {
            name,
            objective,
            status,
            special_ad_categories: JSON.stringify(specialAdCategories),
          },
          "POST",
        );
        return jsonResult({ campaignId: id });
      },
    },
    {
      name: "update_campaign_status",
      description: "Pause or reactivate an existing campaign.",
      inputSchema: updateCampaignStatusSchema,
      async handler({ campaignId, status }) {
        await graphRequest(campaignId, { status }, "POST");
        return textResult(`Campaign ${campaignId} status set to ${status}`);
      },
    },
  ],
});
