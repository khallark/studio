
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }
  const computedSignature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));
}

export async function POST(req: NextRequest) {
  try {
    const shopDomain = req.nextUrl.searchParams.get('shop');
    const signature = req.headers.get('x-interakt-signature') || '';

    if (!shopDomain) {
      console.error('Interakt Webhook: Missing shop query parameter.');
      return NextResponse.json({ error: 'Shop domain is required' }, { status: 400 });
    }

    const accountRef = db.collection('accounts').doc(shopDomain);
    const accountDoc = await accountRef.get();

    if (!accountDoc.exists) {
      console.error(`Interakt Webhook: Account not found for shop: ${shopDomain}`);
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const webhookKey = accountDoc.data()?.integrations?.communication?.interakt?.webhookKey;
    if (!webhookKey) {
      console.error(`Interakt Webhook: Webhook secret key not configured for shop: ${shopDomain}`);
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const rawBody = await req.text();
    const isVerified = verifyWebhookSignature(rawBody, signature, webhookKey);

    if (!isVerified) {
      console.warn(`Interakt Webhook: Invalid signature for shop: ${shopDomain}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const topic = payload.topic;

    switch (topic) {
      case 'message_template_status_update':
        await handleTemplateStatusUpdate(shopDomain, payload);
        break;
      // Other topics can be handled here in the future
      default:
        console.log(`Interakt Webhook: Received unhandled topic "${topic}" for shop: ${shopDomain}`);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error) {
    console.error('Error processing Interakt webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Webhook processing failed', details: errorMessage }, { status: 500 });
  }
}

async function handleTemplateStatusUpdate(shop: string, payload: any) {
  const templateId = payload.data?.message_template_id;
  const newStatus = payload.data?.event;
  const rejectionReason = payload.data?.rejection_reason;

  if (!templateId || !newStatus) {
    console.error('Interakt Webhook (template_status_update): Missing template ID or new status in payload.', payload);
    return;
  }

  const templateRef = db.collection('accounts').doc(shop).collection('communications').doc('interakt').collection('templates').doc(templateId);

  const templateDoc = await templateRef.get();
  if (!templateDoc.exists) {
    console.warn(`Interakt Webhook: Received status update for non-existent template ${templateId} in shop ${shop}`);
    return;
  }
  
  const updateData: { [key: string]: any } = {
    'data.approval_status': newStatus.toUpperCase(),
    'webhookEvents': FieldValue.arrayUnion({
        event: newStatus,
        timestamp: FieldValue.serverTimestamp(),
        payload: payload.data
    }),
    'modified_at_utc': FieldValue.serverTimestamp()
  };

  if (rejectionReason) {
    updateData['data.rejection_reason'] = rejectionReason;
  }

  await templateRef.update(updateData);
  console.log(`Updated template ${templateId} for shop ${shop} to status ${newStatus}.`);
}
