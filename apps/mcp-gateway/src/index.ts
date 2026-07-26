#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  ConfirmationRequiredError,
  DomainError,
} from "@omnimcp/core-domain";
import { createAppContext, loadEnv } from "@omnimcp/core-infrastructure";
import { resolveCallerIdentity } from "./identity.js";

/** Reserved argument key an MCP client sets to true to confirm a `sensitive` tool call after a first attempt was rejected with CONFIRMATION_REQUIRED. Stripped before the params reach ExecuteTool/the connector. */
const CONFIRM_KEY = "_confirm";

async function main(): Promise<void> {
  const env = loadEnv();
  const context = createAppContext(env);
  await context.loadConnectors();
  const identity = await resolveCallerIdentity(context);

  const server = new Server({ name: "omnimcp-gateway", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const available = await context.useCases.listAvailableTools.execute(identity);
    return {
      tools: available.map((entry) => ({
        name: entry.qualifiedName,
        description: `[${entry.connectorId}] ${entry.tool.description}${entry.tool.sensitive ? " (sensitive: requires confirmation)" : ""}`,
        inputSchema: entry.tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const rawArgs = { ...(request.params.arguments ?? {}) } as Record<string, unknown>;
    const confirmationToken = rawArgs[CONFIRM_KEY] ? "confirmed-via-mcp-client" : null;
    delete rawArgs[CONFIRM_KEY];

    try {
      const result = await context.useCases.executeTool.execute({
        tenantId: identity.tenantId,
        actorUserId: identity.userId,
        actorRole: identity.role,
        qualifiedToolName: request.params.name,
        params: rawArgs,
        confirmationToken,
      });
      return { content: result.content, isError: result.isError };
    } catch (err) {
      if (err instanceof ConfirmationRequiredError) {
        return {
          content: [
            {
              type: "text",
              text: `${err.message} Resend the same call with an extra "${CONFIRM_KEY}": true argument to confirm.`,
            },
          ],
          isError: true,
        };
      }
      if (err instanceof DomainError) {
        return { content: [{ type: "text", text: err.message }], isError: true };
      }
      throw err;
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await context.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[omnimcp-gateway] fatal error during startup:", err);
  process.exit(1);
});
