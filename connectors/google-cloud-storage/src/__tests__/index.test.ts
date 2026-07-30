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

beforeAll(async () => {
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_objects", () => {
  const tool = () => tools.get("list_objects")!;

  it("lists objects in a bucket, optionally filtered by prefix", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ name: "a.txt" }] }) });

    const result = await tool().handler({ bucket: "mybucket", prefix: "folder/" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/b/mybucket/o");
    expect((url as URL).searchParams.get("prefix")).toBe("folder/");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ name: "a.txt" }]);
  });

  it("surfaces a Google Cloud Storage API error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: { message: "Not Found" } }) });

    const result = await tool().handler({ bucket: "missing" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Not Found");
  });
});

describe("upload_object", () => {
  const tool = () => tools.get("upload_object")!;

  it("uploads an object's bytes with the given content type", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ name: "a.txt", size: "5" }) });

    const result = await tool().handler({
      bucket: "mybucket",
      name: "a.txt",
      contentBase64: Buffer.from("hello").toString("base64"),
      contentType: "text/plain",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/upload/storage/v1/b/mybucket/o");
    expect((url as URL).searchParams.get("name")).toBe("a.txt");
    expect(init.headers["Content-Type"]).toBe("text/plain");
    expect(Buffer.compare(init.body, Buffer.from("hello"))).toBe(0);
    expect(jsonOf(result)).toEqual({ name: "a.txt", size: "5" });
  });
});

describe("download_object", () => {
  const tool = () => tools.get("download_object")!;

  it("downloads an object's content as base64", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode("hello").buffer });

    const result = await tool().handler({ bucket: "mybucket", name: "a.txt" });

    expect(jsonOf(result)).toEqual({ contentBase64: Buffer.from("hello").toString("base64"), byteLength: 5 });
  });
});

describe("delete_object", () => {
  const tool = () => tools.get("delete_object")!;

  it("deletes an object", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204 });

    const result = await tool().handler({ bucket: "mybucket", name: "a.txt" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(textOf(result)).toContain("Deleted a.txt from mybucket");
  });
});
