
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { FieldValue } from 'firebase-admin/firestore';

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

    const webhookUrl = `${appUrl}/api/webhooks/orders`;
    const webhooks = [
        { topic: 'orders/create', address: webhookUrl },
        { topic: 'orders/updated', address: webhookUrl },
        { topic: 'orders/delete', address: webhookUrl },
    ];

    for (const webhook of webhooks) {
        try {
            const response = await fetch(`https://${shop}/admin/api/2024-04/webhooks.json`, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ webhook: { ...webhook, format: 'json' } }),
            });
            const data = await response.json();
            if (!response.ok) {
                console.error(`Failed to register ${webhook.topic} webhook:`, data);
            } else {
                console.log(`Successfully registered ${webhook.topic} webhook.`);
            }
        } catch (error) {
            console.error(`Error registering ${webhook.topic} webhook:`, error);
        }
    }
}


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const shop = search_params.get('shop');
  const hmac = search_params.get('hmac'); // We should validate the HMAC for security

  if (!code || !shop) {
    return NextResponse.redirect(new URL('/dashboard/connect?error=invalid_callback', req.url));
  }

  // In a production app, you MUST validate the HMAC to ensure the request is from Shopify.
  // We are skipping this for simplicity in this prototype.

  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  const shopifyApiSecret = process.env.SHOPIFY_API_SECRET;

  if (!shopifyApiKey || !shopifyApiSecret) {
    console.error('Shopify API credentials are not set in environment variables.');
    return NextResponse.redirect(new URL('/dashboard/connect?error=config_error', req.url));
  }

  try {
    // Exchange the authorization code for an access token
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

    // 1. Create a new document in the 'accounts' collection
    const accountRef = db.collection('accounts').doc(shop); // Using shop name as a unique ID for the account
    await accountRef.set({
      type: 'shopify',
      shopName: shop,
      accessToken: accessToken, // IMPORTANT: In a real app, encrypt this token!
      installedAt: FieldValue.serverTimestamp(),
      installedBy: userId,
    });

    // 2. Update the user's document
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const isFirstAccount = !userData?.accounts || userData.accounts.length === 0;
      
      const updateData: { [key: string]: any } = {
        accounts: FieldValue.arrayUnion(shop),
      };

      if (isFirstAccount) {
        updateData.primaryAccountId = shop;
        updateData.activeAccountId = shop;
      }
      
      await userRef.update(updateData);
    }
    
    // 3. Register Webhooks
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
