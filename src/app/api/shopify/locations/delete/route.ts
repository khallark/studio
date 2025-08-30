
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const { shop, locationId } = await req.json();

    if (!shop || !locationId) {
      return NextResponse.json({ error: 'Shop and locationId are required' }, { status: 400 });
    }

    // In a real app, you would also verify user permissions here
    
    const locationRef = db.collection('accounts').doc(shop).collection('pickupLocations').doc(locationId);

    await locationRef.delete();

    return NextResponse.json({ message: 'Pickup location successfully deleted.' });
  } catch (error) {
    console.error('Error deleting pickup location:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to delete location', details: errorMessage }, { status: 500 });
  }
}
