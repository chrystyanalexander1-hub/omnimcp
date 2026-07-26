import { desc, eq } from "drizzle-orm";
import { AuditEventId, TenantId, UserId, type AuditEvent, type AuditOutcome } from "@omnimcp/core-domain";
import type { AuditEventRepository } from "@omnimcp/core-application";
import type { Database } from "../db/client.js";
import { auditEvents } from "../db/schema.js";

export class PostgresAuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: Database) {}

  async save(event: AuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values({
      id: event.id,
      tenantId: event.tenantId,
      actorUserId: event.actorUserId,
      qualifiedToolName: event.qualifiedToolName,
      paramsHash: event.paramsHash,
      outcome: event.outcome,
      errorMessage: event.errorMessage,
      occurredAt: event.occurredAt,
    });
  }

  async listByTenant(tenantId: TenantId, limit = 100): Promise<AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit);
    return rows.map((row) => this.toEntity(row));
  }

  private toEntity(row: typeof auditEvents.$inferSelect): AuditEvent {
    return Object.freeze({
      id: AuditEventId(row.id),
      tenantId: TenantId(row.tenantId),
      actorUserId: UserId(row.actorUserId),
      qualifiedToolName: row.qualifiedToolName,
      paramsHash: row.paramsHash,
      outcome: row.outcome as AuditOutcome,
      errorMessage: row.errorMessage,
      occurredAt: row.occurredAt,
    });
  }
}
