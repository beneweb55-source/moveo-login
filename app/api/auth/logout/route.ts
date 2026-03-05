import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out successfully' }, { status: 200 });
  // MUST use SameSite=None and Secure=True for cross-origin iframe support
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: true, // Required for SameSite=None
    sameSite: 'none', // Required for cross-origin iframe
    maxAge: 0,
    path: '/',
  });
  return response;
}
