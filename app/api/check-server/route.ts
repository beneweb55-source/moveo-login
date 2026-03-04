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

    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return NextResponse.json({ status: 'ok', code: response.status });
    } else {
      // If HEAD fails, try a GET with range request as backup (some servers block HEAD)
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 5000);

      const response2 = await fetch(targetUrl, {
        method: 'GET',
        signal: controller2.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Range': 'bytes=0-100', // Just get the first few bytes
        },
      });
      
      clearTimeout(timeoutId2);

      if (response2.ok) {
        return NextResponse.json({ status: 'ok', code: response2.status });
      }

      return NextResponse.json({ status: 'error', code: response.status }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch', details: String(error) }, { status: 500 });
  }
}
