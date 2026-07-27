import { and, eq, isNotNull, lte } from "drizzle-orm";
import { TenantId, UserId, WorkflowId, type Workflow, type WorkflowStep } from "@omnimcp/core-domain";
import type { WorkflowRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { workflows } from "../db/schema.js";

export class PostgresWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: Database) {}

  async findById(id: WorkflowId): Promise<Workflow | null> {
    const [row] = await this.db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    return row ? this.toEntity(row) : null;
  }

  async listByTenant(tenantId: TenantId): Promise<Workflow[]> {
    const rows = await this.db.select().from(workflows).where(eq(workflows.tenantId, tenantId));
    return rows.map((row) => this.toEntity(row));
  }

  async listDue(now: Date): Promise<Workflow[]> {
    const rows = await this.db
      .select()
      .from(workflows)
      .where(and(eq(workflows.enabled, true), isNotNull(workflows.nextRunAt), lte(workflows.nextRunAt, now)));
    return rows.map((row) => this.toEntity(row));
  }

  async save(workflow: Workflow): Promise<void> {
    await this.db
      .insert(workflows)
      .values({
        id: workflow.id,
        tenantId: workflow.tenantId,
        createdByUserId: workflow.createdByUserId,
        name: workflow.name,
        cronExpression: workflow.cronExpression,
        steps: workflow.steps,
        enabled: workflow.enabled,
        nextRunAt: workflow.nextRunAt,
        createdAt: workflow.createdAt,
      })
      .onConflictDoUpdate({
        target: workflows.id,
        set: {
          name: workflow.name,
          cronExpression: workflow.cronExpression,
          steps: workflow.steps,
          enabled: workflow.enabled,
          nextRunAt: workflow.nextRunAt,
        },
      });
  }

  async delete(id: WorkflowId): Promise<void> {
    await this.db.delete(workflows).where(eq(workflows.id, id));
  }

  private toEntity(row: typeof workflows.$inferSelect): Workflow {
    return Object.freeze({
      id: WorkflowId(row.id),
      tenantId: TenantId(row.tenantId),
      createdByUserId: UserId(row.createdByUserId),
      name: row.name,
      cronExpression: row.cronExpression,
      steps: Object.freeze(row.steps as WorkflowStep[]),
      enabled: row.enabled,
      nextRunAt: row.nextRunAt,
      createdAt: row.createdAt,
    });
  }
}
