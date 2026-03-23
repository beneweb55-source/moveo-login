import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required' }, { status: 400 });
    }

    const secret = process.env.HCAPTCHA_SECRET || 'ES_8ca47c0d4e43453491a3c18d81c5f9af';
    
    const verifyUrl = 'https://hcaptcha.com/siteverify';
    const body = new URLSearchParams({
      secret,
      response: token,
    });

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (data.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('hCaptcha verification error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
