// apps/web/src/app/api/integrations/bluedart/update/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, customerCode, loginId, licenceKey } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!customerCode || !loginId || !licenceKey) {
      return NextResponse.json({ 
        error: 'customerCode, loginId, and licenceKey are all required' 
      }, { status: 400 });
    }

    const { businessDoc } = result;

    await businessDoc?.ref.set({
      integrations: {
        couriers: {
          bluedart: {
            customerCode,
            loginId,
            licenceKey
          }
        }
      },
      lastUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ message: 'Blue Dart integration successfully updated.' });
  } catch (error) {
    console.error('Error updating Blue Dart integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ 
      error: 'Failed to update Blue Dart integration', 
      details: errorMessage 
    }, { status: 500 });
  }
}