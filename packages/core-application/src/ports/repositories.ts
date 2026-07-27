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

export interface TenantRepository {
  findById(id: TenantId): Promise<Tenant | null>;
  save(tenant: Tenant): Promise<void>;
}

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(tenantId: TenantId, email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

export interface SessionRepository {
  findById(id: SessionId): Promise<Session | null>;
  findByRefreshTokenHash(hash: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
}

export interface ApiKeyRepository {
  findById(id: ApiKeyId): Promise<ApiKey | null>;
  findByHash(hash: string): Promise<ApiKey | null>;
  save(apiKey: ApiKey): Promise<void>;
}

/** The platform-wide connector catalog, populated by RegisterConnector at gateway boot from each connector's manifest. Not tenant-scoped. */
export interface ConnectorRepository {
  findById(id: ConnectorId): Promise<Connector | null>;
  list(): Promise<Connector[]>;
  save(connector: Connector): Promise<void>;
}

export interface ConnectorInstallationRepository {
  findActive(tenantId: TenantId, connectorId: ConnectorId): Promise<ConnectorInstallation | null>;
  listActiveByTenant(tenantId: TenantId): Promise<ConnectorInstallation[]>;
  save(installation: ConnectorInstallation): Promise<void>;
}

export interface CredentialGrantRepository {
  findActive(tenantId: TenantId, connectorId: ConnectorId): Promise<CredentialGrant | null>;
  save(grant: CredentialGrant): Promise<void>;
  revoke(id: CredentialGrantId, revokedAt: Date): Promise<void>;
  /**
   * Overwrites a grant's encrypted secret in place, keeping its id/tenant/connector.
   * Exists for providers that rotate their refresh_token on every use (Mercado Libre)
   * — see `ConnectorAuth.oauth.refreshTokenRotates` in packages/core-domain.
   */
  updateSecret(id: CredentialGrantId, secret: { ciphertext: string; iv: string; authTag: string }): Promise<void>;
}

export interface PermissionRepository {
  has(tenantId: TenantId, userId: UserId, connectorId: ConnectorId): Promise<boolean>;
  grant(permission: Permission): Promise<void>;
  revoke(tenantId: TenantId, userId: UserId, connectorId: ConnectorId): Promise<void>;
}

export interface AuditEventRepository {
  save(event: AuditEvent): Promise<void>;
  listByTenant(tenantId: TenantId, limit?: number): Promise<AuditEvent[]>;
}

export interface WorkflowRepository {
  findById(id: WorkflowId): Promise<Workflow | null>;
  listByTenant(tenantId: TenantId): Promise<Workflow[]>;
  /** Enabled workflows whose nextRunAt has passed — what the automation worker polls for. */
  listDue(now: Date): Promise<Workflow[]>;
  save(workflow: Workflow): Promise<void>;
  delete(id: WorkflowId): Promise<void>;
}

export interface WorkflowRunRepository {
  save(run: WorkflowRun): Promise<void>;
  listByWorkflow(workflowId: WorkflowId, limit?: number): Promise<WorkflowRun[]>;
}
