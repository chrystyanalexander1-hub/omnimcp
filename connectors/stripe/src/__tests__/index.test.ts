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
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_customers", () => {
  const tool = () => tools.get("list_customers")!;

  it("lists customers with the given limit", async () => {
    mockFetchResponses({ body: { data: [{ id: "cus_1", email: "a@b.com" }] } });

    const result = await tool().handler({ limit: 10 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("/v1/customers?limit=10");
    expect(init.headers.Authorization).toBe("Bearer sk_test_123");
    expect(jsonOf(result)).toEqual([{ id: "cus_1", email: "a@b.com" }]);
  });

  it("surfaces a Stripe API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid API Key provided" } }, ok: false });

    const result = await tool().handler({ limit: 10 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API Key provided");
  });
});

describe("create_customer", () => {
  const tool = () => tools.get("create_customer")!;

  it("creates a customer and returns its id", async () => {
    mockFetchResponses({ body: { id: "cus_2" } });

    const result = await tool().handler({ email: "new@example.com", name: "Ada Lovelace" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toContain("/v1/customers");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("email")).toBe("new@example.com");
    expect(body.get("name")).toBe("Ada Lovelace");
    expect(jsonOf(result)).toEqual({ customerId: "cus_2" });
  });
});

describe("list_charges", () => {
  const tool = () => tools.get("list_charges")!;

  it("lists recent charges", async () => {
    mockFetchResponses({ body: { data: [{ id: "ch_1", amount: 1000 }] } });

    const result = await tool().handler({ limit: 10 });

    expect((fetch as any).mock.calls[0][0]).toContain("/v1/charges");
    expect(jsonOf(result)).toEqual([{ id: "ch_1", amount: 1000 }]);
  });
});

describe("create_refund", () => {
  const tool = () => tools.get("create_refund")!;

  it("refunds a charge in full", async () => {
    mockFetchResponses({ body: { id: "re_1", status: "succeeded" } });

    const result = await tool().handler({ chargeId: "ch_1" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get("charge")).toBe("ch_1");
    expect(body.has("amount")).toBe(false);
    expect(jsonOf(result)).toEqual({ refundId: "re_1", status: "succeeded" });
  });

  it("refunds a charge partially when an amount is given", async () => {
    mockFetchResponses({ body: { id: "re_2", status: "succeeded" } });

    await tool().handler({ chargeId: "ch_1", amount: 500 });

    const [, init] = (fetch as any).mock.calls[0];
    expect((init.body as URLSearchParams).get("amount")).toBe("500");
  });
});
