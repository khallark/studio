import { NextRequest, NextResponse } from "next/server";

/**
 * GET /validate-indian-pin-serviceability?pincode=XXXXXX
 *
 * Public, no-auth endpoint for the storefront "deliver to my pincode?" widget.
 * Checks Delhivery serviceability from the Ludhiana origin and returns an
 * approximate delivery time when available.
 *
 * ── Serviceability decision ────────────────────────────────────────────────
 * Two Delhivery APIs answer DIFFERENT questions:
 *   • pin-codes/json  → "is this pin in Delhivery's network at all?" (origin-independent)
 *   • expected_tat    → "from 141008, can I ship it + how many days?" (lane-specific; only one with a day count)
 *
 * We treat the pin as SERVICEABLE if EITHER source affirms it (OR semantics).
 * Rationale: an expected_tat failure while pin-codes says serviceable is almost
 * always a mode (Surface/Express) or transient issue — not true non-serviceability.
 * Vetoing on expected_tat would falsely reject real customers and lose sales.
 * A genuinely bad pin fails BOTH, so OR never leaks invalid pins through.
 *
 * The day count ALWAYS comes from expected_tat (the only source that has it).
 * If only pin-codes affirms, estimatedDays is null and the UI shows
 * "Delivery available" without a number.
 *
 * To make this stricter later:
 *   • AND semantics (require both)  → change `serviceable` to use && 
 *   • expected_tat authoritative    → set `serviceable = tat.ok`
 * ───────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";

const ORIGIN_PIN = "141008"; // Ludhiana warehouse
const PINCODE_RE = /^[1-9]\d{5}$/; // 6 digits, first digit 1-9 (valid Indian PIN format)
const UPSTREAM_TIMEOUT_MS = 8000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // public read-only data, safe to open
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function reply(body: unknown, init?: { status?: number; cache?: boolean }) {
  const headers: Record<string, string> = { ...CORS_HEADERS };
  // Serviceability changes rarely — let the CDN cache definitive answers briefly.
  if (init?.cache) headers["Cache-Control"] = "public, max-age=300, s-maxage=3600";
  return NextResponse.json(body, { status: init?.status ?? 200, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── Upstream fetch with timeout ─────────────────────────────────────────────

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // network error / timeout / bad JSON → treated as "no answer"
  } finally {
    clearTimeout(timer);
  }
}

// ─── expected_tat (per mode) ─────────────────────────────────────────────────

type TatResult =
  | { kind: "ok"; days: number }
  | { kind: "not_serviceable" }
  | { kind: "invalid" }
  | { kind: "error" };

async function getTat(pincode: string, mot: "S" | "E"): Promise<TatResult> {
  const url =
    `https://track.delhivery.com/api/dc/expected_tat` +
    `?origin_pin=${ORIGIN_PIN}&destination_pin=${pincode}&mot=${mot}`;

  const data = await fetchJson(url);
  if (data === null) return { kind: "error" };

  if (data?.success === true && data?.data?.tat != null) {
    const days = Number(data.data.tat);
    if (Number.isFinite(days)) return { kind: "ok", days };
    return { kind: "error" };
  }

  // success:false — classify the failure
  const msg = String(data?.msg ?? "").toLowerCase();
  if (msg.includes("not valid pin") || msg.includes("not a valid pin")) {
    return { kind: "invalid" };
  }
  return { kind: "not_serviceable" };
}

// ─── pin-codes/json ──────────────────────────────────────────────────────────

type PinCodesResult = "serviceable" | "empty" | "error";

async function getPinCodes(pincode: string): Promise<PinCodesResult> {
  const url =
    `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${pincode}`;
  const data = await fetchJson(url);
  if (data === null) return "error";
  const codes = data?.delivery_codes;
  if (Array.isArray(codes) && codes.length > 0) return "serviceable";
  return "empty";
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const pincode = (req.nextUrl.searchParams.get("pincode") ?? "").trim();

  if (!pincode) {
    return reply({ error: "pincode is required" }, { status: 400 });
  }

  // Local format check first — avoids hitting Delhivery for obviously bad input.
  if (!PINCODE_RE.test(pincode)) {
    return reply({ pincode, serviceable: false, reason: "invalid_pincode" });
  }

  // Run all three checks in parallel. Surface preferred for the day count
  // (realistic COD mode); Express as a coverage fallback.
  const [pinCodes, tatS, tatE] = await Promise.all([
    getPinCodes(pincode),
    getTat(pincode, "S"),
    getTat(pincode, "E"),
  ]);

  const serviceable =
    pinCodes === "serviceable" || tatS.kind === "ok" || tatE.kind === "ok";

  if (serviceable) {
    // Prefer Surface's TAT; fall back to Express; null if only pin-codes affirmed.
    let estimatedDays: number | null = null;
    let mode: "S" | "E" | null = null;
    if (tatS.kind === "ok") {
      estimatedDays = tatS.days;
      mode = "S";
    } else if (tatE.kind === "ok") {
      estimatedDays = tatE.days;
      mode = "E";
    }

    return reply(
      { pincode, serviceable: true, estimatedDays, mode, origin: ORIGIN_PIN },
      { cache: true },
    );
  }

  // Not serviceable. Distinguish "Delhivery is down / unreachable" from a real "no".
  const allErrored =
    pinCodes === "error" && tatS.kind === "error" && tatE.kind === "error";
  if (allErrored) {
    return reply({ error: "upstream_unavailable" }, { status: 502 });
  }

  const sawInvalid = tatS.kind === "invalid" || tatE.kind === "invalid";
  return reply(
    {
      pincode,
      serviceable: false,
      reason: sawInvalid ? "invalid_pincode" : "not_serviceable",
      origin: ORIGIN_PIN,
    },
    { cache: true },
  );
}