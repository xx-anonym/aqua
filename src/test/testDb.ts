import initSqlJs from 'sql.js';
import schema from '../../data-pipeline/schema/catalog.sql?raw';
import traits from '../../data-pipeline/input/traits.json';
import regions from '../../data-pipeline/input/regions.json';
import seed from './fixtures/seed-species.json';
import { AppDb } from '../db/appDb';
import { buildCatalogBytes, type SeedRegion, type SeedSpecies, type SeedTrait } from '../catalog/buildCatalog';
import { loadCatalog } from '../catalog/catalog';

let catalogBytes: Uint8Array | null = null;

export async function createTestDb(userBytes?: Uint8Array): Promise<AppDb> {
  const SQL = await initSqlJs();
  catalogBytes ??= buildCatalogBytes(
    SQL,
    schema,
    traits as SeedTrait[],
    regions as SeedRegion[],
    seed as unknown as SeedSpecies[],
  );
  return AppDb.create(SQL, catalogBytes, userBytes);
}

export async function createTestCatalog() {
  return loadCatalog(await createTestDb());
}
