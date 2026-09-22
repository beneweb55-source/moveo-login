import { getJwtSecret } from '@/lib/jwtSecret';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function auth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) {
      return null;
    }

    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    return { user: payload };
  } catch (error) {
    return null;
  }
}
