import {
  canManageConnectors,
  ConfirmationRequiredError,
  ConnectorId,
  findTool,
  NotFoundError,
  PermissionDeniedError,
  RateLimitExceededError,
  splitQualifiedToolName,
  type Role,
  type TenantId,
  type UserId,
} from "@omnimcp/core-domain";
import type {
  ConnectorInstallationRepository,
  ConnectorRepository,
  CredentialGrantRepository,
  PermissionRepository,
} from "../ports/repositories.js";
import type { ConnectorInvoker, ConnectorToolResult, CryptoService, RateLimiter } from "../ports/services.js";
import { RecordAuditEvent } from "./record-audit-event.js";

export interface ExecuteToolInput {
  readonly tenantId: TenantId;
  readonly actorUserId: UserId;
  readonly actorRole: Role;
  readonly qualifiedToolName: string;
  readonly params: Record<string, unknown>;
  /**
   * Required to run a tool flagged `sensitive` in its manifest. The caller (REST API /
   * MCP gateway) is responsible for having obtained this from an explicit user
   * confirmation step before passing it through.
   */
  readonly confirmationToken?: string | null;
}

/**
 * The single choke point every tool call passes through: install check, permission
 * check, sensitive-action confirmation gate, rate limit, credential decryption,
 * dispatch to the connector process, and an audit record for every outcome —
 * including denials, so nothing is invisible to the audit trail.
 */
export class ExecuteTool {
  constructor(
    private readonly installations: ConnectorInstallationRepository,
    private readonly connectors: ConnectorRepository,
    private readonly permissions: PermissionRepository,
    private readonly credentials: CredentialGrantRepository,
    private readonly crypto: CryptoService,
    private readonly rateLimiter: RateLimiter,
    private readonly invoker: ConnectorInvoker,
    private readonly recordAuditEvent: RecordAuditEvent,
  ) {}

  async execute(input: ExecuteToolInput): Promise<ConnectorToolResult> {
    const audit = (outcome: "success" | "denied" | "error" | "awaiting_confirmation", errorMessage?: string) =>
      this.recordAuditEvent.execute({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        qualifiedToolName: input.qualifiedToolName,
        params: input.params,
        outcome,
        errorMessage: errorMessage ?? null,
      });

    const { connectorId, toolName } = splitQualifiedToolName(input.qualifiedToolName);

    const connector = await this.connectors.findById(ConnectorId(connectorId));
    if (!connector) {
      await audit("error", `Unknown connector: ${connectorId}`);
      throw new NotFoundError(`Unknown connector: ${connectorId}`);
    }
    const tool = findTool(connector, toolName);
    if (!tool) {
      await audit("error", `Unknown tool: ${input.qualifiedToolName}`);
      throw new NotFoundError(`Unknown tool: ${input.qualifiedToolName}`);
    }

    const installation = await this.installations.findActive(input.tenantId, connector.id);
    if (!installation) {
      await audit("denied", "Connector is not installed for this tenant");
      throw new PermissionDeniedError(`Connector "${connector.id}" is not installed for this tenant`);
    }

    const canManage = canManageConnectors(input.actorRole);
    if (!canManage) {
      const allowed = await this.permissions.has(input.tenantId, input.actorUserId, connector.id);
      if (!allowed) {
        await audit("denied", "Caller lacks permission to use this connector");
        throw new PermissionDeniedError(`You do not have permission to use connector "${connector.id}"`);
      }
    }

    if (tool.sensitive && !input.confirmationToken) {
      await audit("awaiting_confirmation");
      throw new ConfirmationRequiredError(
        `Tool "${input.qualifiedToolName}" is sensitive and requires explicit confirmation before it can run`,
      );
    }

    const withinBudget = await this.rateLimiter.consume(`tenant:${input.tenantId}`);
    if (!withinBudget) {
      await audit("denied", "Rate limit exceeded");
      throw new RateLimitExceededError(`Rate limit exceeded for tenant ${input.tenantId}`);
    }

    let credentialSecret: string | null = null;
    if (connector.auth.type !== "none") {
      const grant = await this.credentials.findActive(input.tenantId, connector.id);
      if (!grant) {
        await audit("error", "No active credential granted for this connector");
        throw new NotFoundError(`No credential has been granted for connector "${connector.id}"`);
      }
      credentialSecret = this.crypto.decrypt(input.tenantId, {
        ciphertext: grant.ciphertext,
        iv: grant.iv,
        authTag: grant.authTag,
      });
    }

    try {
      const result = await this.invoker.invoke(input.tenantId, connector, toolName, input.params, credentialSecret);
      await audit(result.isError ? "error" : "success", result.isError ? String(result.content) : undefined);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await audit("error", message);
      throw err;
    }
  }
}
