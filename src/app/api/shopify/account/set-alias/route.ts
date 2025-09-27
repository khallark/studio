
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

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

export async function POST(req: NextRequest) {
  try {
    const { shop, alias } = await req.json();

    if (!shop || !alias) {
      return NextResponse.json({ error: 'Shop and alias are required' }, { status: 400 });
    }
    
    // Validate alias format (lowercase, numbers, hyphens)
    if (!/^[a-z0-9-]+$/.test(alias)) {
        return NextResponse.json({ error: 'Alias can only contain lowercase letters, numbers, and hyphens.' }, { status: 400 });
    }

    const userId = await getUserIdFromToken(req);
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
    }

    const accountRef = db.collection('accounts').doc(shop);
    const aliasRef = db.collection('store_aliases').doc(alias);

    await db.runTransaction(async (transaction) => {
        const aliasDoc = await transaction.get(aliasRef);
        if (aliasDoc.exists) {
            throw new Error(`Alias "${alias}" is already taken.`);
        }
        
        const accountDoc = await transaction.get(accountRef);
        if (!accountDoc.exists) {
            throw new Error('Shop account not found.');
        }

        // Check if user is authorized for this shop
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists || !userDoc.data()?.accounts.includes(shop)) {
            throw new Error('Forbidden: User is not authorized to edit this shop.');
        }

        // Set the alias in the global collection
        transaction.set(aliasRef, {
            mapped_store: shop,
            createdAt: FieldValue.serverTimestamp(),
            createdBy: userId,
        });
        
        // Update the account document with the new alias
        transaction.update(accountRef, {
            storeAlias: alias,
            lastUpdatedAt: FieldValue.serverTimestamp(),
        });
    });

    return NextResponse.json({ message: 'Store alias successfully set.' });
  } catch (error) {
    console.error('Error setting store alias:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to set alias', details: errorMessage }, { status: 500 });
  }
}
