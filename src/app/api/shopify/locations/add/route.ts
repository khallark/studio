
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const { shop, location } = await req.json();

    if (!shop || !location) {
      return NextResponse.json({ error: 'Shop and location data are required' }, { status: 400 });
    }

    const { name, address, city, postcode, country } = location;
    if (!name || !address || !city || !postcode || !country) {
        return NextResponse.json({ error: 'All location fields are required' }, { status: 400 });
    }

    // In a real app, you would also verify user permissions here
    
    const accountRef = db.collection('accounts').doc(shop);
    const locationsCollection = accountRef.collection('pickupLocations');

    await locationsCollection.add({
      ...location,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Pickup location successfully added.' });
  } catch (error) {
    console.error('Error adding pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to add location', details: errorMessage }, { status: 500 });
  }
}
