"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "../../lib/api";
import { saveSession } from "../../lib/session";

const DEFAULT_TENANT_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? "";

export default function LoginPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(DEFAULT_TENANT_ID);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(tenantId, email, password);
      saveSession({
        accessToken: result.accessToken,
        tenantId,
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1 style={{ marginBottom: 0.5 }}>OmniMCP AI</h1>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Iniciá sesión con tu cuenta.
      </p>

      <form className="card" onSubmit={handleSubmit}>
        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label htmlFor="tenantId">Tenant ID</label>
          <input id="tenantId" type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
