-- Activez l'extension pour les UUID si nécessaire (souvent activé par défaut sur Neon)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Création de la table users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index pour accélérer la recherche par email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
