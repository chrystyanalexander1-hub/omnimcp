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

describe("get_values", () => {
  const tool = () => tools.get("get_values")!;

  it("reads a range of cell values", async () => {
    mockFetchResponses({ body: { values: [["Name", "Age"], ["Ada", "30"]] } });

    const result = await tool().handler({ spreadsheetId: "sheet1", range: "A1:B2" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/sheet1/values/A1%3AB2");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([["Name", "Age"], ["Ada", "30"]]);
  });

  it("defaults to an empty range when the response omits values", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ spreadsheetId: "sheet1", range: "A1:B2" });

    expect(jsonOf(result)).toEqual([]);
  });

  it("surfaces a Google Sheets API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Unable to parse range" } }, ok: false });

    const result = await tool().handler({ spreadsheetId: "sheet1", range: "!!!" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Unable to parse range");
  });
});

describe("append_values", () => {
  const tool = () => tools.get("append_values")!;

  it("appends rows after the last row with data", async () => {
    mockFetchResponses({ body: { updates: { updatedRange: "Sheet1!A3:B3" } } });

    const result = await tool().handler({ spreadsheetId: "sheet1", range: "A1:B1", values: [["Grace", "37"]] });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain(":append");
    expect((url as URL).searchParams.get("valueInputOption")).toBe("USER_ENTERED");
    expect(JSON.parse(init.body)).toEqual({ values: [["Grace", "37"]] });
    expect(textOf(result)).toContain("Appended to Sheet1!A3:B3");
  });
});

describe("update_values", () => {
  const tool = () => tools.get("update_values")!;

  it("overwrites the cells in a range", async () => {
    mockFetchResponses({ body: { updatedRange: "Sheet1!A1:B1" } });

    const result = await tool().handler({ spreadsheetId: "sheet1", range: "A1:B1", values: [["Ada", "30"]] });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(textOf(result)).toContain("Updated Sheet1!A1:B1");
  });
});
