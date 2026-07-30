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
  process.env.NOTION_ACCESS_TOKEN = "test-token";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("search", () => {
  const tool = () => tools.get("search")!;

  it("searches pages and databases", async () => {
    mockFetchResponses({ body: { results: [{ id: "page-1", object: "page" }] } });

    const result = await tool().handler({ query: "Roadmap" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/search");
    expect(init.headers["Notion-Version"]).toBeTruthy();
    expect(JSON.parse(init.body)).toEqual({ query: "Roadmap" });
    expect(jsonOf(result)).toEqual([{ id: "page-1", object: "page" }]);
  });

  it("surfaces a Notion API error as an error result", async () => {
    mockFetchResponses({ body: { message: "API token is invalid" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("API token is invalid");
  });
});

describe("get_page", () => {
  const tool = () => tools.get("get_page")!;

  it("gets a page's properties by id", async () => {
    mockFetchResponses({ body: { id: "page-1", properties: {} } });

    const result = await tool().handler({ pageId: "page-1" });

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/pages/page-1");
    expect(jsonOf(result)).toEqual({ id: "page-1", properties: {} });
  });
});

describe("create_page", () => {
  const tool = () => tools.get("create_page")!;

  it("creates a page under a parent page, using the 'title' property key", async () => {
    mockFetchResponses({ body: { id: "page-2", url: "https://notion.so/page-2" } });

    const result = await tool().handler({ parentId: "parent-1", parentType: "page_id", title: "New Page" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.parent).toEqual({ page_id: "parent-1" });
    expect(body.properties.title.title[0].text.content).toBe("New Page");
    expect(jsonOf(result)).toEqual({ pageId: "page-2", url: "https://notion.so/page-2" });
  });

  it("uses the 'Name' property key for database-parented pages", async () => {
    mockFetchResponses({ body: { id: "page-3", url: "https://notion.so/page-3" } });

    await tool().handler({ parentId: "db-1", parentType: "database_id", title: "New Row" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.parent).toEqual({ database_id: "db-1" });
    expect(body.properties.Name.title[0].text.content).toBe("New Row");
  });
});

describe("update_page", () => {
  const tool = () => tools.get("update_page")!;

  it("updates a page's title property", async () => {
    mockFetchResponses({ body: { id: "page-1" } });

    const result = await tool().handler({ pageId: "page-1", title: "Renamed" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/pages/page-1");
    expect(init.method).toBe("PATCH");
    expect(jsonOf(result)).toEqual({ id: "page-1" });
  });
});
