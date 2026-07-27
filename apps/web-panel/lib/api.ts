const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {}

interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly token?: string;
  readonly body?: unknown;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json && typeof json === "object" && "error" in json ? String(json.error) : null) ?? `Error HTTP ${res.status}`;
    throw new ApiError(message);
  }
  return json as T;
}

export function apiBaseUrl(): string {
  return API_BASE;
}

// --- Auth ---

export interface LoginResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: { readonly id: string; readonly email: string; readonly role: "owner" | "admin" | "member" };
}

export async function login(tenantId: string, email: string, password: string): Promise<LoginResult> {
  return apiFetch<LoginResult>("/auth/login", { method: "POST", body: { tenantId, email, password } });
}

// --- Connectors ---

export interface ConnectorSummary {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly authType: "api_key" | "oauth2" | "none";
  readonly tools: ReadonlyArray<{ name: string; description: string; sensitive: boolean }>;
}

export async function listConnectors(token: string): Promise<ConnectorSummary[]> {
  return apiFetch("/connectors", { token });
}

export async function installConnector(token: string, connectorId: string): Promise<{ id: string; installedAt: string }> {
  return apiFetch(`/connectors/${connectorId}/install`, { method: "POST", token, body: {} });
}

export async function grantCredential(token: string, connectorId: string, secret: string): Promise<{ id: string }> {
  return apiFetch(`/connectors/${connectorId}/credentials`, { method: "POST", token, body: { secret } });
}

export async function revokeCredential(token: string, connectorId: string): Promise<void> {
  return apiFetch(`/connectors/${connectorId}/credentials`, { method: "DELETE", token });
}

export async function startOAuth(token: string, connectorId: string): Promise<{ authorizationUrl: string }> {
  return apiFetch(`/connectors/${connectorId}/oauth/start`, { token });
}

// --- Tools ---

export interface ToolSummary {
  readonly name: string;
  readonly sensitive: boolean;
  readonly description: string;
}

export async function listTools(token: string): Promise<ToolSummary[]> {
  return apiFetch("/tools", { token });
}

export interface ExecuteToolResult {
  readonly isError: boolean;
  readonly content: unknown;
}

export async function executeTool(
  token: string,
  qualifiedToolName: string,
  params: Record<string, unknown>,
  confirmationToken?: string,
): Promise<ExecuteToolResult> {
  return apiFetch("/tools/execute", {
    method: "POST",
    token,
    body: { qualifiedToolName, params, ...(confirmationToken ? { confirmationToken } : {}) },
  });
}

// --- Workflows ---

export interface WorkflowStepDto {
  readonly qualifiedToolName: string;
  readonly params: Record<string, unknown>;
  readonly runIf: string;
  readonly confirmationToken: string | null;
}

export interface WorkflowDto {
  readonly id: string;
  readonly tenantId: string;
  readonly createdByUserId: string;
  readonly name: string;
  readonly cronExpression: string | null;
  readonly steps: readonly WorkflowStepDto[];
  readonly enabled: boolean;
  readonly nextRunAt: string | null;
  readonly createdAt: string;
}

export async function listWorkflows(token: string): Promise<WorkflowDto[]> {
  return apiFetch("/workflows", { token });
}

export interface CreateWorkflowStepInput {
  readonly qualifiedToolName: string;
  readonly params: Record<string, unknown>;
  readonly runIf?: string;
  readonly confirmSensitive?: boolean;
}

export async function createWorkflow(
  token: string,
  name: string,
  cronExpression: string | undefined,
  steps: readonly CreateWorkflowStepInput[],
): Promise<WorkflowDto> {
  return apiFetch("/workflows", {
    method: "POST",
    token,
    body: { name, ...(cronExpression ? { cronExpression } : {}), steps },
  });
}

export async function runWorkflowNow(token: string, workflowId: string): Promise<WorkflowRunDto> {
  return apiFetch(`/workflows/${workflowId}/run`, { method: "POST", token });
}

export async function toggleWorkflow(token: string, workflowId: string, enabled: boolean): Promise<void> {
  return apiFetch(`/workflows/${workflowId}`, { method: "PATCH", token, body: { enabled } });
}

export async function deleteWorkflow(token: string, workflowId: string): Promise<void> {
  return apiFetch(`/workflows/${workflowId}`, { method: "DELETE", token });
}

export interface WorkflowRunDto {
  readonly id: string;
  readonly workflowId: string;
  readonly tenantId: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: "success" | "partial_failure" | "failure";
  readonly stepResults: ReadonlyArray<{
    qualifiedToolName: string;
    outcome: "success" | "error" | "skipped";
    errorMessage: string | null;
  }>;
}

export async function listWorkflowRuns(token: string, workflowId: string): Promise<WorkflowRunDto[]> {
  return apiFetch(`/workflows/${workflowId}/runs`, { token });
}

// --- Audit ---

export interface AuditEventDto {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly qualifiedToolName: string;
  readonly paramsHash: string;
  readonly outcome: string;
  readonly errorMessage: string | null;
  readonly occurredAt: string;
}

export async function listAudit(token: string): Promise<AuditEventDto[]> {
  return apiFetch("/audit", { token });
}
