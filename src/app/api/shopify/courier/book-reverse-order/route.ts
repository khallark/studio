import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      return decodedToken.uid;
    } catch (error) {
      console.error('Error verifying auth token:', error);
      return null;
    }
  }
  return null;
}

type LineItem = {
  id: string | number;
  title?: string;
  name?: string;
  quantity?: number;
  grams?: number;     // Shopify often stores grams per item
  weight?: number;    // or weight in kg
  variant_title?: string;
  sku?: string | null;
};

/** Classify Delhivery create-shipment response */
function evalDelhiveryResp(carrier: any): {
    ok: boolean;
    retryable: boolean;
    code: string;
    message: string;
    carrierShipmentId?: string | null;
} {
    const remarksArr = carrier.packages[0].remarks;
    let remarks = "";
    if (Array.isArray(remarksArr)) remarks = remarksArr.join("\n ");

    // Success signals seen in Delhivery responses
    const waybill =
    carrier?.shipment_id ?? carrier?.packets?.[0]?.waybill ?? carrier?.waybill ?? null;

    const okFlag = (carrier?.success === true && carrier?.error !== true) || Boolean(waybill);

    if (okFlag) {
    return {
        ok: true,
        retryable: false,
        code: "OK",
        message: "created",
        carrierShipmentId: waybill,
    };
    }

    // ----- Known permanent validation/business errors (non-retryable) -----
    return {
    ok: false,
    retryable: false,
    code: "CARRIER_AMBIGUOUS",
    message: remarks,
    };
}

const DLV_CREATE_URL = 'https://track.delhivery.com/api/cmu/create.json';

async function postToDelhivery(apiKey: string, payload: any) {
  // Try application/x-www-form-urlencoded with format=json&data=<stringified JSON>
  const body = new URLSearchParams({ format: "json", data: JSON.stringify(payload) });

  let resp = await fetch(DLV_CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      Accept: "application/json",
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  return resp.json();
}

export async function POST(req: NextRequest) {
  try {
    const { shop, orderId, awb, shipping_mode, line_items_skus, pickupName } = await req.json();

    // Validate inputs
    if (
      !shop ||
      !orderId ||
      !awb ||
      !pickupName ||
      !Array.isArray(line_items_skus) ||
      line_items_skus.length === 0
    ) {
      return NextResponse.json({
        ok: false,
        reason: 'Bad Payload'
      }, { status: 400 });
    }

    // Auth
    const userId = await getUserIdFromToken(req);
    if (!userId) {
      return NextResponse.json({
        ok: false,
        reason: 'Unauthorized'
    }, { status: 401 });
    }

    // Read account & API key
    const accountRef = db.collection('accounts').doc(shop);
    const accountSnap = await accountRef.get();
    const accountData = accountSnap.data() || {};
    const delhiveryApiKey =
      accountData?.integrations?.couriers?.delhivery?.apiKey as string | undefined;
    if (!delhiveryApiKey) {
      return NextResponse.json({ 
        ok: false,
        reason: 'Carrier Key missing'
    }, { status: 400 });
    }

    // Read order
    const orderRef = accountRef.collection('orders').doc(String(orderId));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return NextResponse.json({
        ok: false,
        reason: 'Order Not found'
    }, { status: 404 });
    }
    const orderData = orderSnap.data() as any;

    // Prefer shipping address, fallback to billing
    const addr =
      orderData.raw.shipping_address ||
      orderData.raw.billing_address || {
        name: undefined,
        first_name: undefined,
        last_name: undefined,
        address1: undefined,
        address2: undefined,
        city: undefined,
        province: undefined,
        country: 'India',
        zip: undefined,
        phone: orderData.phone,
      };

    const consigneeName =
      addr?.name ||
      [addr?.first_name, addr?.last_name].filter(Boolean).join(' ').trim() ||
      'Customer';

    const addLine = [addr?.address1, addr?.address2].filter(Boolean).join(', ');
    const phone = addr?.phone || orderData.phone || '';
    const city = addr?.city || '';
    const state = addr?.province || '';
    const country = addr?.country || 'India';
    const pin = addr?.zip || '';

    // Build products_desc + quantity from selected line_items
    const lineItems: LineItem[] = Array.isArray(orderData.raw.line_items) ? orderData.raw.line_items : [];
    const idSet = new Set(line_items_skus.map((x: any) => String(x)));
    const selected = lineItems.filter(li => idSet.has(String(li.sku)));

    if (selected.length === 0) {
      return NextResponse.json({
        ok: false,
        reason: 'No selected line items'
      }, { status: 400 });
    }

    const products_desc = selected.length?
    selected
      .map(li => {
        const name = li?.name || li?.title || "Item";
        const qty = Number(li?.quantity ?? 1);
        return `${name} x ${qty}`;
      })
      .join(', ').slice(0, 500)
    : "";

    const totalQty = selected.reduce((sum, li) => sum + (li.quantity ?? 1), 0);

    // Optional weight calculation (kg). If you track grams or kg per item, sum them.
    const totalWeightGm = orderData?.raw?.total_weight;
    // If not available, you can leave it blank; Delhivery will still accept.
    const weightField = String(totalWeightGm) ?? '';

    function normalizePhoneNumber(phoneNumber: string): string {
      // Remove all whitespace characters from the phone number
      const cleanedNumber = phoneNumber.replace(/\s/g, "");

      // Check if the cleaned number length is >= 10
      if (cleanedNumber.length >= 10) {
        // Extract the last 10 digits
        return cleanedNumber.slice(-10);
      } else {
        // Return the whole string if length is less than 10
        return cleanedNumber;
      }
    }

    // Build shipment payload (reverse)
    const shipment: any = {
      name: consigneeName,
      add: addLine,
      pin,
      city,
      state,
      country,
      phone: normalizePhoneNumber(phone),
      order: String(orderData.name || orderData.raw.name),
      payment_mode: 'Pickup',           // **Reverse**
      return_pin: '',
      return_city: '',
      return_phone: '',
      return_add: '',
      return_state: '',
      return_country: '',
      products_desc,
      hsn_code: '',
      cod_amount: '',                   // not applicable in reverse
      order_date: null,                 // optional
      total_amount: '',                 // optional (fill if you want declared value)
      seller_add: '',
      seller_name: '',
      seller_inv: '',
      quantity: String(totalQty),
      waybill: String(awb),
      shipment_width: "10",
      shipment_height: "10",
      shipment_length: "10",
      weight: weightField,              // '' if unknown
      address_type: '',
    };

    if (shipping_mode) {
      // Only set if caller provided (Surface/Express); else let account default apply
      shipment.shipping_mode = shipping_mode;
    }

    const payload: any = {
      shipments: [shipment],
      pickup_location: { name: String(pickupName) },
    };

    // Call Delhivery
    const dlvResp = await postToDelhivery(delhiveryApiKey, payload);
    if(dlvResp.ok) {
        return NextResponse.json(
        {
            ok: false,
            reason: "HTTP Error",
            response: dlvResp
        },
        { status: 502 }
        )
    }
    
    const verdict = evalDelhiveryResp(((t: string) => {
      try {
        return JSON.parse(t);
      } catch {
        return { raw: t };
      }
    })(dlvResp.text()))
    if(!verdict.ok) {
        return NextResponse.json(
        {
            ok: false,
            reason: verdict.message,
            response: dlvResp
        },
        { status: 502 }
        )
    }

    await orderRef.set({ awb_reverse: String(awb), customStatus: 'DTO Booked' }, { merge: true });

    return NextResponse.json(
    {
        ok: true,
        response: dlvResp,
    },
    { status: 200 }
    );
  } catch (error: any) {
    console.error('Reverse create failed:', error);
    return NextResponse.json(
      {
        ok: false,
        reason: error?.message || 'Unknown',
        body: error?.body,
      },
      { status: 502 }
    );
  }
}
