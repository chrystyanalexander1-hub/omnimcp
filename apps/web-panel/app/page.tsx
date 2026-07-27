"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "../lib/session";

/** No landing page needed — this panel only has two real destinations, so root just sends you to whichever one applies. */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getSession() ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
