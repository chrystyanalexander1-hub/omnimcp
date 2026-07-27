import {
  canManageConnectors,
  ConfirmationRequiredError,
  ConnectorId,
  createWorkflow,
  findTool,
  InvalidEntityError,
  NotFoundError,
  PermissionDeniedError,
  splitQualifiedToolName,
  WorkflowId,
  type Role,
  type StepRunCondition,
  type TenantId,
  type UserId,
  type Workflow,
  type WorkflowStep,
} from "@omnimcp/core-domain";
import type { ConnectorRepository, WorkflowRepository } from "../ports/repositories.js";
import type { Clock, CronScheduler, IdGenerator } from "../ports/services.js";

/** Fixed marker, not a real per-call secret — the authorization it represents was already given once, explicitly, when this step was added to the workflow (see CreateWorkflow). */
const SENSITIVE_STEP_CONFIRMATION_TOKEN = "confirmed-at-workflow-creation";

export interface CreateWorkflowStepInput {
  readonly qualifiedToolName: string;
  readonly params: Record<string, unknown>;
  readonly runIf?: StepRunCondition;
  /** Must be true if the referenced tool is sensitive — the explicit, one-time authorization for this step to run unattended on a schedule. */
  readonly confirmSensitive?: boolean;
}

export interface CreateWorkflowInput {
  readonly tenantId: TenantId;
  readonly createdByUserId: UserId;
  readonly createdByRole: Role;
  readonly name: string;
  readonly cronExpression?: string | null;
  readonly steps: readonly CreateWorkflowStepInput[];
}

export class CreateWorkflow {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly connectors: ConnectorRepository,
    private readonly cronScheduler: CronScheduler,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateWorkflowInput): Promise<Workflow> {
    if (!canManageConnectors(input.createdByRole)) {
      throw new PermissionDeniedError("Only tenant owners/admins can create automations");
    }
    if (input.cronExpression && !this.cronScheduler.isValid(input.cronExpression)) {
      throw new InvalidEntityError(`Invalid cron expression: ${input.cronExpression}`);
    }

    const steps: WorkflowStep[] = [];
    for (const stepInput of input.steps) {
      const { connectorId, toolName } = splitQualifiedToolName(stepInput.qualifiedToolName);
      const connector = await this.connectors.findById(ConnectorId(connectorId));
      if (!connector) {
        throw new NotFoundError(`Unknown connector: ${connectorId}`);
      }
      const tool = findTool(connector, toolName);
      if (!tool) {
        throw new NotFoundError(`Unknown tool: ${stepInput.qualifiedToolName}`);
      }
      if (tool.sensitive && !stepInput.confirmSensitive) {
        throw new ConfirmationRequiredError(
          `Step "${stepInput.qualifiedToolName}" is sensitive — pass confirmSensitive: true on this step to explicitly authorize the workflow to run it unattended`,
        );
      }

      steps.push({
        qualifiedToolName: stepInput.qualifiedToolName,
        params: Object.freeze({ ...stepInput.params }),
        runIf: stepInput.runIf ?? "always",
        confirmationToken: tool.sensitive ? SENSITIVE_STEP_CONFIRMATION_TOKEN : null,
      });
    }

    const now = this.clock.now();
    const workflow = createWorkflow({
      id: WorkflowId(this.ids.newId()),
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      name: input.name,
      cronExpression: input.cronExpression ?? null,
      steps,
      nextRunAt: input.cronExpression ? this.cronScheduler.nextRunAt(input.cronExpression, now) : null,
      createdAt: now,
    });
    await this.workflows.save(workflow);
    return workflow;
  }
}
