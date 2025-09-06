// // app/checkout/CheckoutClient.tsx
// "use client";

// import React, { useState, useEffect } from "react";
// import { motion, AnimatePresence } from "framer-motion";
// import { Button } from "@/components/ui/button";
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Loader2, ArrowRight } from "lucide-react";
// import { useToast } from "@/hooks/use-toast";
// import { Logo } from "@/components/logo";
// import { Separator } from "@/components/ui/separator";
// import CustomerDetails from "./customer-details";
// import CartSummary from "./cart-summary";

// type Step = "phone" | "otp" | "confirmed";

// const tenDigitIndian = /^[6-9]\d{9}$/;
// const OTP_EXPIRY_SECONDS = 300; // 5 minutes

// type Props = { sessionId?: string };

// export default function CheckoutClient({ sessionId }: Props) {
//   const [step, setStep] = useState<Step>("phone");
//   const [direction, setDirection] = useState(1);
//   const [phoneInput, setPhoneInput] = useState("");
//   const [fullPhone, setFullPhone] = useState<string | null>(null); // "+91XXXXXXXXXX" (normalized)
//   const [otpInput, setOtpInput] = useState("");
//   const [isLoading, setIsLoading] = useState(false);
//   const [resendLoading, setResendLoading] = useState(false);

//   const [timer, setTimer] = useState(OTP_EXPIRY_SECONDS);
//   const [canResend, setCanResend] = useState(false);

//   const { toast } = useToast();

//   useEffect(() => {
//     let interval: NodeJS.Timeout | undefined;

//     if (step === 'otp' && timer > 0) {
//         setCanResend(false);
//         interval = setInterval(() => {
//             setTimer(prevTimer => prevTimer - 1);
//         }, 1000);
//     } else if (timer <= 0) {
//         setCanResend(true);
//         if(interval) clearInterval(interval);
//       }
    
//     return () => {
//         if(interval) clearInterval(interval);
//     }
//   }, [step, timer]);


//   const variants = {
//     enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
//     center: { zIndex: 1, x: 0, opacity: 1 },
//     exit: (d: number) => ({ zIndex: 0, x: d < 0 ? "100%" : "-100%", opacity: 0 }),
//   };

//   // choose the right base at runtime
//   function apiBase() {
//     if (typeof window === "undefined") return "/api/checkout";       // SSR/dev
//     const p = window.location.pathname;
//     if (p.startsWith("/apps/checkout")) return "/apps/checkout";     // running via App Proxy
//     return "/api/checkout";                                          // running on your own domain
//   }
//   const api = (path: string) => `${apiBase()}/${path}`;

//   const startOtpFlow = async (phoneNumber: string) => {
//     try {
//         const resp = await fetch("/api/checkout/send-otp", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({ sessionId, phoneNumber }),
//         });
//         const data = await resp.json();
//         if (!resp.ok) {
//             throw new Error(data?.error || "Failed to send OTP");
//         }

//         setFullPhone(phoneNumber);
//         setDirection(1);
//         setStep("otp");
//         setTimer(OTP_EXPIRY_SECONDS); // Reset timer
//         setCanResend(false); // Disable resend on new OTP
//         toast({
//             title: "OTP Sent",
//             description: `A code was sent to ${maskPhone(phoneNumber)} on WhatsApp.`,
//         });
//     } catch (err) {
//         toast({
//             title: "Error",
//             description: err instanceof Error ? err.message : "An unknown error occurred.",
//             variant: "destructive",
//         });
//     }
//   }


//   // --- Send OTP flow (calls /api/checkout/send-otp) ---
//   const handlePhoneNumberSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     const cleaned = phoneInput.replace(/\D/g, "").slice(0, 10);
//     if (!tenDigitIndian.test(cleaned)) {
//       toast({
//         title: "Invalid Phone Number",
//         description: "Enter a valid 10-digit Indian mobile number.",
//         variant: "destructive",
//       });
//       return;
//     }
//     const normalized = `+91${cleaned}`;

//     setIsLoading(true);
//     await startOtpFlow(normalized);
//     setIsLoading(false);
//   };
  
//   const handleResendOtp = async () => {
//     if (!fullPhone || !canResend) return;
    
//     setResendLoading(true);
//     await startOtpFlow(fullPhone);
//     setResendLoading(false);
//   }
  

//   // --- Verify OTP flow (calls /api/checkout/verify-otp and sets HttpOnly JWT cookie) ---
//   const handleOtpSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     const code = otpInput.replace(/\D/g, "").slice(0, 6);
//     if (code.length !== 6) {
//       toast({
//         title: "Invalid OTP",
//         description: "Please enter the 6-digit code.",
//         variant: "destructive",
//       });
//       return;
//     }

//     setIsLoading(true);
//     try {
//       const resp = await fetch("/api/checkout/verify-otp", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ sessionId, otp: code }),
//       });
//       const data = await resp.json();
//       if (!resp.ok || !data?.ok) {
//         throw new Error(data?.error || "OTP verification failed");
//       }
      
//       setDirection(1);
//       setStep("confirmed");
//     } catch (err) {
//       toast({
//         title: "Invalid OTP",
//         description: err instanceof Error ? err.message : "The OTP is incorrect or expired.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleBack = () => {
//     setDirection(-1);
//     setStep("phone");
//     setOtpInput("");
//   };

//   const formatTime = (seconds: number) => {
//     const minutes = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
//   }


//   return (
//     <div className="flex items-center justify-center min-h-screen bg-secondary/50 p-4">
//       <AnimatePresence initial={false} custom={direction} mode="wait">
//         {step !== "confirmed" && (
//             <motion.div
//               key={step === 'phone' ? 'phone-card' : 'otp-card'}
//               custom={direction}
//               variants={variants}
//               initial="enter"
//               animate="center"
//               exit="exit"
//               transition={{ type: "tween", ease: "easeInOut", duration: 0.5 }}
//               className="w-full max-w-sm"
//             >
//             <Card className="mx-auto w-full overflow-hidden">
//                 {step === "phone" && (
//                 <form onSubmit={handlePhoneNumberSubmit}>
//                     <CardHeader className="text-center space-y-2">
//                     <Logo className="justify-center" />
//                     <CardTitle className="text-2xl font-headline">Verify your number</CardTitle>
//                     <CardDescription>Enter your phone number to receive a verification code on WhatsApp.</CardDescription>
//                     </CardHeader>
//                     <CardContent className="space-y-4">
//                     <div className="grid gap-2">
//                         <Label htmlFor="phone">Phone Number</Label>
//                         <div className="flex items-center">
//                         <span className="flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
//                             +91
//                         </span>
//                         <Input
//                             id="phone"
//                             type="tel"
//                             placeholder="9876543210"
//                             required
//                             value={phoneInput.replace(/\D/g, "").slice(0, 10)}
//                             onChange={(e) => setPhoneInput(e.target.value)}
//                             disabled={isLoading}
//                             className="rounded-l-none"
//                         />
//                         </div>
//                     </div>
//                     <Button type="submit" className="w-full" disabled={isLoading}>
//                         {isLoading ? <Loader2 className="animate-spin" /> : "Send OTP"}
//                     </Button>
//                     </CardContent>
//                 </form>
//                 )}

//                 {step === "otp" && (
//                 <form onSubmit={handleOtpSubmit}>
//                     <CardHeader className="text-center space-y-2">
//                     <Logo className="justify-center" />
//                     <CardTitle className="text-2xl font-headline">Enter OTP</CardTitle>
//                     <CardDescription>A 6-digit code was sent to {maskPhone(fullPhone ?? "")}.</CardDescription>
//                     </CardHeader>
//                     <CardContent className="space-y-4">
//                     <div className="grid gap-2">
//                         <Label htmlFor="otp">Verification Code</Label>
//                         <Input
//                         id="otp"
//                         type="text"
//                         inputMode="numeric"
//                         maxLength={6}
//                         value={otpInput}
//                         onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
//                         required
//                         disabled={isLoading}
//                         className="text-center tracking-[0.5em] text-lg"
//                         />
//                     </div>
//                     <div className="text-center text-sm text-muted-foreground">
//                         {canResend ? "OTP expired. " : `Expires in: ${formatTime(timer)}`}
//                     </div>
//                     <Button type="submit" className="w-full" disabled={isLoading}>
//                         {isLoading ? <Loader2 className="animate-spin" /> : "Verify"}
//                     </Button>
//                     <div className="flex justify-between items-center text-sm">
//                         <Button
//                             type="button"
//                             variant="link"
//                             className="p-0 h-auto"
//                             onClick={handleBack}
//                             disabled={isLoading || resendLoading}
//                         >
//                             Use a different number
//                         </Button>
//                         <Button
//                             type="button"
//                             variant="link"
//                             className="p-0 h-auto"
//                             onClick={handleResendOtp}
//                             disabled={!canResend || resendLoading || isLoading}
//                         >
//                             {resendLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Resending...</> : "Resend OTP"}
//                         </Button>
//                     </div>
//                     </CardContent>
//                 </form>
//                 )}
//             </Card>
//           </motion.div>
//         )}

//         {step === "confirmed" && (
//           <motion.div
//             key="confirmed"
//             initial={{ opacity: 0, y: 20 }}
//             animate={{ opacity: 1, y: 0 }}
//             transition={{ duration: 0.5, delay: 0.2 }}
//             className="w-full max-w-2xl"
//           >
//             <Card>
//                 <CardHeader>
//                     <div className="flex justify-between items-center">
//                         <CardTitle className="text-3xl font-headline">Review Your Order</CardTitle>
//                         <Logo />
//                     </div>
//                     <CardDescription>Please check your details and finalize your purchase.</CardDescription>
//                 </CardHeader>
//                 <CardContent className="space-y-6">
//                     {/* Customer & Shipping Details */}
//                     <CustomerDetails sessionId={sessionId} phone={fullPhone ?? ''} />
                    
//                     <Separator />
                    
//                     {/* Order Summary */}
//                     <CartSummary sessionId={sessionId} />

//                     <Separator />

//                     {/* Payment Method */}
//                     <div className="space-y-4">
//                         <h3 className="text-lg font-semibold">Payment Method</h3>
//                         <div className="rounded-md border border-input p-4">
//                             <p className="text-muted-foreground">Payment gateway placeholder.</p>
//                         </div>
//                     </div>

//                     <Button className="w-full text-lg h-12" size="lg">
//                         Pay Now <ArrowRight className="ml-2" />
//                     </Button>
//                 </CardContent>
//             </Card>
//           </motion.div>
//         )}
//       </AnimatePresence>
//     </div>
//   );
// }

// function maskPhone(p: string | null) {
//   if (!p || p.length < 6) return "your number";
//   // "+91XXXXXXXXXX" -> "+91******1234"
//   return p.slice(0, 3) + "******" + p.slice(-4);
// }

// app/checkout/CheckoutClient.tsx
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

const tenDigitIndian = /^[6-9]\d{9}$/;
const OTP_EXPIRY_SECONDS = 300; // 5 minutes

// ---------- helpers ----------
function proxyPrefix(): string | null {
  if (typeof window === "undefined") return null;
  if (typeof window.__APP_PROXY_PREFIX__ === "string" && window.__APP_PROXY_PREFIX__.startsWith("/apps/")) {
    return window.__APP_PROXY_PREFIX__;
  }
  const parts = window.location.pathname.split("/").filter(Boolean);
  // "/apps/checkout/..." → ["apps","checkout",...]
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
  // "+91XXXXXXXXXX" -> "+91******1234"
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

// ---------- component ----------
export default function CheckoutClient({ sessionId }: Props) {
  const boot = typeof window !== "undefined" ? window.__CHECKOUT_SESSION__ : undefined;
  const effectiveSessionId = useMemo(() => sessionId ?? boot?.id ?? "", [sessionId, boot?.id]);

  // If the boot SID is different/newer, overwrite storage so future reloads/new tabs use it
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = storageKey();
    const current =
      window.sessionStorage.getItem(key) || window.localStorage.getItem(key) || "";

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
        credentials: "include",
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
      const resp = await fetch(api("verify-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: effectiveSessionId, otp: code }),
        credentials: "include",
      });
      const data = await resp.json().catch(() => ({} as any));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || "OTP verification failed");

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
                <CustomerDetails sessionId={effectiveSessionId} phone={fullPhone ?? ""} />
                <Separator />
                <CartSummary sessionId={effectiveSessionId} />
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
