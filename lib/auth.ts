import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function auth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return null;
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');
    const { payload } = await jwtVerify(token, secret);

    return { user: payload };
  } catch (error) {
    return null;
  }
}
