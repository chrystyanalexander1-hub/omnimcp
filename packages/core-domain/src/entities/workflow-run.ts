import { TenantId, WorkflowId, WorkflowRunId } from "../ids.js";

export type StepOutcome = "success" | "error" | "skipped";
export type WorkflowRunStatus = "success" | "partial_failure" | "failure";

export interface StepResult {
  readonly qualifiedToolName: string;
  readonly outcome: StepOutcome;
  readonly errorMessage: string | null;
}

export interface WorkflowRun {
  readonly id: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly tenantId: TenantId;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly status: WorkflowRunStatus;
  readonly stepResults: readonly StepResult[];
}

/** success if every non-skipped step succeeded, failure if none did, partial_failure otherwise. */
export function summarizeRunStatus(stepResults: readonly StepResult[]): WorkflowRunStatus {
  const attempted = stepResults.filter((r) => r.outcome !== "skipped");
  if (attempted.length === 0) return "success";
  const succeeded = attempted.filter((r) => r.outcome === "success").length;
  if (succeeded === attempted.length) return "success";
  if (succeeded === 0) return "failure";
  return "partial_failure";
}
