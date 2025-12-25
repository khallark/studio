import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// This is a simplified way to get the user.
// In a real app, you'd use a more robust session management solution.
async function getCurrentUserId() {
    // This is not a secure way to get the user, but it works for this prototype
    // It relies on the client sending the UID in a cookie
    const cookieStore = cookies();
    const userCookie = cookieStore.get('user_uid');
    return userCookie?.value || null;
}

async function registerWebhooks(shop: string, accessToken: string) {
    const appUrl = process.env.SHOPIFY_APP_URL;
    if (!appUrl) {
        console.error('SHOPIFY_APP_URL is not defined. Cannot register webhooks.');
        return;
    }

    const webhookUrl = `${appUrl}/webhooks/orders`;
    
    // ✅ UPDATED: Now includes product webhooks
    const webhooks = [
        // Order webhooks
        { topic: 'orders/create', address: webhookUrl },
        { topic: 'orders/updated', address: webhookUrl },
        { topic: 'orders/delete', address: webhookUrl },
        // Product webhooks (NEW!)
        { topic: 'products/create', address: webhookUrl },
        { topic: 'products/update', address: webhookUrl },
        { topic: 'products/delete', address: webhookUrl },
    ];

    for (const webhook of webhooks) {
        try {
            const response = await fetch(`https://${shop}/admin/api/2025-07/webhooks.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ webhook: { ...webhook, format: 'json' } }),
            });
            const data = await response.json();
            if (!response.ok) {
                // ✅ Handle "already exists" gracefully
                if (response.status === 422 && JSON.stringify(data.errors).includes('has already been taken')) {
                    console.log(`⏭️ Webhook ${webhook.topic} already registered for ${shop}`);
                } else {
                    console.error(`❌ Failed to register ${webhook.topic} webhook:`, data);
                }
            } else {
                console.log(`✅ Successfully registered ${webhook.topic} webhook for ${shop}`);
            }
        } catch (error) {
            console.error(`❌ Error registering ${webhook.topic} webhook:`, error);
        }
    }
}


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac');
  const state = searchParams.get('state');
  
  const cookieStore = cookies();
  const savedState = cookieStore.get('shopify_oauth_state')?.value;

  // 1. State Validation for CSRF protection
  if (!state || !savedState || state !== savedState) {
      console.error('State validation failed');
      return NextResponse.redirect(new URL('/dashboard/connect?error=invalid_state', req.url)); 
  }

  // Clear the state cookie after validation
  cookieStore.delete('shopify_oauth_state');


  const shopifyApiSecret = process.env.SHOPIFY_API_SECRET;

  if (!shopifyApiSecret) {
    console.error('Shopify API secret is not set.');
    return NextResponse.redirect(new URL('/dashboard/connect?error=config_error', req.url));
  }
  
  // 2. HMAC Validation
  if (hmac) {
    const map = Object.fromEntries(searchParams.entries());
    delete map['hmac'];
    const message = new URLSearchParams(map).toString();
    
    const generatedHmac = crypto
      .createHmac('sha256', shopifyApiSecret)
      .update(message)
      .digest('hex');

    if (generatedHmac !== hmac) {
      console.error('HMAC validation failed');
      return NextResponse.redirect(new URL('/dashboard/connect?error=invalid_hmac', req.url));
    }
  } else {
      console.error('HMAC missing from callback');
      return NextResponse.redirect(new URL('/dashboard/connect?error=invalid_hmac', req.url));
  }


  if (!code || !shop) {
    return NextResponse.redirect(new URL('/dashboard/connect?error=invalid_callback', req.url));
  }

  const shopifyApiKey = process.env.SHOPIFY_API_KEY;

  if (!shopifyApiKey) {
    console.error('Shopify API credentials are not set in environment variables.');
    return NextResponse.redirect(new URL('/dashboard/connect?error=config_error', req.url));
  }

  try {
    // 3. Exchange the authorization code for an access token
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: shopifyApiKey,
        client_secret: shopifyApiSecret,
        code,
      }),
    });

    const data = await response.json();
    const accessToken = data.access_token;

    if (!accessToken) {
      console.error('Failed to get access token:', data);
      return NextResponse.redirect(new URL('/dashboard/connect?error=token_exchange_failed', req.url));
    }

    const userId = await getCurrentUserId();
    if (!userId) {
        console.error('Could not determine user ID during Shopify callback.');
        return NextResponse.redirect(new URL('/login?error=unauthenticated', req.url));
    }

    // --- Create Account and link to User ---

    // 1. Create/Update the account document
    // NOTE: {merge: true} ensures existing data (orders, products, etc.) is preserved!
    const accountRef = db.collection('accounts').doc(shop);
    await accountRef.set({
      type: 'shopify',
      shopName: shop,
      accessToken: accessToken, // IMPORTANT: In a real app, encrypt this token!
      installedAt: FieldValue.serverTimestamp(),
      installedBy: userId,
    }, {merge: true});
    
    // 2. Register Webhooks (now includes products!)
    await registerWebhooks(shop, accessToken);


    // Redirect to the dashboard on success
    const dashboardUrl = new URL('/dashboard', process.env.SHOPIFY_APP_URL || req.url);
    return NextResponse.redirect(dashboardUrl);

  } catch (error) {
    console.error('Error during Shopify callback:', error);
    const connectUrl = new URL('/dashboard/connect', process.env.SHOPIFY_APP_URL || req.url);
    connectUrl.searchParams.set('error', 'internal_error');
    return NextResponse.redirect(connectUrl);
  }
}