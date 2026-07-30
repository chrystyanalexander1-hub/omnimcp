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
  process.env.ACTIVECAMPAIGN_CREDENTIALS = "https://myaccount.api-us1.com|test-api-key";
  await import("../index.js");
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("list_contacts", () => {
  const tool = () => tools.get("list_contacts")!;

  it("lists contacts, optionally filtered by search", async () => {
    mockFetchResponses({ body: { contacts: [{ id: "1", email: "a@b.com" }] } });

    const result = await tool().handler({ search: "a@b.com" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/api/3/contacts");
    expect((url as URL).searchParams.get("search")).toBe("a@b.com");
    expect(init.headers["Api-Token"]).toBe("test-api-key");
    expect(jsonOf(result)).toEqual([{ id: "1", email: "a@b.com" }]);
  });

  it("surfaces an ActiveCampaign API error as an error result", async () => {
    mockFetchResponses({ body: { message: "Invalid API token" }, ok: false });

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Invalid API token");
  });
});

describe("create_contact", () => {
  const tool = () => tools.get("create_contact")!;

  it("creates a contact and returns its id", async () => {
    mockFetchResponses({ body: { contact: { id: "42" } } });

    const result = await tool().handler({ email: "new@example.com", firstName: "Ada" });

    const [url, init] = (fetch as any).mock.calls[0];
    expect(String(url)).toContain("/api/3/contacts");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ contact: { email: "new@example.com", firstName: "Ada" } });
    expect(jsonOf(result)).toEqual({ contactId: "42" });
  });
});

describe("list_automations", () => {
  const tool = () => tools.get("list_automations")!;

  it("lists automations", async () => {
    mockFetchResponses({ body: { automations: [{ id: "1", name: "Welcome" }] } });

    const result = await tool().handler({});

    expect((fetch as any).mock.calls[0][0].toString()).toContain("/api/3/automations");
    expect(jsonOf(result)).toEqual([{ id: "1", name: "Welcome" }]);
  });
});

describe("add_contact_to_automation", () => {
  const tool = () => tools.get("add_contact_to_automation")!;

  it("enrolls a contact in an automation", async () => {
    mockFetchResponses({ body: { contactAutomation: { id: "99" } } });

    const result = await tool().handler({ contactId: "1", automationId: "2" });

    const [, init] = (fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ contactAutomation: { contact: "1", automation: "2" } });
    expect(jsonOf(result)).toEqual({ contactAutomationId: "99" });
  });

  it("surfaces an ActiveCampaign API error as an error result", async () => {
    mockFetchResponses({ body: { errors: [{ title: "Contact not found" }] }, ok: false });

    const result = await tool().handler({ contactId: "999", automationId: "2" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Contact not found");
  });
});
