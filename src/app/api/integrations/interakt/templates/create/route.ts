
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const INTERAKT_API_BASE = 'https://api.interakt.ai/v1/public';

async function getUserIdAndShop(req: NextRequest): Promise<{ userId: string; shop: string; idToken: string }> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized: No token provided.');
    
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.activeAccountId) {
        throw new Error('Forbidden: No active account found for user.');
    }
    return { userId, shop: userDoc.data()?.activeAccountId, idToken };
}

async function getInteraktApiKey(shop: string): Promise<string> {
    const accountDoc = await db.collection('accounts').doc(shop).get();
    const apiKey = accountDoc.data()?.integrations?.communication?.interakt?.apiKey;
    if (!apiKey) throw new Error('Interakt API Key not configured for this shop.');
    return apiKey;
}

// Helper to parse variables from body text for the 'example' field
function parseBodyVariables(text: string): string[][] | undefined {
    const matches = text.match(/\{\{(\d+)\}\}/g);
    if (!matches) return undefined;

    // Create an array of arrays, with one example value for each variable found
    return [matches.map((_, index) => `example_for_var_${index + 1}`)];
}


export async function POST(req: NextRequest) {
  try {
    const { shop } = await getUserIdAndShop(req);
    const apiKey = await getInteraktApiKey(shop);

    const formData = await req.formData();
    const headerFile = formData.get('headerFile') as File | null;
    let headerMediaHandle: string | null = null;
    
    // Step 1: Upload Media if it exists
    if (headerFile) {
        const fileUploadFormData = new FormData();
        fileUploadFormData.append('file', headerFile);

        const uploadResponse = await fetch(`${INTERAKT_API_BASE}/track/files/upload_to_fb/?fileCategory=message_template_media`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${apiKey}` },
            body: fileUploadFormData,
        });

        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) {
            throw new Error(uploadResult.message || `Media upload failed: ${uploadResponse.statusText}`);
        }
        headerMediaHandle = uploadResult.handle || uploadResult.media_id;
        if (!headerMediaHandle) throw new Error("Failed to get media handle from Interakt.");
    }

    // Step 2: Prepare and create the template
    const components: any[] = [];

    // Header
    const headerType = formData.get('headerType') as string;
    if (headerType && headerType !== 'NONE') {
        const headerComponent: any = { type: 'HEADER', format: headerType };
        if (headerType === 'TEXT') {
            headerComponent.text = formData.get('headerText') as string;
        } else if (headerMediaHandle) {
            headerComponent.example = { header_handle: [headerMediaHandle] };
        }
        components.push(headerComponent);
    }
    
    // Body (always required)
    const bodyText = formData.get('bodyText') as string;
    const bodyComponent: any = { type: 'BODY', text: bodyText };
    const bodyVars = parseBodyVariables(bodyText);
    if (bodyVars) {
        bodyComponent.example = { body_text: bodyVars };
    }
    components.push(bodyComponent);

    // Footer
    const footerText = formData.get('footerText') as string;
    if (footerText) {
        components.push({ type: 'FOOTER', text: footerText });
    }

    // Buttons
    const buttonType = formData.get('buttonType') as string;
    const buttons: any[] = [];
    if (buttonType === 'COPY_CODE') {
        buttons.push({ type: 'COPY_CODE', text: formData.get('copyCodeText') as string });
    } else if (buttonType === 'URL_QUICK_REPLIES') {
        const quickReplies = formData.getAll('quickReplies[]');
        quickReplies.forEach(qr => buttons.push({ type: 'QUICK_REPLY', text: qr as string }));

        const urlText = formData.get('callToActionUrlText') as string;
        if (urlText) {
            buttons.push({ type: 'URL', text: urlText, url: formData.get('callToActionUrl') as string });
        }
        const phoneText = formData.get('callToActionPhoneText') as string;
        if (phoneText) {
            buttons.push({ type: 'PHONE_NUMBER', text: phoneText, phone_number: formData.get('callToActionPhone') as string });
        }
    }

    if (buttons.length > 0) {
        components.push({ type: 'BUTTONS', buttons });
    }
    
    const templatePayload = {
      name: (formData.get('templateName') as string).toLowerCase().replace(/\s+/g, '_'),
      category: formData.get('templateCategory') as string,
      language: formData.get('language') as string,
      components: components
    };
    
    const createResponse = await fetch(`${INTERAKT_API_BASE}/templates`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
    });
    
    const createResult = await createResponse.json();

    if (!createResponse.ok) {
        throw new Error(createResult.message || `Template creation failed: ${createResponse.statusText}`);
    }

    // Step 3: Store the submitted template in Firestore for tracking
    if (createResult.data?.id) {
        const templateRef = db.collection('accounts').doc(shop).collection('communications').doc('interakt').collection('templates').doc(createResult.data.id);
        await templateRef.set({
            ...createResult,
            linkedCategory: null, // Initially uncategorized
            webhookEvents: [],
        });
    }

    return NextResponse.json({ message: 'Template submitted successfully', data: createResult.data });
  } catch (error) {
    console.error('Error creating Interakt template:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to create template', details: errorMessage }, { status: 500 });
  }
}
