"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getSession, type Session } from "../../lib/session";

const TABS = [
  { href: "/dashboard/conectores", label: "Conectores" },
  { href: "/dashboard/herramientas", label: "Herramientas" },
  { href: "/dashboard/automatizaciones", label: "Automatizaciones" },
  { href: "/dashboard/auditoria", label: "Auditoría" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/login");
      return;
    }
    setSession(current);
  }, [router]);

  if (session === undefined) return null; // still checking
  if (session === null) return null; // redirecting

  const visibleTabs = TABS.filter((tab) => tab.href !== "/dashboard/auditoria" || session.role !== "member");

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>OmniMCP AI</h1>
          <span className="hint">
            {session.email} · {session.role}
          </span>
        </div>
        <button
          className="secondary"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
        >
          Cerrar sesión
        </button>
      </header>

      <nav className="tabs">
        {visibleTabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className={pathname?.startsWith(tab.href) ? "active" : ""}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
