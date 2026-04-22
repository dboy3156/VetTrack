-- Run before applying 056. Expect zero rows.
SELECT clinic_id,
       lower(trim(generic_name)) AS g,
       concentration_mg_ml,
       count(*) AS n,
       array_agg(id ORDER BY id) AS ids
FROM vt_drug_formulary
WHERE deleted_at IS NULL
GROUP BY clinic_id, lower(trim(generic_name)), concentration_mg_ml
HAVING count(*) > 1;
