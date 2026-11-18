-- =====================================================================
-- Carbiran — Migration "multi-centres"
-- Base : MySQL 8.0 (8.0.19 minimum pour INSERT ... AS alias), schéma `carbiran`
-- Correspond à l'ÉTAPE 1 : entités Centre, Demande.centre, User.centre,
-- Ravitaillement.centre (backend/src/entities).
--
-- QUAND : application ARRÊTÉE, APRÈS sauvegarde, AVANT de démarrer la
--         nouvelle version du backend (qui contient les nouvelles entités).
-- RÉ-EXÉCUTABLE : oui (chaque étape vérifie si elle a déjà été faite),
--                 tant que le nouveau backend n'a pas encore été démarré.
-- PRINCIPE DE LA PHOTO : le centre d'une demande et d'une ligne du journal
--   est figé au moment où elles sont créées. Avant la généralisation, tout
--   passait par Nouakchott : TOUTES les demandes et TOUTES les lignes du
--   journal existantes reçoivent donc 'NKTT', quel que soit le centre ACTUEL
--   du véhicule (un véhicule réaffecté depuis, ex. 1007AC00 passé à ATAR en
--   août, garde ses anciens ravitaillements et ses anciennes demandes à NKTT).
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
--    Toutes les lignes existantes -> 'NKTT' (tout passait par Nouakchott
--    avant la généralisation). On n'utilise PAS le centre actuel du
--    véhicule : un véhicule réaffecté depuis (ex. 1007AC00 -> ATAR) verrait
--    à tort ses anciens ravitaillements rangés dans son nouveau centre.
--    Pas de jointure sur `vehicules` : les lignes dont le véhicule a été
--    supprimé reçoivent aussi 'NKTT'.
-- ---------------------------------------------------------------------
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ravitaillements_vehicules' AND COLUMN_NAME = 'centre') = 0,
  'ALTER TABLE `ravitaillements_vehicules` ADD COLUMN `centre` varchar(255) NULL',
  'SELECT ''ravitaillements_vehicules.centre existe deja'' AS info');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `ravitaillements_vehicules`
   SET `centre` = 'NKTT'
 WHERE `centre` IS NULL OR `centre` = '';

-- =====================================================================
-- VÉRIFICATIONS (à lancer après le script ; résultats attendus en commentaire)
-- =====================================================================

-- V1. 13 centres : Zone A = 6 (AKJOUJT, ATAR, NDB, NKTT, ROSSO, ZRT)
--                   Zone B = 7 (AIOUN, ALEG, BASSEKNOU, KAEDI, KIFFA, NEMA, SEILIBABI)
SELECT zone, COUNT(*) AS nb, GROUP_CONCAT(code ORDER BY code) AS codes FROM centres GROUP BY zone;

-- V2. Toutes les demandes sont à NKTT (aujourd'hui : 72 lignes, 1 seul groupe)
SELECT centre, COUNT(*) AS nb FROM demandes_ravitaillement GROUP BY centre;

-- V3. INFORMATIF — CE N'EST PAS UNE ERREUR.
--     Demandes dont un véhicule est AUJOURD'HUI rattaché à un autre centre
--     que celui de la demande. C'est attendu : une demande garde le centre
--     de sa création (principe de la photo), même si le véhicule a été
--     réaffecté depuis. Ex. serveur : 1007AC00 réaffecté à ATAR en août ->
--     ses anciennes demandes NKTT apparaissent ici (17 sur le serveur).
--     Le nombre n'a pas à valoir 0 ; à relire seulement pour repérer un cas
--     inattendu (véhicule sans centre, centre inconnu, demande récente).
SELECT COUNT(DISTINCT d.id) AS demandes_avec_vehicule_reaffecte_INFO
  FROM demandes_ravitaillement d
  JOIN demande_vehicules dv ON dv.demande_id = d.id
  JOIN vehicules v          ON v.id = dv.vehicule_id
 WHERE v.centre IS NULL OR v.centre <> d.centre;

SELECT d.id                 AS demande_id,
       d.created_at         AS demande_creee_le,
       d.departement,
       d.centre             AS centre_demande,
       d.statut             AS statut_demande,
       v.matricule,
       v.centre             AS centre_actuel_vehicule,
       dv.statut            AS statut_vehicule_dans_demande,
       'Information : vehicule reaffecte depuis, pas une erreur' AS remarque
  FROM demandes_ravitaillement d
  JOIN demande_vehicules dv ON dv.demande_id = d.id
  JOIN vehicules v          ON v.id = dv.vehicule_id
 WHERE v.centre IS NULL OR v.centre <> d.centre
 ORDER BY v.matricule, d.created_at;

-- V4. Rattachement des utilisateurs : chef_de_cours x2 (dont celui du DC) et
--     responsable_station x1 à NKTT ; tous les autres rôles (dont 'assistant') à NULL
SELECT role, departement, centre, COUNT(*) AS nb FROM users GROUP BY role, departement, centre ORDER BY role;

-- V5. Journal : TOUTES les lignes existantes sont à NKTT, y compris celles
--     d'un véhicule réaffecté depuis (ex. les 19 de 1007AC00, aujourd'hui ATAR).
--     Attendu juste après la migration :
--       rav_sans_centre = 0 et rav_hors_nktt = 0 ;
--       un seul groupe : NKTT = nombre total de lignes (local : 303).
SELECT COUNT(*) AS rav_sans_centre FROM ravitaillements_vehicules WHERE centre IS NULL OR centre = '';
SELECT COUNT(*) AS rav_hors_nktt   FROM ravitaillements_vehicules WHERE centre <> 'NKTT';
SELECT centre, COUNT(*) AS nb FROM ravitaillements_vehicules GROUP BY centre;

--     Contrôle du cas 1007AC00 : ses lignes sont à NKTT même si le véhicule
--     est aujourd'hui dans un autre centre (serveur : 19 lignes, ATAR).
SELECT v.matricule, v.centre AS centre_actuel_vehicule, r.centre AS centre_journal, COUNT(*) AS nb
  FROM ravitaillements_vehicules r
  JOIN vehicules v ON v.id = r.vehicule_id
 WHERE v.matricule = '1007AC00'
 GROUP BY v.matricule, v.centre, r.centre;

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
