import { Resend } from 'resend';

// Initialize with a fallback to prevent build errors when env var is missing
const resend = new Resend(process.env.RESEND_API_KEY || 're_fallback_key');

export async function sendVerificationEmail(email: string, token: string) {
  const confirmLink = `${process.env.NEXTAUTH_URL}/verify-email?token=${token}`;

  if (process.env.RESEND_API_KEY === 're_fallback_key' || !process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY is not set. Skipping email send.');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    await resend.emails.send({
      from: 'Moveo <onboarding@resend.dev>', // You should use a verified domain in production
      to: email,
      subject: 'Vérifiez votre adresse email - Moveo',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Bienvenue sur Moveo !</h2>
          <p>Merci de vous être inscrit. Pour finaliser votre inscription et pouvoir vous connecter, veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous :</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Vérifier mon email</a>
          </div>
          <p>Si le bouton ne fonctionne pas, vous pouvez copier et coller ce lien dans votre navigateur :</p>
          <p style="word-break: break-all; color: #666;">${confirmLink}</p>
          <p>Ce lien expirera dans 24 heures.</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999;">Si vous n'avez pas créé de compte sur Moveo, vous pouvez ignorer cet email.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return { success: false, error };
  }
}
