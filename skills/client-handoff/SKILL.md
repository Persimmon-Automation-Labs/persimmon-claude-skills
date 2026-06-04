---
name: client-handoff
description: Generates client-facing handoff documentation at the end of a Persimmon engagement — a non-technical admin user manual, a printable quick-reference card, a handoff email, and a training agenda — all derived from the actual codebase (routes, Server Actions, admin pages). Emphasizes that the client owns the repo and the keys (no subscription lock-in). Use when a build is delivery-ready, when the user asks for a client manual, training guide, or handoff docs. Pairs with meta-deployment-plan. Trigger keywords: handoff, client manual, user manual, training, walkthrough, deliver project, admin guide.
---

# Client Handoff — Persimmon Patterns

At delivery, produce client-facing docs for non-technical users: an admin manual, a quick-reference card, a handoff email, and a training agenda. This is a Persimmon differentiator — the client gets a polished manual and full ownership, not just a login URL.

These are **Markdown docs with screenshots**, committed to the client's repo under `docs/handoff/`. The client owns the repo and the keys; the manual makes that ownership usable.

## Core Rules

1. **Derive from the real codebase, not a template.** Read the app's routes and actions first. Document what exists, named exactly as the UI labels it.
2. **Screenshots, not prose alone.** Capture the actual admin screens (Playwright or manual) and reference them inline. Save to `docs/handoff/screenshots/`.
3. **Client owns everything.** State plainly: no monthly fees, no subscription, they hold the repo and all API keys. This is the Persimmon model.
4. **Credentials go separately.** Never put real passwords in the manual or email. Send them through a separate secure channel.
5. **Persist these docs in the client repo** so they travel with the code the client owns.

## Step 1 — Analyze the Project

Before writing anything, read the codebase to find what to document:

- Admin/dashboard routes — list `src/app/**/page.tsx` under any authed/admin segment.
- CRUD entities — what Server Actions exist (`src/lib/*-actions.ts`)? Products, processes, orders, users, pages.
- Forms and their fields — the Zod input schemas are the source of truth for required fields.
- Reports / dashboard stats — what the landing page renders.
- Configurable settings.
- Login URL and auth flow (NextAuth v5).

Map each action to a plain-language task ("Add a new {entity}", "Update {entity} status").

## Step 2 — Capture Screenshots

Drive the running app with Playwright (or take them manually) for each documented screen. Save under `docs/handoff/screenshots/` and reference with relative paths in the Markdown.

```js
// scripts/handoff/capture.mjs — point at the running/staging app
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// ...log in via the staging credentials, navigate, screenshot each admin screen...
await page.screenshot({ path: "docs/handoff/screenshots/dashboard.png" });
await browser.close();
```

## Step 3 — Write docs/handoff/USER-MANUAL.md

```markdown
# {Project Name} — Admin Guide

## Getting Started

### Logging In
1. Go to {admin URL}
2. Enter your email and password
3. Click "Sign in"

![Login screen](screenshots/login.png)

If you forget your password, contact {support contact} for a reset.

### Dashboard Overview
When you sign in you'll see the dashboard:
- {Stat 1}: {what it means}
- {Stat 2}: {what it means}

![Dashboard](screenshots/dashboard.png)

---

## Managing {Entity}

### Viewing all {entities}
1. Click "{Entity}" in the sidebar
2. You'll see every {entity} with name, status, date
3. Use search / the status filter to narrow the list

### Adding a new {entity}
1. Click "{Entity}" → "Add New"
2. Fill in the form:
   - **{Field}** (required): {what it's for}
   - **Status**: "Active" shows it; "Draft" hides it
   - **Image**: choose a file — at least 800px wide, JPG or PNG (auto-optimized)
3. Click "Create"

![Add form](screenshots/add-entity.png)

### Editing / Deleting
- Edit: find the row → "Edit" → change → "Save Changes"
- Delete: find the row → "Delete" → confirm. This cannot be undone.

---

## {Orders / Inquiries — whatever applies}

### Where submissions go
Contact-form submissions are emailed to {email} and appear under "{Inquiries}".

### Updating status
1. Open the record
2. Change the status dropdown ({list the real statuses})
3. Click "Update"

---

## Common Tasks Quick Reference
| Task | Steps |
|------|-------|
| Add {entity} | Sidebar → {Entity} → Add New → fill → Create |
| Edit {entity} | Sidebar → {Entity} → find → Edit → Save |
| Check {orders} | Sidebar → {Orders} → open record |
| Change password | Sidebar → Settings → Change Password |

---

## Troubleshooting

**"I can't sign in"** — Check Caps Lock; reset your password; contact {support}.
**"My change isn't showing"** — Hard-refresh (Ctrl/Cmd+Shift+R); confirm status is "Active".
**"An uploaded image looks wrong"** — Use JPG/PNG, ≥800px wide, ≤5MB. The system resizes automatically.
**"I see an error"** — Screenshot it, note what you were doing, send to {support}.

---

## Ownership & Support
This site is fully yours: no monthly fees, no subscription. You own the repository and every API key.

For help: **Email** {support email} · **Response time** {typical}.
```

## Step 4 — Write docs/handoff/QUICK-REFERENCE.md

A one-page card the client can print (export to PDF with `md-to-docx` or print-to-PDF):

```markdown
# {Project Name} — Quick Reference

**Admin login**: {URL}   **Username**: {sent separately}   **Support**: {email}

## Daily
- New {orders/inquiries}: Sidebar → {Orders}
- Respond: check email or Sidebar → {Inquiries}

## Weekly
- Add content: Sidebar → {Entity} → Add New
- Review statuses: Sidebar → {Orders}

## Remember
- Always click "Save" after changes
- "Active" = visible, "Draft" = hidden
- Images: ≥800px wide, JPG/PNG
```

## Step 5 — Handoff Email (for the team to send)

```
Subject: Your new {site/tool} is live — everything you need

Hi {Client Name},

Your {site/tool} is live at {URL}. To get started:

ADMIN PANEL
- Login: {admin URL}
- Username: {username}
- Password: sent separately, for security

Attached is a user manual covering everything — adding {entities}, managing
{orders}, handling inquiries — plus a one-page quick-reference card.

The {site/tool} is fully yours: no monthly fees, no subscription. You own the
code and all the data and keys.

Worth trying first:
- {Key feature 1}
- {Key feature 2}

Questions? Reach out to {support contact}.

Best,
{Persimmon team member}
Persimmon Automation Labs
```

## Step 6 — Training Agenda (live walkthrough, 30–45 min)

```markdown
1. Login & Dashboard (5 min) — sign in, dashboard stats, sidebar nav
2. Core workflow demo (15 min) — add a {entity}, edit it, see it live
3. Daily operations (10 min) — where to check {orders/inquiries}, update statuses
4. Q&A (10 min)
5. Follow-up — send credentials securely, send the manual PDF, confirm support contact
```

## One-Screen Defaults

- Read the codebase first; document real routes/actions/fields.
- Screenshots inline, saved to `docs/handoff/screenshots/`.
- Plain language, numbered steps, no jargon.
- State client ownership of repo + keys explicitly.
- Credentials always sent out-of-band.

## Handoff Checklist

- [ ] Admin user created with the client's preferred login
- [ ] `docs/handoff/USER-MANUAL.md` generated from the real codebase + screenshots
- [ ] `docs/handoff/QUICK-REFERENCE.md` generated
- [ ] Handoff email drafted
- [ ] Training session scheduled (if applicable)
- [ ] Credentials sent securely, separate from the manual
- [ ] Client's email confirmed as form-submission recipient
- [ ] Analytics access shared (GA4 viewer role)
- [ ] Repo + keys ownership transferred / confirmed in the client's accounts
- [ ] Verified the client can sign in and complete a basic task

## Anti-patterns banned

- Templated steps that don't match the actual UI labels/routes.
- Manuals with no screenshots.
- Real passwords embedded in the manual, email, or repo.
- Implying any ongoing subscription — Persimmon hands over full ownership.
- Writing the handoff doc outside the client's repo (it must travel with the code).

## Cross-references

- **meta-deployment-plan** — the launch/cutover plan this handoff follows.
- **meta-document-project** — keeps `docs/` coherent.
- **client-analytics** — the GA4 viewer access referenced above.
- **security-nextauth** — the auth flow the login section documents.
- **quality-final-review** — pre-delivery QA gate before handoff.
