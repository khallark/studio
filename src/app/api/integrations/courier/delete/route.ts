
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { authUserForBusiness } from '@/lib/authoriseUser';

export async function POST(req: NextRequest) {
  try {
    const { businessId, courierName } = await req.json();

    if (!businessId) {
      return NextResponse.json({ error: 'No business id provided.' }, { status: 400 });
    }

    // ----- Auth -----
    const result = await authUserForBusiness({ businessId, req });

    if (!result.authorised) {
      const { error, status } = result;
      return NextResponse.json({ error }, { status });
    }

    if (!courierName) {
      return NextResponse.json({ error: 'courierName is required' }, { status: 400 });
    }

    const { businessDoc } = result;

    const updatePayload: { [key: string]: any } = {
      [`integrations.couriers.${courierName}`]: FieldValue.delete(),
      'integrations.couriers.priorityList': FieldValue.arrayRemove(courierName),
      lastUpdatedAt: FieldValue.serverTimestamp(),
    };

    const currentPriority = businessDoc?.data()?.integrations?.couriers?.priorityList || [];
    const newPriority = currentPriority.filter((p: any) => p.name !== courierName);
    updatePayload['integrations.couriers.priorityList'] = newPriority;
    await businessDoc?.ref.update(updatePayload);

    return NextResponse.json({ message: `${courierName} integration successfully removed.` });
  } catch (error) {
    console.error('Error removing courier integration:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to remove integration', details: errorMessage }, { status: 500 });
  }
}
