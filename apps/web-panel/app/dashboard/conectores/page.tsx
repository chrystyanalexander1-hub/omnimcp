"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  type ConnectorSummary,
  grantCredential,
  installConnector,
  listConnectors,
  listTools,
  revokeCredential,
  startOAuth,
} from "../../../lib/api";
import { getSession } from "../../../lib/session";

export default function ConectoresPage() {
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});

  const token = getSession()?.accessToken ?? "";

  async function refresh() {
    try {
      const [connectorList, tools] = await Promise.all([listConnectors(token), listTools(token)]);
      setConnectors(connectorList);
      setInstalledIds(new Set(tools.map((t) => t.name.split(".")[0])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron cargar los conectores.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleInstall(id: string) {
    setBusyId(id);
    try {
      await installConnector(token, id);
      setStatusById((s) => ({ ...s, [id]: "Instalado." }));
      await refresh();
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al instalar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleGrantCredential(id: string) {
    const secret = secretDrafts[id]?.trim();
    if (!secret) return;
    setBusyId(id);
    try {
      await grantCredential(token, id, secret);
      setStatusById((s) => ({ ...s, [id]: "Credencial guardada." }));
      setSecretDrafts((s) => ({ ...s, [id]: "" }));
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al guardar la credencial." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevokeCredential(id: string) {
    setBusyId(id);
    try {
      await revokeCredential(token, id);
      setStatusById((s) => ({ ...s, [id]: "Credencial revocada." }));
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al revocar." }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleStartOAuth(id: string) {
    setBusyId(id);
    try {
      const { authorizationUrl } = await startOAuth(token, id);
      window.location.href = authorizationUrl;
    } catch (err) {
      setStatusById((s) => ({ ...s, [id]: err instanceof ApiError ? err.message : "Error al iniciar OAuth." }));
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2>Conectores</h2>
      <p className="hint">
        Instalá un conector y dale su credencial para que quede disponible en la pestaña Herramientas.
      </p>

      {error && <div className="error-box">{error}</div>}
      {!connectors && !error && <p>Cargando…</p>}

      {connectors?.map((c) => {
        const installed = installedIds.has(c.id);
        return (
          <div key={c.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <strong>{c.displayName}</strong>{" "}
                <span className="hint">
                  ({c.id} · v{c.version} · auth: {c.authType})
                </span>
              </div>
              {installed ? (
                <span className="badge success">Instalado</span>
              ) : (
                <button disabled={busyId === c.id} onClick={() => handleInstall(c.id)}>
                  Instalar
                </button>
              )}
            </div>

            <p className="hint" style={{ marginTop: "0.5rem" }}>
              Tools: {c.tools.map((t) => t.name).join(", ")}
            </p>

            {installed && c.authType === "api_key" && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <input
                  type="password"
                  placeholder="Pegar credencial/token"
                  value={secretDrafts[c.id] ?? ""}
                  onChange={(e) => setSecretDrafts((s) => ({ ...s, [c.id]: e.target.value }))}
                  style={{ flex: 1 }}
                />
                <button disabled={busyId === c.id} onClick={() => handleGrantCredential(c.id)}>
                  Guardar credencial
                </button>
                <button className="secondary" disabled={busyId === c.id} onClick={() => handleRevokeCredential(c.id)}>
                  Revocar
                </button>
              </div>
            )}

            {installed && c.authType === "oauth2" && (
              <div style={{ marginTop: "0.75rem" }}>
                <button disabled={busyId === c.id} onClick={() => handleStartOAuth(c.id)}>
                  Conectar con OAuth
                </button>
                <button
                  className="secondary"
                  style={{ marginLeft: "0.5rem" }}
                  disabled={busyId === c.id}
                  onClick={() => handleRevokeCredential(c.id)}
                >
                  Revocar
                </button>
              </div>
            )}

            {statusById[c.id] && <p className="hint" style={{ marginTop: "0.5rem" }}>{statusById[c.id]}</p>}
          </div>
        );
      })}
    </section>
  );
}
