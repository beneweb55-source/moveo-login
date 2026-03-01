'use server';

import { z } from 'zod';
import { SignupFormSchema, LoginFormSchema, FormState } from '@/lib/definitions';
import bcrypt from 'bcryptjs';
import pool from '@/lib/db';
import { createSession, deleteSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export async function signup(prevState: FormState, formData: FormData) {
  // Validate form fields
  const validatedFields = SignupFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });

  // If any form fields are invalid, return early
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { name, email, password } = validatedFields.data;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Insert user into database
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id',
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    await createSession(user.id);
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return {
        message: 'Un utilisateur avec cet email existe déjà.',
      };
    }
    return {
      message: 'Erreur de base de données : impossible de créer l\'utilisateur.',
    };
  }

  redirect('/');
}

export async function login(prevState: FormState, formData: FormData) {
  const validatedFields = LoginFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return {
        message: 'Email ou mot de passe incorrect.',
      };
    }

    const passwordsMatch = await bcrypt.compare(password, user.password);
    if (!passwordsMatch) {
      return {
        message: 'Email ou mot de passe incorrect.',
      };
    }

    await createSession(user.id);
  } catch (error) {
    return {
      message: 'Erreur de base de données : impossible de se connecter.',
    };
  }

  redirect('/');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
