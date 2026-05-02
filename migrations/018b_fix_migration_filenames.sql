-- Rename duplicate-prefixed migration filenames in the tracking table.
-- Needed on any DB that applied these files under their old names before the rename.
-- Has no effect if old names are not present (fresh installs, production).
UPDATE vt_migrations SET filename = '019b_smart_role_notifications_schema.sql' WHERE filename = '019_smart_role_notifications_schema.sql';
UPDATE vt_migrations SET filename = '076b_ensure_purchase_orders.sql'          WHERE filename = '076_ensure_purchase_orders.sql';
