import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusinessAndStore } from '@/lib/authoriseUser';

const VALID_SERVICES = ['bookReturnPage'] as const;

type ValidService = typeof VALID_SERVICES[number];

function isValidService(value: unknown): value is ValidService {
  return typeof value === 'string' && VALID_SERVICES.includes(value as ValidService);
}

export async function POST(req: NextRequest) {
  try {
    const { businessId, storeId, serviceName, isEnabled } = await req.json();

    if (!businessId || typeof businessId !== 'string') {
      return NextResponse.json(
        { error: 'No business id provided.' },
        { status: 400 }
      );
    }

    if (!storeId || typeof storeId !== 'string') {
      return NextResponse.json(
        { error: 'No store id provided.' },
        { status: 400 }
      );
    }

    if (!isValidService(serviceName) || typeof isEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'storeId, serviceName, and isEnabled are required.' },
        { status: 400 }
      );
    }

    const result = await authUserForBusinessAndStore({
      businessId,
      shop: storeId,
      req,
    });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    const storeRef = db.collection('accounts').doc(storeId);

    await storeRef.set(
      {
        customerServices: {
          [serviceName]: {
            enabled: isEnabled,
          },
        },
        lastUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: `Service '${serviceName}' successfully ${isEnabled ? 'enabled' : 'disabled'} for store '${storeId}'.`,
    });

  } catch (error) {
    console.error('Error toggling store service:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'An unknown error occurred';

    return NextResponse.json(
      {
        error: 'Failed to update service status',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}