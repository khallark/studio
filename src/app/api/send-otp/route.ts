
import { NextRequest, NextResponse } from 'next/server';

// This is a simplified in-memory store for OTPs for this example.
// In a real app, you would use a more robust solution like Redis or a database.
const otpStore: { [key: string]: string } = {};

function generateOtp(length = 6) {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber } = await req.json();

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    // Basic validation for an Indian phone number
    if (!/^\+91[6-9]\d{9}$/.test(phoneNumber)) {
        return NextResponse.json({ error: 'Invalid Indian phone number format. Expected +91XXXXXXXXXX' }, { status: 400 });
    }

    const interaktApiKey = process.env.INTERAKT_API_KEY;
    if (!interaktApiKey) {
        console.error("Interakt API key is not set in environment variables.");
        return NextResponse.json({ error: 'Server configuration error: Interakt API key missing.' }, { status: 500 });
    }
    
    const otp = generateOtp();
    // Store the OTP to verify later. In a real app, this would have an expiration.
    otpStore[phoneNumber] = otp;

    const endpoint = 'https://api.interakt.ai/v1/public/message/';
    const headers = {
      'Authorization': `Basic ${interaktApiKey}`,
      'Content-Type': 'application/json',
    };
    
    const body = {
        phoneNumber: phoneNumber.substring(3), // Remove '+91'
        countryCode: '+91',
        type: 'Template',
        template: {
            name: 'otp_verification_template',
            languageCode: 'en',
            components: [
                {
                    type: 'body',
                    parameters: [
                        {
                            type: 'text',
                            text: otp,
                        },
                    ],
                },
                {
                    type: 'button',
                    sub_type: 'url',
                    index: '0',
                    parameters: [
                        {
                            type: 'text',
                            text: 'checkout', // Placeholder value for the button URL variable
                        },
                    ],
                },
            ],
        },
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error('Interakt API Error:', errorData);
        return NextResponse.json({ error: 'Failed to send OTP via Interakt', details: errorData }, { status: response.status });
    }
   
    // For this example, we'll return the OTP in the response
    // so the frontend can verify it.
    // In a real application, you would NOT return the OTP to the client.
    // The verification step would also be an API call.
    return NextResponse.json({ message: 'OTP sent successfully via Interakt.', otp: otp });

  } catch (error) {
    console.error('Error in send-otp route:', error);
    return NextResponse.json({ error: 'An internal server error occurred' }, { status: 500 });
  }
}
