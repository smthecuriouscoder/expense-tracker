import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/** Driver-agnostic database handle (Neon in prod, PGlite in dev/tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const PGLITE_PREFIX = "pglite:";
export const MIGRATIONS_FOLDER = "./drizzle";

/**
 * Opens a database from a URL.
 * - `postgres://…` → Neon serverless (WebSocket pool, supports transactions).
 * - `pglite:<dir>` → embedded PGlite stored in <dir>; `pglite:memory` keeps it in RAM.
 */
export async function connect(url: string): Promise<{ db: Db; migrate: () => Promise<void> }> {
  if (url.startsWith(PGLITE_PREFIX)) {
    const target = url.slice(PGLITE_PREFIX.length);
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    if (target !== "memory") {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(target, { recursive: true });
    }
    const client = new PGlite(target === "memory" ? undefined : target);
    const db = drizzle({ client, schema });
    return { db, migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }) };
  }

  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  const db = drizzle({ client: new Pool({ connectionString: url }), schema });
  return { db, migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }) };
}
