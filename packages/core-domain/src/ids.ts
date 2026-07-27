/** Branded string IDs so a TenantId can never be passed where a UserId is expected. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type SessionId = Brand<string, "SessionId">;
export type ApiKeyId = Brand<string, "ApiKeyId">;
export type ConnectorId = Brand<string, "ConnectorId">;
export type ConnectorInstallationId = Brand<string, "ConnectorInstallationId">;
export type CredentialGrantId = Brand<string, "CredentialGrantId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type WorkflowId = Brand<string, "WorkflowId">;
export type WorkflowRunId = Brand<string, "WorkflowRunId">;

const asBrand = <T extends string>(value: string): Brand<string, T> => value as Brand<string, T>;

export const TenantId = (value: string): TenantId => asBrand<"TenantId">(value);
export const UserId = (value: string): UserId => asBrand<"UserId">(value);
export const SessionId = (value: string): SessionId => asBrand<"SessionId">(value);
export const ApiKeyId = (value: string): ApiKeyId => asBrand<"ApiKeyId">(value);
export const ConnectorId = (value: string): ConnectorId => asBrand<"ConnectorId">(value);
export const ConnectorInstallationId = (value: string): ConnectorInstallationId =>
  asBrand<"ConnectorInstallationId">(value);
export const CredentialGrantId = (value: string): CredentialGrantId =>
  asBrand<"CredentialGrantId">(value);
export const AuditEventId = (value: string): AuditEventId => asBrand<"AuditEventId">(value);
export const WorkflowId = (value: string): WorkflowId => asBrand<"WorkflowId">(value);
export const WorkflowRunId = (value: string): WorkflowRunId => asBrand<"WorkflowRunId">(value);
