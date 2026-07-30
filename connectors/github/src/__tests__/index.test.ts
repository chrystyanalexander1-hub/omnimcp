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

const octokitMock = {
  repos: {
    listForAuthenticatedUser: vi.fn(),
    delete: vi.fn(),
  },
  issues: { create: vi.fn() },
  pulls: { create: vi.fn() },
};

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => octokitMock),
}));

function textOf(result: { content: Array<{ type: "text"; text: string }> }): string {
  return result.content[0]!.text;
}

function jsonOf(result: { content: Array<{ type: "text"; text: string }> }): unknown {
  return JSON.parse(textOf(result));
}

beforeAll(async () => {
  process.env.GITHUB_TOKEN = "ghp_test";
  await import("../index.js");
});

beforeEach(() => {
  octokitMock.repos.listForAuthenticatedUser.mockReset();
  octokitMock.repos.delete.mockReset();
  octokitMock.issues.create.mockReset();
  octokitMock.pulls.create.mockReset();
});

describe("list_repos", () => {
  const tool = () => tools.get("list_repos")!;

  it("lists repos owned by or accessible to the account", async () => {
    octokitMock.repos.listForAuthenticatedUser.mockResolvedValueOnce({
      data: [{ full_name: "acme/widgets", private: false, html_url: "https://github.com/acme/widgets" }],
    });

    const result = await tool().handler({});

    expect(octokitMock.repos.listForAuthenticatedUser).toHaveBeenCalledWith({ per_page: 50 });
    expect(jsonOf(result)).toEqual([
      { fullName: "acme/widgets", private: false, url: "https://github.com/acme/widgets" },
    ]);
  });

  it("surfaces a GitHub API error as an error result", async () => {
    octokitMock.repos.listForAuthenticatedUser.mockRejectedValueOnce(new Error("Bad credentials"));

    const result = await tool().handler({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Bad credentials");
  });
});

describe("create_issue", () => {
  const tool = () => tools.get("create_issue")!;

  it("creates an issue in a repository", async () => {
    octokitMock.issues.create.mockResolvedValueOnce({
      data: { number: 7, html_url: "https://github.com/acme/widgets/issues/7" },
    });

    const result = await tool().handler({ owner: "acme", repo: "widgets", title: "Bug", body: "Steps to reproduce" });

    expect(octokitMock.issues.create).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      title: "Bug",
      body: "Steps to reproduce",
    });
    expect(jsonOf(result)).toEqual({ number: 7, url: "https://github.com/acme/widgets/issues/7" });
  });
});

describe("create_pull_request", () => {
  const tool = () => tools.get("create_pull_request")!;

  it("opens a pull request", async () => {
    octokitMock.pulls.create.mockResolvedValueOnce({
      data: { number: 12, html_url: "https://github.com/acme/widgets/pull/12" },
    });

    const result = await tool().handler({
      owner: "acme",
      repo: "widgets",
      title: "Fix bug",
      head: "fix-branch",
      base: "main",
    });

    expect(octokitMock.pulls.create).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      title: "Fix bug",
      head: "fix-branch",
      base: "main",
      body: undefined,
    });
    expect(jsonOf(result)).toEqual({ number: 12, url: "https://github.com/acme/widgets/pull/12" });
  });
});

describe("delete_repository", () => {
  const tool = () => tools.get("delete_repository")!;

  it("deletes a repository", async () => {
    octokitMock.repos.delete.mockResolvedValueOnce({});

    const result = await tool().handler({ owner: "acme", repo: "widgets" });

    expect(octokitMock.repos.delete).toHaveBeenCalledWith({ owner: "acme", repo: "widgets" });
    expect(textOf(result)).toContain("Deleted repository acme/widgets");
  });

  it("surfaces a GitHub API error as an error result", async () => {
    octokitMock.repos.delete.mockRejectedValueOnce(new Error("Must have admin rights to Repository"));

    const result = await tool().handler({ owner: "acme", repo: "widgets" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Must have admin rights to Repository");
  });
});
