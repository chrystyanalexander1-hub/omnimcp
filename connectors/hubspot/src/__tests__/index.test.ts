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
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_contacts", () => {
  const tool = () => tools.get("list_contacts")!;

  it("lists CRM contacts with the given limit", async () => {
    mockFetchResponses({ body: { results: [{ id: "1", properties: { email: "a@b.com" } }] } });

    const result = await tool().handler({ limit: 20 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/crm/v3/objects/contacts?limit=20");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(jsonOf(result)).toEqual([{ id: "1", properties: { email: "a@b.com" } }]);
  });

  it("surfaces a HubSpot API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid access token" }, ok: false });

    const result = await tool().handler({ limit: 20 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid access token");
  });
});

describe("create_contact", () => {
  const tool = () => tools.get("create_contact")!;

  it("creates a contact and returns its id", async () => {
    mockFetchResponses({ body: { id: "42" } });

    const result = await tool().handler({ email: "new@example.com", firstName: "Ada", lastName: "Lovelace" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      properties: { email: "new@example.com", firstname: "Ada", lastname: "Lovelace" },
    });
    expect(jsonOf(result)).toEqual({ contactId: "42" });
  });
});

describe("search_deals", () => {
  const tool = () => tools.get("search_deals")!;

  it("searches deals by name", async () => {
    mockFetchResponses({ body: { results: [{ id: "d1", properties: { dealname: "Big Deal" } }] } });

    const result = await tool().handler({ query: "Big Deal", limit: 20 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/crm/v3/objects/deals/search");
    expect(JSON.parse(init.body)).toMatchObject({ query: "Big Deal", limit: 20 });
    expect(jsonOf(result)).toEqual([{ id: "d1", properties: { dealname: "Big Deal" } }]);
  });
});

describe("update_deal_stage", () => {
  const tool = () => tools.get("update_deal_stage")!;

  it("moves a deal to a different pipeline stage", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ dealId: "d1", dealStage: "closedwon" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/crm/v3/objects/deals/d1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ properties: { dealstage: "closedwon" } });
    expect(textOf(result)).toContain("moved to stage closedwon");
  });

  it("surfaces a HubSpot API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Deal not found" }, ok: false });

    const result = await tool().handler({ dealId: "missing", dealStage: "closedwon" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Deal not found");
  });
});
