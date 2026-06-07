#!/usr/bin/env node
// traceability-audit — a DOCS-ONLY link-checker for the Persimmon requirements spine.
//
// WHAT IT IS: a report that resolves the provenance chain among the artifacts a
// project ALREADY writes, and flags ORPHANS — nodes that don't link upward to a
// source. It is detection, not enforcement: by default it always exits 0 (a
// report you read). Pass --gate to make it exit 1 on errors (use only at the
// demo/handoff transition, per the meta-lifecycle-stage tiering matrix).
//
// WHAT IT IS NOT: it cannot find a flow nobody authored. A missing user journey
// is caught by the human four-source method in `workflow-flow-review`, not here.
// A green audit is NOT a completeness proof.
//
// THE SPINE IT CHECKS:
//   SOW/ADR/constitution -> REQ (EARS) -> PERSONA + FLOW -> SCREEN (=mockup file)
// Orphans reported: a REQ with no Source; a FLOW with no Persona or no Source;
// a FLOW referencing a PERSONA/SCREEN/ADR that doesn't exist; (info) a mockup
// screen no flow references.
//
// DOC CONVENTIONS IT PARSES (Markdown; one block per `### <ID>` heading):
//   docs/requirements/requirements.md
//     ### REQ-<PROJ>-<AREA>-<NNN>
//     - **Source:** SOW §<x>  |  ADR-<NNNN>  |  constitution:<skill>
//     - **EARS:** <the criterion>            (optional)
//     - **Status:** active|changed|removed    (optional)
//   docs/requirements/personas.md
//     ### PERSONA-<slug>
//   docs/requirements/flows.md
//     ### FLOW-<NN> — <title>
//     - **Personas:** PERSONA-a, PERSONA-b
//     - **Source:** SOW §<x> | REQ-... | ADR-<NNNN>
//     - **Screens:** SCREEN-login, SCREEN-verify-email
//     - **Covered:** REQ-...        (optional, feeds RTM)
//     - **Built:** plan §1.5        (optional, feeds RTM)
//     - **Verified:** <test> | manual:<date> | TODO   (optional)
//     - **Usable:** <note> | TODO                       (optional)
//   Mockups: any directory named `mockups` under the root; each *.html = SCREEN-<basename>.
//   ADRs: any directory named `decisions` under the root; ADR-<NNNN>*.md files.
//
// USAGE:
//   node scripts/traceability-audit.mjs <project-docs-root> [--gate] [--json]
//   (root is scanned recursively for the files/dirs above — works whether specs
//    live in docs/ or a nested layout.)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const argv = process.argv.slice(2);
const GATE = argv.includes("--gate");
const JSON_OUT = argv.includes("--json");
const roots = argv.filter((a) => !a.startsWith("--"));
if (argv.includes("-h") || argv.includes("--help") || roots.length === 0) {
  console.log("usage: node scripts/traceability-audit.mjs <project-docs-root> [--gate] [--json]");
  process.exit(roots.length === 0 ? 1 : 0);
}

// ---- collect files -------------------------------------------------------
function walk(p, out = []) {
  let st; try { st = statSync(p); } catch { return out; }
  if (st.isDirectory()) {
    if (basename(p) === "node_modules" || basename(p) === ".git") return out;
    for (const n of readdirSync(p)) walk(join(p, n), out);
  } else out.push(p);
  return out;
}
const files = roots.flatMap((r) => walk(r));
const find = (name) => files.filter((f) => basename(f).toLowerCase() === name);
const mockups = files.filter((f) => /(^|[\\/])mockups[\\/].*\.html?$/i.test(f));
const adrFiles = files.filter((f) => /(^|[\\/])decisions[\\/]/i.test(f) && /adr-?\d+/i.test(basename(f)));

const screensAvail = new Set(mockups.map((f) => "SCREEN-" + basename(f).replace(/\.html?$/i, "")));
const adrsAvail = new Set(adrFiles.map((f) => (basename(f).match(/adr-?(\d+)/i)?.[1] || "").padStart(4, "0")).map((n) => "ADR-" + n));

// ---- tiny block parser ---------------------------------------------------
// Splits a markdown file into {id, body} blocks keyed on `### <ID>` headings.
function blocks(text, idRe) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^#{2,4}\\s+(${idRe.source})`));
    if (m) { cur = { id: m[1], body: [] }; out.push(cur); }
    else if (cur) cur.body.push(line);
  }
  return out.map((b) => ({ id: b.id, body: b.body.join("\n") }));
}
const field = (body, name) => {
  // Tolerates `- **Name:** v`, `**Name**: v`, `Name: v`. Strips stray bold
  // markers (e.g. the closing `**` of `**Source:**`) that would leak into v.
  const m = body.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*\\*{0,2}${name}\\*{0,2}\\s*:\\s*(.+)`, "i"));
  return m ? m[1].replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim() : null;
};
const idsIn = (s, re) => (s ? [...s.matchAll(re)].map((m) => m[0]) : []);
const isEmptySource = (s) => !s || /^(none|n\/a|tbd|gap|—|-|\.)*$/i.test(s.replace(/[*_`]/g, "").trim());

// ---- read the three registries ------------------------------------------
const reqText = find("requirements.md").map((f) => readFileSync(f, "utf8")).join("\n");
const perText = find("personas.md").map((f) => readFileSync(f, "utf8")).join("\n");
const flowText = find("flows.md").map((f) => readFileSync(f, "utf8")).join("\n");

const reqs = blocks(reqText, /REQ-[A-Z0-9-]+/);
const personas = new Set(blocks(perText, /PERSONA-[a-z0-9-]+/i).map((b) => b.id));
const flows = blocks(flowText, /FLOW-[A-Z0-9-]+/);
const reqIds = new Set(reqs.map((r) => r.id));

// ---- run the checks ------------------------------------------------------
const errors = [];
const warns = [];
const info = [];
const SCREEN_RE = /SCREEN-[a-z0-9-]+/gi;
const PERSONA_RE = /PERSONA-[a-z0-9-]+/gi;
const ADR_RE = /ADR-\d+/gi;

for (const r of reqs) {
  const src = field(r.body, "Source");
  if (isEmptySource(src)) errors.push(`ORPHAN req: ${r.id} has no Source (must cite SOW / ADR-NNNN / constitution:<skill>).`);
  else {
    for (const adr of idsIn(src, ADR_RE)) {
      const norm = "ADR-" + adr.slice(4).padStart(4, "0");
      if (!adrsAvail.has(norm)) warns.push(`BROKEN link: ${r.id} cites ${adr} but no decisions/ADR file matches.`);
    }
  }
}
const referencedScreens = new Set();
for (const f of flows) {
  const ppl = idsIn(field(f.body, "Personas"), PERSONA_RE);
  const src = field(f.body, "Source");
  const screens = idsIn(field(f.body, "Screens"), SCREEN_RE);
  if (ppl.length === 0) errors.push(`ORPHAN flow: ${f.id} cites no Persona.`);
  for (const p of ppl) if (!personas.has(p)) warns.push(`BROKEN link: ${f.id} cites ${p}, not defined in personas.md.`);
  if (isEmptySource(src)) errors.push(`ORPHAN flow: ${f.id} has no Source (cite a SOW item, a REQ, or an ADR).`);
  else for (const rq of idsIn(src, /REQ-[A-Z0-9-]+/g)) if (!reqIds.has(rq)) warns.push(`BROKEN link: ${f.id} Source cites ${rq}, not defined in requirements.md.`);
  for (const s of screens) {
    referencedScreens.add(s);
    if (!screensAvail.has(s)) warns.push(`BROKEN link: ${f.id} references ${s} but no mockup file matches.`);
  }
  if (screens.length === 0) info.push(`NOTE: ${f.id} maps to no SCREEN (ok for a backend/infra flow).`);
}
for (const s of screensAvail) if (!referencedScreens.has(s)) info.push(`UNCOVERED screen: ${s} is in mockups/ but no flow references it (may be out-of-slice).`);

// ---- generate the RTM (a view, never hand-maintained) --------------------
const rtm = flows.map((f) => ({
  flow: f.id,
  personas: idsIn(field(f.body, "Personas"), PERSONA_RE).join(" "),
  source: field(f.body, "Source") || "—",
  screens: idsIn(field(f.body, "Screens"), SCREEN_RE).join(" ") || "—",
  covered: field(f.body, "Covered") || "—",
  built: field(f.body, "Built") || "—",
  verified: field(f.body, "Verified") || "—",
  usable: field(f.body, "Usable") || "—",
}));

if (JSON_OUT) {
  console.log(JSON.stringify({ errors, warns, info, rtm, counts: { reqs: reqs.length, personas: personas.size, flows: flows.length, screens: screensAvail.size } }, null, 2));
} else {
  console.log(`\n=== Traceability audit ===`);
  console.log(`scanned: ${reqs.length} REQ · ${personas.size} PERSONA · ${flows.length} FLOW · ${screensAvail.size} screens · ${adrsAvail.size} ADR\n`);
  console.log(`--- RTM (generated view) ---`);
  console.log(`FLOW | personas | source | screens | covered | built | verified | usable`);
  for (const r of rtm) console.log(`${r.flow} | ${r.personas} | ${r.source} | ${r.screens} | ${r.covered} | ${r.built} | ${r.verified} | ${r.usable}`);
  console.log();
  if (errors.length) { console.log(`✗ ${errors.length} ORPHAN(s):`); errors.forEach((e) => console.log("  " + e)); }
  if (warns.length) { console.log(`\n⚠ ${warns.length} broken link(s):`); warns.forEach((w) => console.log("  " + w)); }
  if (info.length) { console.log(`\nℹ ${info.length} note(s):`); info.forEach((i) => console.log("  " + i)); }
  if (!errors.length && !warns.length) console.log(`✓ no orphans or broken links.`);
  console.log(`\n(report-only${GATE ? "" : "; pass --gate at demo/handoff to fail on orphans"}) — a green audit is NOT a completeness proof; the four-source method in workflow-flow-review finds un-authored flows.`);
}

process.exit(GATE && errors.length ? 1 : 0);
