import { desc, eq } from "drizzle-orm";
import { TenantId, WorkflowId, WorkflowRunId, type StepResult, type WorkflowRun, type WorkflowRunStatus } from "@omnimcp/core-domain";
import type { WorkflowRunRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { workflowRuns } from "../db/schema.js";

export class PostgresWorkflowRunRepository implements WorkflowRunRepository {
  constructor(private readonly db: Database) {}

  async save(run: WorkflowRun): Promise<void> {
    await this.db.insert(workflowRuns).values({
      id: run.id,
      workflowId: run.workflowId,
      tenantId: run.tenantId,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      stepResults: run.stepResults,
    });
  }

  async listByWorkflow(workflowId: WorkflowId, limit = 100): Promise<WorkflowRun[]> {
    const rows = await this.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.startedAt))
      .limit(limit);
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: typeof workflowRuns.$inferSelect): WorkflowRun {
    return Object.freeze({
      id: WorkflowRunId(row.id),
      workflowId: WorkflowId(row.workflowId),
      tenantId: TenantId(row.tenantId),
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      status: row.status as WorkflowRunStatus,
      stepResults: Object.freeze(row.stepResults as StepResult[]),
    });
  }
}
