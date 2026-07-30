import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { GoogleAdsApiError, listAccessibleCustomers, mutate, searchGaql } from "./google-ads-client.js";

const listAccessibleCustomersSchema = z.object({});

const searchCampaignsSchema = z.object({
  customerId: z.string(),
  query: z.string().optional(),
});

const createCampaignSchema = z.object({
  customerId: z.string(),
  campaignName: z.string(),
  dailyBudgetMicros: z.number(),
  advertisingChannelType: z.string(),
  status: z.enum(["ENABLED", "PAUSED"]).default("PAUSED"),
});

const updateCampaignStatusSchema = z.object({
  customerId: z.string(),
  campaignId: z.string(),
  status: z.enum(["ENABLED", "PAUSED", "REMOVED"]),
});

const DEFAULT_CAMPAIGN_QUERY =
  "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type FROM campaign ORDER BY campaign.id";

await startConnector({
  name: "google-ads",
  version: "0.1.0",
  tools: [
    {
      name: "list_accessible_customers",
      description: "List Google Ads customer account IDs accessible to the authenticated token.",
      inputSchema: listAccessibleCustomersSchema,
      async handler() {
        return jsonResult(await listAccessibleCustomers());
      },
    },
    {
      name: "search_campaigns",
      description: "Run a GAQL query against a customer's campaigns.",
      inputSchema: searchCampaignsSchema,
      async handler({ customerId, query }) {
        return jsonResult(await searchGaql(customerId, query ?? DEFAULT_CAMPAIGN_QUERY));
      },
    },
    {
      name: "create_campaign",
      description: "Create a new campaign budget and campaign.",
      inputSchema: createCampaignSchema,
      async handler({ customerId, campaignName, dailyBudgetMicros, advertisingChannelType, status }) {
        const budgetResult = (await mutate(customerId, "campaignBudgets", [
          { create: { name: `${campaignName} budget`, amountMicros: dailyBudgetMicros, deliveryMethod: "STANDARD" } },
        ])) as { results: Array<{ resourceName: string }> };
        const budgetResourceName = budgetResult.results[0]?.resourceName;
        if (!budgetResourceName) throw new GoogleAdsApiError("Budget creation did not return a resource name");

        const campaignResult = (await mutate(customerId, "campaigns", [
          {
            create: {
              name: campaignName,
              advertisingChannelType,
              status,
              campaignBudget: budgetResourceName,
              manualCpc: {},
            },
          },
        ])) as { results: Array<{ resourceName: string }> };
        return jsonResult({ budgetResourceName, campaignResourceName: campaignResult.results[0]?.resourceName });
      },
    },
    {
      name: "update_campaign_status",
      description: "Pause, enable, or remove an existing campaign.",
      inputSchema: updateCampaignStatusSchema,
      async handler({ customerId, campaignId, status }) {
        await mutate(customerId, "campaigns", [
          { update: { resourceName: `customers/${customerId}/campaigns/${campaignId}`, status }, updateMask: "status" },
        ]);
        return textResult(`Campaign ${campaignId} status set to ${status}`);
      },
    },
  ],
});
