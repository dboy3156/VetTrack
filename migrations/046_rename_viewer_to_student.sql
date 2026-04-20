-- Rename the 'viewer' role to 'student' in all user records.
-- The role column is a plain varchar so no enum type migration is needed.
UPDATE vt_users SET role = 'student' WHERE role = 'viewer';
