-- Normalize any user roles that are not part of the new 4-role system
-- Valid roles: admin, vet, technician, viewer
-- Existing admin and technician rows are unaffected
UPDATE vt_users
  SET role = 'technician'
  WHERE role NOT IN ('admin', 'vet', 'technician', 'viewer');
