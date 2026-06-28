// app/api/public/claim-500-store-credits/process-claim/route.ts
//
// POST   (session via cookie, CSRF via x-csrf-token header)
// Requires a verified session. Idempotently:
//   1. locks the per-store/per-email redemption,
//   2. finds/creates the Shopify customer (email + phone),
//   3. credits ₹500 to their store-credit account,
//   4. sends the "how to redeem" WhatsApp guide (best effort),
//   5. ends the session and clears the cookie.

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "@/lib/firebase-admin";
import {
  CLAIM,
  validateClaim500Session,
  redemptionDocId,
  toE164India,
  isRecent,
  claimErrorPayload,
} from "@/lib/claim500/helpers";
import {
  findOrCreateShopifyCustomer,
  addStoreCreditToCustomer,
} from "@/lib/shopify/claim500Shopify";
import { sendClaim500GuideWhatsAppMessage } from "@/lib/communication/whatsappMessagesSendingFuncs";

const isProd = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  try {
    const { session, ref, sessionId } = await validateClaim500Session(req);

    if (!session.otpVerified) {
      return NextResponse.json({ error: "OTP_NOT_VERIFIED" }, { status: 403 });
    }

    // Resolve store + storefront URL up front.
    const accountSnap = await db
      .collection(CLAIM.ACCOUNTS)
      .doc(session.shopName)
      .get();
    if (!accountSnap.exists) {
      return NextResponse.json({ error: "STORE_NOT_FOUND" }, { status: 404 });
    }
    const account = accountSnap.data()!;
    const storeUrl = resolveStoreUrl(account, session.storeId);

    // Already finished on this session — return the success payload again.
    if (session.status === "completed") {
      return finish({ storeUrl, alreadyClaimed: true });
    }

    const shopCtx = { shopName: session.shopName, accessToken: account.accessToken };
    const redemptionRef = db
      .collection(CLAIM.REDEMPTIONS)
      .doc(redemptionDocId(session.storeId, session.email));

    // -------- idempotency lock (transaction, no external calls inside) ------
    const lock = await db.runTransaction(async (tx) => {
      const sSnap = await tx.get(ref);
      const s = sSnap.data();
      if (!s) return { state: "invalid" as const };
      if (s.status === "completed") {
        return { state: "done" as const, customerId: s.shopifyCustomerId };
      }

      const rSnap = await tx.get(redemptionRef);
      if (rSnap.exists) {
        const r = rSnap.data()!;
        if (r.status === "completed") {
          // Credited under a different session — sync this session and stop.
          tx.update(ref, {
            status: "completed",
            shopifyCustomerId: r.customerId || null,
            completedAt: FieldValue.serverTimestamp(),
            note: "redeemed_via_other_session",
          });
          return { state: "already" as const };
        }
        if (r.status === "processing" && isRecent(r.startedAt, 120)) {
          return { state: "inprogress" as const };
        }
        // 'failed' or stale 'processing' -> allow retry (fall through).
      }

      tx.set(
        redemptionRef,
        {
          storeId: session.storeId,
          email: session.email,
          phone: session.phone,
          status: "processing",
          sessionId,
          startedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.update(ref, {
        status: "processing",
        processingStartedAt: FieldValue.serverTimestamp(),
      });
      return { state: "go" as const };
    });

    if (lock.state === "invalid") {
      return NextResponse.json({ error: "INVALID_SESSION" }, { status: 401 });
    }
    if (lock.state === "inprogress") {
      return NextResponse.json({ error: "IN_PROGRESS" }, { status: 409 });
    }
    if (lock.state === "done" || lock.state === "already") {
      return finish({ storeUrl, alreadyClaimed: true });
    }

    // -------- irreversible work (outside the transaction) ------------------
    try {
      const customer = await findOrCreateShopifyCustomer(shopCtx, {
        email: session.email,
        name: session.name,
      });

      await addStoreCreditToCustomer(shopCtx, {
        customerId: customer.id,
        amount: CLAIM.CREDIT_AMOUNT,
        currencyCode: CLAIM.CREDIT_CURRENCY,
      });

      // Mark the credit as done *before* the best-effort message, so a retry
      // can never double-credit.
      await redemptionRef.set(
        {
          status: "completed",
          customerId: customer.id,
          creditedAmount: CLAIM.CREDIT_AMOUNT,
          currency: CLAIM.CREDIT_CURRENCY,
          completedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await ref.update({
        status: "completed",
        shopifyCustomerId: customer.id,
        customerCreated: customer.created,
        creditedAmount: CLAIM.CREDIT_AMOUNT,
        completedAt: FieldValue.serverTimestamp(),
      });

      // Best-effort guide message — failure does not fail the claim.
      try {
        const shop = {
          shopName: session.shopName,
          whatsappPhoneNumberId: account.whatsappPhoneNumberId,
          whatsappAccessToken: account.whatsappAccessToken,
        };
        await sendClaim500GuideWhatsAppMessage(shop, session.phone, sessionId);
      } catch (e) {
        console.error("[claim-500] guide message failed (non-fatal):", e);
      }

      return finish({ storeUrl, customerCreated: customer.created });
    } catch (e) {
      // Release the lock so the customer can retry.
      await redemptionRef
        .set(
          { status: "failed", error: String(e), failedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        .catch(() => {});
      await ref
        .update({ status: "verified", processingStartedAt: FieldValue.delete() })
        .catch(() => {});
      console.error("[claim-500 process-claim] fulfilment error:", e);
      return NextResponse.json({ error: "FULFILMENT_FAILED" }, { status: 502 });
    }
  } catch (err) {
    const { code, status } = claimErrorPayload(err);
    if (status === 500) console.error("[claim-500 process-claim]", err);
    return NextResponse.json({ error: code }, { status });
  }
}

function finish(data: {
  storeUrl: string;
  alreadyClaimed?: boolean;
  customerCreated?: boolean;
}) {
  const res = NextResponse.json({ success: true, ...data });
  // Session is spent — clear the cookie.
  res.cookies.set(CLAIM.COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    maxAge: 0,
    path: CLAIM.COOKIE_PATH,
  });
  return res;
}

function resolveStoreUrl(account: any, storeId: string): string {
  const domain = account.storeUrl || account.primaryDomain || account.domain;
  if (domain) return String(domain).startsWith("http") ? domain : `https://${domain}`;
  return `https://${storeId}.myshopify.com`;
}