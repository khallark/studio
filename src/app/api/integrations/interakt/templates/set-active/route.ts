
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

const VALID_CATEGORIES = ['New', 'Confirmed', 'Ready To Dispatch', 'Dispatched'];

export async function POST(req: NextRequest) {
  try {
    const { shop, category, templateId } = await req.json();

    if (!shop || !category || templateId === undefined) {
      return NextResponse.json({ error: 'Shop, category, and templateId (can be null) are required' }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category provided' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
        return NextResponse.json({ error: 'Forbidden: User is not authorized for this shop.' }, { status: 403 });
    }

    const settingsRef = db.collection('accounts').doc(shop).collection('communications').doc('interakt').collection('settings').doc('category_settings');
    
    const fieldToUpdate = `activeTemplateFor${category.replace(/\s/g, '')}`;

    await settingsRef.set({
      [fieldToUpdate]: templateId, // templateId can be a string or null
    }, { merge: true });

    return NextResponse.json({ message: `Active template for ${category} successfully updated.` });
  } catch (error) {
    console.error('Error setting active template:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to set active template', details: errorMessage }, { status: 500 });
  }
}
