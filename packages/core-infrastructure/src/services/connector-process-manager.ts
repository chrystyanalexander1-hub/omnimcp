import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Connector, TenantId } from "@omnimcp/core-domain";
import type { ConnectorInvoker, ConnectorToolResult } from "@omnimcp/core-application";

interface PooledConnection {
  readonly client: Client;
  readonly transport: StdioClientTransport;
  lastUsedAt: number;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

/** Env vars a child connector process is allowed to inherit from the gateway — deliberately excludes DATABASE_URL, JWT_SECRET, MASTER_ENCRYPTION_KEY, REDIS_URL and anything else the gateway holds. */
const INHERITED_ENV_KEYS = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "NODE_ENV"];

function baseChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of INHERITED_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * Implements ConnectorInvoker by spawning each connector as its own child MCP server
 * process over stdio, using the official MCP TS SDK client. Connections are pooled
 * per (tenant, connector) pair — never shared across tenants — so tenant A's decrypted
 * credential is only ever injected into a process tenant A's calls can reach, and an
 * idle sweep closes processes that haven't been used recently to bound resource usage.
 */
export class ConnectorProcessManager implements ConnectorInvoker {
  private readonly pool = new Map<string, Promise<PooledConnection>>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly gatewayName = "omnimcp-gateway",
    private readonly gatewayVersion = "0.1.0",
  ) {
    this.sweepTimer = setInterval(() => this.sweepIdleConnections(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async invoke(
    tenantId: TenantId,
    connector: Connector,
    toolName: string,
    params: Record<string, unknown>,
    credentialSecret: string | null,
  ): Promise<ConnectorToolResult> {
    const key = this.poolKey(tenantId, connector.id);
    const connection = await this.getOrCreateConnection(key, connector, credentialSecret);
    try {
      const result = await connection.client.callTool({ name: toolName, arguments: params });
      connection.lastUsedAt = Date.now();
      return { isError: result.isError === true, content: result.content };
    } catch (err) {
      // The process may be dead or wedged; drop it so the next call respawns fresh.
      this.pool.delete(key);
      void connection.transport.close().catch(() => {});
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    clearInterval(this.sweepTimer);
    const pending = [...this.pool.values()];
    this.pool.clear();
    await Promise.all(pending.map((p) => p.then((c) => c.transport.close()).catch(() => {})));
  }

  private poolKey(tenantId: TenantId, connectorId: string): string {
    return `${tenantId}:${connectorId}`;
  }

  private getOrCreateConnection(
    key: string,
    connector: Connector,
    credentialSecret: string | null,
  ): Promise<PooledConnection> {
    const existing = this.pool.get(key);
    if (existing) return existing;

    const created = this.spawnConnection(connector, credentialSecret);
    this.pool.set(key, created);
    created.catch(() => this.pool.delete(key));
    return created;
  }

  private async spawnConnection(connector: Connector, credentialSecret: string | null): Promise<PooledConnection> {
    if (connector.transport.type !== "stdio") {
      throw new Error(
        `ConnectorProcessManager only supports the "stdio" transport in this phase (connector "${connector.id}" declares "${connector.transport.type}")`,
      );
    }

    const env = baseChildEnv();
    if (connector.auth.envVar && credentialSecret) {
      // For api_key connectors this is the tenant's PAT; for oauth2 connectors it's their refresh token.
      env[connector.auth.envVar] = credentialSecret;
    }
    if (connector.auth.oauth) {
      const clientId = process.env[connector.auth.oauth.clientIdEnvVar];
      const clientSecret = process.env[connector.auth.oauth.clientSecretEnvVar];
      if (clientId) env[connector.auth.oauth.clientIdEnvVar] = clientId;
      if (clientSecret) env[connector.auth.oauth.clientSecretEnvVar] = clientSecret;
    }

    const transport = new StdioClientTransport({
      command: connector.transport.command,
      args: [...connector.transport.args],
      env,
    });
    const client = new Client({ name: this.gatewayName, version: this.gatewayVersion }, { capabilities: {} });
    await client.connect(transport);
    return { client, transport, lastUsedAt: Date.now() };
  }

  private sweepIdleConnections(): void {
    const now = Date.now();
    for (const [key, pending] of this.pool) {
      void pending
        .then((connection) => {
          if (now - connection.lastUsedAt > IDLE_TIMEOUT_MS) {
            this.pool.delete(key);
            void connection.transport.close().catch(() => {});
          }
        })
        .catch(() => this.pool.delete(key));
    }
  }
}
