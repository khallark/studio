"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/logo";
import { Separator } from "@/components/ui/separator";
import CustomerDetails from "./customer-details";
import CartSummary from "./cart-summary";

declare global {
  interface Window {
    __CHECKOUT_SESSION__?: { id?: string; shop?: string };
    __APP_PROXY_PREFIX__?: string; // e.g. "/apps/checkout"
  }
}

type Step = "phone" | "otp" | "confirmed";
type Props = { sessionId?: string };

type Customer = {
  phone: string | null;
  name: string | null;
  email: string | null;
  address: string | null;
};

type Product = any; // shape returned by /product-details (normalized variant objects)

// ---- helpers ----
const tenDigitIndian = /^[6-9]\d{9}$/;
const OTP_EXPIRY_SECONDS = 300; // 5 minutes

function proxyPrefix(): string | null {
  if (typeof window === "undefined") return null;
  if (typeof window.__APP_PROXY_PREFIX__ === "string" && window.__APP_PROXY_PREFIX__.startsWith("/apps/")) {
    return window.__APP_PROXY_PREFIX__;
  }
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "apps" && parts[1]) return `/${parts.slice(0, 2).join("/")}`;
  return null;
}

function apiBase(): string {
  const pp = proxyPrefix();
  return pp ?? "/api/checkout";
}

const api = (path: string) => `${apiBase()}/${path}`;

function maskPhone(p: string | null) {
  if (!p || p.length < 6) return "your number";
  return p.slice(0, 3) + "******" + p.slice(-4);
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function storageKey() {
  if (typeof window === "undefined") return "owr:checkout:sid";
  const shop = (window as any).__CHECKOUT_SESSION__?.shop || window.location.host;
  return `owr:checkout:sid:${shop}`;
}

function phoneStorageKey() {
  if (typeof window === "undefined") return "owr:checkout:phone";
  const shop = (window as any).__CHECKOUT_SESSION__?.shop || window.location.host;
  return `owr:checkout:phone:${shop}`;
}

// ---- component ----
export default function CheckoutClient({ sessionId }: Props) {
  const boot = typeof window !== "undefined" ? window.__CHECKOUT_SESSION__ : undefined;
  const effectiveSessionId = useMemo(() => sessionId ?? boot?.id ?? "", [sessionId, boot?.id]);

  // Persist the latest boot sessionId so reload/new tab can pick it up
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = storageKey();
    const current = window.sessionStorage.getItem(key) || window.localStorage.getItem(key) || "";
    const fresh = boot?.id && String(boot.id);
    if (fresh && fresh !== current) {
      try { window.sessionStorage.setItem(key, fresh); } catch {}
      try { window.localStorage.setItem(key, fresh); } catch {}
    }
  }, [boot?.id]);

  useEffect(() => {
    if (!effectiveSessionId) console.warn("CheckoutClient: missing sessionId");
    else console.log("effectiveSessionId:", effectiveSessionId);
  }, [effectiveSessionId]);

  const [step, setStep] = useState<Step>("phone");
  const [direction, setDirection] = useState(1);

  const [phoneInput, setPhoneInput] = useState("");
  const [fullPhone, setFullPhone] = useState<string | null>(null); // "+91XXXXXXXXXX"
  const [otpInput, setOtpInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [timer, setTimer] = useState(OTP_EXPIRY_SECONDS);
  const [canResend, setCanResend] = useState(false);

  // NEW: data captured from /product-details
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);

  const { toast } = useToast();

  // OTP countdown
  useEffect(() => {
    if (step !== "otp") return;
    if (timer <= 0) {
      setCanResend(true);
      return;
    }
    const iv = setInterval(() => setTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(iv);
  }, [step, timer]);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { zIndex: 1, x: 0, opacity: 1 },
    exit: (d: number) => ({ zIndex: 0, x: d < 0 ? "100%" : "-100%", opacity: 0 }),
  };

  // ----- network calls (proxy-aware) -----
  const startOtpFlow = async (phoneNumber: string) => {
    try {
      const resp = await fetch(api("send-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: effectiveSessionId, phoneNumber }),
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok) throw new Error(data?.error || "Failed to send OTP");

      setFullPhone(phoneNumber);
      setDirection(1);
      setStep("otp");
      setTimer(OTP_EXPIRY_SECONDS);
      setCanResend(false);
      toast({ title: "OTP Sent", description: `A code was sent to ${maskPhone(phoneNumber)} on WhatsApp.` });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "An unknown error occurred.",
        variant: "destructive",
      });
    }
  };

  const handlePhoneNumberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phoneInput.replace(/\D/g, "").slice(0, 10);
    if (!tenDigitIndian.test(cleaned)) {
      toast({
        title: "Invalid Phone Number",
        description: "Enter a valid 10-digit Indian mobile number.",
        variant: "destructive",
      });
      return;
    }
    const normalized = `+91${cleaned}`;
    setIsLoading(true);
    await startOtpFlow(normalized);
    setIsLoading(false);
  };

  const handleResendOtp = async () => {
    if (!fullPhone || !canResend) return;
    setResendLoading(true);
    await startOtpFlow(fullPhone);
    setResendLoading(false);
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpInput.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      toast({ title: "Invalid OTP", description: "Please enter the 6-digit code.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // 1) verify OTP
      const resp = await fetch(api("verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: effectiveSessionId, otp: code }),
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || "OTP verification failed");

      // store phone locally
      try {
        if (fullPhone) localStorage.setItem(phoneStorageKey(), fullPhone);
      } catch {}

      // 2) fetch products + customer from session via proxy (cached if already present)
      try {
        const pd = await fetch(api("product-details"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: effectiveSessionId }),
          cache: "no-store",
        });
        const pdJson = await pd.json().catch(() => ({} as any));
        if (pd.ok && pdJson?.ok) {
          setCustomer(pdJson.customer ?? null);
          setProducts(Array.isArray(pdJson.products) ? pdJson.products : []);
        } else {
          console.warn("product-details failed", pd.status, pdJson);
          // don’t block the flow on product fetch issues
        }
      } catch (e) {
        console.warn("product capture failed", e);
      }

      setDirection(1);
      setStep("confirmed");
    } catch (err) {
      toast({
        title: "Invalid OTP",
        description: err instanceof Error ? err.message : "The OTP is incorrect or expired.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setDirection(-1);
    setStep("phone");
    setOtpInput("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/50 p-4">
      <AnimatePresence initial={false} custom={direction} mode="wait">
        {step !== "confirmed" && (
          <motion.div
            key={step === "phone" ? "phone-card" : "otp-card"}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "tween", ease: "easeInOut", duration: 0.5 }}
            className="w-full max-w-sm"
          >
            <Card className="mx-auto w-full overflow-hidden">
              {step === "phone" && (
                <form onSubmit={handlePhoneNumberSubmit}>
                  <CardHeader className="space-y-2 text-center">
                    <Logo className="justify-center" />
                    <CardTitle className="font-headline text-2xl">Verify your number</CardTitle>
                    <CardDescription>Enter your phone number to receive a verification code on WhatsApp.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="flex items-center">
                        <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                          +91
                        </span>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="9876543210"
                          required
                          value={phoneInput.replace(/\D/g, "").slice(0, 10)}
                          onChange={(e) => setPhoneInput(e.target.value)}
                          disabled={isLoading}
                          className="rounded-l-none"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="animate-spin" /> : "Send OTP"}
                    </Button>
                  </CardContent>
                </form>
              )}

              {step === "otp" && (
                <form onSubmit={handleOtpSubmit}>
                  <CardHeader className="space-y-2 text-center">
                    <Logo className="justify-center" />
                    <CardTitle className="font-headline text-2xl">Enter OTP</CardTitle>
                    <CardDescription>A 6-digit code was sent to {maskPhone(fullPhone ?? "")}.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="otp">Verification Code</Label>
                      <Input
                        id="otp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
                        required
                        disabled={isLoading}
                        className="text-center text-lg tracking-[0.5em]"
                      />
                    </div>
                    <div className="text-center text-sm text-muted-foreground">
                      {canResend ? "OTP expired. " : `Expires in: ${formatTime(timer)}`}
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="animate-spin" /> : "Verify"}
                    </Button>
                    <div className="flex items-center justify-between text-sm">
                      <Button type="button" variant="link" className="h-auto p-0" onClick={handleBack} disabled={isLoading || resendLoading}>
                        Use a different number
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0"
                        onClick={handleResendOtp}
                        disabled={!canResend || resendLoading || isLoading}
                      >
                        {resendLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Resending...
                          </>
                        ) : (
                          "Resend OTP"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </form>
              )}
            </Card>
          </motion.div>
        )}

        {step === "confirmed" && (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="w-full max-w-2xl"
          >
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="font-headline text-3xl">Review Your Order</CardTitle>
                  <Logo />
                </div>
                <CardDescription>Please check your details and finalize your purchase.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Pass the captured customer & products */}
                <CustomerDetails
                  customer={
                    customer ?? {
                      phone: fullPhone ?? null,
                      name: null,
                      email: null,
                      address: null,
                    }
                  }
                />
                <Separator />
                <CartSummary products={products ?? []} />
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Payment Method</h3>
                  <div className="rounded-md border border-input p-4">
                    <p className="text-muted-foreground">Payment gateway placeholder.</p>
                  </div>
                </div>
                <Button className="h-12 w-full text-lg" size="lg">
                  Pay Now <ArrowRight className="ml-2" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
