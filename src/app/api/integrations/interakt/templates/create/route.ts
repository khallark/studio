
import { NextRequest, NextResponse } from 'next/server';
import { db, auth as adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

async function getUserIdFromToken(req: NextRequest): Promise<string | null> {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await adminAuth.verifyIdToken(idToken);
            return decodedToken.uid;
        } catch (error) {
            console.error('Error verifying auth token:', error);
            return null;
        }
    }
    return null;
}

// Helper to parse button configurations from the form data
const processButtons = (data: any) => {
    const buttons = [];
    if (data.hasCopyCode && data.copyCodeText) {
        buttons.push({ type: 'COPY_CODE', text: data.copyCodeText, example: ['SAMPLE_CODE'] });
    }
    if (data.hasUrl && data.urlText && data.urlLink) {
        buttons.push({ type: 'URL', text: data.urlText, url: data.urlLink });
    }
    if (data.hasQuickReply && data.quickReplyText) {
        buttons.push({ type: 'QUICK_REPLY', text: data.quickReplyText });
    }
    if (data.hasCall && data.callPhoneNumber) {
        buttons.push({ type: 'PHONE_NUMBER', text: 'Call Us', phone_number: data.callPhoneNumber });
    }
    return buttons;
};

// Helper to find variables in body text
const parseExistingVariables = (bodyText: string) => {
    const regex = /\{\{(\d+)\}\}/g;
    const matches = bodyText.match(regex);
    return matches ? [...new Set(matches)] : [];
};


export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized: Could not identify user.' }, { status: 401 });
        }

        const formData = await req.formData();
        const shop = formData.get('shop') as string;
        const templateDataString = formData.get('templateData') as string;
        const file = formData.get('file') as File | null;

        if (!shop || !templateDataString) {
            return NextResponse.json({ error: 'Shop and template data are required' }, { status: 400 });
        }
        
        const templateData = JSON.parse(templateDataString);

        // Fetch API Key from Firestore
        const accountDoc = await db.collection('accounts').doc(shop).get();
        if (!accountDoc.exists) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        const interaktApiKey = accountDoc.data()?.integrations?.communication?.interakt?.apiKey;
        if (!interaktApiKey) {
            return NextResponse.json({ error: 'Interakt API key not configured for this shop.' }, { status: 412 });
        }

        const AUTH_HEADER = { 'Authorization': `Basic ${interaktApiKey}` };

        // Step 1: Upload media if necessary
        let headerMediaHandle: string | null = null;
        if (file && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(templateData.headerType)) {
            const mediaFormData = new FormData();
            mediaFormData.append('file', file);
            
            const uploadResponse = await fetch(`https://api.interakt.ai/v1/public/message_template_media/upload/?file_category=message_template_media`, {
                method: 'POST',
                headers: AUTH_HEADER,
                body: mediaFormData,
            });

            const uploadResult = await uploadResponse.json();
            if (!uploadResponse.ok || !uploadResult.data?.media_id) {
                console.error('Interakt Media Upload Failed:', uploadResult);
                throw new Error(uploadResult.message || 'Failed to upload media file to Interakt.');
            }
            headerMediaHandle = uploadResult.data.media_id;
        }

        // Step 2: Construct the template payload
        const payload: { [key: string]: any } = {
            name: templateData.templateName.trim(),
            category: templateData.templateCategory,
            language: templateData.templateLanguage.toLowerCase(),
            components: [],
        };
        
        // Header Component
        if (templateData.headerType !== 'NONE') {
            const headerComponent: { [key: string]: any } = {
                type: 'HEADER',
                format: templateData.headerType,
            };
            if (templateData.headerType === 'TEXT') {
                headerComponent.text = templateData.headerText.trim();
            } else if (headerMediaHandle) {
                headerComponent.example = { header_handle: [headerMediaHandle] };
            }
            payload.components.push(headerComponent);
        }

        // Body Component
        const bodyComponent: { [key: string]: any } = {
            type: 'BODY',
            text: templateData.bodyText.trim(),
        };
        const variables = parseExistingVariables(templateData.bodyText);
        if (variables.length > 0) {
            bodyComponent.example = { body_text: [variables.map((v, i) => `Sample for variable ${i+1}`)] };
        }
        payload.components.push(bodyComponent);

        // Footer Component
        if (templateData.footerText?.trim()) {
            payload.components.push({ type: 'FOOTER', text: templateData.footerText.trim() });
        }

        // Buttons Component
        if (templateData.buttonType === 'WITH_BUTTONS') {
            const buttons = processButtons(templateData);
            if (buttons.length > 0) {
                payload.components.push({ type: 'BUTTONS', buttons });
            }
        }
        
        // Step 3: Call Interakt API to create the template
        const createResponse = await fetch('https://api.interakt.ai/v1/public/templates/', {
            method: 'POST',
            headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        const createResult = await createResponse.json();

        if (!createResponse.ok) {
            console.error("Interakt Template Creation Failed:", createResult);
            throw new Error(createResult.message || `Template creation failed: ${createResponse.statusText}`);
        }

        // Step 4: Store the submitted template in Firestore for tracking
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
