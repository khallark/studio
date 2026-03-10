// /api/business/generate-remittance-table/route.ts

import { authUserForBusiness } from '@/lib/authoriseUser';
import { db } from '@/lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

const CLOUD_FUNCTION_URL =
    'https://asia-south1-orderflow-jnig7.cloudfunctions.net/generateRemittanceTable';

const ENQUEUE_FUNCTION_SECRET = process.env.ENQUEUE_FUNCTION_SECRET!;
    
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_COURIERS = ['Blue Dart', 'Delhivery'] as const;
type SupportedCourier = typeof SUPPORTED_COURIERS[number];

const FIRESTORE_KEY: Record<SupportedCourier, string> = {
    'Blue Dart': 'blueDart',
    'Delhivery': 'delhivery',
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { businessId, startDate, endDate, courier } = body as {
            businessId?: string;
            startDate?: string;
            endDate?: string;
            courier?: string;
        };

        if (!businessId || !startDate || !endDate || !courier) {
            return NextResponse.json(
                { error: 'businessId, startDate, endDate, and courier are required.' },
                { status: 400 }
            );
        }

        if (!SUPPORTED_COURIERS.includes(courier as SupportedCourier)) {
            return NextResponse.json(
                { error: `courier must be one of: ${SUPPORTED_COURIERS.join(', ')}` },
                { status: 400 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
            return NextResponse.json(
                { error: 'Dates must be in yyyy-MM-dd format.' },
                { status: 400 }
            );
        }
        if (startDate > endDate) {
            return NextResponse.json(
                { error: 'startDate must not be after endDate.' },
                { status: 400 }
            );
        }

        const fsKey = FIRESTORE_KEY[courier as SupportedCourier];
        const businessDocRef = db.collection('users').doc(businessId);

        // Set loading state
        await businessDocRef.set(
            {
                remittanceTable: {
                    [fsKey]: {
                        loading: true,
                        startDate,
                        endDate,
                        error: null,
                    },
                },
            },
            { merge: true }
        );

        // Fire-and-forget
        await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': ENQUEUE_FUNCTION_SECRET,
            },
            body: JSON.stringify({ businessId, startDate, endDate, courier }),
        }).catch((err) => {
            console.error('[generate-remittance-table] CF call failed:', err);
            businessDocRef.update({
                [`remittanceTable.${fsKey}.loading`]: false,
                [`remittanceTable.${fsKey}.error`]: err.message ?? 'Failed to call cloud function',
            });
        });

        return NextResponse.json({ success: true, status: 'processing' }, { status: 202 });
    } catch (error: unknown) {
        console.error('[generate-remittance-table] Error:', error);
        return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
    }
}