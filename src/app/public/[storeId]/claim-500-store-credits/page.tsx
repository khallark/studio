"use client";

// app/public/[storeId]/claim-500-store-credits/page.tsx
//
// Public, no-login claim flow for a limited ₹500 store-credit offer.
// Steps: form → otp → confirm → success | claimed.
// All styling is scoped under `.c500` so it won't touch the rest of the app.
//
// Drop the background artwork at:  public/claim-500-bg.jpg
// (or change BG_URL below to wherever you host it).

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const API = "/api/public/claim-500-store-credits";
const BG_URL = "/claim-500-bg.jpeg";

type Step = "form" | "otp" | "confirm" | "success" | "claimed";

// Errors that mean "you can't proceed at all" -> show the terminal screen.
const TERMINAL = new Set([
  "MISSING_STORE",
  "STORE_NOT_FOUND",
  "STORE_NOT_CONFIGURED",
  "ALREADY_CLAIMED",
  "OFFER_NOT_AVAILABLE",
]);

const ERRORS: Record<string, string> = {
  INVALID_NAME: "Enter your full name",
  INVALID_PHONE: "Enter a valid 10-digit number",
  INVALID_EMAIL: "Enter a valid email address",
  RATE_LIMITED: "Too many attempts. Please try later",
  OTP_SEND_FAILED: "Couldn't send your code. Try again",
  INVALID_OTP_FORMAT: "Enter the 6-digit code",
  INCORRECT_OTP: "Invalid OTP",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please try later",
  NO_SESSION: "Your session ended. Please start again",
  SESSION_EXPIRED: "Your session timed out. Please start again",
  INVALID_SESSION: "Your session ended. Please start again",
  OTP_NOT_VERIFIED: "Please verify your code first",
  IN_PROGRESS: "We're already adding your credit",
  FULFILMENT_FAILED: "Something went wrong. Please try again",
  INTERNAL_ERROR: "Something went wrong. Please try again",
};

function msgFor(code: string, extra?: { attemptsLeft?: number }) {
  let m = ERRORS[code] || "Something went wrong. Please try again";
  if (code === "INCORRECT_OTP" && typeof extra?.attemptsLeft === "number" && extra.attemptsLeft > 0) {
    m = `Invalid OTP · ${extra.attemptsLeft} left`;
  }
  return m;
}

export default function Claim500Page() {
  const params = useParams();
  const storeId = String(params?.storeId || "");
  const brand = (storeId || "OWR").toUpperCase();

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [csrfToken, setCsrfToken] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [otp, setOtp] = useState("");

  const fallbackUrl = `https://${storeId}.myshopify.com`;
  const [storeUrl, setStoreUrl] = useState(fallbackUrl);

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  const formValid =
    name.trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(phoneDigits) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function createSession(isResend = false) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/create-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, name: name.trim(), phone: phoneDigits, email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (TERMINAL.has(data.error)) {
          setStep("claimed");
        } else {
          setError(msgFor(data.error));
        }
        return;
      }
      setCsrfToken(data.csrfToken);
      setResendIn(data.resendCooldownSeconds || 30);
      if (!isResend) {
        setOtp("");
        setStep("otp");
      }
    } catch {
      setError("Network error. Please try again");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(msgFor(data.error, { attemptsLeft: data.attemptsLeft }));
        if (["SESSION_EXPIRED", "NO_SESSION", "INVALID_SESSION", "TOO_MANY_ATTEMPTS"].includes(data.error)) {
          setTimeout(resetToForm, 1300);
        } else {
          setOtp("");
        }
        return;
      }
      setStep("confirm");
    } catch {
      setError("Network error. Please try again");
    } finally {
      setBusy(false);
    }
  }

  async function processClaim() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/process-claim`, {
        method: "POST",
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (TERMINAL.has(data.error)) {
          if (data.storeUrl) setStoreUrl(data.storeUrl);
          setStep("claimed");
        } else {
          setError(msgFor(data.error));
          if (["SESSION_EXPIRED", "NO_SESSION", "INVALID_SESSION"].includes(data.error)) {
            setTimeout(resetToForm, 1400);
          }
        }
        return;
      }
      setStoreUrl(data.storeUrl || fallbackUrl);
      setStep(data.alreadyClaimed ? "claimed" : "success");
    } catch {
      setError("Network error. Please try again");
    } finally {
      setBusy(false);
    }
  }

  function resetToForm() {
    setStep("form");
    setOtp("");
    setCsrfToken("");
    setError(null);
  }

  return (
    <div className="c500" style={{ ["--c500-bg" as any]: `url("${BG_URL}")` }}>
      <style>{CSS}</style>
      <div className="c500-bg" aria-hidden />
      <div className="c500-scrim" aria-hidden />

      <main className="c500-wrap" role="main">
        <Logo />

        {step === "form" && (
          <div className="c500-stack">
            <input
              className="c500-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              autoComplete="name"
              maxLength={80}
            />
            <input
              className="c500-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              type="email"
              inputMode="email"
              autoComplete="email"
            />
            <input
              className="c500-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter your WhatsApp number"
              inputMode="numeric"
              autoComplete="tel"
            />
            <button className="c500-btn" disabled={!formValid || busy} onClick={() => createSession(false)}>
              {busy ? <Spin /> : "Submit"}
            </button>
            {error && <p className="c500-error">{error}</p>}
          </div>
        )}

        {step === "otp" && (
          <div className="c500-stack">
            <input
              className="c500-input"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
              placeholder="Enter WhatsApp OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
            />
            <button className="c500-btn" disabled={otp.length !== 6 || busy} onClick={verifyOtp}>
              {busy ? <Spin /> : "Submit"}
            </button>
            {error && <p className="c500-error">{error}</p>}
            <div className="c500-row">
              <button className="c500-link" onClick={resetToForm} disabled={busy}>
                Change number
              </button>
              <button className="c500-link" onClick={() => createSession(true)} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="c500-stack">
            <p className="c500-text">
              You're verified. Tap below to add your ₹500 to your OWR wallet.
            </p>
            <button className="c500-btn" disabled={busy} onClick={processClaim}>
              {busy ? <Spin /> : `Claim ₹500`}
            </button>
            {error && <p className="c500-error">{error}</p>}
          </div>
        )}

        {step === "success" && (
          <div className="c500-stack">
            <p className="c500-text">Done! ₹500 has been credited to your {brand} wallet.</p>
            <p className="c500-text">
              Log in with the same email address you mentioned, &amp; your ₹500 wallet balance will be
              ready to use on your next order.
            </p>
            <a className="c500-btn" href={storeUrl} target="_blank" rel="noreferrer">
              Visit the store
            </a>
          </div>
        )}

        {step === "claimed" && (
          <div className="c500-stack">
            <p className="c500-text">
              Looks like this reward has already been claimed or isn't available for your account.
            </p>
            <a className="c500-btn" href={storeUrl} target="_blank" rel="noreferrer">
              Visit the store
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- presentational bits ---------- */

function Logo() {
  return (
    <svg className="c500-logo" viewBox="0 0 100 100" fill="none" aria-label={`Brand logo`}>
      <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="13" />
    </svg>
  );
}

function Spin() {
  return <span className="c500-spin" aria-label="Working" />;
}

/* ---------- styles (scoped to .c500) ---------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');

.c500{
  --ink: rgba(255,255,255,0.45);
  --line: rgba(255,255,255,0.45);
  --fill: rgba(255,255,255,0.45);
  --btn-ink: #16161a;
  --danger: #d0463a;
  position:fixed; inset:0; overflow-y:auto;
  background:#161618;
  font-family:'Poppins',system-ui,-apple-system,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.c500 *{ box-sizing:border-box; }

.c500-bg{
  position:absolute; inset:0; z-index:0;
  background-image:var(--c500-bg);
  background-size:cover; background-position:center;
  background-repeat:no-repeat;
}
.c500-scrim{
  position:absolute; inset:0; z-index:1;
  background:linear-gradient(180deg,
    rgba(20,20,22,0.62) 0%,
    rgba(20,20,22,0.30) 32%,
    rgba(20,20,22,0.04) 52%,
    rgba(20,20,22,0.00) 64%);
  pointer-events:none;
}

.c500-wrap{
  position:relative; z-index:2;
  width:100%; max-width:430px; margin:0 auto;
  min-height:100dvh;
  display:flex; flex-direction:column; align-items:center;
  padding:13vh 30px 8vh;
  text-align:center;
}

.c500-logo{
  width:108px; height:108px;
  color:#ffffff; opacity:0.55;
  margin-bottom:54px;
}

.c500-stack{
  width:100%;
  display:flex; flex-direction:column; gap:18px;
  animation:c500-fade .45s ease both;
}
@keyframes c500-fade{ from{opacity:0; transform:translateY(8px);} to{opacity:1; transform:none;} }

.c500-input{
  width:100%;
  padding:17px 20px;
  background:transparent;
  border:1.5px solid var(--line);
  border-radius:14px;
  color:rgba(255,255,255,0.82);
  font-family:inherit; font-size:14px; font-weight:400;
  letter-spacing:.14em; text-transform:uppercase; text-align:center;
  outline:none;
  transition:border-color .2s ease;
}
.c500-input::placeholder{ color:var(--ink); opacity:1; text-transform:uppercase; }
.c500-input:focus{ border-color:rgba(255,255,255,0.7); }

.c500-btn{
  width:100%;
  padding:17px 20px;
  background:var(--fill);
  border:none; border-radius:14px;
  color:var(--btn-ink);
  font-family:inherit; font-size:14px; font-weight:600;
  letter-spacing:.16em; text-transform:uppercase; text-align:center;
  cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:10px;
  text-decoration:none;
  transition:filter .18s ease, opacity .18s ease;
}
.c500-btn:hover:not(:disabled){ filter:brightness(1.08); }
.c500-btn:active:not(:disabled){ filter:brightness(0.96); }
.c500-btn:disabled{ opacity:.55; cursor:not-allowed; }

.c500-text{
  color:var(--ink);
  font-size:15px; font-weight:400; line-height:1.75;
  letter-spacing:.12em; text-transform:uppercase;
  margin:0 0 4px;
}
.c500-stack .c500-text + .c500-btn,
.c500-stack .c500-text + .c500-text{ margin-top:6px; }

.c500-error{
  color:var(--danger);
  font-size:13px; font-weight:500; line-height:1.6;
  letter-spacing:.13em; text-transform:uppercase;
  margin:2px 0 0;
}

.c500-row{
  display:flex; justify-content:space-between; gap:14px;
  margin-top:2px;
}
.c500-link{
  background:none; border:none; padding:6px 2px;
  color:var(--ink);
  font-family:inherit; font-size:12px; font-weight:400;
  letter-spacing:.12em; text-transform:uppercase;
  cursor:pointer;
}
.c500-link:hover:not(:disabled){ color:rgba(255,255,255,0.72); }
.c500-link:disabled{ opacity:.5; cursor:not-allowed; }

.c500-spin{
  width:15px; height:15px; border-radius:50%;
  border:2px solid rgba(22,22,26,0.35);
  border-top-color:#16161a;
  animation:c500-rot .7s linear infinite;
}
@keyframes c500-rot{ to{ transform:rotate(360deg); } }

:focus-visible{ outline:2px solid rgba(255,255,255,0.7); outline-offset:2px; }

@media (max-width:380px){
  .c500-wrap{ padding:11vh 22px 7vh; }
  .c500-logo{ width:96px; height:96px; margin-bottom:44px; }
}
@media (prefers-reduced-motion:reduce){
  .c500-stack{ animation:none; }
  .c500-spin{ animation-duration:1.4s; }
}
`;