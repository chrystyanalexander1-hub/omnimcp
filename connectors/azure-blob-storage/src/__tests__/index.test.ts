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

beforeAll(async () => {
  process.env.AZURE_STORAGE_CONNECTION_STRING =
    "AccountName=testaccount;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_blobs", () => {
  const tool = () => tools.get("list_blobs")!;

  it("lists blob names parsed out of the XML response", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<EnumerationResults><Blobs>" +
        "<Blob><Name>a.txt</Name></Blob>" +
        "<Blob><Name>b.txt</Name></Blob>" +
        "</Blobs></EnumerationResults>",
    });

    const result = await tool().handler({ container: "mycontainer" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("testaccount.blob.core.windows.net/mycontainer");
    expect(jsonOf(result)).toEqual(["a.txt", "b.txt"]);
  });

  it("surfaces an Azure error as an error result", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 403, text: async () => "AuthenticationFailed" });

    const result = await tool().handler({ container: "mycontainer" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("HTTP 403");
  });
});

describe("upload_blob", () => {
  const tool = () => tools.get("upload_blob")!;

  it("uploads a blob's bytes with the given content type", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, text: async () => "" });

    const result = await tool().handler({
      container: "mycontainer",
      blobName: "a.txt",
      contentBase64: Buffer.from("hello").toString("base64"),
      contentType: "text/plain",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/mycontainer/a.txt");
    expect(init.method).toBe("PUT");
    expect(init.headers["Content-Type"]).toBe("text/plain");
    expect(Buffer.from(init.body).toString()).toBe("hello");
    expect(textOf(result)).toContain("Uploaded a.txt to mycontainer");
  });
});

describe("download_blob", () => {
  const tool = () => tools.get("download_blob")!;

  it("downloads a blob's content as base64", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("hello").buffer,
    });

    const result = await tool().handler({ container: "mycontainer", blobName: "a.txt" });

    expect(jsonOf(result)).toEqual({ contentBase64: Buffer.from("hello").toString("base64"), byteLength: 5 });
  });
});

describe("delete_blob", () => {
  const tool = () => tools.get("delete_blob")!;

  it("deletes a blob", async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, text: async () => "" });

    const result = await tool().handler({ container: "mycontainer", blobName: "a.txt" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.method).toBe("DELETE");
    expect(textOf(result)).toContain("Deleted a.txt from mycontainer");
  });
});
