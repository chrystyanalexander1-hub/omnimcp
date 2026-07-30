import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { tiktokRequest } from "./tiktok-client.js";

const listCampaignsSchema = z.object({ advertiserId: z.string() });

const getCampaignReportSchema = z.object({
  advertiserId: z.string(),
  campaignIds: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
});

const createCampaignSchema = z.object({
  advertiserId: z.string(),
  campaignName: z.string(),
  objectiveType: z.string(),
  budgetMode: z.enum(["BUDGET_MODE_DAY", "BUDGET_MODE_TOTAL"]),
  budget: z.number(),
});

const updateCampaignStatusSchema = z.object({
  advertiserId: z.string(),
  campaignIds: z.array(z.string()),
  operationStatus: z.enum(["ENABLE", "DISABLE", "DELETE"]),
});

await startConnector({
  name: "tiktok-ads",
  version: "0.1.0",
  tools: [
    {
      name: "list_campaigns",
      description: "List campaigns for a TikTok advertiser account.",
      inputSchema: listCampaignsSchema,
      async handler({ advertiserId }) {
        const { list } = await tiktokRequest<{ list: unknown[] }>("/campaign/get/", { advertiser_id: advertiserId, page_size: 50 });
        return jsonResult(list);
      },
    },
    {
      name: "get_campaign_report",
      description: "Get performance metrics for one or more campaigns over a date range.",
      inputSchema: getCampaignReportSchema,
      async handler({ advertiserId, campaignIds, startDate, endDate }) {
        const { list } = await tiktokRequest<{ list: unknown[] }>("/report/integrated/get/", {
          advertiser_id: advertiserId,
          report_type: "BASIC",
          dimensions: ["campaign_id"],
          metrics: ["impressions", "clicks", "spend", "ctr"],
          data_level: "AUCTION_CAMPAIGN",
          filtering: [{ field_name: "campaign_ids", filter_type: "IN", filter_value: JSON.stringify(campaignIds) }],
          start_date: startDate,
          end_date: endDate,
        });
        return jsonResult(list);
      },
    },
    {
      name: "create_campaign",
      description: "Create a new TikTok advertising campaign.",
      inputSchema: createCampaignSchema,
      async handler({ advertiserId, campaignName, objectiveType, budgetMode, budget }) {
        const { campaign_id } = await tiktokRequest<{ campaign_id: string }>(
          "/campaign/create/",
          {
            advertiser_id: advertiserId,
            campaign_name: campaignName,
            objective_type: objectiveType,
            budget_mode: budgetMode,
            budget,
          },
          "POST",
        );
        return jsonResult({ campaignId: campaign_id });
      },
    },
    {
      name: "update_campaign_status",
      description: "Pause, enable, or delete one or more campaigns.",
      inputSchema: updateCampaignStatusSchema,
      async handler({ advertiserId, campaignIds, operationStatus }) {
        await tiktokRequest(
          "/campaign/status/update/",
          { advertiser_id: advertiserId, campaign_ids: campaignIds, operation_status: operationStatus },
          "POST",
        );
        return textResult(`Campaigns ${campaignIds.join(", ")} set to ${operationStatus}`);
      },
    },
  ],
});
