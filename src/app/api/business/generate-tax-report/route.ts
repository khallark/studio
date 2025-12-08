// app/api/business/generate-tax-report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness,  } from '@/lib/authoriseUser';

const CLOUD_FUNCTION_URL = process.env.GENERATE_CUSTOM_TAX_REPORT_URL!;
const ENQUEUE_FUNCTION_SECRET = process.env.ENQUEUE_FUNCTION_SECRET!;
export async function POST(req: NextRequest) {
    try {
        const { businessId, storeId, startDate, endDate } = await req.json();

        if (!businessId || typeof businessId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'businessId is required and must be a string' },
                { status: 400 }
            );
        }

        // Get authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Missing or invalid authorization header' },
                { status: 401 }
            );
        }

        const result = await authUserForBusiness({ businessId, req });
        const { businessDoc } = result;

        if (!result.authorised) {
            const { error, status } = result;
            return NextResponse.json({ error }, { status });
        }

        // Validate inputs
        if (!storeId || typeof storeId !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'storeId is required and must be a string' },
                { status: 400 }
            );
        }

        if (!startDate || typeof startDate !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'startDate is required and must be a string (YYYY-MM-DD)' },
                { status: 400 }
            );
        }

        if (!endDate || typeof endDate !== 'string') {
            return NextResponse.json(
                { error: 'Validation Error', message: 'endDate is required and must be a string (YYYY-MM-DD)' },
                { status: 400 }
            );
        }

        const stores = businessDoc?.data()?.stores;
        if (stores && Array.isArray(stores) && !stores.includes(storeId)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'the business is not auth to access this store' },
                { status: 400 }
            );
        }

        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Dates must be in YYYY-MM-DD format' },
                { status: 400 }
            );
        }

        // Validate date range
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'Invalid date values' },
                { status: 400 }
            );
        }

        if (start > end) {
            return NextResponse.json(
                { error: 'Validation Error', message: 'startDate must be before or equal to endDate' },
                { status: 400 }
            );
        }

        console.log(CLOUD_FUNCTION_URL, ENQUEUE_FUNCTION_SECRET, businessId, storeId, startDate, endDate, start, end);

        // ✅ FIRE-AND-FORGET: Trigger Cloud Function without awaiting
        fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "X-Api-Key": ENQUEUE_FUNCTION_SECRET,
            },
            body: JSON.stringify({
                startDate,
                endDate,
                storeId,
            })
        }).catch((error) => {
            // Log error but don't block the response
            console.error('Cloud Function trigger error:', error);
        }).finally(() => {
            console.log('Request sent');
        });

        // ✅ Return immediately - don't wait for Cloud Function
        return NextResponse.json({
            success: true,
            message: 'Tax report generation has been initiated. You will receive the report on WhatsApp shortly.',
        }, { status: 202 }); // 202 Accepted - request accepted for processing

    } catch (error: any) {
        console.error('Tax report API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred'
            },
            { status: 500 }
        );
    }
}