import {
  shouldRunStep,
  summarizeRunStatus,
  WorkflowRunId,
  type StepOutcome,
  type StepResult,
  type Workflow,
  type WorkflowRun,
} from "@omnimcp/core-domain";
import type { UserRepository, WorkflowRunRepository } from "../ports/repositories.js";
import type { Clock, IdGenerator } from "../ports/services.js";
import type { ExecuteTool } from "./execute-tool.js";

/**
 * Runs every step of a workflow in order, reusing ExecuteTool as-is for each one —
 * permission checks, credential decryption, rate limiting, and audit logging all
 * happen exactly as they would for a manual call, because this literally *is* a
 * manual call made on the workflow creator's behalf. The only things this use case
 * adds are: resolving that creator's *current* role (not a stale snapshot — see
 * class doc below), sequencing, and the `runIf` gate between steps.
 */
export class RunWorkflow {
  constructor(
    private readonly users: UserRepository,
    private readonly executeTool: ExecuteTool,
    private readonly workflowRuns: WorkflowRunRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(workflow: Workflow): Promise<WorkflowRun> {
    const startedAt = this.clock.now();
    const stepResults: StepResult[] = [];

    // Re-fetched live, not stored on the workflow — if the creator's role was
    // downgraded or their account removed after this workflow was created,
    // ExecuteTool must see that change immediately, the same as it would for any
    // manual call this person made today.
    const actor = await this.users.findById(workflow.createdByUserId);

    if (!actor) {
      for (const step of workflow.steps) {
        stepResults.push({
          qualifiedToolName: step.qualifiedToolName,
          outcome: "error",
          errorMessage: "Workflow creator no longer exists",
        });
      }
    } else {
      let previousOutcome: StepOutcome | null = null;
      for (const step of workflow.steps) {
        if (!shouldRunStep(step.runIf, previousOutcome)) {
          stepResults.push({ qualifiedToolName: step.qualifiedToolName, outcome: "skipped", errorMessage: null });
          previousOutcome = "skipped";
          continue;
        }

        try {
          const result = await this.executeTool.execute({
            tenantId: workflow.tenantId,
            actorUserId: actor.id,
            actorRole: actor.role,
            qualifiedToolName: step.qualifiedToolName,
            params: step.params,
            confirmationToken: step.confirmationToken,
          });
          const outcome: StepOutcome = result.isError ? "error" : "success";
          stepResults.push({
            qualifiedToolName: step.qualifiedToolName,
            outcome,
            errorMessage: result.isError ? String(result.content) : null,
          });
          previousOutcome = outcome;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          stepResults.push({ qualifiedToolName: step.qualifiedToolName, outcome: "error", errorMessage: message });
          previousOutcome = "error";
        }
      }
    }

    const run: WorkflowRun = Object.freeze({
      id: WorkflowRunId(this.ids.newId()),
      workflowId: workflow.id,
      tenantId: workflow.tenantId,
      startedAt,
      finishedAt: this.clock.now(),
      status: summarizeRunStatus(stepResults),
      stepResults: Object.freeze(stepResults),
    });
    await this.workflowRuns.save(run);
    return run;
  }
}
