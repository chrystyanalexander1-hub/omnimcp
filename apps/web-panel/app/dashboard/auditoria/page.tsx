"use client";

import { useEffect, useState } from "react";
import { ApiError, type AuditEventDto, listAudit } from "../../../lib/api";
import { getSession } from "../../../lib/session";

const OUTCOME_CLASS: Record<string, string> = {
  success: "success",
  denied: "error",
  error: "error",
  awaiting_confirmation: "warn",
};

export default function AuditoriaPage() {
  const [events, setEvents] = useState<AuditEventDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getSession()?.accessToken ?? "";
    listAudit(token)
      .then(setEvents)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar la auditoría."));
  }, []);

  return (
    <section>
      <h2>Auditoría</h2>
      <p className="hint">Registro inmutable de cada intento de ejecutar una tool — incluye lo bloqueado, no solo lo que corrió.</p>

      {error && <div className="error-box">{error}</div>}
      {!events && !error && <p>Cargando…</p>}

      {events && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Tool</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.occurredAt).toLocaleString()}</td>
                  <td>{e.qualifiedToolName}</td>
                  <td>
                    <span className={`badge ${OUTCOME_CLASS[e.outcome] ?? "warn"}`}>{e.outcome}</span>
                  </td>
                  <td className="hint">{e.errorMessage ?? "—"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="hint">
                    Todavía no hay eventos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
