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

describe("list_documents", () => {
  const tool = () => tools.get("list_documents")!;

  it("lists documents, converting Firestore's typed fields to plain values", async () => {
    mockFetchResponses({
      body: {
        documents: [
          { name: "projects/p/databases/(default)/documents/users/1", fields: { name: { stringValue: "Ada" } } },
        ],
      },
    });

    const result = await tool().handler({ projectId: "p", collectionPath: "users" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/projects/p/databases/(default)/documents/users");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([
      { name: "projects/p/databases/(default)/documents/users/1", fields: { name: "Ada" } },
    ]);
  });

  it("surfaces a Firestore API error as an error result", async () => {
    mockFetchResponses({ body: { error: { message: "Permission denied" } }, ok: false });

    const result = await tool().handler({ projectId: "p", collectionPath: "users" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Permission denied");
  });
});

describe("get_document", () => {
  const tool = () => tools.get("get_document")!;

  it("gets a single document, converted to a plain object", async () => {
    mockFetchResponses({
      body: { name: "projects/p/databases/(default)/documents/users/1", fields: { age: { integerValue: "30" } } },
    });

    const result = await tool().handler({ projectId: "p", documentPath: "users/1" });

    expect(jsonOf(result)).toEqual({ name: "projects/p/databases/(default)/documents/users/1", fields: { age: 30 } });
  });
});

describe("create_document", () => {
  const tool = () => tools.get("create_document")!;

  it("creates a document, encoding fields into Firestore's typed format", async () => {
    mockFetchResponses({
      body: { name: "projects/p/databases/(default)/documents/users/2", fields: { name: { stringValue: "Grace" } } },
    });

    const result = await tool().handler({ projectId: "p", collectionPath: "users", fields: { name: "Grace" } });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ fields: { name: { stringValue: "Grace" } } });
    expect(jsonOf(result)).toEqual({ name: "projects/p/databases/(default)/documents/users/2", fields: { name: "Grace" } });
  });
});

describe("delete_document", () => {
  const tool = () => tools.get("delete_document")!;

  it("deletes a document", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await tool().handler({ projectId: "p", documentPath: "users/1" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/users/1");
    expect(init.method).toBe("DELETE");
    expect(textOf(result)).toContain("Deleted users/1");
  });

  it("surfaces an error when the delete fails", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

    const result = await tool().handler({ projectId: "p", documentPath: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 404");
  });
});
