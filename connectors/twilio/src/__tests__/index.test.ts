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
  process.env.TWILIO_CREDENTIALS = "ACtest|authtoken123";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_messages", () => {
  const tool = () => tools.get("list_messages")!;

  it("lists recent messages on the account", async () => {
    mockFetchResponses({ body: { messages: [{ sid: "SM1", body: "Hi" }] } });

    const result = await tool().handler({ limit: 20 });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/2010-04-01/Accounts/ACtest/Messages.json");
    expect((url as URL).searchParams.get("PageSize")).toBe("20");
    expect(init.headers.Authorization).toContain("Basic ");
    expect(jsonOf(result)).toEqual([{ sid: "SM1", body: "Hi" }]);
  });

  it("surfaces a Twilio API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Authenticate" }, ok: false });

    const result = await tool().handler({ limit: 20 });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Authenticate");
  });
});

describe("send_sms", () => {
  const tool = () => tools.get("send_sms")!;

  it("sends an SMS text message", async () => {
    mockFetchResponses({ body: { sid: "SM2" } });

    const result = await tool().handler({ to: "+15551234567", from: "+15557654321", body: "Hello" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/Messages.json");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("To")).toBe("+15551234567");
    expect(body.get("Body")).toBe("Hello");
    expect(jsonOf(result)).toEqual({ messageSid: "SM2" });
  });
});

describe("send_whatsapp_message", () => {
  const tool = () => tools.get("send_whatsapp_message")!;

  it("sends a WhatsApp message via Twilio, prefixing numbers", async () => {
    mockFetchResponses({ body: { sid: "SM3" } });

    const result = await tool().handler({ to: "+15551234567", from: "+15557654321", body: "Hello" });

    const [, init] = (fetch as any).mock.calls[0];
    const body = init.body as URLSearchParams;
    expect(body.get("To")).toBe("whatsapp:+15551234567");
    expect(body.get("From")).toBe("whatsapp:+15557654321");
    expect(jsonOf(result)).toEqual({ messageSid: "SM3" });
  });
});
