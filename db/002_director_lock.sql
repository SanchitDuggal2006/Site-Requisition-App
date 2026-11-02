CREATE OR REPLACE FUNCTION protect_director() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.role='DIRECTOR' AND OLD.active AND (NOT NEW.active OR NEW.role<>'DIRECTOR') THEN
 PERFORM pg_advisory_xact_lock(774201);
 IF NOT EXISTS(SELECT 1 FROM users WHERE id<>OLD.id AND role='DIRECTOR' AND active) THEN RAISE EXCEPTION 'LAST_DIRECTOR'; END IF;
 END IF;
 IF NEW.role<>OLD.role OR NOT NEW.active OR NEW.pin_hash<>OLD.pin_hash THEN DELETE FROM sessions WHERE user_id=OLD.id; END IF;
 RETURN NEW; END $$;
INSERT INTO schema_migrations(version) VALUES('002_director_lock');
