
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';

function genUniqueId(): string {
  const dateStr = Date
    .now()
    .toString(36); // convert num to base 36 and stringify

  const randomStr = Math
    .random()
    .toString(36)
    .substring(2, 8); // start at index 2 to skip decimal point

  return `${dateStr}-${randomStr}`;
}

export async function POST(req: NextRequest) {
    try {
        const { str } = await req.json();

        const coll = db.collection('indexing-errors').doc(genUniqueId());
        coll.set({
            str
        }, { merge: true });

        return NextResponse.json({ success: true, }, { status: 200 });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
