ALTER TABLE sites ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PIPELINE','TO_START','COMPLETED'));
ALTER TABLE sites ADD COLUMN photo text;
ALTER TABLE sites ADD COLUMN version integer NOT NULL DEFAULT 0;
UPDATE sites SET status='COMPLETED' WHERE NOT active;
ALTER TABLE items ADD COLUMN ordered_quantity numeric(12,3) NOT NULL DEFAULT 0;
UPDATE items SET ordered_quantity=quantity-cancelled WHERE ordered;
CREATE TABLE order_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES items(id),
 quantity numeric(12,3) NOT NULL CHECK(quantity>0), dispatched numeric(12,3) NOT NULL DEFAULT 0,
 received numeric(12,3) NOT NULL DEFAULT 0,cancelled numeric(12,3) NOT NULL DEFAULT 0,
 supplier text NOT NULL DEFAULT '',contact text NOT NULL DEFAULT '',expected_by date,
 shipping_status text NOT NULL DEFAULT 'NOT_SHIPPED' CHECK(shipping_status IN ('NOT_SHIPPED','IN_TRANSIT','DELAYED')),
 note text NOT NULL DEFAULT '',created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(received>=0 AND dispatched>=received AND cancelled>=0 AND dispatched+cancelled<=quantity)
);
CREATE INDEX order_batches_item ON order_batches(item_id);
ALTER TABLE events ADD COLUMN batch_id uuid REFERENCES order_batches(id);
INSERT INTO order_batches(item_id,quantity,dispatched,received,supplier,created_by,shipping_status,created_at,note)
 SELECT i.id,i.quantity-i.cancelled,i.dispatched,i.received,i.supplier,COALESCE(e.actor_id,r.requested_by),CASE WHEN i.dispatched>0 THEN 'IN_TRANSIT' ELSE 'NOT_SHIPPED' END,COALESCE(e.created_at,r.created_at),'Imported full-order record; original ETA and contact were not recorded.' FROM items i JOIN requisitions r ON r.id=i.requisition_id LEFT JOIN LATERAL (SELECT actor_id,created_at FROM events WHERE item_id=i.id AND action='ORDERED' ORDER BY id LIMIT 1) e ON true WHERE i.ordered AND i.quantity>i.cancelled;
ALTER TABLE items ADD CONSTRAINT ordered_balance CHECK(ordered_quantity>=dispatched AND ordered_quantity+cancelled<=quantity);
CREATE FUNCTION request_access(actor uuid,rid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM requisitions r JOIN users u ON u.id=actor WHERE r.id=rid AND site_access(actor,r.site_id) AND (u.role<>'PURCHASE' OR r.status='APPROVED')) $$;
DROP VIEW item_details;
CREATE VIEW item_details AS SELECT i.*,CASE WHEN received+cancelled<quantity AND dispatched=0 AND ordered_quantity>0 AND ordered_quantity+cancelled<quantity THEN 'PART_ORDERED' ELSE item_state(quantity,cancelled,dispatched,received,ordered_quantity>0) END AS item_status,r.status AS requisition_status,r.site_id,r.requested_by,r.request_date,r.created_at,r.number,s.name AS site_name,u.name AS requested_name FROM items i JOIN requisitions r ON r.id=i.requisition_id JOIN sites s ON s.id=r.site_id JOIN users u ON u.id=r.requested_by;
CREATE OR REPLACE FUNCTION create_requisition(actor uuid,p jsonb,business_tz text) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE u users; s sites; rid uuid; line jsonb; BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR UPDATE;
 IF u.id IS NULL OR u.role NOT IN ('DIRECTOR','SUPERVISOR','MANAGER') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
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
CREATE OR REPLACE FUNCTION transition_requisition(actor uuid,rid uuid,target text,why text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE u users; r requisitions; BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR SHARE;
 SELECT * INTO r FROM requisitions WHERE id=rid FOR UPDATE;
 IF u.id IS NULL OR r.id IS NULL OR NOT site_access(actor,r.site_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target IN ('APPROVED','REJECTED') AND u.role NOT IN ('DIRECTOR','MANAGER') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target='CANCELLED' AND NOT(u.role='DIRECTOR' OR (u.role IN ('SUPERVISOR','MANAGER') AND r.requested_by=actor)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF target NOT IN ('APPROVED','REJECTED','CANCELLED') OR r.status<>'SUBMITTED' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF target='REJECTED' AND length(trim(why))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 UPDATE requisitions SET status=target WHERE id=rid;
 INSERT INTO events(requisition_id,actor_id,action,from_status,to_status,reason) VALUES(rid,actor,target,r.status,target,why);
 END $$;

CREATE FUNCTION act_item(actor uuid,iid uuid,expected integer,p jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE u users; i items; r requisitions; b order_batches; remaining numeric; take numeric; amount numeric; action_name text; previous text; bid uuid; why text; amount_log numeric;
BEGIN
 SELECT * INTO u FROM users WHERE id=actor AND active FOR SHARE;
 SELECT * INTO i FROM items WHERE id=iid FOR UPDATE;
 SELECT * INTO r FROM requisitions WHERE id=i.requisition_id FOR SHARE;
 IF u.id IS NULL OR i.id IS NULL OR NOT site_access(actor,r.site_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 action_name:=p->>'action'; amount:=(p->>'quantity')::numeric; bid:=(p->>'batchId')::uuid; why:=COALESCE(p->>'reason','');
 IF action_name='RECEIVED' THEN
  IF u.role NOT IN ('DIRECTOR','SUPERVISOR','MANAGER') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 ELSE
  IF u.role NOT IN ('DIRECTOR','PURCHASE') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 END IF;
 IF r.status<>'APPROVED' OR i.version<>expected THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 previous:=item_state(i.quantity,i.cancelled,i.dispatched,i.received,i.ordered);
 IF previous IN ('CANCELLED','DELIVERED') THEN RAISE EXCEPTION 'CONFLICT'; END IF;
 IF bid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM order_batches WHERE id=bid AND item_id=iid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF action_name='ORDERED' THEN
  amount:=COALESCE(amount,i.quantity-i.cancelled-i.ordered_quantity);
  IF amount<=0 OR amount<>round(amount,3) OR i.ordered_quantity+i.cancelled+amount>i.quantity THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  INSERT INTO order_batches(item_id,quantity,supplier,contact,expected_by,created_by,note) VALUES(iid,amount,COALESCE(p->>'supplier',''),COALESCE(p->>'contact',''),NULLIF(p->>'expectedBy','')::date,actor,why) RETURNING id INTO bid;
  i.ordered_quantity:=i.ordered_quantity+amount;i.ordered:=true;i.supplier:=COALESCE(p->>'supplier','');
 ELSIF action_name='STATUS' THEN
  IF bid IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO b FROM order_batches WHERE id=bid;
  IF b.received+b.cancelled=b.quantity THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF p->>'shippingStatus' NOT IN ('NOT_SHIPPED','IN_TRANSIT','DELAYED') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF (p->>'shippingStatus'='NOT_SHIPPED' AND b.dispatched>0) OR (p->>'shippingStatus'='IN_TRANSIT' AND b.dispatched<=b.received) THEN RAISE EXCEPTION 'INVALID_SHIPPING_STATUS'; END IF;
  UPDATE order_batches SET shipping_status=p->>'shippingStatus',expected_by=NULLIF(p->>'expectedBy','')::date,contact=COALESCE(p->>'contact',contact),supplier=COALESCE(p->>'supplier',supplier),note=why WHERE id=bid;
  why:=concat(p->>'shippingStatus','; ETA ',COALESCE(NULLIF(p->>'expectedBy',''),'not supplied'),'; ',why);
 ELSIF action_name IN ('DISPATCHED','RECEIVED','CANCELLED') THEN
  IF amount IS NULL OR amount<=0 OR amount<>round(amount,3) THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  remaining:=amount;
  IF action_name='DISPATCHED' THEN
   IF i.dispatched+amount>i.ordered_quantity THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
   FOR b IN SELECT * FROM order_batches WHERE item_id=iid AND (bid IS NULL OR id=bid) ORDER BY created_at,id LOOP
    take:=least(remaining,b.quantity-b.cancelled-b.dispatched);
    UPDATE order_batches SET dispatched=dispatched+take,shipping_status=CASE WHEN take>0 THEN 'IN_TRANSIT' ELSE shipping_status END WHERE id=b.id;
    remaining:=remaining-take;EXIT WHEN remaining=0;
   END LOOP;
   i.dispatched:=i.dispatched+amount;
  ELSIF action_name='RECEIVED' THEN
   IF i.received+amount>i.dispatched THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
   FOR b IN SELECT * FROM order_batches WHERE item_id=iid AND (bid IS NULL OR id=bid) ORDER BY created_at,id LOOP
    take:=least(remaining,b.dispatched-b.received);UPDATE order_batches SET received=received+take WHERE id=b.id;remaining:=remaining-take;EXIT WHEN remaining=0;
   END LOOP;
   i.received:=i.received+amount;
  ELSE
   IF length(trim(why))=0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   IF i.cancelled+i.dispatched+amount>i.quantity THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
   IF bid IS NULL THEN remaining:=greatest(0,amount-(i.quantity-i.cancelled-i.ordered_quantity)); END IF;
   FOR b IN SELECT * FROM order_batches WHERE item_id=iid AND (bid IS NULL OR id=bid) ORDER BY created_at DESC,id LOOP
    EXIT WHEN remaining=0;take:=least(remaining,b.quantity-b.cancelled-b.dispatched);
    UPDATE order_batches SET cancelled=cancelled+take WHERE id=b.id;
    i.ordered_quantity:=i.ordered_quantity-take;remaining:=remaining-take;
   END LOOP;
   i.cancelled:=i.cancelled+amount;
  END IF;
  IF remaining<>0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 i.ordered:=i.ordered_quantity>0;
 UPDATE items SET ordered=i.ordered,supplier=i.supplier,ordered_quantity=i.ordered_quantity,dispatched=i.dispatched,received=i.received,cancelled=i.cancelled,version=version+1 WHERE id=iid;
 INSERT INTO events(requisition_id,item_id,actor_id,action,from_status,to_status,quantity,reason,batch_id) VALUES(r.id,iid,actor,action_name,previous,item_state(i.quantity,i.cancelled,i.dispatched,i.received,i.ordered),amount,why,bid);
END $$;
CREATE OR REPLACE FUNCTION transition_item(actor uuid,iid uuid,expected integer,action_name text,amount numeric,why text,vendor text) RETURNS void LANGUAGE sql AS $$ SELECT act_item(actor,iid,expected,jsonb_build_object('action',action_name,'quantity',amount,'reason',why,'supplier',vendor)) $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='site_requisitions_app') THEN
 GRANT SELECT ON item_details,order_batches TO site_requisitions_app;
 GRANT INSERT,UPDATE ON order_batches TO site_requisitions_app;
 END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES('003_siteops');
