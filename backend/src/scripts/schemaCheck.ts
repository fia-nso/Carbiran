/// <reference types="node" />
/**
 * Affiche les requêtes que `synchronize: true` exécuterait au démarrage,
 * SANS les exécuter (synchronize forcé à false pour ce script).
 *
 * Usage :
 *   npm run schema:check
 *   DB_DATABASE=carbiran_test npm run schema:check
 *
 * Résultat attendu après migration : "0 requête". Code de sortie 1 sinon.
 */
import 'reflect-metadata'
import 'dotenv/config'
import { AppDataSource } from '../config/database'

async function main(): Promise<void> {
  AppDataSource.setOptions({ synchronize: false, logging: false })
  await AppDataSource.initialize()

  const opts = AppDataSource.options as { host?: string; database?: string }
  console.log(`Base vérifiée : ${opts.database} @ ${opts.host}`)

  try {
    const { upQueries } = await AppDataSource.driver.createSchemaBuilder().log()

    if (upQueries.length === 0) {
      console.log('OK : 0 requête — le schéma correspond exactement aux entités.')
      return
    }

    console.log(`ATTENTION : ${upQueries.length} requête(s) seraient exécutées par synchronize :`)
    for (const q of upQueries) console.log(`  ${q.query};`)
    process.exitCode = 1
  } finally {
    await AppDataSource.destroy()
  }
}

main().catch((err) => {
  console.error('Erreur schema:check :', err)
  process.exit(1)
})
