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
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_account_summaries", () => {
  const tool = () => tools.get("list_account_summaries")!;

  it("lists GA4 accounts and properties", async () => {
    mockFetchResponses({ body: { accountSummaries: [{ account: "accounts/1", displayName: "My Account" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/accountSummaries");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ account: "accounts/1", displayName: "My Account" }]);
  });

  it("defaults to an empty list when the response omits account summaries", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({});

    expect(jsonOf(result)).toEqual([]);
  });

  it("surfaces a Google Analytics API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Request had invalid authentication credentials" } }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Request had invalid authentication credentials");
  });
});

describe("run_report", () => {
  const tool = () => tools.get("run_report")!;

  it("runs a GA4 report over the given date range", async () => {
    mockFetchResponses({ body: { rows: [{ dimensionValues: [{ value: "2026-01-01" }] }] } });

    const result = await tool().handler({
      propertyId: "123456",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      dimensions: ["date"],
      metrics: ["activeUsers"],
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/properties/123456:runReport");
    const body = JSON.parse(init.body);
    expect(body.dateRanges).toEqual([{ startDate: "2026-01-01", endDate: "2026-01-31" }]);
    expect(body.dimensions).toEqual([{ name: "date" }]);
    expect(jsonOf(result)).toEqual({ rows: [{ dimensionValues: [{ value: "2026-01-01" }] }] });
  });
});
