CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, phone text UNIQUE NOT NULL, pin_hash text NOT NULL, role text NOT NULL CHECK(role IN ('DIRECTOR','MANAGER','SUPERVISOR','PURCHASE')), active boolean NOT NULL DEFAULT true, must_change_pin boolean NOT NULL DEFAULT true, failed_attempts integer NOT NULL DEFAULT 0, locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE NOT NULL,active boolean NOT NULL DEFAULT true);
CREATE TABLE assignments(user_id uuid REFERENCES users(id),site_id uuid REFERENCES sites(id),PRIMARY KEY(user_id,site_id));
CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),csrf text NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE login_limits(key text PRIMARY KEY,count int NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE requisitions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,site_id uuid NOT NULL REFERENCES sites(id),requested_by uuid NOT NULL REFERENCES users(id),request_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),note text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','CANCELLED')),submission_key uuid NOT NULL,UNIQUE(requested_by,submission_key));
CREATE TABLE items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requisition_id uuid NOT NULL REFERENCES requisitions(id),description text NOT NULL,quantity numeric(12,3) NOT NULL CHECK(quantity>0),unit text NOT NULL,required_by date NOT NULL,ordered boolean NOT NULL DEFAULT false,supplier text NOT NULL DEFAULT '',dispatched numeric(12,3) NOT NULL DEFAULT 0,received numeric(12,3) NOT NULL DEFAULT 0,cancelled numeric(12,3) NOT NULL DEFAULT 0,version integer NOT NULL DEFAULT 0,CHECK(received>=0 AND dispatched>=received AND cancelled>=0 AND dispatched+cancelled<=quantity));
CREATE TABLE events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,requisition_id uuid REFERENCES requisitions(id),item_id uuid REFERENCES items(id),actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,from_status text,to_status text,quantity numeric(12,3),reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX requisitions_site ON requisitions(site_id,created_at DESC);
CREATE INDEX items_req ON items(requisition_id);
CREATE INDEX events_req ON events(requisition_id,created_at);
CREATE INDEX events_time ON events(created_at);
CREATE TABLE seen(user_id uuid REFERENCES users(id),site_id uuid REFERENCES sites(id),seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,site_id));
CREATE FUNCTION site_access(actor uuid,site uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=actor AND u.active AND (u.role IN ('DIRECTOR','PURCHASE') OR EXISTS(SELECT 1 FROM assignments a WHERE a.user_id=actor AND a.site_id=site))) $$;
CREATE FUNCTION item_state(q numeric,c numeric,d numeric,r numeric,o boolean) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN c=q THEN 'CANCELLED' WHEN r+c=q THEN 'DELIVERED' WHEN r>0 THEN 'PART_RECEIVED' WHEN d>0 THEN 'DISPATCHED' WHEN o THEN 'ORDERED' ELSE 'TO_ORDER' END $$;
CREATE VIEW item_details AS SELECT i.*,item_state(quantity,cancelled,dispatched,received,ordered) AS item_status,r.status AS requisition_status,r.site_id,r.requested_by,r.request_date,r.created_at,r.number,s.name AS site_name,u.name AS requested_name FROM items i JOIN requisitions r ON r.id=i.requisition_id JOIN sites s ON s.id=r.site_id JOIN users u ON u.id=r.requested_by;
CREATE FUNCTION protect_director() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.role='DIRECTOR' AND OLD.active AND (NOT NEW.active OR NEW.role<>'DIRECTOR') THEN
 PERFORM pg_advisory_xact_lock(774201);
 IF NOT EXISTS(SELECT 1 FROM users WHERE id<>OLD.id AND role='DIRECTOR' AND active) THEN RAISE EXCEPTION 'LAST_DIRECTOR'; END IF;
 END IF;
 IF NEW.role<>OLD.role OR NOT NEW.active OR NEW.pin_hash<>OLD.pin_hash THEN DELETE FROM sessions WHERE user_id=OLD.id; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER protect_director BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION protect_director();
CREATE FUNCTION create_requisition(actor uuid,p jsonb,business_tz text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE u users; s sites; rid uuid; line jsonb; BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR UPDATE;
 IF u.id IS NULL OR u.role NOT IN ('DIRECTOR','SUPERVISOR') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT id INTO rid FROM requisitions WHERE requested_by=actor AND submission_key=(p->>'key')::uuid;
 IF rid IS NOT NULL THEN RETURN rid; END IF;
 SELECT * INTO s FROM sites WHERE id=(p->>'siteId')::uuid AND active;
 IF s.id IS NULL OR NOT site_access(actor,s.id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 INSERT INTO requisitions(site_id,requested_by,request_date,note,submission_key) VALUES(s.id,actor,(now() AT TIME ZONE business_tz)::date,COALESCE(p->>'note',''),(p->>'key')::uuid) RETURNING id INTO rid;
 FOR line IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
 IF (line->>'requiredBy')::date < (now() AT TIME ZONE business_tz)::date THEN RAISE EXCEPTION 'DATE_IN_PAST'; END IF;
 INSERT INTO items(requisition_id,description,quantity,unit,required_by) VALUES(rid,line->>'description',(line->>'quantity')::numeric,line->>'unit',(line->>'requiredBy')::date);
 END LOOP;
 INSERT INTO events(requisition_id,actor_id,action,to_status) VALUES(rid,actor,'SUBMITTED','SUBMITTED'); RETURN rid;
 END $$;
CREATE FUNCTION transition_requisition(actor uuid,rid uuid,target text,why text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE u users; r requisitions; BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR SHARE;
 SELECT * INTO r FROM requisitions WHERE id=rid FOR UPDATE;
 IF u.id IS NULL OR r.id IS NULL OR NOT site_access(actor,r.site_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target IN ('APPROVED','REJECTED') AND u.role NOT IN ('DIRECTOR','MANAGER') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target='CANCELLED' AND NOT(u.role='DIRECTOR' OR (u.role='SUPERVISOR' AND r.requested_by=actor)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target NOT IN ('APPROVED','REJECTED','CANCELLED') OR r.status<>'SUBMITTED' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF target='REJECTED' AND length(trim(why))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 UPDATE requisitions SET status=target WHERE id=rid;
 INSERT INTO events(requisition_id,actor_id,action,from_status,to_status,reason) VALUES(rid,actor,target,r.status,target,why);
 END $$;
CREATE FUNCTION transition_item(actor uuid,iid uuid,expected integer,action_name text,amount numeric,why text,vendor text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE u users; i items; r requisitions; previous text; BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR SHARE;
 SELECT * INTO i FROM items WHERE id=iid FOR UPDATE;
 SELECT * INTO r FROM requisitions WHERE id=i.requisition_id FOR SHARE;
 IF u.id IS NULL OR i.id IS NULL OR NOT site_access(actor,r.site_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF action_name='RECEIVED' THEN
 IF u.role NOT IN ('DIRECTOR','SUPERVISOR') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 ELSE IF u.role NOT IN ('DIRECTOR','PURCHASE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF; END IF;
 IF r.status<>'APPROVED' OR i.version<>expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 previous:=item_state(i.quantity,i.cancelled,i.dispatched,i.received,i.ordered);
 IF previous IN ('CANCELLED','DELIVERED') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF action_name='ORDERED' THEN
 IF i.ordered THEN RAISE EXCEPTION 'CONFLICT'; END IF; i.ordered:=true; i.supplier:=vendor;
 ELSIF action_name IN ('DISPATCHED','RECEIVED','CANCELLED') THEN
 IF amount IS NULL OR amount<=0 OR amount<>round(amount,3) THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
 IF action_name='DISPATCHED' THEN
 IF NOT i.ordered OR i.dispatched+i.cancelled+amount>i.quantity THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF; i.dispatched:=i.dispatched+amount;
 ELSIF action_name='RECEIVED' THEN
 IF i.received+amount>i.dispatched THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF; i.received:=i.received+amount;
 ELSE
 IF length(trim(why))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF i.cancelled+i.dispatched+amount>i.quantity THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF; i.cancelled:=i.cancelled+amount;
 END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 UPDATE items SET ordered=i.ordered,supplier=i.supplier,dispatched=i.dispatched,received=i.received,cancelled=i.cancelled,version=version+1 WHERE id=iid;
 INSERT INTO events(requisition_id,item_id,actor_id,action,from_status,to_status,quantity,reason) VALUES(r.id,iid,actor,action_name,previous,item_state(i.quantity,i.cancelled,i.dispatched,i.received,i.ordered),amount,why);
 END $$;
CREATE FUNCTION save_user(actor uuid,uid uuid,p jsonb,new_hash text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE result uuid; BEGIN
 PERFORM pg_advisory_xact_lock(774201);
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor AND active AND role='DIRECTOR') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF uid IS NULL THEN
 IF new_hash IS NULL THEN RAISE EXCEPTION 'PIN_REQUIRED'; END IF;
 INSERT INTO users(name,phone,role,pin_hash,active) VALUES(p->>'name',p->>'phone',p->>'role',new_hash,COALESCE((p->>'active')::boolean,true)) RETURNING id INTO result;
 ELSE
 UPDATE users SET name=p->>'name',phone=p->>'phone',role=p->>'role',active=(p->>'active')::boolean,pin_hash=COALESCE(new_hash,pin_hash),must_change_pin=CASE WHEN new_hash IS NOT NULL THEN true ELSE must_change_pin END,failed_attempts=CASE WHEN new_hash IS NOT NULL THEN 0 ELSE failed_attempts END,locked_until=CASE WHEN new_hash IS NOT NULL THEN NULL ELSE locked_until END WHERE id=uid RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 END IF;
 DELETE FROM assignments WHERE user_id=result;
 IF p->>'role' IN ('SUPERVISOR','MANAGER') THEN INSERT INTO assignments(user_id,site_id) SELECT result,value::uuid FROM jsonb_array_elements_text(p->'siteIds'); END IF;
 INSERT INTO events(actor_id,action,reason) VALUES(actor,'USER_UPDATED',result::text); RETURN result;
 END $$;
CREATE FUNCTION finish_login(uid uuid,expected_hash text,valid boolean,token text,csrf_value text) RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE u users; BEGIN
 SELECT * INTO u FROM users WHERE id=uid FOR UPDATE;
 IF u.id IS NULL OR NOT u.active OR u.pin_hash<>expected_hash OR u.locked_until>now() THEN RETURN false; END IF;
 IF NOT valid THEN UPDATE users SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=uid; RETURN false; END IF;
 UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=uid;
 INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(token,uid,csrf_value,now()+interval '30 days');
 DELETE FROM sessions WHERE expires_at<now(); DELETE FROM login_limits WHERE expires_at<now()-interval '1 day';
 RETURN true; END $$;
INSERT INTO schema_migrations(version) VALUES('001_initial');
CREATE FUNCTION sign_in(mobile text,pin text,token text,csrf_value text) RETURNS boolean LANGUAGE plpgsql AS $$ DECLARE u users; valid boolean; BEGIN
 SELECT * INTO u FROM users WHERE phone=mobile FOR UPDATE;
 IF u.id IS NULL THEN PERFORM crypt(pin,gen_salt('bf',12)); RETURN false; END IF;
 IF NOT u.active OR u.locked_until>now() THEN RETURN false; END IF;
 valid:=u.pin_hash=crypt(pin,u.pin_hash);
 RETURN finish_login(u.id,u.pin_hash,valid,token,csrf_value);
 END $$;
