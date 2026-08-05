-- 009_logs.sql
-- Traçabilité des actions utilisateurs

CREATE TABLE IF NOT EXISTS logs_activite (
  id            SERIAL PRIMARY KEY,
  utilisateur_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  utilisateur_nom VARCHAR(150),
  action        VARCHAR(100) NOT NULL,
  details       JSONB DEFAULT '{}',
  ip            VARCHAR(45),
  date_action   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_date   ON logs_activite(date_action DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user   ON logs_activite(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON logs_activite(action);
