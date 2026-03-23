import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    // We use GET to fetch the initial HTML to check for soft 404s (e.g., VOE "404 - Not found")
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Range': 'bytes=0-5000', // Just enough to read the <title> or error message
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const text = await response.text();
      const lowerText = text.toLowerCase();
      
      // Check for common soft 404 / file deleted messages in the HTML
      if (
        lowerText.includes('404 - not found') || 
        lowerText.includes('file not found') || 
        lowerText.includes('file was deleted') ||
        lowerText.includes('video not found') ||
        lowerText.includes('the server can not find the requested resource')
      ) {
         return NextResponse.json({ status: 'error', code: 404, reason: 'Soft 404 detected in content' }, { status: 404 });
      }

      // If content is extremely small, it might be an error page too
      if (text.length < 500 && !targetUrl.includes('vidsrc')) {
         return NextResponse.json({ status: 'error', code: response.status, reason: 'Content too small' }, { status: 404 });
      }

      return NextResponse.json({ status: 'ok', code: response.status });
    }

    return NextResponse.json({ status: 'error', code: response.status }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch', details: String(error) }, { status: 500 });
  }
}
