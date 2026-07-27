"use client";

import { useEffect, useState } from "react";
import { ApiError, type ExecuteToolResult, executeTool, listTools, type ToolSummary } from "../../../lib/api";
import { getSession } from "../../../lib/session";
import ParamsForm, { defaultParamsFrom } from "../../../components/ParamsForm";

const CONFIRMATION_TOKEN = "confirmed-via-web-panel";

export default function HerramientasPage() {
  const [tools, setTools] = useState<ToolSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [advancedMode, setAdvancedMode] = useState(false);
  const [advancedText, setAdvancedText] = useState("{}");
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecuteToolResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const token = getSession()?.accessToken ?? "";

  useEffect(() => {
    listTools(token)
      .then((list) => {
        setTools(list);
        if (list.length > 0) {
          setSelected(list[0]!.name);
          setParams(defaultParamsFrom(list[0]!.inputSchema));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudieron cargar las herramientas."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTool = tools?.find((t) => t.name === selected);

  function handleSelectTool(name: string) {
    setSelected(name);
    const tool = tools?.find((t) => t.name === name);
    setParams(defaultParamsFrom(tool?.inputSchema));
    setAdvancedMode(false);
    setAdvancedText("{}");
    setConfirmSensitive(false);
    setResult(null);
    setRunError(null);
  }

  function toggleAdvanced() {
    if (!advancedMode) {
      setAdvancedText(JSON.stringify(params, null, 2));
      setAdvancedMode(true);
      return;
    }
    try {
      const parsed = JSON.parse(advancedText);
      setParams(parsed && typeof parsed === "object" ? parsed : {});
      setAdvancedMode(false);
    } catch {
      setRunError("Los parámetros no son un JSON válido — corregilo antes de volver al formulario.");
    }
  }

  async function handleRun() {
    setRunError(null);
    setResult(null);

    let finalParams: Record<string, unknown>;
    if (advancedMode) {
      try {
        finalParams = JSON.parse(advancedText);
      } catch {
        setRunError("Los parámetros no son un JSON válido.");
        return;
      }
    } else {
      finalParams = params;
    }

    setRunning(true);
    try {
      const res = await executeTool(
        token,
        selected,
        finalParams,
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
      <p className="hint">Elegí una tool instalada, completá el formulario, y ejecutala.</p>

      {error && <div className="error-box">{error}</div>}
      {!tools && !error && <p>Cargando…</p>}

      {tools && tools.length === 0 && <p className="hint">No hay tools disponibles — instalá un conector primero.</p>}

      {tools && tools.length > 0 && (
        <div className="card">
          <div className="field">
            <label htmlFor="tool">Tool</label>
            <select id="tool" value={selected} onChange={(e) => handleSelectTool(e.target.value)}>
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} {t.sensitive ? "⚠️" : ""}
                </option>
              ))}
            </select>
            {selectedTool && <span className="hint">{selectedTool.description}</span>}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
            <button className="secondary" onClick={toggleAdvanced} type="button">
              {advancedMode ? "Volver al formulario" : "Modo avanzado (JSON)"}
            </button>
          </div>

          {advancedMode ? (
            <div className="field">
              <label htmlFor="params">Parámetros (JSON)</label>
              <textarea id="params" value={advancedText} onChange={(e) => setAdvancedText(e.target.value)} />
            </div>
          ) : (
            <ParamsForm schema={selectedTool?.inputSchema} value={params} onChange={setParams} />
          )}

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
