import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { z } from "zod";

export interface ToolResult {
  readonly content: Array<{ type: "text"; text: string }>;
  readonly isError?: boolean;
  // The SDK's CallToolResult type carries an index signature (for provider-specific
  // extension fields); this satisfies structural assignability to it.
  readonly [key: string]: unknown;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(value: unknown): ToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export interface ToolDefinition<Schema extends z.ZodTypeAny> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Schema;
  readonly handler: (input: z.infer<Schema>) => Promise<ToolResult> | ToolResult;
}

export interface ConnectorDefinition {
  readonly name: string;
  readonly version: string;
  /** Heterogeneous tool list — each tool's own zod schema still type-checks its handler. */
  readonly tools: ReadonlyArray<ToolDefinition<z.ZodTypeAny>>;
}

/** Reads a required env var (the connector's own secret, injected by the gateway per its manifest's `auth.envVar`) or throws with a clear message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. This connector expects the gateway to inject it from a granted credential.`);
  }
  return value;
}

/**
 * Boots a connector as a standalone MCP server over stdio. This is the entire runtime
 * a connector author needs: declare tools with a zod input schema and a handler, call
 * `startConnector`, and the gateway can spawn and drive this process like any other
 * MCP server — no OmniMCP-specific transport or RPC code required. Built on the SDK's
 * high-level `McpServer`, which derives each tool's JSON Schema for `tools/list` from
 * its zod schema and validates incoming arguments before `handler` ever runs.
 */
export async function startConnector(definition: ConnectorDefinition): Promise<void> {
  const server = new McpServer({ name: definition.name, version: definition.version });

  for (const tool of definition.tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (input) => {
      try {
        return await tool.handler(input);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
