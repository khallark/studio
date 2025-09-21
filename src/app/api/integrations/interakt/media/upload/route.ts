// app/api/integrations/interakt/media/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { db } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify Firebase token
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await auth().verifyIdToken(idToken);

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const activeAccountId = formData.get('shop') as string;

    if (!file || !activeAccountId) {
      return NextResponse.json(
        { error: 'Missing file or shop parameter' },
        { status: 400 }
      );
    }

    // Get account's Interakt keys
    const accountRef = db.collection('accounts').doc(activeAccountId);
    const accountDoc = await accountRef.get();
    
    if (!accountDoc.exists) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const accountData = accountDoc.data();
    const interaktKeys = accountData?.integrations?.communication?.interakt;
    
    if (!interaktKeys?.apiKey) {
      return NextResponse.json(
        { error: 'Interakt API key not configured' },
        { status: 400 }
      );
    }

    // Create FormData for Interakt API
    const uploadFormData = new FormData();
    uploadFormData.append('uploadFile', file);

    // Upload to Interakt
    const uploadResponse = await fetch(
      'https://api.interakt.ai/v1/public/track/files/upload_to_fb/?fileCategory=message_template_media',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${interaktKeys.apiKey}`,
        },
        body: uploadFormData,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();

    if (uploadResult.result && uploadResult.data?.file_handle) {
      return NextResponse.json({
        success: true,
        data: {
          file_handle: uploadResult.data.file_handle,
          file_url: uploadResult.data.file_url,
          file_name: uploadResult.data.file_name,
        },
      });
    } else {
      throw new Error('Upload failed: No file handle received');
    }

  } catch (error) {
    console.error('Media upload error:', error);
    
    return NextResponse.json(
      {
        error: 'Media upload failed',
        details: error instanceof Error ? error.message : 'An unknown error occurred',
      },
      { status: 500 }
    );
  }
}