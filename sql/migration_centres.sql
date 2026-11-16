-- =====================================================================
-- Carbiran — Migration "multi-centres"
-- Base : MySQL 8.0 (8.0.19 minimum pour INSERT ... AS alias), schéma `carbiran`
-- Correspond à l'ÉTAPE 1 : entités Centre, Demande.centre, User.centre,
-- Ravitaillement.centre (backend/src/entities).
--
-- QUAND : application ARRÊTÉE, APRÈS sauvegarde, AVANT de démarrer la
--         nouvelle version du backend (qui contient les nouvelles entités).
-- RÉ-EXÉCUTABLE : oui (chaque étape vérifie si elle a déjà été faite).
-- NB : en MySQL, les ALTER/CREATE TABLE valident implicitement la
--      transaction : la sauvegarde ci-dessous est le vrai filet de sécurité.
--
-- 0. Sauvegarde (à lancer dans un terminal, pas dans ce script) :
--    mysqldump --single-transaction --routines --triggers -u <user> -p carbiran \
--      > carbiran_avant_centres_$(date +%F).sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Table des centres
--    Les types DOIVENT rester identiques à l'entité TypeORM Centre
--    (sinon `synchronize: true` supprimera et recréera les colonnes).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `centres` (
  `code`       varchar(255) NOT NULL,
  `nom`        varchar(255) NOT NULL,
  `zone`       varchar(255) NOT NULL,
  `actif`      tinyint      NOT NULL DEFAULT 1,
  `created_at` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Centres de départ (codes = valeurs exactes de vehicules.centre)
INSERT INTO `centres` (`code`, `nom`, `zone`) VALUES
  ('NKTT',      'Nouakchott',  'Zone A'),
  ('ROSSO',     'Rosso',       'Zone A'),
  ('NDB',       'Nouadhibou',  'Zone A'),
  ('AKJOUJT',   'Akjoujt',     'Zone A'),
  ('ZRT',       'Zouérate',    'Zone A'),
  ('ATAR',      'Atar',        'Zone A'),
  ('BASSEKNOU', 'Bassiknou',   'Zone B'),
  ('NEMA',      'Néma',        'Zone B'),
  ('AIOUN',     'Aïoun',       'Zone B'),
  ('KIFFA',     'Kiffa',       'Zone B'),
  ('SEILIBABI', 'Sélibaby',    'Zone B'),
  ('KAEDI',     'Kaédi',       'Zone B'),
  ('ALEG',      'Aleg',        'Zone B')
AS nouveau
ON DUPLICATE KEY UPDATE `nom` = nouveau.`nom`, `zone` = nouveau.`zone`;

-- ---------------------------------------------------------------------
-- 1 bis. Corrections des véhicules (AVANT le remplissage du journal, étape 4)
--   - MOTO1 (id 60) : 'MBERRE' était une erreur de saisie -> BASSEKNOU
--   - 4862BB00 (id 54) : centre vide -> NKTT
--   Les conditions sur matricule + valeur actuelle évitent de modifier
--   un autre véhicule si les id ont changé.
-- ---------------------------------------------------------------------
UPDATE `vehicules` SET `centre` = 'BASSEKNOU'
 WHERE `id` = 60 AND `matricule` = 'MOTO1' AND `centre` = 'MBERRE';

UPDATE `vehicules` SET `centre` = 'NKTT'
 WHERE `id` = 54 AND `matricule` = '4862BB00' AND `centre` IS NULL;

-- ---------------------------------------------------------------------
-- 2. Centre sur chaque demande (photo au moment de la création)
--    NOT NULL DEFAULT 'NKTT' : toutes les demandes existantes -> NKTT.
-- ---------------------------------------------------------------------
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'demandes_ravitaillement' AND COLUMN_NAME = 'centre') = 0,
  'ALTER TABLE `demandes_ravitaillement` ADD COLUMN `centre` varchar(255) NOT NULL DEFAULT ''NKTT''',
  'SELECT ''demandes_ravitaillement.centre existe deja'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `demandes_ravitaillement` SET `centre` = 'NKTT' WHERE `centre` IS NULL OR `centre` = '';

-- ---------------------------------------------------------------------
-- 3. Centre de rattachement des utilisateurs (NULL = pas de centre)
-- ---------------------------------------------------------------------
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'centre') = 0,
  'ALTER TABLE `users` ADD COLUMN `centre` varchar(255) NULL',
  'SELECT ''users.centre existe deja'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Chef de parc de Nouakchott (= chef de centre NKTT) et station actuelle -> NKTT.
-- Les comptes 'assistant', chefs de département, signataires, cellule, viewer,
-- dmg et responsable_station_viewer restent à NULL.
UPDATE `users`
   SET `centre` = 'NKTT'
 WHERE `role` IN ('chef_de_cours', 'responsable_station')
   AND `centre` IS NULL;

-- ---------------------------------------------------------------------
-- 4. Centre sur chaque ligne du journal des ravitaillements (photo)
-- ---------------------------------------------------------------------
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ravitaillements_vehicules' AND COLUMN_NAME = 'centre') = 0,
  'ALTER TABLE `ravitaillements_vehicules` ADD COLUMN `centre` varchar(255) NULL',
  'SELECT ''ravitaillements_vehicules.centre existe deja'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `ravitaillements_vehicules` r
  JOIN `vehicules` v ON v.`id` = r.`vehicule_id`
   SET r.`centre` = v.`centre`
 WHERE r.`centre` IS NULL;

-- =====================================================================
-- VÉRIFICATIONS (à lancer après le script ; résultats attendus en commentaire)
-- =====================================================================

-- V1. 13 centres : Zone A = 6 (AKJOUJT, ATAR, NDB, NKTT, ROSSO, ZRT)
--                   Zone B = 7 (AIOUN, ALEG, BASSEKNOU, KAEDI, KIFFA, NEMA, SEILIBABI)
SELECT zone, COUNT(*) AS nb, GROUP_CONCAT(code ORDER BY code) AS codes FROM centres GROUP BY zone;

-- V2. Toutes les demandes sont à NKTT (aujourd'hui : 72 lignes, 1 seul groupe)
SELECT centre, COUNT(*) AS nb FROM demandes_ravitaillement GROUP BY centre;

-- V3. Aucune demande ne contient un véhicule d'un autre centre (attendu : 0)
SELECT COUNT(*) AS demandes_incoherentes
  FROM demandes_ravitaillement d
 WHERE EXISTS (SELECT 1 FROM demande_vehicules dv JOIN vehicules v ON v.id = dv.vehicule_id
                WHERE dv.demande_id = d.id AND (v.centre IS NULL OR v.centre <> d.centre));

-- V4. Rattachement des utilisateurs : chef_de_cours x2 (dont celui du DC) et
--     responsable_station x1 à NKTT ; tous les autres rôles (dont 'assistant') à NULL
SELECT role, departement, centre, COUNT(*) AS nb FROM users GROUP BY role, departement, centre ORDER BY role;

-- V5. Journal : aucune ligne sans centre (attendu : 0 ; aujourd'hui 303 lignes toutes NKTT)
SELECT COUNT(*) AS rav_sans_centre FROM ravitaillements_vehicules WHERE centre IS NULL;
SELECT centre, COUNT(*) AS nb FROM ravitaillements_vehicules GROUP BY centre;

-- V6. Véhicules sans centre valide (centre NULL, vide ou absent de `centres`)
--     Attendu : 0 ligne. Vérification complémentaire : MOTO1 -> BASSEKNOU, 4862BB00 -> NKTT.
SELECT v.id, v.matricule, v.zone, v.centre
  FROM vehicules v LEFT JOIN centres c ON c.code = v.centre
 WHERE c.code IS NULL;

SELECT COUNT(*) AS vehicules_sans_centre_valide
  FROM vehicules v LEFT JOIN centres c ON c.code = v.centre
 WHERE c.code IS NULL;

SELECT id, matricule, zone, centre FROM vehicules WHERE id IN (54, 60);

-- V7. Structure (à comparer aux définitions des entités)
SHOW CREATE TABLE centres;
SHOW COLUMNS FROM demandes_ravitaillement LIKE 'centre';
SHOW COLUMNS FROM users LIKE 'centre';
SHOW COLUMNS FROM ravitaillements_vehicules LIKE 'centre';

-- =====================================================================
-- RETOUR ARRIÈRE (uniquement si on revient à l'ancienne version du code ;
-- perd les centres saisis après la migration — préférer la restauration
-- de la sauvegarde)
-- =====================================================================
-- ALTER TABLE ravitaillements_vehicules DROP COLUMN centre;
-- ALTER TABLE users DROP COLUMN centre;
-- ALTER TABLE demandes_ravitaillement DROP COLUMN centre;
-- DROP TABLE centres;
