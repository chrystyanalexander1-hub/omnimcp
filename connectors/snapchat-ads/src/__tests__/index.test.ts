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

vi.mock("../snapchat-auth.js", () => ({
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

describe("list_organizations", () => {
  const tool = () => tools.get("list_organizations")!;

  it("lists organizations accessible to the account", async () => {
    mockFetchResponses({ body: { request_status: "SUCCESS", organizations: [{ id: "org1" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("me/organizations");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ id: "org1" }]);
  });

  it("surfaces a Snapchat Ads API error as an error result", async () => {
    mockFetchResponses({ body: { request_status: "ERROR", debug_message: "Invalid token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid token");
  });
});

describe("list_ad_accounts", () => {
  const tool = () => tools.get("list_ad_accounts")!;

  it("lists ad accounts within an organization", async () => {
    mockFetchResponses({ body: { request_status: "SUCCESS", adaccounts: [{ id: "acc1" }] } });

    const result = await tool().handler({ organizationId: "org1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/organizations/org1/adaccounts");
    expect(jsonOf(result)).toEqual([{ id: "acc1" }]);
  });
});

describe("list_campaigns", () => {
  const tool = () => tools.get("list_campaigns")!;

  it("lists campaigns in an ad account", async () => {
    mockFetchResponses({ body: { request_status: "SUCCESS", campaigns: [{ id: "c1" }] } });

    const result = await tool().handler({ adAccountId: "acc1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/adaccounts/acc1/campaigns");
    expect(jsonOf(result)).toEqual([{ id: "c1" }]);
  });
});

describe("create_campaign", () => {
  const tool = () => tools.get("create_campaign")!;

  it("creates a new advertising campaign", async () => {
    mockFetchResponses({ body: { request_status: "SUCCESS", campaigns: [{ campaign: { id: "c2" } }] } });

    const result = await tool().handler({ adAccountId: "acc1", name: "Winter Sale", status: "PAUSED" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.campaigns[0]).toMatchObject({ name: "Winter Sale", ad_account_id: "acc1", status: "PAUSED" });
    expect(jsonOf(result)).toEqual({ campaignId: "c2" });
  });
});

describe("update_campaign_status", () => {
  const tool = () => tools.get("update_campaign_status")!;

  it("pauses or reactivates a campaign", async () => {
    mockFetchResponses({ body: { request_status: "SUCCESS" } });

    const result = await tool().handler({ adAccountId: "acc1", campaignId: "c1", status: "ACTIVE" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).campaigns).toEqual([{ id: "c1", status: "ACTIVE" }]);
    expect(textOf(result)).toContain("status set to ACTIVE");
  });
});
