// app/api/business/generate-tax-report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authUserForBusiness } from '@/lib/authoriseUser';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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
                { error: 'Validation Error', message: 'the business is not authorized to access this store' },
                { status: 403 }
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

        console.log('🚀 Calling Cloud Function:', {
            url: CLOUD_FUNCTION_URL,
            storeId,
            startDate,
            endDate
        });

        // ✅ Call Cloud Function with timeout
        let response: Response;
        try {
            response = await Promise.race([
                fetch(CLOUD_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Api-Key': ENQUEUE_FUNCTION_SECRET,
                    },
                    body: JSON.stringify({
                        businessId,
                        startDate,
                        endDate,
                        storeId,
                    }),
                }),
                new Promise<Response>((_, reject) =>
                    setTimeout(() => reject(new Error('Cloud Function request timeout')), 10000)
                )
            ]);
        } catch (error: any) {
            console.error('❌ Cloud Function request failed:', error);
            return NextResponse.json(
                {
                    error: 'Cloud Function Error',
                    message: error.message === 'Cloud Function request timeout'
                        ? 'The request to generate the report timed out. Please try again.'
                        : 'Failed to initiate report generation. Please try again.'
                },
                { status: 503 }
            );
        }

        // ✅ Validate response status
        if (!response.ok) {
            console.error('❌ Cloud Function returned error status:', response.status);

            let errorMessage = 'Failed to initiate report generation';
            let errorDetails = null;

            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
                errorDetails = errorData;
            } catch (parseError) {
                // If response is not JSON, try to get text
                try {
                    const errorText = await response.text();
                    if (errorText) {
                        errorMessage = errorText;
                    }
                } catch {
                    // Ignore parsing errors
                }
            }

            console.error('Cloud Function error details:', errorDetails);

            return NextResponse.json(
                {
                    error: 'Cloud Function Error',
                    message: errorMessage,
                    status: response.status,
                    ...(errorDetails && { details: errorDetails })
                },
                { status: response.status >= 500 ? 503 : 400 }
            );
        }

        // ✅ Parse and validate response body
        let responseData: any;
        try {
            responseData = await response.json();
        } catch (parseError) {
            console.error('❌ Failed to parse Cloud Function response:', parseError);
            return NextResponse.json(
                {
                    error: 'Invalid Response',
                    message: 'Received invalid response from report generation service'
                },
                { status: 500 }
            );
        }

        // ✅ Validate response contains expected fields
        if (!responseData.success) {
            console.error('❌ Cloud Function returned unsuccessful response:', responseData);
            return NextResponse.json(
                {
                    error: 'Report Generation Failed',
                    message: responseData.message || 'Failed to queue report generation',
                    details: responseData
                },
                { status: 400 }
            );
        }

        console.log('✅ Cloud Function call successful:', {
            taskName: responseData.taskName,
            status: responseData.status,
            dateRange: responseData.dateRange
        });

        // ✅ Return success - report is queued
        return NextResponse.json({
            success: true,
            message: 'Tax report generation has been initiated. You will receive the report on WhatsApp shortly.',
            taskName: responseData.taskName,
            dateRange: responseData.dateRange,
            status: responseData.status || 'queued'
        }, { status: 202 }); // 202 Accepted - request accepted for processing

    } catch (error: any) {
        console.error('❌ Tax report API error:', error);
        return NextResponse.json(
            {
                error: 'Internal Server Error',
                message: error.message || 'An unexpected error occurred'
            },
            { status: 500 }
        );
    }
}