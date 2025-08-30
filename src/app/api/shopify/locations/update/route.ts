
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: NextRequest) {
  try {
    const { shop, locationId, location } = await req.json();

    if (!shop || !locationId || !location) {
      return NextResponse.json({ error: 'Shop, locationId, and location data are required' }, { status: 400 });
    }

    // Optional: Add more specific validation for location fields
    const { name, address, city, postcode, country } = location;
    if (!name || !address || !city || !postcode || !country) {
        return NextResponse.json({ error: 'All location fields are required' }, { status: 400 });
    }

    // In a real app, you would also verify user permissions here
    
    const locationRef = db.collection('accounts').doc(shop).collection('pickupLocations').doc(locationId);
    
    // Check if the location exists before updating
    const docSnap = await locationRef.get();
    if (!docSnap.exists) {
        return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    await locationRef.update({
      ...location,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ message: 'Pickup location successfully updated.' });
  } catch (error) {
    console.error('Error updating pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to update location', details: errorMessage }, { status: 500 });
  }
}
