/** Початкова схема етапу 0. У ітерації 1 замінюється міграціями Drizzle. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS requests (
  id text PRIMARY KEY,
  revision integer NOT NULL,
  status text NOT NULL,
  body jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS journal (
  seq serial PRIMARY KEY,
  at text NOT NULL,
  type text NOT NULL,
  request_id text,
  list_id text,
  actor_id text NOT NULL,
  idempotency_key text NOT NULL,
  data jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  status integer NOT NULL,
  response jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION journal_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_no_change ON journal;
CREATE TRIGGER journal_no_change BEFORE UPDATE OR DELETE ON journal
  FOR EACH ROW EXECUTE FUNCTION journal_append_only();
`;
