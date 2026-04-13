---
name: deployment-plan
description: Generate a lean, client-facing deployment plan document for a Persimmon Automation Labs milestone. Use when shipping a feature to production, cutting a release, pushing a milestone live, or preparing sign-off for a client go-live. Trigger keywords — deployment plan, ship plan, go-live, release doc, production cutover, milestone launch, cutover checklist, rollout doc.
---

# Deployment Plan Generator (Persimmon)

## Purpose

Produce a short, actionable deployment plan for a specific milestone on a Persimmon client project. The doc is the written agreement — before/during/after the push — between Persimmon and the client. It lives in the client repo, gets signed off, and is the reference if anything goes sideways.

**Not** a full scope document. Not a sales artifact. **Keep it under 80 lines of body content.** If it's longer, you're planning too much in one cutover.

---

## When to Use

- Shipping a named milestone to production (e.g. "Indexer MVP", "Auth hardening", "RAG go-live").
- Cutting a release that the client must sign off on before it goes live.
- Any deployment that touches a **destructive migration**, a **custom domain**, a **new env var**, or a **new third-party integration**.
- **Do not** use for routine patch deploys (typo fix, copy change, dependency bump) — those don't need a plan.

---

## Output

- **File**: `docs/deployment-plan-YYYY-MM-DD.md` in the client project repo.
- **Format**: Markdown. Eight fixed sections. One title line. One metadata table.
- **Length**: ≤ 80 lines of body content (excluding frontmatter/signature block).

---

## Stack Assumptions

This skill assumes the Persimmon default stack — read `/Users/renatoprado/Documents/Projects/persimmon-claude-skills/CLAUDE.md` first and adapt if the client's stack differs.

- **Hosting**: Railway (app + DB + bucket). Push to `main` → auto-build → live.
- **DB**: PostgreSQL on Railway, schema via Prisma (`prisma db push` or `migrate deploy` — confirm per project).
- **CI**: GitHub Actions runs lint / typecheck / prisma validate / build on every push.
- **Rollback**: Railway keeps previous deploy builds; rollback = click previous build → "Redeploy" in dashboard, or `railway redeploy <deploymentId>` via CLI.
- **DNS**: Custom domain already cut over via Railway → DNS; no DNS work during deploy unless the plan explicitly says so.

---

## Section Template (Copy Exactly)

```markdown
# Deployment Plan — {Milestone Name}

| | |
|---|---|
| **Project** | {client-project-repo} |
| **Milestone** | {short name} |
| **Target date** | YYYY-MM-DD |
| **Prepared by** | Persimmon Automation Labs |
| **Client contact** | {Name, role} |
| **Status** | Draft / Approved / Shipped |

## 1. Overview

One paragraph. What is shipping, why now, what the client will see after this goes live. No jargon — the client has to understand the value in 30 seconds.

## 2. Scope

**In:**
- {Feature or fix 1 — one line each}
- {Feature or fix 2}
- {...}

**Out (explicitly not in this deploy):**
- {Thing the client might assume is in — name it}
- {Deferred items, next milestone}

## 3. Pre-deployment checklist

- [ ] DB migration reviewed and applied to `{project}_dev` without error
- [ ] New env vars set in Railway `Production` environment: `{VAR_1}`, `{VAR_2}`
- [ ] Custom domain / DNS already live (or N/A)
- [ ] CI green on the commit being deployed (lint, typecheck, prisma validate, build)
- [ ] `review-skills` dimensions pass (security, accessibility, performance) — or waivers documented below
- [ ] Backup of production DB taken at `{location}` (required if migration is destructive)
- [ ] Client notified of maintenance window (if downtime expected)

## 4. Deployment steps

1. Merge `{branch}` → `main` (or push `main` directly if already merged).
2. Railway auto-deploys `{service-name}`. Build time typically {N} min.
3. Watch Railway build log until status = **SUCCESS**. If `prisma db push` is in the build step, confirm it completed without drift warnings.
4. Smoke-test production (§7 checklist) within 5 minutes of deploy success.
5. Verify custom domain `{https://custom.domain}` serves the new build (hard refresh, check build ID in network tab or `/api/health` if available).
6. Notify client with link + 1-line summary of what shipped.

## 5. Rollback plan

- **Previous Railway deployment ID**: `{deploymentId}` — redeploy via dashboard or `railway redeploy {deploymentId}`.
- **DB rollback**:
  - If migration is additive only → no DB rollback needed; previous build works against new schema.
  - If migration is destructive (drop column, drop table, rename, enum value removed) → **restore DB from backup taken in §3** before redeploying previous build. Restore path: `{backup-location}` → `pg_restore --clean --if-exists --no-owner --dbname=$DATABASE_URL {backup-file}`.
- **Data backup location**: `{s3-bucket-path or local-path}`.
- **Rollback authority**: Persimmon can rollback unilaterally within the first 60 min if smoke tests fail. After that, client sign-off required.

## 6. Post-deployment verification

Smoke test checklist — all must pass within 10 min of deploy:

- [ ] Landing route loads over HTTPS on custom domain
- [ ] Login works (test account: `{test-user-email}`)
- [ ] Core user flow end-to-end: `{the one path the client cares about most}`
- [ ] No 5xx errors in Railway logs for 10 minutes post-deploy
- [ ] New feature from §2 actually visible/usable
- [ ] Existing critical flow from previous milestone still works (regression check)

## 7. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Client approver | | | |
| Persimmon lead | | | |

Status legend: **Draft** (pre-review) → **Approved** (client signed, ready to ship) → **Shipped** (deployed, smoke tests green).
```

---

## Writing Rules

1. **One milestone per plan.** If you're shipping two unrelated features, write two plans.
2. **Scope section is binding.** Everything in "In" goes out with this deploy. Everything in "Out" does not. If something surfaces mid-deploy that isn't in "In", it waits for the next plan.
3. **Rollback must be real.** If you can't describe how to roll back, the plan isn't ready. Destructive migrations require a named backup file *before* deploy.
4. **Checklists are checkboxes, not prose.** The client (and future-you) should be able to scan and tick.
5. **Never include secrets.** Env var *names* only. Values live in Railway.
6. **Assume Railway + push-to-deploy.** If the project is self-hosted or uses a different CD, note it in §4 and adapt. Do not pretend it's Railway if it isn't.
7. **Skip sections only when truly N/A.** If there's no DB migration, §3 still lists the migration line as `N/A — no schema changes`. Don't delete the line; the client reads structure.

---

## Example — Filled Plan for Piccino

Realistic example for the Piccino milestone "Indexer MVP" — page-by-page PDF classification with `ProcessDocument` persistence.

```markdown
# Deployment Plan — Indexer MVP

| | |
|---|---|
| **Project** | piccino-legal |
| **Milestone** | Indexer MVP (page classification + ProcessDocument persistence) |
| **Target date** | 2026-04-17 |
| **Prepared by** | Persimmon Automation Labs |
| **Client contact** | João Piccino, sócio |
| **Status** | Draft |

## 1. Overview

Este deploy liga a primeira etapa do pipeline do Piccino: após o upload, cada página do PDF é classificada automaticamente pelo Claude (petição inicial, sentença, intimação, demonstrativo de débito, etc.) e persistida em `ProcessDocument`. O painel passa a mostrar o status `INDEXED` e a lista de peças identificadas por processo.

## 2. Scope

**In:**
- Job de indexação em background por processo (status `UPLOADED → INDEXING → INDEXED`)
- Classificação página-a-página via Claude Sonnet com cache de system prompt
- Persistência em `ProcessDocument` (tipo, páginas inicial/final, resumo curto)
- Tela `/processes/[id]` passa a listar as peças classificadas
- Botão "Reindexar" (admin only) — apaga `ProcessDocument` do processo e reenfileira

**Out (explicitly not in this deploy):**
- Análise de parâmetros (prescrição, nulidade) — próximo milestone
- Geração de peça — milestone posterior
- RAG sobre doutrina do escritório — ainda não
- SSE / push de status — por enquanto polling a cada 5s

## 3. Pre-deployment checklist

- [ ] Migration `ProcessDocument` model + enum `DocumentType` aplicada em `piccino_dev` sem erro
- [ ] Env vars em Railway Production: `ANTHROPIC_API_KEY` (já existe, verificar), `INDEXER_CONCURRENCY=2` (novo)
- [ ] Custom domain `sistema.piccino.com.br` já live — N/A (sem mudança)
- [ ] CI verde no commit de deploy (lint, typecheck, prisma validate, build)
- [ ] review-skills: security + performance passam; accessibility com waiver (tela de lista ainda sem labels ARIA — backlog)
- [ ] Backup de `piccino_prod` em `tigris://piccino-backups/2026-04-17-pre-indexer.dump` (migration é aditiva, mas tabela nova é grande — backup por precaução)
- [ ] João avisado: sem janela de manutenção, deploy em horário comercial ok

## 4. Deployment steps

1. Merge PR `feat/indexer-mvp` → `main`.
2. Railway auto-deploys `piccino-web`. Build típico: 3 min.
3. Acompanhar log até status **SUCCESS**. Confirmar `prisma db push` aplicou `ProcessDocument` + enum sem drift.
4. Smoke test (§7) em 5 min.
5. Abrir `https://sistema.piccino.com.br`, fazer login, ver painel.
6. Avisar João: "Indexer no ar — pode subir um PDF de teste e acompanhar o status em /processes".

## 5. Rollback plan

- **Previous Railway deployment ID**: `d-a7f3e2` (deploy anterior, auth hardening) — redeploy via dashboard.
- **DB rollback**: migration é aditiva (nova tabela + novo enum + nova coluna `Process.indexedAt`). Não precisa rollback de schema — build anterior ignora colunas novas. Se der ruim de verdade, restaurar `tigris://piccino-backups/2026-04-17-pre-indexer.dump` via `pg_restore --clean --if-exists --no-owner --dbname=$DATABASE_URL`.
- **Data backup location**: `tigris://piccino-backups/2026-04-17-pre-indexer.dump`.
- **Rollback authority**: Persimmon rollback unilateral em 60 min se smoke falhar.

## 6. Post-deployment verification

- [ ] `https://sistema.piccino.com.br` carrega em HTTPS
- [ ] Login de João funciona
- [ ] Upload de PDF de teste (3 páginas) → status vai `UPLOADED → INDEXING → INDEXED` em < 2 min
- [ ] `/processes/[id]` mostra peças classificadas com tipo + páginas
- [ ] Sem 5xx no log do Railway por 10 min pós-deploy
- [ ] Botão "Reindexar" funciona (admin) e reexecuta sem duplicar registros
- [ ] Upload antigo (pré-deploy) continua abrindo sem erro

## 7. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Client approver | João Piccino | | |
| Persimmon lead | Renato Prado | | |
```

---

## Delivery Steps

1. **Confirm the milestone.** If the user hasn't given a name, ask. Don't guess.
2. **Read the client CLAUDE.md** to pull stack specifics, domain, service name, migration strategy.
3. **Check the repo** for:
   - Current Railway deployment ID (ask user or check `railway status` if MCP available).
   - Existing migrations in `prisma/migrations/` — is this one destructive?
   - Env vars in `.env.example` — anything new needing Railway config?
4. **Generate the doc** at `docs/deployment-plan-YYYY-MM-DD.md`. YYYY-MM-DD = target deploy date (not today).
5. **Mark status `Draft`**. Only the human flips to `Approved` / `Shipped`.
6. **Verify**:
   - Body ≤ 80 lines.
   - All 7 sections present.
   - Rollback plan is concrete (has IDs, backup paths — or an explicit "N/A because additive only").
   - No secrets.
7. **Report** file path + one-line summary. Do not commit unless the user asks.

---

## Anti-patterns

- Writing a plan as a sales doc (hero copy, value props) — this is an ops doc.
- Skipping §5 rollback because "it's a small change". Small changes break production too.
- Listing env var *values* instead of names.
- Describing deploy as "push and pray". If §4 has fewer than 4 concrete steps, you're being sloppy.
- One plan covering three milestones. Split it.
- Forgetting the regression line in §6. Every deploy can break something that already worked.
