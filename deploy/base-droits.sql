-- ═══════════════════════════════════════════════════════════════════════════
--  Droits du rôle applicatif
--
--  À exécuter en tant que superutilisateur, sur la base applicative :
--    sudo -u postgres psql -d amana_db -f deploy/base-droits.sql
--
--  L'application lit et écrit les données ; elle ne modifie JAMAIS le schéma.
--  Cette séparation est ce qui limite les dégâts d'une injection SQL : même
--  détournée, l'application ne peut ni supprimer une table, ni désactiver les
--  déclencheurs qui rendent le grand livre et le journal d'audit immuables.
--
--  Les migrations s'exécutent donc sous un rôle distinct, habilité au DDL.
-- ═══════════════════════════════════════════════════════════════════════════

\set ROLE_APP amana_app

-- Connexion à la base.
GRANT CONNECT ON DATABASE :"DBNAME" TO :ROLE_APP;

-- Lecture du schéma, mais pas création : PostgreSQL accorde CREATE sur
-- « public » à tout le monde par défaut, ce qui rendrait le reste illusoire.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL    ON DATABASE :"DBNAME" FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO :ROLE_APP;

-- Données : lecture et écriture sur les tables existantes…
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO :ROLE_APP;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO :ROLE_APP;

-- …et sur celles que les futures migrations créeront.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :ROLE_APP;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :ROLE_APP;

-- ─── Vérification ───────────────────────────────────────────────────────────
-- Après exécution, contrôler que le rôle NE PEUT PAS modifier le schéma :
--
--   PGPASSWORD=<mdp> psql -U amana_app -d amana_db -c "CREATE TABLE t(id int);"
--   → ERROR:  permission denied for schema public
--
-- Si cette commande réussit, le durcissement n'a pas pris.
