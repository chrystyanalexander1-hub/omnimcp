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

const mockToArrayCollections = vi.fn();
const mockToArrayFind = vi.fn();
const mockCommand = vi.fn();
const mockLimit = vi.fn(() => ({ toArray: mockToArrayFind }));
const mockFind = vi.fn(() => ({ limit: mockLimit }));
const mockListCollections = vi.fn(() => ({ toArray: mockToArrayCollections }));
const mockCollection = vi.fn(() => ({ find: mockFind }));
const mockDb = vi.fn(() => ({ listCollections: mockListCollections, collection: mockCollection, command: mockCommand }));

vi.mock("mongodb", () => ({
  MongoClient: vi.fn().mockImplementation(() => ({ db: mockDb })),
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

beforeAll(async () => {
  process.env.MONGODB_CONNECTION_STRING = "mongodb://localhost:27017/test";
  await import("../index.js");
});

beforeEach(() => {
  mockDb.mockClear();
  mockCollection.mockClear();
  mockFind.mockClear();
  mockLimit.mockClear();
  mockListCollections.mockClear();
  mockToArrayCollections.mockReset();
  mockToArrayFind.mockReset();
  mockCommand.mockReset();
});

describe("list_collections", () => {
  const tool = () => tools.get("list_collections")!;

  it("lists collection names in a database", async () => {
    mockToArrayCollections.mockResolvedValueOnce([{ name: "users" }, { name: "orders" }]);

    const result = await tool().handler({ database: "shop" });

    expect(mockDb).toHaveBeenCalledWith("shop");
    expect(jsonOf(result)).toEqual(["users", "orders"]);
  });

  it("surfaces a MongoDB error as an error result", async () => {
    mockToArrayCollections.mockRejectedValueOnce(new Error("not authorized on shop to execute command"));

    const result = await tool().handler({ database: "shop" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("not authorized on shop");
  });
});

describe("find_documents", () => {
  const tool = () => tools.get("find_documents")!;

  it("finds documents in a collection matching a filter", async () => {
    mockToArrayFind.mockResolvedValueOnce([{ _id: "1", name: "Ada" }]);

    const result = await tool().handler({ database: "shop", collection: "users", filter: { name: "Ada" }, limit: 20 });

    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockFind).toHaveBeenCalledWith({ name: "Ada" });
    expect(mockLimit).toHaveBeenCalledWith(20);
    expect(jsonOf(result)).toEqual([{ _id: "1", name: "Ada" }]);
  });
});

describe("run_command", () => {
  const tool = () => tools.get("run_command")!;

  it("runs a raw command against the database", async () => {
    mockCommand.mockResolvedValueOnce({ ok: 1 });

    const result = await tool().handler({ database: "shop", command: { ping: 1 } });

    expect(mockCommand).toHaveBeenCalledWith({ ping: 1 });
    expect(jsonOf(result)).toEqual({ ok: 1 });
  });

  it("surfaces a MongoDB error as an error result", async () => {
    mockCommand.mockRejectedValueOnce(new Error("command dropDatabase requires authentication"));

    const result = await tool().handler({ database: "shop", command: { dropDatabase: 1 } });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("requires authentication");
  });
});
