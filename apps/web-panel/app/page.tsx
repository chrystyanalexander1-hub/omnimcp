/**
 * Placeholder landing page. The full admin panel (login, connector catalog,
 * credential management, audit log viewer) is explicitly out of scope for this
 * phase — see docs/architecture.md — and is meant to be built directly on top of
 * apps/rest-api's existing endpoints (/auth/login, /connectors, /tools, /audit).
 * This page only proves the Next.js app is wired to that API.
 */
export default async function HomePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
  let apiStatus = "unreachable";
  try {
    const res = await fetch(`${apiBaseUrl}/healthz`, { cache: "no-store" });
    apiStatus = res.ok ? "ok" : `error (${res.status})`;
  } catch {
    apiStatus = "unreachable";
  }

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1>OmniMCP AI</h1>
      <p>Panel de administración — en construcción.</p>
      <p>
        API REST ({apiBaseUrl}): <strong>{apiStatus}</strong>
      </p>
      <p>
        Ver <code>docs/architecture.md</code> para el alcance de esta fase y{" "}
        <code>docs/connector-authoring-guide.md</code> para añadir nuevos conectores.
      </p>
    </main>
  );
}
