import { Redis } from "ioredis";
import {
  AuthenticateUser,
  CreateWorkflow,
  DeleteWorkflow,
  ExecuteTool,
  GetWorkflowRuns,
  GrantConnectorCredential,
  InstallConnector,
  IssueApiKey,
  ListAvailableTools,
  ListWorkflows,
  RecordAuditEvent,
  RegisterConnector,
  RegisterTenant,
  RevokeConnectorCredential,
  RunDueWorkflows,
  RunWorkflow,
  ToggleWorkflow,
  TriggerWorkflow,
} from "@omnimcp/core-application";
import type { Env } from "./config/env.js";
import { createDatabase, type Database } from "./db/client.js";
import { loadConnectorManifests } from "./manifest/manifest-loader.js";
import { InMemoryConnectorRepository } from "./repositories/in-memory-connector-repository.js";
import { PostgresApiKeyRepository } from "./repositories/postgres-api-key-repository.js";
import { PostgresAuditEventRepository } from "./repositories/postgres-audit-event-repository.js";
import { PostgresConnectorInstallationRepository } from "./repositories/postgres-connector-installation-repository.js";
import { PostgresCredentialGrantRepository } from "./repositories/postgres-credential-grant-repository.js";
import { PostgresPermissionRepository } from "./repositories/postgres-permission-repository.js";
import { PostgresSessionRepository } from "./repositories/postgres-session-repository.js";
import { PostgresTenantRepository } from "./repositories/postgres-tenant-repository.js";
import { PostgresUserRepository } from "./repositories/postgres-user-repository.js";
import { PostgresWorkflowRepository } from "./repositories/postgres-workflow-repository.js";
import { PostgresWorkflowRunRepository } from "./repositories/postgres-workflow-run-repository.js";
import { AesCryptoService } from "./services/aes-crypto-service.js";
import { BcryptPasswordHasher } from "./services/bcrypt-password-hasher.js";
import { ConnectorProcessManager } from "./services/connector-process-manager.js";
import { CronParserScheduler } from "./services/cron-parser-scheduler.js";
import { JwtTokenService } from "./services/jwt-token-service.js";
import { RedisRateLimiter } from "./services/redis-rate-limiter.js";
import { CryptoIdGenerator, SystemClock } from "./services/system-clock.js";

/**
 * The single composition root for the whole platform: every concrete adapter is
 * wired here exactly once, then both apps/mcp-gateway and apps/rest-api import
 * `createAppContext` instead of each re-wiring their own copy of the use cases —
 * that's what keeps their business logic identical by construction, not by convention.
 */
export interface AppContext {
  readonly db: Database;
  readonly redis: Redis;
  readonly repositories: {
    readonly tenants: PostgresTenantRepository;
    readonly users: PostgresUserRepository;
    readonly sessions: PostgresSessionRepository;
    readonly apiKeys: PostgresApiKeyRepository;
    readonly connectors: InMemoryConnectorRepository;
    readonly connectorInstallations: PostgresConnectorInstallationRepository;
    readonly credentialGrants: PostgresCredentialGrantRepository;
    readonly permissions: PostgresPermissionRepository;
    readonly auditEvents: PostgresAuditEventRepository;
    readonly workflows: PostgresWorkflowRepository;
    readonly workflowRuns: PostgresWorkflowRunRepository;
  };
  readonly services: {
    readonly crypto: AesCryptoService;
    readonly tokens: JwtTokenService;
    readonly passwordHasher: BcryptPasswordHasher;
    readonly clock: SystemClock;
    readonly ids: CryptoIdGenerator;
    readonly rateLimiter: RedisRateLimiter;
    readonly connectorProcessManager: ConnectorProcessManager;
    readonly cronScheduler: CronParserScheduler;
  };
  readonly useCases: {
    readonly registerTenant: RegisterTenant;
    readonly authenticateUser: AuthenticateUser;
    readonly issueApiKey: IssueApiKey;
    readonly registerConnector: RegisterConnector;
    readonly installConnector: InstallConnector;
    readonly listAvailableTools: ListAvailableTools;
    readonly grantConnectorCredential: GrantConnectorCredential;
    readonly revokeConnectorCredential: RevokeConnectorCredential;
    readonly recordAuditEvent: RecordAuditEvent;
    readonly executeTool: ExecuteTool;
    readonly createWorkflow: CreateWorkflow;
    readonly listWorkflows: ListWorkflows;
    readonly toggleWorkflow: ToggleWorkflow;
    readonly deleteWorkflow: DeleteWorkflow;
    readonly runWorkflow: RunWorkflow;
    readonly runDueWorkflows: RunDueWorkflows;
    readonly triggerWorkflow: TriggerWorkflow;
    readonly getWorkflowRuns: GetWorkflowRuns;
  };
  /** Loads every connector.manifest.json under env.CONNECTORS_DIR into the catalog. Call once at boot. */
  loadConnectors(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createAppContext(env: Env): AppContext {
  const db = createDatabase(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL);

  const repositories = {
    tenants: new PostgresTenantRepository(db),
    users: new PostgresUserRepository(db),
    sessions: new PostgresSessionRepository(db),
    apiKeys: new PostgresApiKeyRepository(db),
    connectors: new InMemoryConnectorRepository(),
    connectorInstallations: new PostgresConnectorInstallationRepository(db),
    credentialGrants: new PostgresCredentialGrantRepository(db),
    permissions: new PostgresPermissionRepository(db),
    auditEvents: new PostgresAuditEventRepository(db),
    workflows: new PostgresWorkflowRepository(db),
    workflowRuns: new PostgresWorkflowRunRepository(db),
  };

  const services = {
    crypto: new AesCryptoService(env.MASTER_ENCRYPTION_KEY),
    tokens: new JwtTokenService(env.JWT_SECRET),
    passwordHasher: new BcryptPasswordHasher(),
    clock: new SystemClock(),
    ids: new CryptoIdGenerator(),
    rateLimiter: new RedisRateLimiter(redis, env.RATE_LIMIT_PER_MINUTE),
    connectorProcessManager: new ConnectorProcessManager(),
    cronScheduler: new CronParserScheduler(),
  };

  const recordAuditEvent = new RecordAuditEvent(repositories.auditEvents, services.crypto, services.ids, services.clock);
  const executeTool = new ExecuteTool(
    repositories.connectorInstallations,
    repositories.connectors,
    repositories.permissions,
    repositories.credentialGrants,
    services.crypto,
    services.rateLimiter,
    services.connectorProcessManager,
    recordAuditEvent,
  );
  const runWorkflow = new RunWorkflow(repositories.users, executeTool, repositories.workflowRuns, services.ids, services.clock);

  const useCases = {
    registerTenant: new RegisterTenant(repositories.tenants, repositories.users, services.passwordHasher, services.ids, services.clock),
    authenticateUser: new AuthenticateUser(
      repositories.users,
      repositories.sessions,
      services.passwordHasher,
      services.tokens,
      services.crypto,
      services.ids,
      services.clock,
    ),
    issueApiKey: new IssueApiKey(repositories.apiKeys, services.crypto, services.ids, services.clock),
    registerConnector: new RegisterConnector(repositories.connectors),
    installConnector: new InstallConnector(repositories.connectors, repositories.connectorInstallations, services.ids, services.clock),
    listAvailableTools: new ListAvailableTools(repositories.connectorInstallations, repositories.connectors, repositories.permissions),
    grantConnectorCredential: new GrantConnectorCredential(
      repositories.connectors,
      repositories.credentialGrants,
      services.crypto,
      services.ids,
      services.clock,
    ),
    revokeConnectorCredential: new RevokeConnectorCredential(repositories.credentialGrants, services.clock),
    recordAuditEvent,
    executeTool,
    createWorkflow: new CreateWorkflow(repositories.workflows, repositories.connectors, services.cronScheduler, services.ids, services.clock),
    listWorkflows: new ListWorkflows(repositories.workflows),
    toggleWorkflow: new ToggleWorkflow(repositories.workflows),
    deleteWorkflow: new DeleteWorkflow(repositories.workflows),
    runWorkflow,
    runDueWorkflows: new RunDueWorkflows(repositories.workflows, runWorkflow, services.cronScheduler, services.clock),
    triggerWorkflow: new TriggerWorkflow(repositories.workflows, runWorkflow),
    getWorkflowRuns: new GetWorkflowRuns(repositories.workflows, repositories.workflowRuns),
  };

  return {
    db,
    redis,
    repositories,
    services,
    useCases,
    async loadConnectors() {
      const manifests = await loadConnectorManifests(env.CONNECTORS_DIR);
      for (const manifest of manifests) {
        await useCases.registerConnector.execute(manifest);
      }
    },
    async shutdown() {
      await services.connectorProcessManager.shutdown();
      redis.disconnect();
    },
  };
}
