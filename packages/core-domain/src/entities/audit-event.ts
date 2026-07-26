import { AuditEventId, TenantId, UserId } from "../ids.js";

export type AuditOutcome = "success" | "denied" | "error" | "awaiting_confirmation";

/**
 * Immutable, append-only record of every tool execution attempt. Written by
 * RecordAuditEvent regardless of outcome, including denials, so the audit trail
 * proves what was blocked, not only what ran.
 */
export interface AuditEvent {
  readonly id: AuditEventId;
  readonly tenantId: TenantId;
  readonly actorUserId: UserId;
  readonly qualifiedToolName: string;
  /** SHA-256 hash of the JSON-stringified params — never the raw params, which may contain secrets. */
  readonly paramsHash: string;
  readonly outcome: AuditOutcome;
  readonly errorMessage: string | null;
  readonly occurredAt: Date;
}
