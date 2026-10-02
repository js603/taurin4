interface KV { key: string; value: string }

export interface OutboxItem {
  id: string;
  method: string;
  path: string;
  body?: string;
  createdAt: number;
  attempts: number;
  optimisticId?: string;
}

const memory = new Map<string,string>();
const cacheMemory = new Map<string,string>();
const outboxMemory = new Map<string,OutboxItem>();
let dbPromise: Promise<any> | null = null;

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function db() {
  if (!isTauri()) return null;
  if (!dbPromise) {
    dbPromise = import("@tauri-apps/plugin-sql").then(async ({default: Database}) => {
      const conn = await Database.load("sqlite:moonjang-local.db");
      await conn.execute("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      await conn.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
      await conn.execute("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, method TEXT NOT NULL, path TEXT NOT NULL, body TEXT, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, optimistic_id TEXT)");
      await conn.execute("CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox(created_at)");
      return conn;
    });
  }
  return dbPromise;
}

export const localDb = {
  async get<T>(key: string): Promise<T | null> {
    const conn = await db();
    if (!conn) {
      const value = memory.get(key);
      return value ? JSON.parse(value) as T : null;
    }
    const rows = await conn.select("SELECT key, value FROM kv WHERE key = $1", [key]) as KV[];
    return rows[0] ? JSON.parse(rows[0].value) as T : null;
  },

  async set(key: string, value: unknown) {
    const json = JSON.stringify(value);
    const conn = await db();
    if (!conn) { memory.set(key, json); return; }
    await conn.execute(
      "INSERT INTO kv(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      [key, json, Date.now()],
    );
  },

  async remove(key: string) {
    const conn = await db();
    if (!conn) { memory.delete(key); return; }
    await conn.execute("DELETE FROM kv WHERE key = $1", [key]);
  },

  async clear() {
    const conn = await db();
    if (!conn) { memory.clear(); cacheMemory.clear(); outboxMemory.clear(); return; }
    await conn.execute("DELETE FROM kv");
    await conn.execute("DELETE FROM cache");
    await conn.execute("DELETE FROM outbox");
  },

  async cacheGet<T>(key: string): Promise<T | null> {
    const conn = await db();
    if (!conn) {
      const value = cacheMemory.get(key);
      return value ? JSON.parse(value) as T : null;
    }
    const rows = await conn.select("SELECT value FROM cache WHERE key = $1", [key]) as {value:string}[];
    return rows[0] ? JSON.parse(rows[0].value) as T : null;
  },

  async cacheSet(key: string, value: unknown) {
    const json = JSON.stringify(value);
    const conn = await db();
    if (!conn) { cacheMemory.set(key, json); return; }
    await conn.execute(
      "INSERT INTO cache(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
      [key, json, Date.now()],
    );
  },

  async cacheRemove(key: string) {
    const conn = await db();
    if (!conn) { cacheMemory.delete(key); return; }
    await conn.execute("DELETE FROM cache WHERE key = $1", [key]);
  },

  async outboxAdd(item: Omit<OutboxItem,"attempts"> & {attempts?:number}) {
    const row: OutboxItem = {...item, attempts:item.attempts ?? 0};
    const conn = await db();
    if (!conn) { outboxMemory.set(row.id, row); return; }
    await conn.execute(
      "INSERT OR REPLACE INTO outbox(id,method,path,body,created_at,attempts,optimistic_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [row.id,row.method,row.path,row.body ?? null,row.createdAt,row.attempts,row.optimisticId ?? null],
    );
  },

  async outboxList(): Promise<OutboxItem[]> {
    const conn = await db();
    if (!conn) return [...outboxMemory.values()].sort((a,b)=>a.createdAt-b.createdAt);
    const rows = await conn.select("SELECT id,method,path,body,created_at,attempts,optimistic_id FROM outbox ORDER BY created_at") as any[];
    return rows.map(r=>({id:r.id,method:r.method,path:r.path,body:r.body ?? undefined,createdAt:Number(r.created_at),attempts:Number(r.attempts),optimisticId:r.optimistic_id ?? undefined}));
  },

  async outboxRemove(id: string) {
    const conn = await db();
    if (!conn) { outboxMemory.delete(id); return; }
    await conn.execute("DELETE FROM outbox WHERE id = $1", [id]);
  },

  async outboxMarkAttempt(id: string) {
    const conn = await db();
    if (!conn) {
      const item=outboxMemory.get(id); if(item) outboxMemory.set(id,{...item,attempts:item.attempts+1}); return;
    }
    await conn.execute("UPDATE outbox SET attempts=attempts+1 WHERE id=$1", [id]);
  },

  async outboxCount() {
    const conn = await db();
    if (!conn) return outboxMemory.size;
    const rows = await conn.select("SELECT COUNT(*) AS c FROM outbox") as {c:number}[];
    return Number(rows[0]?.c ?? 0);
  },
};
