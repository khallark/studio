// app/checkout/page.tsx
"use client";

import { useEffect, useState } from "react";
import CheckoutClient from "./checkoutClient";

export default function CheckoutPage() {
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // same-origin → browser will send HttpOnly cookie automatically
        const res = await fetch("/api/checkout/session", { cache: "no-store" });
        if (!res.ok) {
          // e.g., 401 when cookie missing/invalid
          setError("No valid checkout session. Redirecting…");
          // Optional: redirect
          // setTimeout(() => { window.location.href = "/start"; }, 800);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setSessionId(json.sessionId as string);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Failed to load session. Please retry.");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p>Loading your session…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p>{error}</p>
      </main>
    );
  }

  // sessionId is the decrypted cookie value
  return <CheckoutClient sessionId={sessionId!} />;
}
