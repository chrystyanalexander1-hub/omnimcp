import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@omnimcp/connector-sdk-ts";

const tools = new Map<string, ToolDefinition<any>>();

vi.mock("@omnimcp/connector-sdk-ts", async () => {
  const actual = await vi.importActual<typeof import("@omnimcp/connector-sdk-ts")>("@omnimcp/connector-sdk-ts");
  return {
    ...actual,
    startConnector: vi.fn(async (definition: { tools: ReadonlyArray<ToolDefinition<any>> }) => {
      // Wraps each handler the same way the real startConnector does, so a thrown
      // error surfaces as an errorResult here too instead of failing the test.
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
  process.env.AIRTABLE_API_KEY = "test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_records", () => {
  const tool = () => tools.get("list_records")!;

  it("lists records with maxRecords and an optional filter formula", async () => {
    mockFetchResponses({ body: { records: [{ id: "rec1", fields: { Name: "Ada" } }] } });

    const result = await tool().handler({
      baseId: "app123",
      tableName: "People",
      maxRecords: 5,
      filterByFormula: "{Name}='Ada'",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/v0/app123/People");
    expect((url as URL).searchParams.get("maxRecords")).toBe("5");
    expect((url as URL).searchParams.get("filterByFormula")).toBe("{Name}='Ada'");
    expect(init.headers.Authorization).toBe("Bearer test-api-key");
    expect(jsonOf(result)).toEqual([{ id: "rec1", fields: { Name: "Ada" } }]);
  });

  it("surfaces an Airtable API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Invalid API key" } }, ok: false });

    const result = await tool().handler({ baseId: "app123", tableName: "People", maxRecords: 5 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API key");
  });
});

describe("create_record", () => {
  const tool = () => tools.get("create_record")!;

  it("creates a record and returns its id", async () => {
    mockFetchResponses({ body: { id: "recNew" } });

    const result = await tool().handler({ baseId: "app123", tableName: "People", fields: { Name: "Ada" } });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ fields: { Name: "Ada" } });
    expect(jsonOf(result)).toEqual({ recordId: "recNew" });
  });
});

describe("update_record", () => {
  const tool = () => tools.get("update_record")!;

  it("updates a record's fields", async () => {
    mockFetchResponses({ body: { id: "rec1" } });

    const result = await tool().handler({ baseId: "app123", tableName: "People", recordId: "rec1", fields: { Name: "Grace" } });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/v0/app123/People/rec1");
    expect(init.method).toBe("PATCH");
    expect(jsonOf(result)).toEqual({ recordId: "rec1" });
  });
});

describe("delete_record", () => {
  const tool = () => tools.get("delete_record")!;

  it("deletes a record", async () => {
    mockFetchResponses({ body: { id: "rec1", deleted: true } });

    const result = await tool().handler({ baseId: "app123", tableName: "People", recordId: "rec1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/v0/app123/People/rec1");
    expect(init.method).toBe("DELETE");
    expect(textOf(result)).toContain("rec1 deleted");
  });

  it("surfaces an Airtable API error as an error result", async () => {
    mockFetchResponses({ body: { error: "NOT_FOUND" }, ok: false });

    const result = await tool().handler({ baseId: "app123", tableName: "People", recordId: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("NOT_FOUND");
  });
});
