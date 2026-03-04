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
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) < 1000) {
         return NextResponse.json({ status: 'error', code: response.status, reason: 'Content too small' }, { status: 404 });
      }
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
          'Range': 'bytes=0-2000', // Get enough bytes to check size
        },
      });
      
      clearTimeout(timeoutId2);

      if (response2.ok) {
        // Check if we got enough data or if content-length is small
        const contentLength = response2.headers.get('content-length');
        // Note: For range requests, content-length might be the range size, or total. 
        // But if the *total* entity is small, it will be small.
        // If we requested 2000 bytes and got < 1000, it's suspicious unless it's a partial response of a large file?
        // Actually, if the file is small, range 0-2000 will return the whole file (e.g. 500 bytes).
        // If the file is large, it will return 2001 bytes (0-2000).
        
        const buffer = await response2.arrayBuffer();
        if (buffer.byteLength < 1000) {
             return NextResponse.json({ status: 'error', code: response2.status, reason: 'Content too small' }, { status: 404 });
        }

        return NextResponse.json({ status: 'ok', code: response2.status });
      }

      return NextResponse.json({ status: 'error', code: response.status }, { status: 404 });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch', details: String(error) }, { status: 500 });
  }
}
