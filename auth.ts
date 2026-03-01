// auth.ts
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

    // Retourne un objet similaire à ce que NextAuth renvoyait
    return { user: payload };
  } catch (error) {
    // Si le token est invalide ou expiré
    return null;
  }
}