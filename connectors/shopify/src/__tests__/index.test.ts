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
  process.env.SHOPIFY_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_products", () => {
  const tool = () => tools.get("list_products")!;

  it("lists products in a store", async () => {
    mockFetchResponses({ body: { products: [{ id: 1, title: "Widget" }] } });

    const result = await tool().handler({ shopDomain: "myshop.myshopify.com", limit: 20 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("https://myshop.myshopify.com/admin/api/");
    expect(String(url)).toContain("/products.json?limit=20");
    expect(init.headers["X-Shopify-Access-Token"]).toBe("test-token");
    expect(jsonOf(result)).toEqual([{ id: 1, title: "Widget" }]);
  });

  it("surfaces a Shopify API error as an error result", async () => {
    mockFetchResponses({ body: { errors: "Invalid API key or access token" }, ok: false });

    const result = await tool().handler({ shopDomain: "myshop.myshopify.com", limit: 20 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API key or access token");
  });
});

describe("get_order", () => {
  const tool = () => tools.get("get_order")!;

  it("gets details of a specific order", async () => {
    mockFetchResponses({ body: { order: { id: 100, financial_status: "paid" } } });

    const result = await tool().handler({ shopDomain: "myshop.myshopify.com", orderId: "100" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/orders/100.json");
    expect(jsonOf(result)).toEqual({ id: 100, financial_status: "paid" });
  });
});

describe("create_product", () => {
  const tool = () => tools.get("create_product")!;

  it("creates a product as a draft by default", async () => {
    mockFetchResponses({ body: { product: { id: 2 } } });

    const result = await tool().handler({ shopDomain: "myshop.myshopify.com", title: "New Widget", status: "draft" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ product: { title: "New Widget", status: "draft" } });
    expect(jsonOf(result)).toEqual({ productId: 2 });
  });
});

describe("fulfill_order", () => {
  const tool = () => tools.get("fulfill_order")!;

  it("marks an order as fulfilled, notifying the customer by default", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ shopDomain: "myshop.myshopify.com", orderId: "100", notifyCustomer: true, trackingNumber: "1Z999" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/orders/100/fulfillments.json");
    const body = JSON.parse(init.body);
    expect(body.fulfillment).toEqual({ notify_customer: true, tracking_number: "1Z999" });
    expect(textOf(result)).toContain("Order 100 fulfilled");
  });
});
