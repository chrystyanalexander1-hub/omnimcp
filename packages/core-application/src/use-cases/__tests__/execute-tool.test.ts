import { beforeEach, describe, expect, it } from "vitest";
import {
  ConfirmationRequiredError,
  ConnectorId,
  ConnectorInstallationId,
  CredentialGrantId,
  PermissionDeniedError,
  RateLimitExceededError,
  TenantId,
  UserId,
  createConnector,
} from "@omnimcp/core-domain";
import { ExecuteTool } from "../execute-tool.js";
import { RecordAuditEvent } from "../record-audit-event.js";
import {
  AlwaysAllowRateLimiter,
  AlwaysDenyRateLimiter,
  FakeConnectorInvoker,
  FixedClock,
  InMemoryAuditEventRepository,
  InMemoryConnectorInstallationRepository,
  InMemoryConnectorRepository,
  InMemoryCredentialGrantRepository,
  InMemoryPermissionRepository,
  Sha256CryptoService,
  UuidIdGenerator,
} from "./test-doubles.js";

const tenantId = TenantId("tenant-1");
const userId = UserId("user-1");
const connectorId = ConnectorId("github");

function githubConnector(sensitiveDelete = false) {
  return createConnector({
    id: connectorId,
    displayName: "GitHub",
    version: "0.1.0",
    transport: { type: "stdio", command: "node", args: ["dist/index.js"] },
    auth: { type: "api_key", envVar: "GITHUB_TOKEN" },
    tools: [
      { name: "create_issue", description: "Create an issue", inputSchema: {}, sensitive: false },
      { name: "delete_repository", description: "Delete a repo", inputSchema: {}, sensitive: sensitiveDelete },
    ],
  });
}

describe("ExecuteTool", () => {
  let connectors: InMemoryConnectorRepository;
  let installations: InMemoryConnectorInstallationRepository;
  let permissions: InMemoryPermissionRepository;
  let credentials: InMemoryCredentialGrantRepository;
  let auditEvents: InMemoryAuditEventRepository;
  let crypto: Sha256CryptoService;
  let clock: FixedClock;
  let ids: UuidIdGenerator;
  let invoker: FakeConnectorInvoker;
  let recordAuditEvent: RecordAuditEvent;

  beforeEach(async () => {
    connectors = new InMemoryConnectorRepository();
    installations = new InMemoryConnectorInstallationRepository();
    permissions = new InMemoryPermissionRepository();
    credentials = new InMemoryCredentialGrantRepository();
    auditEvents = new InMemoryAuditEventRepository();
    crypto = new Sha256CryptoService();
    clock = new FixedClock();
    ids = new UuidIdGenerator();
    invoker = new FakeConnectorInvoker();
    recordAuditEvent = new RecordAuditEvent(auditEvents, crypto, ids, clock);

    await connectors.save(githubConnector());
    await installations.save({
      id: ConnectorInstallationId(ids.newId()),
      tenantId,
      connectorId,
      installedByUserId: userId,
      config: {},
      installedAt: clock.now(),
      uninstalledAt: null,
    });
    await credentials.save({
      id: CredentialGrantId(ids.newId()),
      tenantId,
      connectorId,
      grantedByUserId: userId,
      ...crypto.encrypt(tenantId, "ghp_secret"),
      expiresAt: null,
      createdAt: clock.now(),
      revokedAt: null,
    });
  });

  function makeExecuteTool(rateLimiter = new AlwaysAllowRateLimiter()) {
    return new ExecuteTool(installations, connectors, permissions, credentials, crypto, rateLimiter, invoker, recordAuditEvent);
  }

  it("runs a non-sensitive tool for an owner and records a success audit event", async () => {
    const useCase = makeExecuteTool();
    const result = await useCase.execute({
      tenantId,
      actorUserId: userId,
      actorRole: "owner",
      qualifiedToolName: "github.create_issue",
      params: { title: "Bug" },
    });

    expect(result.isError).toBe(false);
    expect(invoker.lastCall?.credentialSecret).toBe("ghp_secret");
    expect(auditEvents.rows).toHaveLength(1);
    expect(auditEvents.rows[0]?.outcome).toBe("success");
  });

  it("denies a member with no explicit permission and audits the denial", async () => {
    const useCase = makeExecuteTool();
    await expect(
      useCase.execute({
        tenantId,
        actorUserId: userId,
        actorRole: "member",
        qualifiedToolName: "github.create_issue",
        params: {},
      }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(auditEvents.rows[0]?.outcome).toBe("denied");
  });

  it("allows a member with an explicit Permission grant", async () => {
    await permissions.grant({ tenantId, userId, connectorId, grantedByUserId: userId, grantedAt: clock.now() });
    const useCase = makeExecuteTool();
    const result = await useCase.execute({
      tenantId,
      actorUserId: userId,
      actorRole: "member",
      qualifiedToolName: "github.create_issue",
      params: {},
    });
    expect(result.isError).toBe(false);
  });

  it("requires an explicit confirmation token for a sensitive tool", async () => {
    await connectors.save(githubConnector(true));
    const useCase = makeExecuteTool();

    await expect(
      useCase.execute({
        tenantId,
        actorUserId: userId,
        actorRole: "owner",
        qualifiedToolName: "github.delete_repository",
        params: {},
      }),
    ).rejects.toThrow(ConfirmationRequiredError);
    expect(auditEvents.rows[0]?.outcome).toBe("awaiting_confirmation");
    expect(invoker.lastCall).toBeNull();

    const result = await useCase.execute({
      tenantId,
      actorUserId: userId,
      actorRole: "owner",
      qualifiedToolName: "github.delete_repository",
      params: {},
      confirmationToken: "confirmed-by-user",
    });
    expect(result.isError).toBe(false);
    expect(invoker.lastCall?.toolName).toBe("delete_repository");
  });

  it("blocks execution once the tenant's rate limit is exhausted", async () => {
    const useCase = makeExecuteTool(new AlwaysDenyRateLimiter());
    await expect(
      useCase.execute({
        tenantId,
        actorUserId: userId,
        actorRole: "owner",
        qualifiedToolName: "github.create_issue",
        params: {},
      }),
    ).rejects.toThrow(RateLimitExceededError);
  });

  it("rejects a tool call for a connector that is not installed", async () => {
    const otherTenant = TenantId("tenant-2");
    const useCase = makeExecuteTool();
    await expect(
      useCase.execute({
        tenantId: otherTenant,
        actorUserId: userId,
        actorRole: "owner",
        qualifiedToolName: "github.create_issue",
        params: {},
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});
