// app/api/checkout/customer/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const JWT_SECRET = process.env.CHECKOUT_JWT_SECRET || "";

interface AuthenticatedContext {
    sessionId: string;
    phone: string;
}

// --- Auth & Verification Helper ---
async function verifyAndGetContext(req: NextRequest): Promise<AuthenticatedContext | NextResponse> {
    if (!JWT_SECRET) {
      console.error("CHECKOUT_JWT_SECRET missing");
      return NextResponse.json({ error: "server config error" }, { status: 500 });
    }

    const token = req.cookies.get("checkout_token")?.value;
    if (!token) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    
    let decoded: any;
    try {
        decoded = jwt.verify(token, JWT_SECRET, { audience: "checkout" });
    } catch (err) {
        return NextResponse.json({ error: "invalid or expired token" }, { status: 401 });
    }

    const { session_id: sessionId, phone_no: phone } = decoded;
    if (!sessionId || !phone) {
        return NextResponse.json({ error: "malformed token" }, { status: 401 });
    }

    // Security check: ensure session exists and phone number matches
    const sessionRef = db.collection('checkout_sessions').doc(sessionId);
    const snap = await sessionRef.get();
    if (!snap.exists) return NextResponse.json({ error: "session not found" }, { status: 404 });
    
    const sessionPhone = snap.data()?.customerPhone;
    if (sessionPhone !== phone) {
         return NextResponse.json({ error: "token/session mismatch" }, { status: 403 });
    }

    return { sessionId, phone };
}


// --- GET handler: Fetch customer details ---
export async function GET(req: NextRequest) {
    const context = await verifyAndGetContext(req);
    if (context instanceof NextResponse) return context; // Error response

    try {
        const customerRef = db.collection("checkout_customers").doc(context.phone);
        const doc = await customerRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: "customer not found" }, { status: 404 });
        }
        
        const customerData = doc.data() || {};
        return NextResponse.json({
            ok: true,
            phone: customerData.phone,
            name: customerData.name,
            email: customerData.email,
            address: customerData.address,
        });

    } catch (err) {
        console.error("Error fetching customer:", err);
        return NextResponse.json({ error: "internal server error" }, { status: 500 });
    }
}

// --- POST handler: Update customer details ---
export async function POST(req: NextRequest) {
    const context = await verifyAndGetContext(req);
    if (context instanceof NextResponse) return context; // Error response

    try {
        const body = await req.json();
        const { name, email, address } = body;

        // Basic validation
        if (typeof name !== 'string' || typeof email !== 'string' || typeof address !== 'string') {
            return NextResponse.json({ error: "invalid data format" }, { status: 400 });
        }

        const customerRef = db.collection("checkout_customers").doc(context.phone);
        await customerRef.update({
            name,
            email,
            address,
            updatedAt: FieldValue.serverTimestamp(),
        });
        
        return NextResponse.json({ ok: true, message: "Details updated" });

    } catch (err) {
        console.error("Error updating customer:", err);
        const errorMessage = err instanceof Error ? err.message : "internal server error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
