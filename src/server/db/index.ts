import "server-only";
import { connect, type Db } from "./client";

export type { Db } from "./client";

// One connection per server instance; reused across requests (and HMR in dev).
const globalForDb = globalThis as unknown as { dbPromise?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.dbPromise) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
    globalForDb.dbPromise = connect(url).then(({ db }) => db);
  }
  return globalForDb.dbPromise;
}
