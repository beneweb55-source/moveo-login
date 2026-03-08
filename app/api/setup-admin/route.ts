import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    // 1. Créer le rôle Fondateur s'il n'existe pas, avec la priorité maximale (999)
    await pool.query(`
      INSERT INTO roles (name, color, permissions, priority)
      VALUES (
        'Fondateur', 
        '#FFD700', 
        '["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"]', 
        999
      )
      ON CONFLICT (name) DO UPDATE 
      SET permissions = '["view_users", "edit_users", "ban_users", "edit_roles", "edit_hero", "pin_sections", "view_reports", "handle_reports", "view_stats", "manage_watch_time", "manage_roles", "access_admin_panel"]',
          priority = 999;
    `);

    // 2. Assigner le rôle Fondateur à l'utilisateur Samy (tvmystral@gmail.com)
    const result = await pool.query(`
      UPDATE users 
      SET role_id = (SELECT id FROM roles WHERE name = 'Fondateur' LIMIT 1)
      WHERE email = 'tvmystral@gmail.com'
      RETURNING id, name, email;
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ 
        error: "Utilisateur tvmystral@gmail.com non trouvé. Veuillez vous connecter au moins une fois avec ce compte avant d'exécuter ce script." 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      message: "Succès ! Le rôle 'Fondateur' a été attribué à tvmystral@gmail.com.",
      user: result.rows[0],
      instruction: "Vous pouvez maintenant retourner sur l'application et rafraîchir la page. Un bouton 'Panel Admin' apparaîtra dans votre menu déroulant."
    });
  } catch (error: any) {
    console.error('Erreur lors de la configuration admin:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
