---
name: data-db-cli
description: "Inspect and query a Persimmon project's PostgreSQL database WITHOUT writing a throwaway script each time — via a committed read-only-by-default CLI (`npm run db`) and/or a Postgres MCP server for tool-native querying. Covers the safety model (read-only default, --write/--prod guards), setup, and when to use the CLI vs the MCP. Use when you need to look at real data, check a schema, debug a query, or verify a migration applied. Trigger keywords: query the database, look at the data, db cli, run SQL, inspect schema, count rows, check the table, postgres mcp, psql."
---

# Data — DB CLI + Postgres MCP

Stop writing one-off Prisma/Node scripts to peek at the database. Persimmon projects ship a tiny **`db` CLI** (`scripts/db.mjs`) for query-from-Bash, and can wire a **Postgres MCP server** for fully tool-native querying. Both default to read-only so you can't fat-finger a production table.

## Trigger

- "What's in the `User` table?" / "How many pending accounts are there?"
- "Show me the schema for `Process`" / "Does this column exist?"
- "Did the migration apply?" / "Debug this query against real data"
- "Set up DB access for Claude" / "psql but easier"

## Two tools, one safety model

| Tool | Best for | How Claude uses it |
|---|---|---|
| **`db` CLI** (`scripts/db.mjs`) | Everyday inspection, scripting, humans, CI; works anywhere Node runs | Runs `npm run db …` through Bash |
| **Postgres MCP** | Tool-native querying with no Bash at all; schema as MCP resources | Calls the MCP `query` tool directly |

Both are **read-only by default.** Use the CLI as the default; add the MCP when you want Claude querying without shelling out. Per `meta-lifecycle-stage`, treat `production`/`maintenance` DBs as live data — read freely, mutate only deliberately.

## The CLI (`scripts/db.mjs`)

Dependency-light: one dep, `pg`. Reads `DATABASE_URL` from the environment, falling back to `.env` / `.env.local` (no `dotenv` needed).

```bash
npm run db tables                         # list tables + row estimates
npm run db schema User                    # columns, types, PK, indexes, FKs
npm run db count User
npm run db "select email, role from \"User\" where status='pending'"
npm run db --json "select count(*) from \"User\""   # machine-readable for follow-up logic
npm run db --write "update \"User\" set role='admin' where id='…'"   # mutation (local only)
npm run db --write --prod "…"             # mutation against a remote/Railway DB (deliberate)
```

### Safety model (matches the lifecycle-stage "assume live data" posture)

- **Read-only by default** — every query runs inside `BEGIN; SET TRANSACTION READ ONLY; …; ROLLBACK`. A stray `UPDATE`/`DROP` physically cannot commit; you'll see `(rolled back: read-only; use --write)`.
- **Mutations require `--write`** (drops the read-only transaction).
- **`--write` against a non-local host additionally requires `--prod`** — so you can't accidentally mutate a Railway production DB. Reads against remote hosts are always allowed.
- Quote PascalCase Prisma table names: `"User"`, not `User` (Postgres folds unquoted identifiers to lowercase).

### Setup (per project)

```bash
npm i -D pg
# copy the template (the install script does this automatically):
cp <persimmon-skills>/templates/db.mjs scripts/db.mjs
# add to package.json scripts:
#   "db": "node scripts/db.mjs"
```

`meta-skill-sync` / `install-in-project.sh` copies `db.mjs` into `scripts/` and adds the `db` npm script when it can.

## The Postgres MCP server (optional, tool-native)

Wire a read-only Postgres MCP into the project so Claude queries via an MCP tool with no Bash. Two good servers:

- **`@modelcontextprotocol/server-postgres`** — the simple reference server; read-only (runs every query in a read-only transaction), exposes table schemas as resources + a `query` tool. (In maintenance mode but functional.)
- **`crystaldba/postgres-mcp` (Postgres MCP Pro)** — actively maintained; `--access-mode=restricted` enforces read-only + safety, plus index/health analysis tools.

Configure via a committed `.mcp.json` at the project root. **Never hard-code the connection string** — use Claude Code's `${VAR}` expansion so the secret stays in the environment:

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]
    }
  }
}
```

For `crystaldba/postgres-mcp` (reads `DATABASE_URI`, runs restricted):

```json
{
  "mcpServers": {
    "postgres": {
      "command": "postgres-mcp",
      "args": ["--access-mode=restricted"],
      "env": { "DATABASE_URI": "${DATABASE_URL}" }
    }
  }
}
```

**For a production DB, point the MCP at a dedicated read-only Postgres role**, not the app's read-write user — defense in depth beyond the server's own read-only mode. The MCP runs with whatever the connection grants; a read-only grant is the real guarantee.

## When to use which

- **Default to the CLI** — zero config beyond `npm i -D pg`, reproducible, scriptable, and the `--write`/`--prod` gates are explicit and auditable in the command itself.
- **Add the MCP** when you want Claude to query mid-task without shelling out, or want schema-as-resources. Heavier setup (per project + per environment) and an extra process.
- **Either way, read against staging/preview, not production, when you can** — match the stage (`meta-lifecycle-stage`).

## Anti-patterns banned

- Hard-coding `DATABASE_URL` in a committed `.mcp.json` (leaks the secret) — use `${DATABASE_URL}` expansion.
- `--write --prod` casually — it's the one command that can mutate live client data. Snapshot first (`infra-railway-deploy`); confirm the stage.
- Pointing a read-write MCP connection at a production DB — use a read-only role.
- Writing a fresh Prisma/Node script just to `SELECT` something — that's exactly what this skill removes.
- Unquoted PascalCase table names (`select * from User` → "relation user does not exist").

## Relationship to other skills

| Skill | Connection |
|---|---|
| `data-prisma-pgvector` | Owns the schema the CLI/MCP inspects; the shared Prisma client is for app code, this is for ad-hoc inspection |
| `meta-lifecycle-stage` | The "assume live data" posture; production/maintenance → read-only, snapshot before any `--write --prod` |
| `infra-railway-deploy` | Where `DATABASE_URL` comes from (Railway env) + the DB backup/snapshot before risky writes |
| `security-review` | Audits that no `.mcp.json` / repo file hard-codes DB creds, and that prod MCP access is read-only |
| `workflow-debug` | Uses this to inspect real data when debugging a stack issue |
