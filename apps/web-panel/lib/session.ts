"use client";

export interface Session {
  readonly accessToken: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly email: string;
  readonly role: "owner" | "admin" | "member";
}

const STORAGE_KEY = "omnimcp_session";

/** Session lives only in the browser's localStorage — this panel has no server-side rendering that needs it, so there's no reason to touch cookies. */
export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
