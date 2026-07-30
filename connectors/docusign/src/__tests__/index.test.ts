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

vi.mock("../docusign-auth.js", () => ({
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

describe("get_user_info", () => {
  const tool = () => tools.get("get_user_info")!;

  it("fetches the authenticated user's DocuSign accounts", async () => {
    mockFetchResponses({ body: { accounts: [{ account_id: "acc-1", base_uri: "https://demo.docusign.net" }] } });

    const result = await tool().handler({});

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/oauth/userinfo");
    expect(init.headers.Authorization).toBe("Bearer test-access-token");
    expect(jsonOf(result)).toEqual([{ account_id: "acc-1", base_uri: "https://demo.docusign.net" }]);
  });

  it("surfaces a DocuSign API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid token");
  });
});

describe("list_envelopes", () => {
  const tool = () => tools.get("list_envelopes")!;

  it("lists envelopes since a from date", async () => {
    mockFetchResponses({ body: { envelopes: [{ envelopeId: "e1", status: "sent" }] } });

    const result = await tool().handler({ baseUri: "https://demo.docusign.net", accountId: "acc-1", fromDate: "2026-01-01" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/restapi/v2.1/accounts/acc-1/envelopes");
    expect((url as URL).searchParams.get("from_date")).toBe("2026-01-01");
    expect(jsonOf(result)).toEqual([{ envelopeId: "e1", status: "sent" }]);
  });

  it("defaults to an empty list when the response omits envelopes", async () => {
    mockFetchResponses({ body: {} });

    const result = await tool().handler({ baseUri: "https://demo.docusign.net", accountId: "acc-1" });

    expect(jsonOf(result)).toEqual([]);
  });
});

describe("get_envelope_status", () => {
  const tool = () => tools.get("get_envelope_status")!;

  it("gets an envelope's status", async () => {
    mockFetchResponses({ body: { status: "completed" } });

    const result = await tool().handler({ baseUri: "https://demo.docusign.net", accountId: "acc-1", envelopeId: "e1" });

    const [url] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/envelopes/e1");
    expect(jsonOf(result)).toEqual({ status: "completed" });
  });
});

describe("send_envelope", () => {
  const tool = () => tools.get("send_envelope")!;

  it("sends a document for signature", async () => {
    mockFetchResponses({ body: { envelopeId: "e2" } });

    const result = await tool().handler({
      baseUri: "https://demo.docusign.net",
      accountId: "acc-1",
      emailSubject: "Please sign",
      documentBase64: Buffer.from("pdf-bytes").toString("base64"),
      documentName: "contract.pdf",
      fileExtension: "pdf",
      signerEmail: "signer@example.com",
      signerName: "Ada Lovelace",
    });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/envelopes");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.recipients.signers[0]).toMatchObject({ email: "signer@example.com", name: "Ada Lovelace" });
    expect(jsonOf(result)).toEqual({ envelopeId: "e2" });
  });

  it("surfaces a DocuSign API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Recipient email is invalid" }, ok: false });

    const result = await tool().handler({
      baseUri: "https://demo.docusign.net",
      accountId: "acc-1",
      emailSubject: "Please sign",
      documentBase64: "aGVsbG8=",
      documentName: "contract.pdf",
      fileExtension: "pdf",
      signerEmail: "not-an-email",
      signerName: "Ada Lovelace",
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Recipient email is invalid");
  });
});
