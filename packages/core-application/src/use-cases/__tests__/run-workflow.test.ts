import { describe, expect, it } from "vitest";
import {
  ConnectorId,
  ConnectorInstallationId,
  createConnector,
  createUser,
  CredentialGrantId,
  TenantId,
  UserId,
  WorkflowId,
  type Workflow,
  type WorkflowStep,
} from "@omnimcp/core-domain";
import type { ConnectorToolResult } from "../../ports/services.js";
import { ExecuteTool } from "../execute-tool.js";
import { RecordAuditEvent } from "../record-audit-event.js";
import { RunWorkflow } from "../run-workflow.js";
import {
  AlwaysAllowRateLimiter,
  FakeConnectorInvoker,
  FixedClock,
  InMemoryAuditEventRepository,
  InMemoryConnectorInstallationRepository,
  InMemoryConnectorRepository,
  InMemoryCredentialGrantRepository,
  InMemoryPermissionRepository,
  InMemoryUserRepository,
  InMemoryWorkflowRunRepository,
  Sha256CryptoService,
  UuidIdGenerator,
} from "./test-doubles.js";

const tenantId = TenantId("tenant-1");
const ownerId = UserId("owner-1");
const connectorId = ConnectorId("github");

function step(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    qualifiedToolName: "github.create_issue",
    params: {},
    runIf: "always",
    confirmationToken: null,
    ...overrides,
  };
}

function workflow(steps: WorkflowStep[], overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: WorkflowId("wf-1"),
    tenantId,
    createdByUserId: ownerId,
    name: "Test workflow",
    cronExpression: null,
    steps,
    enabled: true,
    nextRunAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

/** Builds a fresh RunWorkflow (with its own ExecuteTool, connector catalog, installation, and credential) per test, so each test can control exactly what the connector invocation returns. */
async function setup(invokerResult: ConnectorToolResult = { isError: false, content: "ok" }) {
  const connectors = new InMemoryConnectorRepository();
  const installations = new InMemoryConnectorInstallationRepository();
  const permissions = new InMemoryPermissionRepository();
  const credentials = new InMemoryCredentialGrantRepository();
  const auditEvents = new InMemoryAuditEventRepository();
  const crypto = new Sha256CryptoService();
  const clock = new FixedClock();
  const ids = new UuidIdGenerator();
  const invoker = new FakeConnectorInvoker(invokerResult);
  const users = new InMemoryUserRepository();
  const workflowRuns = new InMemoryWorkflowRunRepository();

  await users.save(
    createUser({ id: ownerId, tenantId, email: "owner@omnimcp.ai", passwordHash: "hashed", role: "owner" }),
  );
  await connectors.save(
    createConnector({
      id: connectorId,
      displayName: "GitHub",
      version: "0.1.0",
      transport: { type: "stdio", command: "node", args: [] },
      auth: { type: "api_key", envVar: "GITHUB_TOKEN" },
      tools: [
        { name: "create_issue", description: "Create an issue", inputSchema: {}, sensitive: false },
        { name: "delete_repository", description: "Delete a repo", inputSchema: {}, sensitive: true },
      ],
    }),
  );
  await installations.save({
    id: ConnectorInstallationId(ids.newId()),
    tenantId,
    connectorId,
    installedByUserId: ownerId,
    config: {},
    installedAt: clock.now(),
    uninstalledAt: null,
  });
  await credentials.save({
    id: CredentialGrantId(ids.newId()),
    tenantId,
    connectorId,
    grantedByUserId: ownerId,
    ...crypto.encrypt(tenantId, "secret"),
    expiresAt: null,
    createdAt: clock.now(),
    revokedAt: null,
  });

  const recordAuditEvent = new RecordAuditEvent(auditEvents, crypto, ids, clock);
  const executeTool = new ExecuteTool(
    installations,
    connectors,
    permissions,
    credentials,
    crypto,
    new AlwaysAllowRateLimiter(),
    invoker,
    recordAuditEvent,
  );
  const runWorkflow = new RunWorkflow(users, executeTool, workflowRuns, ids, clock);
  return { runWorkflow, workflowRuns, users };
}

describe("RunWorkflow", () => {
  it("runs every step and reports success when all succeed", async () => {
    const { runWorkflow, workflowRuns } = await setup();
    const run = await runWorkflow.execute(workflow([step(), step()]));
    expect(run.status).toBe("success");
    expect(run.stepResults).toHaveLength(2);
    expect(run.stepResults.every((r) => r.outcome === "success")).toBe(true);
    expect(workflowRuns.rows).toHaveLength(1);
  });

  it("skips a step gated on previous_success once the previous step fails, and the skip cascades through 'always' downstream correctly", async () => {
    const { runWorkflow } = await setup({ isError: true, content: "boom" });
    const run = await runWorkflow.execute(
      workflow([
        step(), // fails (invoker returns isError: true)
        step({ runIf: "previous_success" }), // skipped: previous step failed
        step({ runIf: "always" }), // always runs regardless of the skip above
      ]),
    );
    expect(run.stepResults[0]?.outcome).toBe("error");
    expect(run.stepResults[1]?.outcome).toBe("skipped");
    expect(run.stepResults[2]?.outcome).toBe("error"); // same failing invoker, but it did run
  });

  it("runs a step gated on previous_failure only when the previous step actually failed", async () => {
    const { runWorkflow } = await setup({ isError: true, content: "boom" });
    const run = await runWorkflow.execute(workflow([step(), step({ runIf: "previous_failure" })]));
    expect(run.stepResults[0]?.outcome).toBe("error");
    expect(run.stepResults[1]?.outcome).toBe("error"); // ran, and also failed via the same invoker
  });

  it("marks the run partial_failure when some steps succeed and some don't", async () => {
    const { runWorkflow } = await setup();
    const run = await runWorkflow.execute(
      workflow([step({ qualifiedToolName: "github.create_issue" }), step({ qualifiedToolName: "github.unknown_tool" })]),
    );
    expect(run.stepResults[0]?.outcome).toBe("success");
    expect(run.stepResults[1]?.outcome).toBe("error");
    expect(run.status).toBe("partial_failure");
  });

  it("errors out every step when the workflow creator no longer exists", async () => {
    const { runWorkflow } = await setup();
    const run = await runWorkflow.execute(workflow([step()], { createdByUserId: UserId("ghost") }));
    expect(run.status).toBe("failure");
    expect(run.stepResults[0]?.errorMessage).toMatch(/no longer exists/);
  });

  it("runs a sensitive step because CreateWorkflow already captured its confirmation token", async () => {
    const { runWorkflow } = await setup();
    const run = await runWorkflow.execute(
      workflow([
        step({ qualifiedToolName: "github.delete_repository", confirmationToken: "confirmed-at-workflow-creation" }),
      ]),
    );
    expect(run.stepResults[0]?.outcome).toBe("success");
  });
});
