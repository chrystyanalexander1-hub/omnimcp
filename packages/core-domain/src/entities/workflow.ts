import { InvalidEntityError } from "../errors.js";
import { TenantId, UserId, WorkflowId } from "../ids.js";

/** Gates whether a step runs based on the immediately preceding step's outcome — the minimal "conditional action" needed without a full expression language. */
export type StepRunCondition = "always" | "previous_success" | "previous_failure";

export interface WorkflowStep {
  readonly qualifiedToolName: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly runIf: StepRunCondition;
  /**
   * Required (non-null) when the referenced tool is `sensitive`. Captured once, by
   * an owner/admin, at the moment this step is added to the workflow — that act of
   * creation *is* the explicit human authorization ExecuteTool requires, so an
   * unattended scheduled run can reuse it without ever silently approving itself.
   */
  readonly confirmationToken: string | null;
}

export interface Workflow {
  readonly id: WorkflowId;
  readonly tenantId: TenantId;
  readonly createdByUserId: UserId;
  readonly name: string;
  /** null means "manual trigger only" — no schedule. */
  readonly cronExpression: string | null;
  readonly steps: readonly WorkflowStep[];
  readonly enabled: boolean;
  readonly nextRunAt: Date | null;
  readonly createdAt: Date;
}

export function createWorkflow(input: {
  id: WorkflowId;
  tenantId: TenantId;
  createdByUserId: UserId;
  name: string;
  cronExpression: string | null;
  steps: readonly WorkflowStep[];
  enabled?: boolean;
  nextRunAt?: Date | null;
  createdAt?: Date;
}): Workflow {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new InvalidEntityError("Workflow name must be at least 2 characters long");
  }
  if (input.steps.length === 0) {
    throw new InvalidEntityError("Workflow must have at least one step");
  }
  return Object.freeze({
    id: input.id,
    tenantId: input.tenantId,
    createdByUserId: input.createdByUserId,
    name,
    cronExpression: input.cronExpression,
    steps: Object.freeze(input.steps.map((s) => Object.freeze({ ...s }))),
    enabled: input.enabled ?? true,
    nextRunAt: input.nextRunAt ?? null,
    createdAt: input.createdAt ?? new Date(),
  });
}

export function shouldRunStep(runIf: StepRunCondition, previousOutcome: "success" | "error" | "skipped" | null): boolean {
  if (runIf === "always" || previousOutcome === null) return true;
  if (runIf === "previous_success") return previousOutcome === "success";
  return previousOutcome === "error"; // previous_failure
}
