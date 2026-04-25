-- Row-Level Security — isolation par tenant
-- À appliquer après chaque `prisma migrate deploy`

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE espaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE pieces_jointes ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlook_mailboxes ENABLE ROW LEVEL SECURITY;

-- Politique : accès via current_setting posé par tenantDb()
CREATE POLICY tenant_isolation ON restaurants
  USING (id = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON users
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON contacts
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON espaces
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON demandes
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON threads
  USING ("demandeId" IN (
    SELECT id FROM demandes
    WHERE "restaurantId" = current_setting('app.current_restaurant', true)
  ));

CREATE POLICY tenant_isolation ON messages
  USING ("threadId" IN (
    SELECT t.id FROM threads t
    JOIN demandes d ON d.id = t."demandeId"
    WHERE d."restaurantId" = current_setting('app.current_restaurant', true)
  ));

CREATE POLICY tenant_isolation ON menus
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON templates
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON notifications
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON pieces_jointes
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

CREATE POLICY tenant_isolation ON outlook_mailboxes
  USING ("restaurantId" = current_setting('app.current_restaurant', true));

-- Bypass RLS pour le service role Supabase (migrations, seed)
ALTER TABLE restaurants FORCE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE espaces FORCE ROW LEVEL SECURITY;
ALTER TABLE demandes FORCE ROW LEVEL SECURITY;
ALTER TABLE menus FORCE ROW LEVEL SECURITY;
ALTER TABLE templates FORCE ROW LEVEL SECURITY;
