// app/checkout/page.tsx
"use client";

import { useEffect, useState } from "react";
import CheckoutClient from "./checkoutClient";
import { Loader2 } from "lucide-react";

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
      <main className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="flex items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">Loading your session...</p>
        </div>
      </main>
    );
  }

  if (!sessionId) {
    // Optionally redirect to a start page if no session is found:
    // if (typeof window !== "undefined") window.location.replace("/start");
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <p className="text-muted-foreground">No active checkout session found. Please start checkout again.</p>
      </main>
    );
  }

  return <CheckoutClient sessionId={sessionId} />;
}
