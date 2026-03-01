CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_list (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  media_type VARCHAR(50) NOT NULL, -- 'movie' or 'tv'
  media_id INTEGER NOT NULL,
  list_type VARCHAR(50) NOT NULL, -- 'watchlist', 'favorites', 'watched'
  title VARCHAR(255) NOT NULL,
  poster_path VARCHAR(255),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, media_type, media_id, list_type)
);
