import type { WorkflowRepository } from "../ports/repositories.js";
import type { Clock, CronScheduler } from "../ports/services.js";
import type { RunWorkflow } from "./run-workflow.js";

/** What apps/automation-worker polls periodically — finds every enabled workflow whose scheduled time has arrived, runs it, and reschedules it. */
export class RunDueWorkflows {
  constructor(
    private readonly workflows: WorkflowRepository,
    private readonly runWorkflow: RunWorkflow,
    private readonly cronScheduler: CronScheduler,
    private readonly clock: Clock,
  ) {}

  /** Returns how many workflows were run, for the caller to log. */
  async execute(): Promise<number> {
    const now = this.clock.now();
    const due = await this.workflows.listDue(now);

    for (const workflow of due) {
      await this.runWorkflow.execute(workflow);
      if (workflow.cronExpression) {
        await this.workflows.save({ ...workflow, nextRunAt: this.cronScheduler.nextRunAt(workflow.cronExpression, now) });
      }
    }

    return due.length;
  }
}
