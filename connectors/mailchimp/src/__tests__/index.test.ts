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
  process.env.MAILCHIMP_API_KEY = "test-api-key-us6";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_audiences", () => {
  const tool = () => tools.get("list_audiences")!;

  it("lists audiences using the datacenter parsed from the API key", async () => {
    mockFetchResponses({ body: { lists: [{ id: "aud1", name: "Newsletter" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("https://us6.api.mailchimp.com/3.0/lists");
    expect(init.headers.Authorization).toContain("Basic ");
    expect(jsonOf(result)).toEqual([{ id: "aud1", name: "Newsletter" }]);
  });

  it("surfaces a Mailchimp API error as an error result", async () => {
    mockFetchResponses({ body: { detail: "Invalid API key" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API key");
  });
});

describe("list_campaigns", () => {
  const tool = () => tools.get("list_campaigns")!;

  it("lists email campaigns", async () => {
    mockFetchResponses({ body: { campaigns: [{ id: "c1" }] } });

    const result = await tool().handler({});

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/campaigns");
    expect(jsonOf(result)).toEqual([{ id: "c1" }]);
  });
});

describe("add_list_member", () => {
  const tool = () => tools.get("add_list_member")!;

  it("adds or updates a subscriber, keyed by the email's md5 hash", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ listId: "aud1", email: "a@b.com", status: "subscribed" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/lists/aud1/members/");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ email_address: "a@b.com", status_if_new: "subscribed", status: "subscribed" });
    expect(textOf(result)).toContain("added to list aud1 with status subscribed");
  });
});
