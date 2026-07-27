"use client";

import { useEffect, useState } from "react";
import { ApiError, type ExecuteToolResult, executeTool, listTools, type ToolSummary } from "../../../lib/api";
import { getSession } from "../../../lib/session";

const CONFIRMATION_TOKEN = "confirmed-via-web-panel";

export default function HerramientasPage() {
  const [tools, setTools] = useState<ToolSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [paramsText, setParamsText] = useState("{}");
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecuteToolResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const token = getSession()?.accessToken ?? "";

  useEffect(() => {
    listTools(token)
      .then((list) => {
        setTools(list);
        if (list.length > 0) setSelected(list[0]!.name);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las herramientas."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTool = tools?.find((t) => t.name === selected);

  async function handleRun() {
    setRunError(null);
    setResult(null);
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText);
    } catch {
      setRunError("Los parámetros no son un JSON válido.");
      return;
    }

    setRunning(true);
    try {
      const res = await executeTool(
        token,
        selected,
        params,
        selectedTool?.sensitive && confirmSensitive ? CONFIRMATION_TOKEN : undefined,
      );
      setResult(res);
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : "Error al ejecutar la herramienta.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h2>Herramientas</h2>
      <p className="hint">Elegí una tool instalada, escribí sus parámetros en JSON, y ejecutala.</p>

      {error && <div className="error-box">{error}</div>}
      {!tools && !error && <p>Cargando…</p>}

      {tools && tools.length === 0 && <p className="hint">No hay tools disponibles — instalá un conector primero.</p>}

      {tools && tools.length > 0 && (
        <div className="card">
          <div className="field">
            <label htmlFor="tool">Tool</label>
            <select
              id="tool"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConfirmSensitive(false);
                setResult(null);
                setRunError(null);
              }}
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} {t.sensitive ? "⚠️" : ""}
                </option>
              ))}
            </select>
            {selectedTool && <span className="hint">{selectedTool.description}</span>}
          </div>

          <div className="field">
            <label htmlFor="params">Parámetros (JSON)</label>
            <textarea id="params" value={paramsText} onChange={(e) => setParamsText(e.target.value)} />
          </div>

          {selectedTool?.sensitive && (
            <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                id="confirm"
                checked={confirmSensitive}
                onChange={(e) => setConfirmSensitive(e.target.checked)}
              />
              <label htmlFor="confirm" style={{ margin: 0 }}>
                Esta acción es sensible (puede ser irreversible o costar dinero) — confirmo que quiero ejecutarla.
              </label>
            </div>
          )}

          <button onClick={handleRun} disabled={running || (selectedTool?.sensitive && !confirmSensitive)}>
            {running ? "Ejecutando…" : "Ejecutar"}
          </button>

          {runError && <div className="error-box" style={{ marginTop: "1rem" }}>{runError}</div>}

          {result && (
            <div style={{ marginTop: "1rem" }}>
              <span className={`badge ${result.isError ? "error" : "success"}`}>
                {result.isError ? "Error" : "Éxito"}
              </span>
              <pre
                style={{
                  background: "#f5f5f7",
                  padding: "0.75rem",
                  borderRadius: 6,
                  overflowX: "auto",
                  fontSize: "0.85rem",
                  marginTop: "0.5rem",
                }}
              >
                {JSON.stringify(result.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
