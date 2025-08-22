
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc, serverTimestamp, getDoc, arrayUnion } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { cookies } from 'next/headers';

// This is a simplified way to get the user. 
// In a real app, you'd use a more robust session management solution.
async function getCurrentUserId() {
    // This is not a secure way to get the user, but it works for this prototype
    // It relies on the client sending the UID in a cookie
    const cookieStore = cookies()
    const userCookie = cookieStore.get('user_uid');
    return userCookie?.value || null;
}


export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const hmac = searchParams.get('hmac'); // We should validate the HMAC for security

  if (!code || !shop) {
    return NextResponse.redirect('/dashboard/connect?error=invalid_callback');
  }

  // In a production app, you MUST validate the HMAC to ensure the request is from Shopify.
  // We are skipping this for simplicity in this prototype.

  const shopifyApiKey = process.env.SHOPIFY_API_KEY;
  const shopifyApiSecret = process.env.SHOPIFY_API_SECRET;

  if (!shopifyApiKey || !shopifyApiSecret) {
    console.error('Shopify API credentials are not set in environment variables.');
    return NextResponse.redirect('/dashboard/connect?error=config_error');
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
      return NextResponse.redirect('/dashboard/connect?error=token_exchange_failed');
    }

    const userId = await getCurrentUserId();
    if (!userId) {
        return NextResponse.redirect('/login?error=unauthenticated');
    }

    // --- Create Account and link to User ---

    // 1. Create a new document in the 'accounts' collection
    const accountRef = doc(db, 'accounts', shop); // Using shop name as a unique ID for the account
    await setDoc(accountRef, {
      type: 'shopify',
      shopName: shop,
      accessToken: accessToken, // IMPORTANT: In a real app, encrypt this token!
      installedAt: serverTimestamp(),
      installedBy: userId,
    });

    // 2. Update the user's document
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      const isFirstAccount = !userData.accounts || userData.accounts.length === 0;

      await updateDoc(userRef, {
        accounts: arrayUnion(shop),
        // If it's the first account, set it as primary and active
        ...(isFirstAccount && {
          primaryAccountId: shop,
          activeAccountId: shop,
        }),
      });
    }

    // Redirect to the dashboard on success
    const dashboardUrl = new URL('/dashboard', process.env.SHOPIFY_APP_URL);
    return NextResponse.redirect(dashboardUrl);

  } catch (error) {
    console.error('Error during Shopify callback:', error);
    const connectUrl = new URL('/dashboard/connect', process.env.SHOPIFY_APP_URL);
    connectUrl.searchParams.set('error', 'internal_error');
    return NextResponse.redirect(connectUrl);
  }
}
