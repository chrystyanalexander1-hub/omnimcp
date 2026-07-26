import { Octokit } from "@octokit/rest";
import { errorResult, jsonResult, requireEnv, startConnector, textResult } from "@omnimcp/connector-sdk-ts";
import { z } from "zod";

const octokit = new Octokit({ auth: requireEnv("GITHUB_TOKEN") });

const listReposSchema = z.object({});

const createIssueSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string().optional(),
});

const createPullRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  head: z.string(),
  base: z.string(),
  body: z.string().optional(),
});

const deleteRepositorySchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

await startConnector({
  name: "github",
  version: "0.1.0",
  tools: [
    {
      name: "list_repos",
      description: "List repositories owned by or accessible to the authenticated GitHub account.",
      inputSchema: listReposSchema,
      async handler() {
        const { data } = await octokit.repos.listForAuthenticatedUser({ per_page: 50 });
        return jsonResult(data.map((r) => ({ fullName: r.full_name, private: r.private, url: r.html_url })));
      },
    },
    {
      name: "create_issue",
      description: "Create an issue in a GitHub repository.",
      inputSchema: createIssueSchema,
      async handler({ owner, repo, title, body }) {
        try {
          const { data } = await octokit.issues.create({ owner, repo, title, body });
          return jsonResult({ number: data.number, url: data.html_url });
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    },
    {
      name: "create_pull_request",
      description: "Open a pull request in a GitHub repository.",
      inputSchema: createPullRequestSchema,
      async handler({ owner, repo, title, head, base, body }) {
        try {
          const { data } = await octokit.pulls.create({ owner, repo, title, head, base, body });
          return jsonResult({ number: data.number, url: data.html_url });
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    },
    {
      name: "delete_repository",
      description: "Permanently delete a GitHub repository. Irreversible — the gateway only forwards this call once the caller has explicitly confirmed it.",
      inputSchema: deleteRepositorySchema,
      async handler({ owner, repo }) {
        try {
          await octokit.repos.delete({ owner, repo });
          return textResult(`Deleted repository ${owner}/${repo}`);
        } catch (err) {
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    },
  ],
});
