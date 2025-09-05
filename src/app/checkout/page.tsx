// app/checkout/page.tsx
"use client";

import { useEffect, useState } from "react";
import CheckoutClient from "./checkoutClient";

export default function CheckoutPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read from localStorage on mount
    const sid = typeof window !== "undefined"
      ? window.localStorage.getItem("checkout_session")
      : null;

    setSessionId(sid && sid.trim() ? sid : null);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p>Loading your session…</p>
      </main>
    );
  }

  if (!sessionId) {
    // Optionally redirect to a start page if no session is found:
    // if (typeof window !== "undefined") window.location.replace("/start");
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p>No active checkout session found. Please start checkout again.</p>
      </main>
    );
  }

  return <CheckoutClient sessionId={sessionId} />;
}
