// app/api/integrations/interakt/templates/create/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { db as adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

interface ButtonConfig {
  type: 'quick_reply' | 'url' | 'phone_number';
  text: string;
  url?: string;
  phoneNumber?: string;
}

interface TemplateData {
  name: string;
  category: string;
  buttonType: 'none' | 'buttons';
  language: string;
  headerType: 'none' | 'text' | 'image' | 'video' | 'document';
  headerText: string;
  headerMediaHandle?: string; // Pre-uploaded media handle from dialog
  headerMediaFileUrl?: string;
  headerMediaFileName?: string;
  body: string;
  footer: string;
  buttons: ButtonConfig[];
}

const parseExistingVariables = (text: string): number[] => {
    const variableRegex = /\{\{(\d+)\}\}/g;
    const matches = [...text.matchAll(variableRegex)];
    return matches.map(match => parseInt(match[1])).sort((a, b) => a - b);
};

// Convert undefined values to null
const sanitizeObject = (obj: any): any => {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined)
            sanitized[key] = null;
        else if (typeof value === 'object' && value !== null)
            sanitized[key] = sanitizeObject(value);
        else
            sanitized[key] = value;
    }
    return sanitized;
};

// Build template payload for Interakt API
function buildTemplatePayload(templateData: TemplateData) {
  const payload: any = {
    display_name: templateData.name.trim(),
    language: templateData.language === 'en' ? 'English' : templateData.language,
    category: templateData.category,
    body: templateData.body.trim(),
  };

  const variables = parseExistingVariables(templateData.body);
  if (variables.length > 0) {
    // Generate sample values based on variable count
    payload.body_text = variables.map((varNum, index) => {
        switch (index) {
        case 0: return "John Doe";        // First variable - typically name
        case 1: return "12345";           // Second variable - typically order/ID
        case 2: return "999.50";          // Third variable - typically amount
        default: return `Sample ${varNum}`; // Generic sample for additional variables
        }
    });
  }

  // Add header if specified
  if (templateData.headerType && templateData.headerType !== 'none') {
    if (templateData.headerType === 'text') {
      payload.header_format = 'TEXT';
      payload.header = templateData.headerText.trim();
    } else if (['image', 'video', 'document'].includes(templateData.headerType)) {
      // Use the pre-uploaded media handle from dialog
      if (templateData.headerMediaHandle) {
        payload.header_format = templateData.headerType.toUpperCase();
        payload.header_handle = [templateData.headerMediaHandle]; // Array format as per schema
        payload.header_handle_file_url = templateData.headerMediaFileUrl;      // Add this
        payload.header_handle_file_name = templateData.headerMediaFileName;
      }
    }
  } else {
    payload.header_format = null;
  }

  // Add footer if specified
  if (templateData.footer?.trim()) {
    payload.footer = templateData.footer.trim();
  }

  // Add buttons if specified
  if (templateData.buttonType === 'buttons' && templateData.buttons?.length > 0) {
    const buttons = templateData.buttons.filter(btn => btn.text?.trim());
    
    if (buttons.length > 0) {
      // Determine button type based on button configuration
      const hasUrl = buttons.some(btn => btn.type === 'url');
      const hasPhone = buttons.some(btn => btn.type === 'phone_number');
      const hasQuickReply = buttons.some(btn => btn.type === 'quick_reply');
      
      if (hasQuickReply && !hasUrl && !hasPhone) {
        // Pure quick reply buttons
        payload.button_type = 'Quick Replies';
        payload.buttons = buttons
          .filter(btn => btn.type === 'quick_reply')
          .slice(0, 3) // Max 3 quick reply buttons
          .map(button => ({
            type: 'QUICK_REPLY',
            text: button.text.trim()
          }));
      } else if (hasUrl || hasPhone) {
        // Call to action buttons
        payload.button_type = 'Call to Action';
        const actionButtons = [];
        
        // Add URL button (max 1)
        const urlButton = buttons.find(btn => btn.type === 'url');
        if (urlButton && urlButton.url) {
          actionButtons.push({
            type: 'URL',
            text: urlButton.text.trim(),
            url: urlButton.url.trim()
          });
        }
        
        // Add Phone button (max 1)
        const phoneButton = buttons.find(btn => btn.type === 'phone_number');
        if (phoneButton && phoneButton.phoneNumber && actionButtons.length < 2) {
          actionButtons.push({
            type: 'PHONE_NUMBER',
            text: phoneButton.text.trim(),
            phone_number: phoneButton.phoneNumber.trim()
          });
        }
        
        payload.buttons = actionButtons.slice(0, 2); // Max 2 call to action buttons
      }
    }
  }

  return payload;
}

// Validate template data
function validateTemplateData(templateData: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required field validation
  if (!templateData.name?.trim()) {
    errors.push('Template name is required');
  }
  if (!templateData.category) {
    errors.push('Category is required');
  }
  if (!templateData.body?.trim()) {
    errors.push('Body is required');
  }

  // Length validations
  if (templateData.name?.trim().length > 512) {
    errors.push('Template name too long (max 512 characters)');
  }
  if (templateData.body?.trim().length > 1024) {
    errors.push('Body too long (max 1024 characters)');
  }
  if (templateData.headerText?.length > 60) {
    errors.push('Header text too long (max 60 characters)');
  }
  if (templateData.footer?.length > 60) {
    errors.push('Footer text too long (max 60 characters)');
  }

  // Header validation
  if (templateData.headerType === 'text' && !templateData.headerText?.trim()) {
    errors.push('Header text is required when header type is text');
  }
  if (['image', 'video', 'document'].includes(templateData.headerType) && !templateData.headerMediaHandle) {
    errors.push(`${templateData.headerType} file must be uploaded when header type is ${templateData.headerType}`);
  }

  // Button validation
  if (templateData.buttonType === 'buttons') {
    if (!templateData.buttons || templateData.buttons.length === 0) {
      errors.push('At least one button must be configured when button type is selected');
    }
  }

  return { isValid: errors.length === 0, errors };
}

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
    const userId = decodedToken.uid;

    // Parse request body
    const { shop: activeAccountId, templateData } = await request.json();

    if (!activeAccountId || !templateData) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate template data
    const validation = validateTemplateData(templateData);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors.join(', ') },
        { status: 400 }
      );
    }

    // Get account's Interakt keys
    const accountRef = adminDb.collection('accounts').doc(activeAccountId);
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

    // Create Firebase tracking document
    const templateTrackingRef = adminDb
      .collection('accounts')
      .doc(activeAccountId)
      .collection('communications')
      .doc('interakt')
      .collection('template_creation');

    const trackingDoc = await templateTrackingRef.add({
      name: templateData.name.trim(),
      category: templateData.category,
      status: 'creating',
      progress: 'Creating template...',
      createdBy: userId,
      createdAt: Timestamp.now(),
    });

    try {
      // Build template payload using pre-uploaded media handle if provided
      const templatePayload = buildTemplatePayload(templateData);

      // Create template via Interakt API
      await trackingDoc.update({
        progress: 'Submitting to Interakt...',
      });

      console.log('Sending payload to Interakt:', JSON.stringify(templatePayload, null, 2));
      const templateResponse = await fetch('https://api.interakt.ai/v1/public/track/templates/', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${interaktKeys.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload),
      });

      if (!templateResponse.ok) {
        const errorData = await templateResponse.text();
        throw new Error(`Template creation failed: ${templateResponse.status} - ${errorData}`);
      }

      const templateResult = await templateResponse.json();

      // Update tracking document with success
      await trackingDoc.update({
        status: 'submitted',
        progress: 'Template submitted for WhatsApp approval',
        templateId: templateResult.template_id || templateResult.id,
        interaktResponse: sanitizeObject(templateResult),
        completedAt: Timestamp.now(),
      });

      // Add to templates collection for real-time updates
      const templatesRef = adminDb
        .collection('accounts')
        .doc(activeAccountId)
        .collection('communications')
        .doc('interakt')
        .collection('templates');

      await templatesRef.add({
        ...sanitizeObject(templateResult),
        createdAt: Timestamp.now(),
        createdBy: userId,
        linkedCategory: null,
      });

      return NextResponse.json({
        success: true,
        message: 'Template created successfully and submitted for approval',
        templateId: trackingDoc.id,
        interaktResponse: templateResult,
      });

    } catch (error) {
      // Update tracking document with error
      await trackingDoc.update({
        status: 'error',
        progress: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorAt: Timestamp.now(),
      });

      throw error;
    }

  } catch (error) {
    console.error('Template creation error:', error);
    
    return NextResponse.json(
      {
        error: 'Template creation failed',
        details: error instanceof Error ? error.message : 'An unknown error occurred',
      },
      { status: 500 }
    );
  }
}