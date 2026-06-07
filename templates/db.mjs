#!/usr/bin/env node
// db — a tiny, safe Postgres CLI for Persimmon projects, so Claude (and you) can
// inspect and query the project DB WITHOUT writing a throwaway script each time.
//
// Requires the `pg` package (a dev dependency): npm i -D pg
// Connection: reads DATABASE_URL from the environment, falling back to .env /
// .env.local in the project root (dependency-free parse — no dotenv needed).
//
// SAFETY MODEL (matches meta-lifecycle-stage's "assume live data" posture):
//   • READ-ONLY by default — every query runs inside `BEGIN; SET TRANSACTION
//     READ ONLY; …; ROLLBACK`, so a stray UPDATE/DROP physically cannot commit.
//   • Mutations require --write (drops the read-only transaction).
//   • --write against a NON-LOCAL host (anything but localhost/127.0.0.1)
//     additionally requires --prod, so you can't accidentally mutate a Railway
//     production DB. Reads against remote hosts are always allowed.
//
// USAGE:
//   node scripts/db.mjs tables                       list tables + row estimates
//   node scripts/db.mjs schema <table>               columns, PK, indexes, FKs
//   node scripts/db.mjs count <table>                exact row count
//   node scripts/db.mjs query "SELECT …"             run read-only SQL
//   node scripts/db.mjs "SELECT …"                   (bare SQL == query)
//   node scripts/db.mjs --write "UPDATE …"           allow a mutation (local)
//   node scripts/db.mjs --write --prod "UPDATE …"    allow a mutation on a remote DB
//   Flags: --json (machine-readable)  --url <conn> (override DATABASE_URL)
//          --limit N (default 100 rows shown; 0 = all)

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── args ──────────────────────────────────────────────────────────
const raw = process.argv.slice(2);
const flag = (name) => {
  const i = raw.indexOf(name);
  if (i === -1) return undefined;
  const next = raw[i + 1];
  raw.splice(i, next && !next.startsWith("--") ? 2 : 1);
  return next && !next.startsWith("--") ? next : true;
};
const has = (name) => {
  const i = raw.indexOf(name);
  if (i === -1) return false;
  raw.splice(i, 1);
  return true;
};

if (has("-h") || has("--help") || raw.length === 0) {
  console.log(readFileSync(new URL(import.meta.url)).toString().split("\n")
    .filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(0);
}

// ── pg is the only dependency (imported after help so --help works without it) ──
let pg;
try {
  pg = (await import("pg")).default;
} catch {
  console.error("✗ The 'pg' package is not installed. Run:  npm i -D pg");
  process.exit(2);
}

const JSON_OUT = has("--json");
const WRITE = has("--write");
const ALLOW_PROD = has("--prod");
const urlOverride = flag("--url");
const limit = Number(flag("--limit") ?? 100);

// ── resolve connection string ─────────────────────────────────────
function loadEnvFile(name) {
  try {
    const txt = readFileSync(join(process.cwd(), name), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* no file */ }
}
loadEnvFile(".env");
loadEnvFile(".env.local");

const connStr = urlOverride || process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connStr) {
  console.error("✗ No connection string. Set DATABASE_URL (env or .env) or pass --url <conn>.");
  process.exit(2);
}

let host = "localhost";
try { host = new URL(connStr).hostname || "localhost"; } catch { /* keep default */ }
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";

// ── write/prod guard ──────────────────────────────────────────────
if (WRITE && !isLocal && !ALLOW_PROD) {
  console.error(`✗ Refusing --write against a non-local host (${host}) without --prod.`);
  console.error(`  This looks like a remote/Railway DB. Re-run with --prod ONLY if you mean it.`);
  process.exit(3);
}

// ── connect ───────────────────────────────────────────────────────
const client = new pg.Client({
  connectionString: connStr,
  // Railway/managed Postgres external connections use TLS; accept the chain.
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

function out(rows, fields) {
  if (JSON_OUT) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log("(0 rows)"); return; }
  const cols = fields ?? Object.keys(rows[0]);
  const shown = limit > 0 ? rows.slice(0, limit) : rows;
  const widths = cols.map((c) => Math.max(c.length, ...shown.map((r) => fmt(r[c]).length)));
  const line = (cells) => cells.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(line(cols));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of shown) console.log(line(cols.map((c) => fmt(r[c]))));
  if (limit > 0 && rows.length > limit) console.log(`… ${rows.length - limit} more row(s) (--limit 0 for all)`);
}
function fmt(v) {
  if (v === null || v === undefined) return "∅";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

async function run(sql) {
  if (WRITE) return client.query(sql);
  // Read-only: wrap so any accidental mutation cannot commit.
  await client.query("BEGIN");
  try {
    await client.query("SET TRANSACTION READ ONLY");
    return await client.query(sql);
  } finally {
    await client.query("ROLLBACK");
  }
}

const TABLES_SQL = `
  SELECT c.relname AS table, n_live_tup AS est_rows
  FROM pg_stat_user_tables s JOIN pg_class c ON c.oid = s.relid
  WHERE s.schemaname = 'public' ORDER BY c.relname`;

const schemaSQL = (t) => ({
  cols: `SELECT column_name AS column, data_type AS type, is_nullable AS nullable, column_default AS "default"
         FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
  idx: `SELECT indexname AS index, indexdef AS def FROM pg_indexes WHERE schemaname='public' AND tablename=$1`,
  fks: `SELECT con.conname AS fk, pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
        JOIN pg_namespace ns ON ns.oid=rel.relnamespace
        WHERE ns.nspname='public' AND rel.relname=$1 AND con.contype IN ('f','p','u')`,
});

async function paramQuery(sql, params) {
  await client.query("BEGIN");
  try { await client.query("SET TRANSACTION READ ONLY"); return await client.query(sql, params); }
  finally { await client.query("ROLLBACK"); }
}

try {
  await client.connect();
  const cmd = raw[0];

  if (cmd === "tables") {
    const r = await run(TABLES_SQL);
    out(r.rows);
  } else if (cmd === "schema") {
    const t = raw[1];
    if (!t) throw new Error("usage: db schema <table>");
    const s = schemaSQL(t);
    const cols = await paramQuery(s.cols, [t]);
    if (!cols.rows.length) throw new Error(`table "${t}" not found in schema public`);
    if (JSON_OUT) {
      const [idx, fks] = await Promise.all([paramQuery(s.idx, [t]), paramQuery(s.fks, [t])]);
      console.log(JSON.stringify({ table: t, columns: cols.rows, indexes: idx.rows, constraints: fks.rows }, null, 2));
    } else {
      console.log(`# ${t} — columns`); out(cols.rows);
      const idx = await paramQuery(s.idx, [t]);
      console.log(`\n# ${t} — indexes`); out(idx.rows);
      const fks = await paramQuery(s.fks, [t]);
      console.log(`\n# ${t} — keys / constraints`); out(fks.rows);
    }
  } else if (cmd === "count") {
    const t = raw[1];
    if (!t) throw new Error("usage: db count <table>");
    const r = await run(`SELECT count(*)::int AS count FROM "${t.replace(/"/g, '""')}"`);
    out(r.rows);
  } else {
    const sql = cmd === "query" ? raw.slice(1).join(" ") : raw.join(" ");
    if (!sql.trim()) throw new Error("usage: db query \"SELECT …\"  (or pass bare SQL)");
    const r = await run(sql);
    if (r.command === "SELECT" || r.rows?.length) out(r.rows);
    else console.log(`✓ ${r.command} — ${r.rowCount} row(s) affected${WRITE ? "" : " (rolled back: read-only; use --write)"}`);
  }
} catch (e) {
  // pg connection failures surface as AggregateError with an empty top message.
  const msg = e.message || e.errors?.map((x) => x.message || x.code).join("; ") || e.code || String(e);
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
