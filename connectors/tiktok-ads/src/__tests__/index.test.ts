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
  process.env.TIKTOK_ADS_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_campaigns", () => {
  const tool = () => tools.get("list_campaigns")!;

  it("lists campaigns for an advertiser account", async () => {
    mockFetchResponses({ body: { code: 0, message: "OK", data: { list: [{ campaign_id: "1" }] } } });

    const result = await tool().handler({ advertiserId: "adv1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/campaign/get/");
    expect(init.headers["Access-Token"]).toBe("test-token");
    expect(jsonOf(result)).toEqual([{ campaign_id: "1" }]);
  });

  it("surfaces a TikTok API error as an error result", async () => {
    mockFetchResponses({ body: { code: 40001, message: "Access token is invalid", data: {} } });

    const result = await tool().handler({ advertiserId: "adv1" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Access token is invalid");
  });
});

describe("get_campaign_report", () => {
  const tool = () => tools.get("get_campaign_report")!;

  it("gets a performance report for the given campaigns and date range", async () => {
    mockFetchResponses({ body: { code: 0, message: "OK", data: { list: [{ impressions: "1000" }] } } });

    const result = await tool().handler({
      advertiserId: "adv1",
      campaignIds: ["c1", "c2"],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/report/integrated/get/");
    expect(jsonOf(result)).toEqual([{ impressions: "1000" }]);
  });
});

describe("create_campaign", () => {
  const tool = () => tools.get("create_campaign")!;

  it("creates a new TikTok advertising campaign", async () => {
    mockFetchResponses({ body: { code: 0, message: "OK", data: { campaign_id: "c3" } } });

    const result = await tool().handler({
      advertiserId: "adv1",
      campaignName: "Summer Sale",
      objectiveType: "TRAFFIC",
      budgetMode: "BUDGET_MODE_DAY",
      budget: 100,
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/campaign/create/");
    expect(JSON.parse(init.body)).toMatchObject({ campaign_name: "Summer Sale", budget: 100 });
    expect(jsonOf(result)).toEqual({ campaignId: "c3" });
  });
});

describe("update_campaign_status", () => {
  const tool = () => tools.get("update_campaign_status")!;

  it("updates one or more campaigns' status", async () => {
    mockFetchResponses({ body: { code: 0, message: "OK", data: {} } });

    const result = await tool().handler({ advertiserId: "adv1", campaignIds: ["c1", "c2"], operationStatus: "DISABLE" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ campaign_ids: ["c1", "c2"], operation_status: "DISABLE" });
    expect(textOf(result)).toContain("c1, c2 set to DISABLE");
  });
});
