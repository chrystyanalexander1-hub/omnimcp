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
  process.env.META_ADS_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_ad_accounts", () => {
  const tool = () => tools.get("list_ad_accounts")!;

  it("lists ad accounts accessible to the token", async () => {
    mockFetchResponses({ body: { data: [{ id: "act_1", name: "Main Account" }] } });

    const result = await tool().handler({});

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("me/adaccounts");
    expect((url as URL).searchParams.get("access_token")).toBe("test-token");
    expect(jsonOf(result)).toEqual([{ id: "act_1", name: "Main Account" }]);
  });

  it("surfaces a Graph API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid OAuth access token" } }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid OAuth access token");
  });
});

describe("list_campaigns", () => {
  const tool = () => tools.get("list_campaigns")!;

  it("lists campaigns in an ad account", async () => {
    mockFetchResponses({ body: { data: [{ id: "c1", name: "Summer Sale" }] } });

    const result = await tool().handler({ adAccountId: "act_1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/act_1/campaigns");
    expect(jsonOf(result)).toEqual([{ id: "c1", name: "Summer Sale" }]);
  });
});

describe("get_campaign_insights", () => {
  const tool = () => tools.get("get_campaign_insights")!;

  it("gets performance metrics for a campaign", async () => {
    mockFetchResponses({ body: { data: [{ impressions: "1000", spend: "50" }] } });

    const result = await tool().handler({ campaignId: "c1", datePreset: "last_7d" });

    const [url] = (fetch as any).mock.calls[0];
    expect((url as URL).searchParams.get("date_preset")).toBe("last_7d");
    expect(jsonOf(result)).toEqual([{ impressions: "1000", spend: "50" }]);
  });
});

describe("create_campaign", () => {
  const tool = () => tools.get("create_campaign")!;

  it("creates a new advertising campaign", async () => {
    mockFetchResponses({ body: { id: "c2" } });

    const result = await tool().handler({
      adAccountId: "act_1",
      name: "Winter Sale",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      specialAdCategories: [],
    });

    const [, init] = (fetch as any).mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get("name")).toBe("Winter Sale");
    expect(body.get("special_ad_categories")).toBe("[]");
    expect(jsonOf(result)).toEqual({ campaignId: "c2" });
  });
});

describe("update_campaign_status", () => {
  const tool = () => tools.get("update_campaign_status")!;

  it("pauses or reactivates a campaign", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ campaignId: "c1", status: "ACTIVE" });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("status")).toBe("ACTIVE");
    expect(textOf(result)).toContain("status set to ACTIVE");
  });
});
