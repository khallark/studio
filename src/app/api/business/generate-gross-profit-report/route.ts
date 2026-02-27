import { authUserForBusiness } from '@/lib/authoriseUser';
import { NextRequest, NextResponse } from 'next/server';

const CLOUD_FUNCTION_URL =
    'https://asia-south1-orderflow-jnig7.cloudfunctions.net/grossProfitReport';

export async function POST(req: NextRequest) {
    try {
        // ── 1. Parse & validate body ───────────────────────────────────────────
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
        
        // ── 2. Authenticate ────────────────────────────────────────────────────
        const result = await authUserForBusiness({ businessId, req });

        if(!result.authorised) {
            const { error, status } = result;
            return NextResponse.json(
                { error }, { status }
            );
        }

        const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
        if (!DATE_REGEX.test(startDate) || !DATE_REGEX.test(endDate)) {
            return NextResponse.json(
                { error: 'Dates must be in yyyy-mm-dd format.' },
                { status: 400 }
            );
        }

        if (startDate > endDate) {
            return NextResponse.json(
                { error: 'startDate must not be after endDate.' },
                { status: 400 }
            );
        }

        // ── 3. Call Cloud Function ─────────────────────────────────────────────
        const cfResponse = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ businessId, startDate, endDate }),
        });

        if (!cfResponse.ok) {
            const errorData = await cfResponse.json().catch(() => ({}));
            return NextResponse.json(
                { error: errorData.error ?? 'Cloud function returned an error.' },
                { status: cfResponse.status }
            );
        }

        const { downloadUrl } = (await cfResponse.json()) as { downloadUrl: string };

        if (!downloadUrl) {
            return NextResponse.json(
                { error: 'No download URL returned from report generator.' },
                { status: 500 }
            );
        }

        // ── 4. Fetch Excel from Storage & stream to client ─────────────────────
        const fileResponse = await fetch(downloadUrl);

        if (!fileResponse.ok) {
            return NextResponse.json(
                { error: 'Failed to download the generated report file.' },
                { status: 502 }
            );
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        const filename = `gross-profit-report_${startDate}_${endDate}.xlsx`;

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type':
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Length': String(fileBuffer.byteLength),
            },
        });
    } catch (error: unknown) {
        console.error('[generate-gross-profit-report] Error:', error);
        return NextResponse.json(
            {
                error: 'Internal server error.',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}