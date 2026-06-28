"use client";

// app/public/[storeId]/claim-500-store-credits/page.tsx
//
// Public, no-login claim flow for a limited ₹500 store-credit offer.
// Steps: details → verify (WhatsApp OTP) → confirm → success.
// All styling is scoped under `.c500` so it won't touch the rest of the app.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

const API = "/api/public/claim-500-store-credits";

type Step = "form" | "otp" | "confirm" | "success";

const ERRORS: Record<string, string> = {
  MISSING_STORE: "This offer link isn't valid.",
  INVALID_NAME: "Please enter your full name.",
  INVALID_PHONE: "Enter a valid 10-digit mobile number.",
  INVALID_EMAIL: "Enter a valid email address.",
  STORE_NOT_FOUND: "This offer link isn't active.",
  STORE_NOT_CONFIGURED: "This store isn't set up for the offer yet.",
  ALREADY_CLAIMED: "This email has already claimed the credit.",
  RATE_LIMITED: "Too many attempts. Please try again in a little while.",
  OTP_SEND_FAILED: "We couldn't send your code. Check the number and try again.",
  INVALID_OTP_FORMAT: "Enter the 6-digit code.",
  INCORRECT_OTP: "That code isn't right.",
  TOO_MANY_ATTEMPTS: "Too many tries. Start again to get a new code.",
  NO_SESSION: "Your session ended. Please start again.",
  SESSION_EXPIRED: "Your session timed out. Please start again.",
  INVALID_SESSION: "Your session ended. Please start again.",
  OTP_NOT_VERIFIED: "Please verify your code first.",
  IN_PROGRESS: "We're already adding your credit — one moment.",
  FULFILMENT_FAILED: "Something went wrong adding your credit. Please try again.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
};

function msgFor(code: string, extra?: { attemptsLeft?: number }) {
  let m = ERRORS[code] || "Something went wrong. Please try again.";
  if (code === "INCORRECT_OTP" && typeof extra?.attemptsLeft === "number") {
    m += ` ${extra.attemptsLeft} attempt${extra.attemptsLeft === 1 ? "" : "s"} left.`;
  }
  return m;
}

export default function Claim500Page() {
  const params = useParams();
  const storeId = String(params?.storeId || "");

  const [step, setStep] = useState<Step>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [csrfToken, setCsrfToken] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [storeUrl, setStoreUrl] = useState("");
  const [resultNote, setResultNote] = useState<string | null>(null);

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, "").slice(-10), [phone]);
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
        setError(msgFor(data.error));
        return;
      }
      setCsrfToken(data.csrfToken);
      setMaskedPhone(data.maskedPhone || "");
      setResendIn(data.resendCooldownSeconds || 30);
      if (!isResend) {
        setOtp(["", "", "", "", "", ""]);
        setStep("otp");
        setTimeout(() => otpRefs.current[0]?.focus(), 60);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    const code = otp.join("");
    if (code.length !== 6 || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${API}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ otp: code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(msgFor(data.error, { attemptsLeft: data.attemptsLeft }));
        if (["SESSION_EXPIRED", "NO_SESSION", "INVALID_SESSION", "TOO_MANY_ATTEMPTS"].includes(data.error)) {
          setTimeout(() => resetToForm(), 1200);
        } else {
          setOtp(["", "", "", "", "", ""]);
          setTimeout(() => otpRefs.current[0]?.focus(), 60);
        }
        return;
      }
      setStep("confirm");
    } catch {
      setError("Network error. Please try again.");
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
        setError(msgFor(data.error));
        if (["SESSION_EXPIRED", "NO_SESSION", "INVALID_SESSION"].includes(data.error)) {
          setTimeout(() => resetToForm(), 1400);
        }
        return;
      }
      setStoreUrl(data.storeUrl || `https://${storeId}.myshopify.com`);
      setResultNote(data.alreadyClaimed ? "This reward was already on your account." : null);
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function resetToForm() {
    setStep("form");
    setOtp(["", "", "", "", "", ""]);
    setCsrfToken("");
    setError(null);
  }

  // OTP box handlers
  function onOtpChange(i: number, v: string) {
    const digit = v.replace(/\D/g, "").slice(-1);
    setOtp((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  }
  function onOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) otpRefs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) otpRefs.current[i + 1]?.focus();
    if (e.key === "Enter" && otp.join("").length === 6) verifyOtp();
  }
  function onOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    text.split("").forEach((d, idx) => (next[idx] = d));
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
  }

  return (
    <div className="c500">
      <style>{CSS}</style>

      <div className="c500-bg" aria-hidden />
      <main className="c500-card" role="main">
        <header className="c500-head">
          <Crown />
          <span className="c500-eyebrow">One Who Rules · Members' reward</span>
        </header>

        <Stepper step={step} />

        <section className="c500-panel" key={step}>
          {step === "form" && (
            <>
              <h1 className="c500-title">Your ₹500 store credit is waiting.</h1>
              <p className="c500-sub">
                Verify your WhatsApp number and we'll add it to your account. Takes a minute,
                no card needed.
              </p>

              <Field label="Full name">
                <input
                  className="c500-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={80}
                />
              </Field>

              <Field label="WhatsApp number">
                <div className="c500-phone">
                  <span className="c500-cc">+91</span>
                  <input
                    className="c500-input c500-input--phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    inputMode="numeric"
                    autoComplete="tel"
                  />
                </div>
              </Field>

              <Field label="Email">
                <input
                  className="c500-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                />
                <span className="c500-hint">Use the email you'll sign in with at checkout.</span>
              </Field>

              {error && <p className="c500-error">{error}</p>}

              <button
                className="c500-btn"
                disabled={!formValid || busy}
                onClick={() => createSession(false)}
              >
                {busy ? <Spin /> : "Send my code"}
              </button>
              <p className="c500-legal">
                We'll send a one-time code to your WhatsApp to confirm it's you.
              </p>
            </>
          )}

          {step === "otp" && (
            <>
              <h1 className="c500-title">Enter your code</h1>
              <p className="c500-sub">
                We sent a 6-digit code on WhatsApp to <strong>{maskedPhone || "your number"}</strong>.
              </p>

              <div className="c500-otp" onPaste={onOtpPaste}>
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    className="c500-otp-box"
                    value={d}
                    onChange={(e) => onOtpChange(i, e.target.value)}
                    onKeyDown={(e) => onOtpKeyDown(i, e)}
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {error && <p className="c500-error">{error}</p>}

              <button
                className="c500-btn"
                disabled={otp.join("").length !== 6 || busy}
                onClick={verifyOtp}
              >
                {busy ? <Spin /> : "Verify code"}
              </button>

              <div className="c500-row">
                <button className="c500-link" onClick={resetToForm} disabled={busy}>
                  Change number
                </button>
                <button
                  className="c500-link"
                  onClick={() => createSession(true)}
                  disabled={busy || resendIn > 0}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <h1 className="c500-title">You're verified.</h1>
              <p className="c500-sub">One tap to add the reward to your account.</p>

              <Seal amount="₹500" />

              <dl className="c500-summary">
                <div><dt>Name</dt><dd>{name}</dd></div>
                <div><dt>Email</dt><dd>{email}</dd></div>
                <div><dt>Phone</dt><dd>{maskedPhone || `+91 ${phoneDigits}`}</dd></div>
              </dl>

              {error && <p className="c500-error">{error}</p>}

              <button className="c500-btn" disabled={busy} onClick={processClaim}>
                {busy ? <Spin /> : "Add ₹500 to my account"}
              </button>
            </>
          )}

          {step === "success" && (
            <div className="c500-done">
              <SuccessMark />
              <h1 className="c500-title">₹500 added.</h1>
              <p className="c500-sub">
                {resultNote || "It's in your store-credit balance now."} Sign in with{" "}
                <strong>{email}</strong> at checkout to spend it.
              </p>
              <a className="c500-btn c500-btn--gold" href={storeUrl} target="_blank" rel="noreferrer">
                Go to the store
              </a>
              <p className="c500-legal">We've also sent the details to your WhatsApp.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- small presentational components ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="c500-field">
      <span className="c500-label">{label}</span>
      {children}
    </label>
  );
}

function Stepper({ step }: { step: Step }) {
  const order: Step[] = ["form", "otp", "confirm", "success"];
  const idx = order.indexOf(step);
  return (
    <div className="c500-stepper" aria-hidden>
      {order.slice(0, 3).map((s, i) => (
        <span key={s} className={`c500-dot ${i <= Math.min(idx, 2) ? "is-on" : ""}`} />
      ))}
    </div>
  );
}

function Crown() {
  return (
    <svg className="c500-crown" viewBox="0 0 48 36" fill="none" aria-hidden>
      <path
        d="M4 30h40l-3-19-9 8-7-15-7 15-9-8-3 19Z"
        fill="url(#c500g)"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="9" r="3" fill="url(#c500g)" />
      <circle cx="44" cy="9" r="3" fill="url(#c500g)" />
      <circle cx="24" cy="4" r="3" fill="url(#c500g)" />
      <defs>
        <linearGradient id="c500g" x1="0" y1="0" x2="48" y2="36">
          <stop stopColor="#f3e4b3" />
          <stop offset="1" stopColor="#c79a3a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Seal({ amount }: { amount: string }) {
  return (
    <div className="c500-seal" aria-hidden>
      <div className="c500-seal-ring">
        <span className="c500-seal-top">STORE CREDIT</span>
        <span className="c500-seal-amount">{amount}</span>
        <span className="c500-seal-bot">ONE WHO RULES</span>
      </div>
    </div>
  );
}

function SuccessMark() {
  return (
    <svg className="c500-check" viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" stroke="url(#c500g2)" strokeWidth="2" />
      <path d="M20 33l8 8 16-18" stroke="url(#c500g2)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="c500g2" x1="0" y1="0" x2="64" y2="64">
          <stop stopColor="#f3e4b3" />
          <stop offset="1" stopColor="#c79a3a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Spin() {
  return <span className="c500-spin" aria-label="Loading" />;
}

/* ---------- scoped styles ---------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

.c500 { --ink:#160f1c; --ink-2:#221630; --line:rgba(243,228,179,.16);
  --gold:#e6c463; --gold-2:#c79a3a; --gold-soft:#f3e4b3; --cream:#f4eee2; --muted:#b3a7bd;
  position:relative; min-height:100dvh; width:100%;
  display:flex; align-items:center; justify-content:center; padding:28px 18px;
  background:var(--ink); color:var(--cream);
  font-family:'Inter',system-ui,sans-serif; -webkit-font-smoothing:antialiased;
}
.c500 *{box-sizing:border-box}
.c500-bg{position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(120% 90% at 50% -10%, rgba(199,154,58,.20), transparent 55%),
    radial-gradient(80% 60% at 50% 120%, rgba(120,60,140,.18), transparent 60%),
    linear-gradient(180deg,#1b1224,#120c18);
}
.c500-card{position:relative; width:100%; max-width:460px;
  background:linear-gradient(180deg, rgba(34,22,48,.92), rgba(22,15,28,.92));
  border:1px solid var(--line); border-radius:22px; padding:30px 28px 26px;
  box-shadow:0 30px 80px -30px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.04);
}
.c500-head{display:flex; align-items:center; gap:10px; margin-bottom:18px}
.c500-crown{width:30px; height:auto; color:var(--gold-2)}
.c500-eyebrow{font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold-soft); opacity:.85}

.c500-stepper{display:flex; gap:7px; margin-bottom:22px}
.c500-dot{width:26px; height:3px; border-radius:3px; background:rgba(243,228,179,.16); transition:background .4s}
.c500-dot.is-on{background:linear-gradient(90deg,var(--gold-soft),var(--gold-2))}

.c500-panel{animation:c500in .45s cubic-bezier(.2,.7,.2,1)}
@keyframes c500in{from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none}}

.c500-title{font-family:'Cormorant Garamond',Georgia,serif; font-weight:600;
  font-size:30px; line-height:1.12; letter-spacing:.2px; margin:2px 0 8px; color:#fff}
.c500-sub{font-size:14px; line-height:1.55; color:var(--muted); margin:0 0 22px}
.c500-sub strong{color:var(--cream); font-weight:600}

.c500-field{display:block; margin-bottom:16px}
.c500-label{display:block; font-size:12px; color:var(--gold-soft); letter-spacing:.04em; margin-bottom:7px}
.c500-input{width:100%; height:48px; padding:0 14px; color:var(--cream); font-size:15px;
  background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:12px; outline:none;
  transition:border-color .2s, box-shadow .2s}
.c500-input::placeholder{color:rgba(179,167,189,.5)}
.c500-input:focus{border-color:var(--gold-2); box-shadow:0 0 0 3px rgba(199,154,58,.16)}
.c500-hint{display:block; font-size:11.5px; color:var(--muted); margin-top:6px}
.c500-phone{display:flex; align-items:stretch; gap:8px}
.c500-cc{display:flex; align-items:center; padding:0 14px; height:48px; border-radius:12px;
  background:rgba(255,255,255,.03); border:1px solid var(--line); color:var(--gold-soft); font-size:15px}
.c500-input--phone{flex:1; letter-spacing:.5px}

.c500-otp{display:flex; gap:9px; justify-content:space-between; margin:6px 0 20px}
.c500-otp-box{flex:1; aspect-ratio:1/1.12; min-width:0; text-align:center;
  font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:600; color:#fff;
  background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:12px; outline:none;
  transition:border-color .15s, box-shadow .15s, transform .15s}
.c500-otp-box:focus{border-color:var(--gold); box-shadow:0 0 0 3px rgba(199,154,58,.18); transform:translateY(-1px)}

.c500-btn{width:100%; height:50px; margin-top:4px; border:0; border-radius:12px; cursor:pointer;
  font-family:'Inter',sans-serif; font-size:15px; font-weight:600; letter-spacing:.02em; color:#1a1208;
  background:linear-gradient(180deg,var(--gold-soft),var(--gold-2));
  box-shadow:0 12px 26px -12px rgba(199,154,58,.7); transition:transform .12s, box-shadow .2s, opacity .2s;
  display:flex; align-items:center; justify-content:center}
.c500-btn:hover:not(:disabled){transform:translateY(-1px); box-shadow:0 16px 32px -12px rgba(199,154,58,.8)}
.c500-btn:active:not(:disabled){transform:translateY(0)}
.c500-btn:disabled{opacity:.45; cursor:not-allowed}
.c500-btn--gold{text-decoration:none}

.c500-row{display:flex; justify-content:space-between; margin-top:16px}
.c500-link{background:none; border:0; color:var(--gold-soft); font-size:13px; cursor:pointer; padding:4px 0}
.c500-link:hover:not(:disabled){text-decoration:underline}
.c500-link:disabled{color:var(--muted); cursor:default}

.c500-legal{font-size:11.5px; color:var(--muted); text-align:center; margin:14px 0 0; line-height:1.5}
.c500-error{font-size:13px; color:#f0b4b4; background:rgba(180,60,60,.12);
  border:1px solid rgba(220,120,120,.25); border-radius:10px; padding:10px 12px; margin:0 0 14px}

.c500-seal{display:flex; justify-content:center; margin:6px 0 20px}
.c500-seal-ring{width:138px; height:138px; border-radius:50%; display:flex; flex-direction:column;
  align-items:center; justify-content:center; text-align:center;
  border:2px solid rgba(243,228,179,.45);
  background:radial-gradient(circle at 50% 30%, rgba(243,228,179,.16), rgba(199,154,58,.06));
  box-shadow:inset 0 0 0 5px rgba(199,154,58,.12), 0 18px 40px -22px rgba(199,154,58,.7)}
.c500-seal-amount{font-family:'Cormorant Garamond',serif; font-size:42px; font-weight:700; color:var(--gold-soft); line-height:1}
.c500-seal-top,.c500-seal-bot{font-size:9px; letter-spacing:.22em; color:var(--gold); opacity:.9}
.c500-seal-top{margin-bottom:7px}
.c500-seal-bot{margin-top:7px}

.c500-summary{margin:0 0 22px; border:1px solid var(--line); border-radius:12px; overflow:hidden}
.c500-summary>div{display:flex; justify-content:space-between; gap:12px; padding:11px 14px;
  border-bottom:1px solid var(--line); font-size:13.5px}
.c500-summary>div:last-child{border-bottom:0}
.c500-summary dt{color:var(--muted); margin:0}
.c500-summary dd{margin:0; color:var(--cream); text-align:right; overflow:hidden; text-overflow:ellipsis}

.c500-done{text-align:center}
.c500-check{width:64px; height:64px; margin:0 auto 14px; display:block}
.c500-done .c500-title{margin-top:0}

.c500-spin{width:18px; height:18px; border-radius:50%;
  border:2px solid rgba(26,18,8,.35); border-top-color:#1a1208; animation:c500spin .7s linear infinite}
@keyframes c500spin{to{transform:rotate(360deg)}}

@media (max-width:420px){ .c500-card{padding:24px 20px} .c500-title{font-size:26px} .c500-otp{gap:7px} }
@media (prefers-reduced-motion:reduce){ .c500-panel,.c500-spin,.c500-otp-box{animation:none; transition:none} }
`;