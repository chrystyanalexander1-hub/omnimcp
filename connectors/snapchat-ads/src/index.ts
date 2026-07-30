import { jsonResult, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";
import { getAccessToken } from "./snapchat-auth.js";

const ADS_API = "https://adsapi.snapchat.com/v1";

export class SnapchatApiError extends Error {}

const listOrganizationsSchema = z.object({});
const listAdAccountsSchema = z.object({ organizationId: z.string() });
const listCampaignsSchema = z.object({ adAccountId: z.string() });
const createCampaignSchema = z.object({
  adAccountId: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]).default("PAUSED"),
  startTime: z.string().optional(),
});
const updateCampaignStatusSchema = z.object({
  adAccountId: z.string(),
  campaignId: z.string(),
  status: z.enum(["ACTIVE", "PAUSED"]),
});

async function snapRequest<T>(path: string, body?: Record<string, unknown>, method: "GET" | "POST" | "PUT" = "GET"): Promise<T> {
  const token = await getAccessToken();
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${ADS_API}/${path}`, init);
  const json = (await res.json()) as { request_status?: string; debug_message?: string } & T;
  if (!res.ok || json.request_status === "ERROR") {
    throw new SnapchatApiError(json.debug_message ?? `Snapchat Ads API error: HTTP ${res.status}`);
  }
  return json;
}

await startConnector({
  name: "snapchat-ads",
  version: "0.1.0",
  tools: [
    {
      name: "list_organizations",
      description: "List Snapchat Ads organizations accessible to the authenticated account.",
      inputSchema: listOrganizationsSchema,
      async handler() {
        const { organizations } = await snapRequest<{ organizations: unknown[] }>("me/organizations");
        return jsonResult(organizations);
      },
    },
    {
      name: "list_ad_accounts",
      description: "List ad accounts within an organization.",
      inputSchema: listAdAccountsSchema,
      async handler({ organizationId }) {
        const { adaccounts } = await snapRequest<{ adaccounts: unknown[] }>(`organizations/${organizationId}/adaccounts`);
        return jsonResult(adaccounts);
      },
    },
    {
      name: "list_campaigns",
      description: "List campaigns in an ad account.",
      inputSchema: listCampaignsSchema,
      async handler({ adAccountId }) {
        const { campaigns } = await snapRequest<{ campaigns: unknown[] }>(`adaccounts/${adAccountId}/campaigns`);
        return jsonResult(campaigns);
      },
    },
    {
      name: "create_campaign",
      description: "Create a new advertising campaign.",
      inputSchema: createCampaignSchema,
      async handler({ adAccountId, name, status, startTime }) {
        const { campaigns } = await snapRequest<{ campaigns: Array<{ campaign: { id: string } }> }>(
          `adaccounts/${adAccountId}/campaigns`,
          { campaigns: [{ name, ad_account_id: adAccountId, status, start_time: startTime ?? new Date().toISOString() }] },
          "POST",
        );
        return jsonResult({ campaignId: campaigns[0]?.campaign.id });
      },
    },
    {
      name: "update_campaign_status",
      description: "Pause or reactivate an existing campaign.",
      inputSchema: updateCampaignStatusSchema,
      async handler({ adAccountId, campaignId, status }) {
        await snapRequest(`adaccounts/${adAccountId}/campaigns`, { campaigns: [{ id: campaignId, status }] }, "PUT");
        return textResult(`Campaign ${campaignId} status set to ${status}`);
      },
    },
  ],
});
