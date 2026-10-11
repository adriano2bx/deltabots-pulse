type Param = string | number | null;

export async function first<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T | null> {
  return (
    (await db
      .prepare(sql)
      .bind(...params)
      .first<T>()) ?? null
  );
}

export async function all<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  const r = await db
    .prepare(sql)
    .bind(...params)
    .all<T>();
  return r.results ?? [];
}

export async function run(db: D1Database, sql: string, ...params: Param[]): Promise<D1Result> {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}

export function stmt(db: D1Database, sql: string, ...params: Param[]): D1PreparedStatement {
  return db.prepare(sql).bind(...params);
}

export const bool = (v: number | null | undefined): boolean => v === 1;
