import { beforeEach, describe, expect, it } from "vitest";
import { ConfirmationRequiredError, ConnectorId, createConnector, InvalidEntityError, PermissionDeniedError, TenantId, UserId } from "@omnimcp/core-domain";
import { CreateWorkflow } from "../create-workflow.js";
import { FakeCronScheduler, InMemoryConnectorRepository, InMemoryWorkflowRepository, FixedClock, UuidIdGenerator } from "./test-doubles.js";

const tenantId = TenantId("tenant-1");
const userId = UserId("owner-1");
const connectorId = ConnectorId("github");

describe("CreateWorkflow", () => {
  let connectors: InMemoryConnectorRepository;
  let workflows: InMemoryWorkflowRepository;
  let createWorkflow: CreateWorkflow;

  beforeEach(async () => {
    connectors = new InMemoryConnectorRepository();
    workflows = new InMemoryWorkflowRepository();
    createWorkflow = new CreateWorkflow(workflows, connectors, new FakeCronScheduler(), new UuidIdGenerator(), new FixedClock());

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
  });

  it("creates a workflow with a non-sensitive step, no confirmation needed", async () => {
    const workflow = await createWorkflow.execute({
      tenantId,
      createdByUserId: userId,
      createdByRole: "owner",
      name: "Daily issue triage",
      steps: [{ qualifiedToolName: "github.create_issue", params: { title: "x" } }],
    });
    expect(workflow.steps[0]?.confirmationToken).toBeNull();
  });

  it("rejects a sensitive step that wasn't explicitly confirmed", async () => {
    await expect(
      createWorkflow.execute({
        tenantId,
        createdByUserId: userId,
        createdByRole: "owner",
        name: "Cleanup",
        steps: [{ qualifiedToolName: "github.delete_repository", params: {} }],
      }),
    ).rejects.toThrow(ConfirmationRequiredError);
  });

  it("captures a confirmation token for a sensitive step when explicitly confirmed", async () => {
    const workflow = await createWorkflow.execute({
      tenantId,
      createdByUserId: userId,
      createdByRole: "owner",
      name: "Cleanup",
      steps: [{ qualifiedToolName: "github.delete_repository", params: {}, confirmSensitive: true }],
    });
    expect(workflow.steps[0]?.confirmationToken).toBe("confirmed-at-workflow-creation");
  });

  it("rejects creation by a member (only owner/admin can create automations)", async () => {
    await expect(
      createWorkflow.execute({
        tenantId,
        createdByUserId: userId,
        createdByRole: "member",
        name: "wf",
        steps: [{ qualifiedToolName: "github.create_issue", params: {} }],
      }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("rejects an invalid cron expression", async () => {
    await expect(
      createWorkflow.execute({
        tenantId,
        createdByUserId: userId,
        createdByRole: "owner",
        name: "wf",
        cronExpression: "invalid-cron",
        steps: [{ qualifiedToolName: "github.create_issue", params: {} }],
      }),
    ).rejects.toThrow(InvalidEntityError);
  });

  it("computes nextRunAt from the cron scheduler when a valid cron expression is given", async () => {
    const workflow = await createWorkflow.execute({
      tenantId,
      createdByUserId: userId,
      createdByRole: "owner",
      name: "wf",
      cronExpression: "* * * * *",
      steps: [{ qualifiedToolName: "github.create_issue", params: {} }],
    });
    expect(workflow.nextRunAt).not.toBeNull();
    await expect(workflows.listByTenant(tenantId)).resolves.toHaveLength(1);
  });
});
