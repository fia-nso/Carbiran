-- Normalise les anciennes valeurs stockées comme URL ou chemin
-- pour ne conserver que le nom de fichier en base.

UPDATE photos_justification
SET url = SUBSTRING_INDEX(REPLACE(url, '\\', '/'), '/', -1)
WHERE url IS NOT NULL
  AND (url LIKE '%/%' OR url LIKE '%\\%');

UPDATE signatures_situation
SET signature_url = CONCAT(
  user_id,
  '-signature',
  SUBSTRING(SUBSTRING_INDEX(REPLACE(signature_url, '\\', '/'), '/', -1), LENGTH('signature') + 1)
)
WHERE signature_url IS NOT NULL
  AND (signature_url LIKE '%/%' OR signature_url LIKE '%\\%');

UPDATE signatures_utilisateurs
SET signature_url = CONCAT(
  user_id,
  '-signature',
  SUBSTRING(SUBSTRING_INDEX(REPLACE(signature_url, '\\', '/'), '/', -1), LENGTH('signature') + 1)
)
WHERE signature_url IS NOT NULL
  AND (signature_url LIKE '%/%' OR signature_url LIKE '%\\%');
