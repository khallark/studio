"use client";

import { useEffect, useState } from "react";
import CheckoutClient from "./checkoutClient";
import { Loader2 } from "lucide-react";

function storageKey() {
  if (typeof window === "undefined") return "owr:checkout:sid";
  const shop = (window as any).__CHECKOUT_SESSION__?.shop || window.location.host;
  return `owr:checkout:sid:${shop}`;
}

export default function CheckoutPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const key = storageKey();
    const boot = (window as any).__CHECKOUT_SESSION__;
    const fromStorage =
      window.sessionStorage.getItem(key) || window.localStorage.getItem(key) || "";

    // prefer the fresh boot SID if present; otherwise fall back to storage
    const chosen = (boot?.id && String(boot.id)) || fromStorage || "";

    // write back so reload/new tab keep the newest SID
    if (chosen) {
      try { window.sessionStorage.setItem(key, chosen); } catch {}
      try { window.localStorage.setItem(key, chosen); } catch {}
    }

    setSessionId(chosen || null);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading your session...</p>
        </div>
      </main>
    );
  }

  if (!sessionId) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p className="text-muted-foreground">No active checkout session found. Please start checkout again.</p>
      </main>
    );
  }

  return <CheckoutClient sessionId={sessionId} />;
}
