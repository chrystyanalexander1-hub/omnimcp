import { createHash, randomUUID } from "node:crypto";
import type {
  ApiKey,
  ApiKeyId,
  AuditEvent,
  Connector,
  ConnectorId,
  ConnectorInstallation,
  CredentialGrant,
  CredentialGrantId,
  Permission,
  Session,
  SessionId,
  Tenant,
  TenantId,
  User,
  UserId,
  Workflow,
  WorkflowId,
  WorkflowRun,
} from "@omnimcp/core-domain";
import { isConnectorInstallationActive, isCredentialGrantActive } from "@omnimcp/core-domain";
import type {
  ApiKeyRepository,
  AuditEventRepository,
  ConnectorInstallationRepository,
  ConnectorRepository,
  CredentialGrantRepository,
  PermissionRepository,
  SessionRepository,
  TenantRepository,
  UserRepository,
  WorkflowRepository,
  WorkflowRunRepository,
} from "../../ports/repositories.js";
import type {
  Clock,
  ConnectorInvoker,
  ConnectorToolResult,
  CronScheduler,
  CryptoService,
  EncryptedPayload,
  IdGenerator,
  PasswordHasher,
  RateLimiter,
  TokenService,
  AccessTokenClaims,
} from "../../ports/services.js";

export class InMemoryTenantRepository implements TenantRepository {
  private readonly rows = new Map<string, Tenant>();
  async findById(id: TenantId) {
    return this.rows.get(id) ?? null;
  }
  async save(tenant: Tenant) {
    this.rows.set(tenant.id, tenant);
  }
}

export class InMemoryUserRepository implements UserRepository {
  private readonly rows = new Map<string, User>();
  async findById(id: UserId) {
    return this.rows.get(id) ?? null;
  }
  async findByEmail(tenantId: TenantId, email: string) {
    for (const user of this.rows.values()) {
      if (user.tenantId === tenantId && user.email === email) return user;
    }
    return null;
  }
  async save(user: User) {
    this.rows.set(user.id, user);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly rows = new Map<string, Session>();
  async findById(id: SessionId) {
    return this.rows.get(id) ?? null;
  }
  async findByRefreshTokenHash(hash: string) {
    for (const s of this.rows.values()) if (s.refreshTokenHash === hash) return s;
    return null;
  }
  async save(session: Session) {
    this.rows.set(session.id, session);
  }
}

export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private readonly rows = new Map<string, ApiKey>();
  async findById(id: ApiKeyId) {
    return this.rows.get(id) ?? null;
  }
  async findByHash(hash: string) {
    for (const k of this.rows.values()) if (k.keyHash === hash) return k;
    return null;
  }
  async save(apiKey: ApiKey) {
    this.rows.set(apiKey.id, apiKey);
  }
}

export class InMemoryConnectorRepository implements ConnectorRepository {
  private readonly rows = new Map<string, Connector>();
  async findById(id: ConnectorId) {
    return this.rows.get(id) ?? null;
  }
  async list() {
    return [...this.rows.values()];
  }
  async save(connector: Connector) {
    this.rows.set(connector.id, connector);
  }
}

export class InMemoryConnectorInstallationRepository implements ConnectorInstallationRepository {
  private readonly rows: ConnectorInstallation[] = [];
  async findActive(tenantId: TenantId, connectorId: ConnectorId) {
    return (
      this.rows.find(
        (i) => i.tenantId === tenantId && i.connectorId === connectorId && isConnectorInstallationActive(i),
      ) ?? null
    );
  }
  async listActiveByTenant(tenantId: TenantId) {
    return this.rows.filter((i) => i.tenantId === tenantId && isConnectorInstallationActive(i));
  }
  async save(installation: ConnectorInstallation) {
    this.rows.push(installation);
  }
}

export class InMemoryCredentialGrantRepository implements CredentialGrantRepository {
  private readonly rows = new Map<string, CredentialGrant>();
  async findActive(tenantId: TenantId, connectorId: ConnectorId) {
    for (const g of this.rows.values()) {
      if (g.tenantId === tenantId && g.connectorId === connectorId && isCredentialGrantActive(g)) return g;
    }
    return null;
  }
  async save(grant: CredentialGrant) {
    this.rows.set(grant.id, grant);
  }
  async revoke(id: CredentialGrantId, revokedAt: Date) {
    const existing = this.rows.get(id);
    if (existing) this.rows.set(id, { ...existing, revokedAt });
  }
}

export class InMemoryPermissionRepository implements PermissionRepository {
  private readonly rows: Permission[] = [];
  async has(tenantId: TenantId, userId: UserId, connectorId: ConnectorId) {
    return this.rows.some((p) => p.tenantId === tenantId && p.userId === userId && p.connectorId === connectorId);
  }
  async grant(permission: Permission) {
    this.rows.push(permission);
  }
  async revoke(tenantId: TenantId, userId: UserId, connectorId: ConnectorId) {
    const idx = this.rows.findIndex(
      (p) => p.tenantId === tenantId && p.userId === userId && p.connectorId === connectorId,
    );
    if (idx !== -1) this.rows.splice(idx, 1);
  }
}

export class InMemoryAuditEventRepository implements AuditEventRepository {
  readonly rows: AuditEvent[] = [];
  async save(event: AuditEvent) {
    this.rows.push(event);
  }
  async listByTenant(tenantId: TenantId, limit = 100) {
    return this.rows.filter((e) => e.tenantId === tenantId).slice(0, limit);
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date = new Date("2026-01-01T00:00:00.000Z")) {}
  now() {
    return this.current;
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class UuidIdGenerator implements IdGenerator {
  newId() {
    return randomUUID();
  }
}

export class Sha256CryptoService implements CryptoService {
  encrypt(_tenantId: TenantId, plaintext: string): EncryptedPayload {
    return { ciphertext: Buffer.from(plaintext, "utf8").toString("base64"), iv: "test-iv", authTag: "test-tag" };
  }
  decrypt(_tenantId: TenantId, payload: EncryptedPayload): string {
    return Buffer.from(payload.ciphertext, "base64").toString("utf8");
  }
  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plaintext: string) {
    return `hashed:${plaintext}`;
  }
  async verify(plaintext: string, hash: string) {
    return hash === `hashed:${plaintext}`;
  }
}

export class FakeTokenService implements TokenService {
  issueAccessToken(claims: AccessTokenClaims) {
    return `token:${JSON.stringify(claims)}`;
  }
  verifyAccessToken(token: string): AccessTokenClaims {
    return JSON.parse(token.replace(/^token:/, ""));
  }
  generateRefreshToken() {
    return randomUUID();
  }
}

export class AlwaysAllowRateLimiter implements RateLimiter {
  async consume() {
    return true;
  }
}

export class AlwaysDenyRateLimiter implements RateLimiter {
  async consume() {
    return false;
  }
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly rows = new Map<string, Workflow>();
  async findById(id: WorkflowId) {
    return this.rows.get(id) ?? null;
  }
  async listByTenant(tenantId: TenantId) {
    return [...this.rows.values()].filter((w) => w.tenantId === tenantId);
  }
  async listDue(now: Date) {
    return [...this.rows.values()].filter((w) => w.enabled && w.nextRunAt !== null && w.nextRunAt <= now);
  }
  async save(workflow: Workflow) {
    this.rows.set(workflow.id, workflow);
  }
  async delete(id: WorkflowId) {
    this.rows.delete(id);
  }
}

export class InMemoryWorkflowRunRepository implements WorkflowRunRepository {
  readonly rows: WorkflowRun[] = [];
  async save(run: WorkflowRun) {
    this.rows.push(run);
  }
  async listByWorkflow(workflowId: WorkflowId, limit = 100) {
    return this.rows.filter((r) => r.workflowId === workflowId).slice(0, limit);
  }
}

export class FakeCronScheduler implements CronScheduler {
  isValid(expr: string): boolean {
    return expr !== "invalid-cron";
  }
  nextRunAt(_expr: string, after: Date): Date {
    return new Date(after.getTime() + 60_000);
  }
}

export class FakeConnectorInvoker implements ConnectorInvoker {
  public lastCall: {
    tenantId: TenantId;
    toolName: string;
    params: Record<string, unknown>;
    credentialSecret: string | null;
  } | null = null;
  constructor(private readonly result: ConnectorToolResult = { isError: false, content: "ok" }) {}
  async invoke(
    tenantId: TenantId,
    _connector: Connector,
    toolName: string,
    params: Record<string, unknown>,
    credentialSecret: string | null,
  ) {
    this.lastCall = { tenantId, toolName, params, credentialSecret };
    return this.result;
  }
}
