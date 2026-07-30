import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      for (const tool of definition.tools) {
        tools.set(tool.name, {
          ...tool,
          async handler(input: any) {
            try {
              return await tool.handler(input);
            } catch (err) {
              return actual.errorResult(err instanceof Error ? err.message : String(err));
            }
          },
        });
      }
    }),
  };
});

vi.mock("../google-auth.js", () => ({
  getAccessToken: vi.fn().mockResolvedValue("test-access-token"),
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

function mockFetchResponses(...responses: Array<{ body: unknown; ok?: boolean; status?: number }>) {
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  for (const { body, ok = true, status = ok ? 200 : 400 } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
  }
}

beforeAll(async () => {
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "test-dev-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_accessible_customers", () => {
  const tool = () => tools.get("list_accessible_customers")!;

  it("lists accessible customer ids", async () => {
    mockFetchResponses({ body: { resourceNames: ["customers/1", "customers/2"] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain(":listAccessibleCustomers");
    expect(init.headers["developer-token"]).toBe("test-dev-token");
    expect(jsonOf(result)).toEqual(["customers/1", "customers/2"]);
  });

  it("surfaces the nested Google Ads error message as an error result", async () => {
    mockFetchResponses({
      body: { error: { message: "generic error", details: [{ errors: [{ message: "Invalid developer token" }] }] } },
      ok: false,
    });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid developer token");
  });
});

describe("search_campaigns", () => {
  const tool = () => tools.get("search_campaigns")!;

  it("runs a GAQL query against a customer's campaigns", async () => {
    mockFetchResponses({ body: { results: [{ campaign: { id: "1", name: "Summer Sale" } }] } });

    const result = await tool().handler({ customerId: "123", query: "SELECT campaign.id FROM campaign" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/customers/123/googleAds:search");
    expect(JSON.parse(init.body)).toEqual({ query: "SELECT campaign.id FROM campaign" });
    expect(jsonOf(result)).toEqual([{ campaign: { id: "1", name: "Summer Sale" } }]);
  });
});

describe("create_campaign", () => {
  const tool = () => tools.get("create_campaign")!;

  it("creates a budget then a campaign using the resulting resource name", async () => {
    mockFetchResponses(
      { body: { results: [{ resourceName: "customers/123/campaignBudgets/1" }] } },
      { body: { results: [{ resourceName: "customers/123/campaigns/1" }] } },
    );

    const result = await tool().handler({
      customerId: "123",
      campaignName: "Summer Sale",
      dailyBudgetMicros: 1000000,
      advertisingChannelType: "SEARCH",
      status: "PAUSED",
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [budgetUrl] = (fetch as any).mock.calls[0];
    expect(String(budgetUrl)).toContain(":mutate");
    const [, campaignInit] = (fetch as any).mock.calls[1];
    expect(JSON.parse(campaignInit.body).operations[0].create.campaignBudget).toBe("customers/123/campaignBudgets/1");
    expect(jsonOf(result)).toEqual({
      budgetResourceName: "customers/123/campaignBudgets/1",
      campaignResourceName: "customers/123/campaigns/1",
    });
  });
});

describe("update_campaign_status", () => {
  const tool = () => tools.get("update_campaign_status")!;

  it("updates a campaign's status", async () => {
    mockFetchResponses({ body: { results: [{}] } });

    const result = await tool().handler({ customerId: "123", campaignId: "1", status: "PAUSED" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body).operations[0].update.status).toBe("PAUSED");
    expect(textOf(result)).toContain("status set to PAUSED");
  });
});
