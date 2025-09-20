
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

const VALID_CATEGORIES = ['New', 'Confirmed', 'Ready To Dispatch', 'Dispatched', null];

export async function POST(req: NextRequest) {
  try {
    const { shop, templateId, category } = await req.json();

    if (!shop || !templateId || category === undefined) {
      return NextResponse.json({ error: 'Shop, templateId, and category (can be null) are required' }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category provided' }, { status: 400 });
    }
    
    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }
    
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists() || !userDoc.data()?.accounts.includes(shop)) {
        return NextResponse.json({ error: 'Forbidden: User is not authorized to edit this shop.' }, { status: 403 });
    }

    const templateRef = db.collection('accounts').doc(shop).collection('communications').doc('interakt').collection('templates').doc(templateId);

    // Also need to ensure the previously linked template (if any for this category) is unlinked.
    // For now, we are just updating the one template. A more robust solution might use a transaction.
    
    await templateRef.update({
      linkedCategory: category,
    });

    return NextResponse.json({ message: `Template category successfully updated.` });
  } catch (error) {
    console.error('Error updating template category:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update category', details: errorMessage }, { status: 500 });
  }
}
