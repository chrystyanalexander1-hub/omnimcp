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

vi.mock("../mercadolibre-auth.js", () => ({
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

describe("get_my_user", () => {
  const tool = () => tools.get("get_my_user")!;

  it("gets the authenticated seller's own info", async () => {
    mockFetchResponses({ body: { id: 123, nickname: "MYSTORE", site_id: "MLA" } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/users/me");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual({ id: 123, nickname: "MYSTORE", site_id: "MLA" });
  });

  it("surfaces a Mercado Libre API error as an error result", async () => {
    mockFetchResponses({ body: { message: "invalid_token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("invalid_token");
  });
});

describe("list_orders", () => {
  const tool = () => tools.get("list_orders")!;

  it("lists orders for a seller", async () => {
    mockFetchResponses({ body: { results: [{ id: 1, status: "paid" }] } });

    const result = await tool().handler({ sellerId: "123" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/orders/search");
    expect((url as URL).searchParams.get("seller")).toBe("123");
    expect(jsonOf(result)).toEqual([{ id: 1, status: "paid" }]);
  });
});

describe("update_item_stock", () => {
  const tool = () => tools.get("update_item_stock")!;

  it("updates a listing's available stock", async () => {
    mockFetchResponses({ body: { id: "MLA1", available_quantity: 5 } });

    const result = await tool().handler({ itemId: "MLA1", quantity: 5 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/items/MLA1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ available_quantity: 5 });
    expect(jsonOf(result)).toEqual({ itemId: "MLA1", availableQuantity: 5 });
  });
});
