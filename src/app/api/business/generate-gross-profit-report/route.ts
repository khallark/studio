// /api/business/generate-gross-profit-report

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

const CLOUD_FUNCTION_URL =
    'https://asia-south1-orderflow-jnig7.cloudfunctions.net/grossProfitReport';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, startDate, endDate } = body as {
            businessId?: string;
            startDate?: string;
            endDate?: string;
        };

        if (!businessId || !startDate || !endDate) {
            return NextResponse.json(
                { error: 'businessId, startDate, and endDate are required.' },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
        if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
            return NextResponse.json({ error: 'Dates must be in yyyy-mm-dd format.' }, { status: 400 });
        }
        if (startDate > endDate) {
            return NextResponse.json({ error: 'startDate must not be after endDate.' }, { status: 400 });
        }

        // Set loading state in Firestore
        const businessDocRef = db.collection('users').doc(businessId);
        await businessDocRef.set(
            {
                grossProfitData: {
                    loading: true,
                    startDate,
                    endDate,
                    error: null,
                },
            },
            { merge: true }
        );

        // Fire-and-forget
        fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, startDate, endDate }),
        }).catch((err) => {
            console.error('[generate-gross-profit-report] CF call failed:', err);
            businessDocRef.update({
                'grossProfitData.loading': false,
                'grossProfitData.error': err.message ?? 'Failed to call cloud function',
            });
        });

        return NextResponse.json({ success: true, status: 'processing' }, { status: 202 });

    } catch (error: unknown) {
        console.error('[generate-gross-profit-report] Error:', error);
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}