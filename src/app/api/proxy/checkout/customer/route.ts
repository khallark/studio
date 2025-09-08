// app/api/proxy/checkout/customer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { verifyAppProxySignature } from "@/lib/verifyAppProxy";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_SECRET = process.env.SHOPIFY_API_SECRET || "";

// -- Helpers --
const ok = (data: unknown) => NextResponse.json(data, { status: 200 });
const err = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const getBody = async (req: NextRequest) => req.json().catch(() => null);

// --- Context Verification (App Proxy + Session) ---
async function verifyContext(req: NextRequest) {
  if (!verifyAppProxySignature(req.url, APP_SECRET)) {
    return { error: err("bad signature", 401) };
  }

  const body = await getBody(req);
  const sessionId = body?.sessionId ?? new URL(req.url).searchParams.get("sessionId");
  const phone = body?.phone ?? new URL(req.url).searchParams.get("phone");

  if (!sessionId || !phone) {
    return { error: err("missing sessionId or phone", 400) };
  }

  const sessionRef = db.collection("checkout_sessions").doc(sessionId);
  const snap = await sessionRef.get();

  if (!snap.exists) {
    return { error: err("session not found", 404) };
  }

  const s = snap.data() as any;
  if (s?.customerPhone !== phone) {
    return { error: err("phone mismatch", 403) };
  }

  const customerRef = db.collection("checkout_customers").doc(phone);
  return { customerRef, body };
}

// --- GET: Fetch all customer details ---
export async function GET(req: NextRequest) {
  const { customerRef, error } = await verifyContext(req);
  if (error) return error;

  const doc = await customerRef.get();
  if (!doc.exists) {
    return ok({ ok: true, details: [] });
  }

  const data = doc.data();
  return ok({ ok: true, details: data?.customer_details || [] });
}

// --- POST: Add, Update, or Delete a customer detail entry ---
export async function POST(req: NextRequest) {
  const { customerRef, body, error } = await verifyContext(req);
  if (error) return error;
  if (!body) return err("invalid request body", 400);

  const { action, payload } = body;
  if (!action || !payload) {
    return err("action and payload are required", 400);
  }

  const snap = await customerRef.get();
  if (!snap.exists) return err("customer not found", 404);

  const currentDetails = snap.data()?.customer_details || [];

  switch (action) {
    case "add": {
      if (!payload.name || !payload.shipping_address) return err("missing required fields for new address", 400);
      const newDetail = {
        id: crypto.randomUUID(),
        ...payload,
      };
      await customerRef.update({
        customer_details: FieldValue.arrayUnion(newDetail),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ok({ ok: true, message: "Address added", newDetail });
    }

    case "update": {
      if (!payload.id) return err("missing id for update", 400);
      const index = currentDetails.findIndex((d: any) => d.id === payload.id);
      if (index === -1) return err("address not found", 404);
      
      const updatedDetails = [...currentDetails];
      updatedDetails[index] = { ...updatedDetails[index], ...payload };

      await customerRef.update({
        customer_details: updatedDetails,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ok({ ok: true, message: "Address updated" });
    }

    case "delete": {
      if (!payload.id) return err("missing id for delete", 400);
      const detailToDelete = currentDetails.find((d: any) => d.id === payload.id);
      if (!detailToDelete) return err("address not found to delete", 404);
      
      await customerRef.update({
        customer_details: FieldValue.arrayRemove(detailToDelete),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ok({ ok: true, message: "Address deleted" });
    }

    default:
      return err("invalid action", 400);
  }
}
