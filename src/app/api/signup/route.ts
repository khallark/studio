// app/api/signup/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth, db } from '@/lib/firebase-admin';
import { serverTimestamp } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { idToken, displayName, email, phone } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: 'No authentication token provided' },
        { status: 401 }
      );
    }

    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    const uid = decodedToken.uid;

    // Create or update user document in Firestore
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create new user document
      await userRef.set({
        stores: [],
        businesses: [],
        profile: {
          displayName: displayName || email,
          email: email,
          phone: phone || null,
        },
        lastLoginAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      return NextResponse.json({
        success: true,
        message: 'User document created successfully',
        userId: uid,
      });
    } else {
      // Update existing user document
      await userRef.update({
        lastLoginAt: serverTimestamp(),
        'profile.displayName': displayName || email,
        'profile.email': email,
        ...(phone && { 'profile.phone': phone }),
      });

      return NextResponse.json({
        success: true,
        message: 'User document updated successfully',
        userId: uid,
      });
    }
  } catch (error) {
    console.error('Error in signup API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}