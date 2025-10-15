// app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';

// GET - Webhook verification
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('Webhook verification request:', { mode, token, challenge });

  // Verify token matches
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_SECRET) {
    console.log('✅ Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  console.log('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST - Receive webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    console.log('📩 Webhook received:', JSON.stringify(body, null, 2));

    // Extract message details if present
    if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
      const messages = body.entry[0].changes[0].value.messages;
      console.log('💬 Messages:', JSON.stringify(messages, null, 2));
    }

    // Extract status updates if present
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) {
      const statuses = body.entry[0].changes[0].value.statuses;
      console.log('📊 Status updates:', JSON.stringify(statuses, null, 2));
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}