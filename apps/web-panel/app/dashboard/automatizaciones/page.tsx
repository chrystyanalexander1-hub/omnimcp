"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  createWorkflow,
  deleteWorkflow,
  listTools,
  listWorkflowRuns,
  listWorkflows,
  runWorkflowNow,
  toggleWorkflow,
  type CreateWorkflowStepInput,
  type ToolSummary,
  type WorkflowDto,
  type WorkflowRunDto,
} from "../../../lib/api";
import { getSession } from "../../../lib/session";
import ParamsForm, { defaultParamsFrom } from "../../../components/ParamsForm";

export default function AutomatizacionesPage() {
  const [workflows, setWorkflows] = useState<WorkflowDto[] | null>(null);
  const [tools, setTools] = useState<ToolSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [runsById, setRunsById] = useState<Record<string, WorkflowRunDto[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [steps, setSteps] = useState<CreateWorkflowStepInput[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [advancedMode, setAdvancedMode] = useState(false);
  const [advancedText, setAdvancedText] = useState("[]");

  const [stepTool, setStepTool] = useState("");
  const [stepParams, setStepParams] = useState<Record<string, unknown>>({});
  const [stepConfirmSensitive, setStepConfirmSensitive] = useState(false);

  const token = getSession()?.accessToken ?? "";

  async function refresh() {
    try {
      setWorkflows(await listWorkflows(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar las automatizaciones.");
    }
  }

  useEffect(() => {
    refresh();
    listTools(token)
      .then((list) => {
        setTools(list);
        if (list.length > 0) {
          setStepTool(list[0]!.name);
          setStepParams(defaultParamsFrom(list[0]!.inputSchema));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las herramientas."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStepTool = tools?.find((t) => t.name === stepTool);

  function handleSelectStepTool(toolName: string) {
    setStepTool(toolName);
    const tool = tools?.find((t) => t.name === toolName);
    setStepParams(defaultParamsFrom(tool?.inputSchema));
    setStepConfirmSensitive(false);
  }

  function handleAddStep() {
    setSteps((prev) => [
      ...prev,
      {
        qualifiedToolName: stepTool,
        params: stepParams,
        ...(selectedStepTool?.sensitive && stepConfirmSensitive ? { confirmSensitive: true } : {}),
      },
    ]);
    const tool = tools?.find((t) => t.name === stepTool);
    setStepParams(defaultParamsFrom(tool?.inputSchema));
    setStepConfirmSensitive(false);
  }

  function handleRemoveStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function handleMoveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function toggleAdvanced() {
    if (!advancedMode) {
      setAdvancedText(JSON.stringify(steps, null, 2));
      setAdvancedMode(true);
      return;
    }
    try {
      const parsed = JSON.parse(advancedText);
      setSteps(Array.isArray(parsed) ? parsed : []);
      setAdvancedMode(false);
    } catch {
      setCreateError("Los pasos no son un JSON válido — corregilo antes de volver al formulario.");
    }
  }

  async function handleCreate() {
    setCreateError(null);

    let finalSteps: CreateWorkflowStepInput[];
    if (advancedMode) {
      try {
        finalSteps = JSON.parse(advancedText);
      } catch {
        setCreateError("Los pasos no son un JSON válido.");
        return;
      }
    } else {
      finalSteps = steps;
    }

    if (finalSteps.length === 0) {
      setCreateError("Agregá al menos un paso.");
      return;
    }

    setCreating(true);
    try {
      await createWorkflow(token, name, cronExpression.trim() || undefined, finalSteps);
      setName("");
      setCronExpression("");
      setSteps([]);
      setAdvancedText("[]");
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Error al crear la automatización.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRunNow(id: string) {
    setBusyId(id);
    try {
      const run = await runWorkflowNow(token, id);
      setStatusById((s) => ({ ...s, [id]: `Corrida terminada: ${run.status}` }));
      await refresh();
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al ejecutar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(wf: WorkflowDto) {
    setBusyId(wf.id);
    try {
      await toggleWorkflow(token, wf.id, !wf.enabled);
      await refresh();
    } catch (err) {
      setStatusById((s) => ({ ...s, [wf.id]: err instanceof ApiError ? err.message : "Error al cambiar el estado." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteWorkflow(token, id);
      await refresh();
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al borrar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleRuns(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!runsById[id]) {
      try {
        const runs = await listWorkflowRuns(token, id);
        setRunsById((r) => ({ ...r, [id]: runs }));
      } catch (err) {
        setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al cargar el historial." }));
      }
    }
  }

  return (
    <section>
      <h2>Automatizaciones</h2>
      <p className="hint">
        Un flujo ejecuta una o más tools en orden, solo o programado por horario (cron).
      </p>

      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Crear automatización</h3>
        {createError && <div className="error-box">{createError}</div>}
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cron">Horario cron (opcional — vacío = solo manual)</label>
          <input
            id="cron"
            type="text"
            placeholder="ej: 0 9 * * * (todos los días a las 9am)"
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
          <button className="secondary" onClick={toggleAdvanced} type="button">
            {advancedMode ? "Volver al formulario" : "Modo avanzado (JSON)"}
          </button>
        </div>

        {advancedMode ? (
          <div className="field">
            <label htmlFor="steps">Pasos (JSON)</label>
            <textarea id="steps" value={advancedText} onChange={(e) => setAdvancedText(e.target.value)} />
            <span className="hint">
              Si un paso usa una tool sensible, agregale &quot;confirmSensitive&quot;: true.
            </span>
          </div>
        ) : (
          <>
            {steps.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="card"
                    style={{ padding: "0.75rem 1rem", marginBottom: "0.5rem", background: "#f9fafb" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong>
                        {i + 1}. {s.qualifiedToolName} {s.confirmSensitive ? "⚠️" : ""}
                      </strong>
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button className="secondary" type="button" onClick={() => handleMoveStep(i, -1)} disabled={i === 0}>
                          ↑
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => handleMoveStep(i, 1)}
                          disabled={i === steps.length - 1}
                        >
                          ↓
                        </button>
                        <button className="danger" type="button" onClick={() => handleRemoveStep(i)}>
                          Quitar
                        </button>
                      </div>
                    </div>
                    {Object.keys(s.params).length > 0 && (
                      <span className="hint">{JSON.stringify(s.params)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tools && tools.length > 0 ? (
              <div style={{ border: "1px dashed #ccc", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
                <div className="field">
                  <label htmlFor="stepTool">Agregar paso — Tool</label>
                  <select id="stepTool" value={stepTool} onChange={(e) => handleSelectStepTool(e.target.value)}>
                    {tools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name} {t.sensitive ? "⚠️" : ""}
                      </option>
                    ))}
                  </select>
                  {selectedStepTool && <span className="hint">{selectedStepTool.description}</span>}
                </div>

                <ParamsForm schema={selectedStepTool?.inputSchema} value={stepParams} onChange={setStepParams} />

                {selectedStepTool?.sensitive && (
                  <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      id="stepConfirm"
                      checked={stepConfirmSensitive}
                      onChange={(e) => setStepConfirmSensitive(e.target.checked)}
                    />
                    <label htmlFor="stepConfirm" style={{ margin: 0 }}>
                      Confirmo esta acción sensible para cada corrida futura de esta automatización.
                    </label>
                  </div>
                )}

                <button
                  type="button"
                  className="secondary"
                  onClick={handleAddStep}
                  disabled={!stepTool || (selectedStepTool?.sensitive && !stepConfirmSensitive)}
                >
                  Agregar este paso
                </button>
              </div>
            ) : (
              <p className="hint">No hay tools disponibles — instalá un conector primero.</p>
            )}
          </>
        )}

        <button onClick={handleCreate} disabled={creating || !name.trim()}>
          {creating ? "Creando…" : "Crear"}
        </button>
      </div>

      {!workflows && !error && <p>Cargando…</p>}
      {workflows?.length === 0 && <p className="hint">Todavía no creaste ninguna automatización.</p>}

      {workflows?.map((wf) => (
        <div key={wf.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <strong>{wf.name}</strong>{" "}
              <span className="hint">
                ({wf.cronExpression ?? "solo manual"}
                {wf.nextRunAt ? ` · próxima: ${new Date(wf.nextRunAt).toLocaleString()}` : ""})
              </span>
            </div>
            <span className={`badge ${wf.enabled ? "success" : "warn"}`}>{wf.enabled ? "Activo" : "Pausado"}</span>
          </div>

          <p className="hint" style={{ marginTop: "0.5rem" }}>
            {wf.steps.map((s) => s.qualifiedToolName).join(" → ")}
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <button disabled={busyId === wf.id} onClick={() => handleRunNow(wf.id)}>
              Ejecutar ahora
            </button>
            <button className="secondary" disabled={busyId === wf.id} onClick={() => handleToggle(wf)}>
              {wf.enabled ? "Pausar" : "Activar"}
            </button>
            <button className="secondary" onClick={() => handleToggleRuns(wf.id)}>
              {expandedId === wf.id ? "Ocultar historial" : "Ver historial"}
            </button>
            <button className="danger" disabled={busyId === wf.id} onClick={() => handleDelete(wf.id)}>
              Borrar
            </button>
          </div>

          {statusById[wf.id] && <p className="hint" style={{ marginTop: "0.5rem" }}>{statusById[wf.id]}</p>}

          {expandedId === wf.id && (
            <table style={{ marginTop: "0.75rem" }}>
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Estado</th>
                  <th>Pasos</th>
                </tr>
              </thead>
              <tbody>
                {(runsById[wf.id] ?? []).map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.startedAt).toLocaleString()}</td>
                    <td>
                      <span
                        className={`badge ${run.status === "success" ? "success" : run.status === "failure" ? "error" : "warn"}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>
                      {run.stepResults.map((r, i) => (
                        <div key={i}>
                          {r.qualifiedToolName}: {r.outcome}
                          {r.errorMessage ? ` (${r.errorMessage})` : ""}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {(runsById[wf.id] ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="hint">
                      Todavía no corrió ninguna vez.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </section>
  );
}
