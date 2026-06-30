// D1-compatible adapter backed by PostgreSQL (postgres.js), preserving the
// old D1 `prepare().bind().run()/.all()/.first()` call shape so the route
// handlers in functions/api didn't need to change during the D1 -> Postgres migration.
import postgres from 'postgres';

let _sql = null;

function getSqlClient(env) {
  if (_sql) return _sql;
  _sql = postgres({
    host: env.PG_HOST,
    port: Number(env.PG_PORT || 5432),
    database: env.PG_DATABASE,
    username: env.PG_USERNAME,
    password: env.PG_PASSWORD,
    ssl: env.PG_SSL === 'false' ? false : (env.PG_SSL || 'prefer'),
    max: 1,
    onnotice: () => {},
  });
  return _sql;
}

// D1 positional placeholders (`?`) -> Postgres numbered placeholders (`$1, $2, ...`)
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Re-throw Postgres errors with substrings the existing D1-era error handling
// already checks for (e.message.includes('UNIQUE') / 'no such column'), so the
// route handlers' catch blocks keep working unmodified.
function translateError(e) {
  if (e && e.code === '23505') { // unique_violation
    const err = new Error(`UNIQUE constraint failed: ${e.message}`);
    err.cause = e;
    throw err;
  }
  if (e && e.code === '42703') { // undefined_column
    const err = new Error(`no such column: ${e.message}`);
    err.cause = e;
    throw err;
  }
  throw e;
}

function makeRunResult(rows) {
  const changes = typeof rows.count === 'number' ? rows.count : rows.length;
  return { success: true, changes, meta: { changes, last_row_id: null }, results: rows };
}

function makeStatement(sql, pgQuery) {
  let boundArgs = [];
  return {
    bind(...args) { boundArgs = args; return this; },
    async first() {
      try {
        const rows = await sql.unsafe(pgQuery, boundArgs);
        return rows[0] || null;
      } catch (e) { translateError(e); }
    },
    async all() {
      try {
        const rows = await sql.unsafe(pgQuery, boundArgs);
        return { results: rows };
      } catch (e) { translateError(e); }
    },
    async run() {
      try {
        const rows = await sql.unsafe(pgQuery, boundArgs);
        return makeRunResult(rows);
      } catch (e) { translateError(e); }
    },
    _query: pgQuery,
    _args: () => boundArgs,
  };
}

export function getDB(env) {
  const sql = getSqlClient(env);
  return {
    prepare(query) {
      return makeStatement(sql, toPgSql(query));
    },
    async batch(stmts) {
      try {
        return await sql.begin(async (tx) => {
          const results = [];
          for (const stmt of stmts) {
            const rows = await tx.unsafe(stmt._query, stmt._args());
            results.push(makeRunResult(rows));
          }
          return results;
        });
      } catch (e) { translateError(e); }
    },
  };
}
