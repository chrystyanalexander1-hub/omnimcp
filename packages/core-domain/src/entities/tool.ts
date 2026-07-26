/** A single capability exposed by a connector, as declared in its manifest. */
export interface Tool {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool's input, forwarded to the MCP client unchanged. */
  readonly inputSchema: Record<string, unknown>;
  /**
   * When true, ExecuteTool refuses to run this tool unless the caller passes an
   * explicit confirmation token — implements "never run sensitive actions without
   * explicit user authorization".
   */
  readonly sensitive: boolean;
}

/** A tool namespaced under its connector, e.g. "github.create_issue". */
export function qualifyToolName(connectorId: string, toolName: string): string {
  return `${connectorId}.${toolName}`;
}

export function splitQualifiedToolName(qualified: string): { connectorId: string; toolName: string } {
  const idx = qualified.indexOf(".");
  if (idx === -1) {
    throw new Error(`Tool name is not namespaced with a connector id: ${qualified}`);
  }
  return { connectorId: qualified.slice(0, idx), toolName: qualified.slice(idx + 1) };
}
