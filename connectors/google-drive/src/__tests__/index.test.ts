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

describe("list_files", () => {
  const tool = () => tools.get("list_files")!;

  it("lists files in the authenticated user's drive", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ files: [{ id: "f1", name: "doc.txt" }] }) });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/files?pageSize=50");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ id: "f1", name: "doc.txt" }]);
  });

  it("returns an error result on a failed request", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("403");
  });
});

describe("upload_file", () => {
  const tool = () => tools.get("upload_file")!;

  it("uploads a file via multipart, returning its id and name", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "f2", name: "new.txt", webViewLink: "https://drive.google.com/f2" }),
    });

    const result = await tool().handler({
      name: "new.txt",
      mimeType: "text/plain",
      contentBase64: Buffer.from("hello").toString("base64"),
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/upload/drive/v3/files?uploadType=multipart");
    expect(init.method).toBe("POST");
    expect(init.body).toContain("new.txt");
    expect(jsonOf(result)).toEqual({ id: "f2", name: "new.txt", webViewLink: "https://drive.google.com/f2" });
  });
});

describe("download_file", () => {
  const tool = () => tools.get("download_file")!;

  it("downloads a file's content as base64", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new TextEncoder().encode("hello").buffer });

    const result = await tool().handler({ fileId: "f1" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/files/f1?alt=media");
    expect(jsonOf(result)).toEqual({ contentBase64: Buffer.from("hello").toString("base64"), byteLength: 5 });
  });
});
