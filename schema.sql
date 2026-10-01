CREATE TABLE IF NOT EXISTS clients (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guests_slug ON guests (slug);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT,
  client_name TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  event_date TEXT,
  package TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);
