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
  process.env.WOOCOMMERCE_CREDENTIALS = "ck_test:cs_test";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_products", () => {
  const tool = () => tools.get("list_products")!;

  it("lists products in a store, optionally filtered by search", async () => {
    mockFetchResponses({ body: [{ id: 1, name: "Widget" }] });

    const result = await tool().handler({ storeUrl: "https://myshop.com", search: "widget", perPage: 20 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("https://myshop.com/wp-json/wc/v3/products");
    expect((url as URL).searchParams.get("search")).toBe("widget");
    expect(init.headers.Authorization).toContain("Basic ");
    expect(jsonOf(result)).toEqual([{ id: 1, name: "Widget" }]);
  });

  it("surfaces a WooCommerce API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid signature" }, ok: false });

    const result = await tool().handler({ storeUrl: "https://myshop.com", perPage: 20 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid signature");
  });
});

describe("list_orders", () => {
  const tool = () => tools.get("list_orders")!;

  it("lists orders, optionally filtered by status", async () => {
    mockFetchResponses({ body: [{ id: 100, status: "processing" }] });

    const result = await tool().handler({ storeUrl: "https://myshop.com", status: "processing", perPage: 20 });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/orders");
    expect((url as URL).searchParams.get("status")).toBe("processing");
    expect(jsonOf(result)).toEqual([{ id: 100, status: "processing" }]);
  });
});

describe("update_order_status", () => {
  const tool = () => tools.get("update_order_status")!;

  it("changes an order's status", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ storeUrl: "https://myshop.com", orderId: 100, status: "completed" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/orders/100");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ status: "completed" });
    expect(textOf(result)).toContain("Order 100 status set to completed");
  });
});
