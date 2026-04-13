---
name: legal-brief-composer
description: Build the Piccino Brief pipeline — multi-stage composition (outline → sections → assembly) with strict citation grounding. Every doctrine citation must reference a retrieved chunk_id. Use when building the brief generation endpoint, fixing hallucinated citations, adding a new peça type (contestação, réplica, recurso), or tuning tone/length. Trigger keywords: brief generator, peça jurídica, legal drafting, citation grounding, [ref:chunk_id], RAG composition, multi-stage composition, Fatos Direito Pedido.
---

# legal-brief-composer

The pipeline that turns `{ process summary, findings, retrieved doctrine chunks }` into a formal Brazilian legal peça. Used by Piccino's `Brief` feature. Zero tolerance for hallucinated citations.

## The non-negotiable rule

**Every citation of doctrine, jurisprudence, or legal article MUST reference a chunk returned by the retrieval layer.** The model never cites from parametric knowledge. If a chunk doesn't support a claim, the claim is made WITHOUT citation or is dropped.

Enforcement lives at three layers:
1. The prompt instructs it.
2. Retrieval always passes `chunk_id` per source.
3. A post-processor validates every `[ref:chunk_id]` in the output against the source list and fails the pipeline on unknown IDs.

## Pipeline architecture

```
Input: { processId }
  │
  ├─► Stage 1: Outline
  │     - Read Process + Findings
  │     - Retrieve 20–30 chunks per section query
  │     - callClaude(task: "compose-brief", short) → outline JSON
  │
  ├─► Stage 2: Section drafts (parallel per section)
  │     - For Fatos / Direito / Pedido:
  │       - Retrieve section-specific chunks
  │       - callClaude(task: "compose-brief") with cached doctrine block
  │       - Output: markdown section WITH [ref:chunk_id] inline
  │
  ├─► Stage 3: Validation
  │     - Parse [ref:xxx] tokens
  │     - Verify each exists in the retrieval set
  │     - On failure: regenerate that section ONCE, then fail-loud
  │
  └─► Stage 4: Assembly + persist to DB
        - Concatenate sections
        - Replace [ref:chunk_id] with [N] footnote refs + bibliography
        - Persist to Brief table (never regenerate; link by briefId)
```

## File layout

```
src/lib/brief/
  compose.ts         # top-level pipeline
  outline.ts         # stage 1
  sections.ts        # stage 2
  validate.ts        # stage 3
  citations.ts       # [ref:X] parsing + bibliography
```

## Stage 1 — Outline

```ts
import { callClaude } from "@/lib/ai/claude";
import { retrieveForComposition } from "@/lib/rag/retrieve";
import { briefOutlinePrompt, OUTLINE_TOOL } from "@/lib/ai/prompts";

export type BriefOutline = {
  peçaType: "contestação" | "réplica" | "recurso" | "petição inicial";
  sections: {
    id: "fatos" | "direito" | "pedido";
    theses: string[];           // main arguments to develop
    retrievalQueries: string[]; // queries to feed stage 2 retrieval
  }[];
};

export async function buildOutline(input: {
  processSummary: string;
  findings: unknown;
  peçaType: BriefOutline["peçaType"];
}): Promise<BriefOutline> {
  // Seed retrieval with a broad query from the summary + findings keywords.
  const seedChunks = await retrieveForComposition(
    `${input.processSummary}`,
    { topK: 15, docType: "doctrine" },
  );

  const { system, messages } = briefOutlinePrompt({
    processSummary: input.processSummary,
    findings: input.findings,
    peçaType: input.peçaType,
    seedChunks,
  });

  const { toolUses } = await callClaude({
    task: "compose-brief",
    system,
    messages,
    tools: [OUTLINE_TOOL],
    toolChoice: { type: "tool", name: "emit_outline" },
    maxTokens: 2000,
    label: "brief-outline",
  });

  return toolUses[0].input as BriefOutline;
}
```

## Stage 2 — Section drafts (parallel)

```ts
import { callClaude } from "@/lib/ai/claude";
import { retrieveForComposition, type RetrievedChunk } from "@/lib/rag/retrieve";
import { briefSectionPrompt } from "@/lib/ai/prompts";

export type DraftedSection = {
  id: "fatos" | "direito" | "pedido";
  markdown: string;
  sources: RetrievedChunk[];    // the exact chunks passed to the model
};

export async function draftSection(input: {
  sectionId: DraftedSection["id"];
  theses: string[];
  retrievalQueries: string[];
  processSummary: string;
  findings: unknown;
}): Promise<DraftedSection> {
  // Fan-out retrieval across section queries, dedupe, rerank to ~12.
  const lists = await Promise.all(
    input.retrievalQueries.map((q) =>
      retrieveForComposition(q, { topK: 20, docType: "doctrine" }),
    ),
  );
  const merged = dedupById(lists.flat()).slice(0, 12);

  const { system, messages } = briefSectionPrompt({
    sectionId: input.sectionId,
    theses: input.theses,
    processSummary: input.processSummary,
    findings: input.findings,
    sources: merged,
  });

  const { text } = await callClaude({
    task: "compose-brief",                   // -> opus
    system,                                   // doctrine block is cached
    messages,
    maxTokens: 6000,
    label: `brief-section:${input.sectionId}`,
  });

  return { id: input.sectionId, markdown: text, sources: merged };
}

function dedupById(list: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.chunkId) ? false : (seen.add(c.chunkId), true)));
}
```

Parallelize across sections:

```ts
const drafts = await Promise.all(
  outline.sections.map((s) =>
    draftSection({
      sectionId: s.id,
      theses: s.theses,
      retrievalQueries: s.retrievalQueries,
      processSummary,
      findings,
    }),
  ),
);
```

## Prompt contract — section drafting

The system prompt (in `prompts.ts`) must include:

```
<citation_rules>
- Toda afirmação doutrinária DEVE ser seguida de [ref:CHUNK_ID], usando um id literal do bloco <sources>.
- NUNCA invente um chunk_id.
- Se nenhuma fonte em <sources> suporta uma afirmação, afirme-a sem citação ou omita.
- NÃO cite artigos de lei, súmulas ou julgados que não apareçam em <sources>.
</citation_rules>
```

User turn embeds sources as:

```
<sources>
<source id="clu2a9x..." origin="STJ, REsp 1.234.567/SP, 2022">
...texto do chunk...
</source>
<source id="clu2b1y..." origin="Nery Jr., CPC Comentado, p.412">
...
</source>
</sources>
```

## Stage 3 — Validation

```ts
const REF_RE = /\[ref:([a-z0-9]+)\]/gi;

export function extractRefs(markdown: string): string[] {
  return Array.from(markdown.matchAll(REF_RE), (m) => m[1]);
}

export function validateCitations(section: DraftedSection): { ok: boolean; unknown: string[] } {
  const allowed = new Set(section.sources.map((s) => s.chunkId));
  const found = extractRefs(section.markdown);
  const unknown = found.filter((id) => !allowed.has(id));
  return { ok: unknown.length === 0, unknown };
}

export async function draftSectionValidated(input: Parameters<typeof draftSection>[0], retries = 1): Promise<DraftedSection> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const draft = await draftSection(input);
    const check = validateCitations(draft);
    if (check.ok) return draft;
    console.warn(`[brief:${input.sectionId}] unknown citations ${check.unknown.join(",")}, retry ${attempt + 1}`);
  }
  throw new Error(`brief section ${input.sectionId}: citation validation failed after ${retries + 1} attempts`);
}
```

## Stage 4 — Assembly + footnotes

Replace `[ref:chunk_id]` with `[N]` sequential footnotes and emit a bibliography from the source rows:

```ts
export function assembleBrief(sections: DraftedSection[]): { markdown: string; bibliography: string } {
  const refMap = new Map<string, number>();
  const bib: RetrievedChunk[] = [];
  let n = 0;

  const transformed = sections
    .map((s) => {
      const body = s.markdown.replace(REF_RE, (_, id: string) => {
        let idx = refMap.get(id);
        if (!idx) {
          n += 1;
          idx = n;
          refMap.set(id, idx);
          const src = s.sources.find((c) => c.chunkId === id);
          if (src) bib.push(src);
        }
        return `[${idx}]`;
      });
      return `## ${titleFor(s.id)}\n\n${body}`;
    })
    .join("\n\n");

  const bibliography = bib
    .map((c, i) => `[${i + 1}] ${c.source}${c.pageNumber != null ? `, p. ${c.pageNumber}` : ""}`)
    .join("\n");

  return { markdown: `${transformed}\n\n## REFERÊNCIAS\n\n${bibliography}`, bibliography };
}

function titleFor(id: DraftedSection["id"]): string {
  return { fatos: "FATOS", direito: "DIREITO", pedido: "PEDIDO" }[id];
}
```

## Top-level — `compose.ts`

```ts
import { db } from "@/lib/db";

export async function composeBrief(processId: string, peçaType: BriefOutline["peçaType"]) {
  const proc = await db.process.findUniqueOrThrow({
    where: { id: processId },
    include: { findings: true },
  });

  const outline = await buildOutline({
    processSummary: proc.summary,
    findings: proc.findings,
    peçaType,
  });

  const drafts = await Promise.all(
    outline.sections.map((s) =>
      draftSectionValidated({
        sectionId: s.id,
        theses: s.theses,
        retrievalQueries: s.retrievalQueries,
        processSummary: proc.summary,
        findings: proc.findings,
      }),
    ),
  );

  const { markdown, bibliography } = assembleBrief(drafts);

  return db.brief.create({
    data: {
      processId,
      peçaType,
      markdown,
      bibliography,
      outline: outline as object,
    },
  });
}
```

## Tone & style

- Brazilian Portuguese formal register. See `portuguese-legal-prompting` skill.
- Third person, active voice where possible.
- Latin legal terms allowed (ex tunc, ex nunc, data venia, ad cautelam).
- No hedging language ("talvez", "aparentemente"). State positions.
- Section headings in ALL CAPS.
- Never address opposing party derisively.

## Performance notes

- Stage 2 runs 3 Opus calls in parallel. Each ~4k output tokens. Keep `max_tokens: 6000` as a safety margin.
- Doctrine block in the system prompt is typically 8–15k tokens → caches after first call. Subsequent sections hit cache and save 80% on input cost.
- Full brief: ~$1.50–$3.00 in Claude costs with caching. Without caching: $5–$10.

## Checklist — a correct brief run

- [ ] Outline produced via tool-use (no free-form JSON)
- [ ] Each section received retrieved chunks with `chunkId`
- [ ] Every `[ref:...]` in output appears in the section's `sources`
- [ ] Bibliography has one entry per unique cited chunk
- [ ] `Brief` row persisted with `outline`, `markdown`, `bibliography`
- [ ] `AiCall` rows logged for each stage with `costUsd`

## Anti-patterns

- Letting the model cite `"STF, ADI 1234"` without a source in `<sources>`. Validation will catch it — but prevention is better: tell the model explicitly in the prompt.
- Regenerating a brief on every page load. Persist once; render from DB.
- Passing 50+ chunks to a section — wastes context and dilutes relevance. Rerank to ~12.
- Skipping validation "because the model usually gets it right." It doesn't always. One hallucinated citation in a legal document is a client-trust incident.
- Building outlines in free-form text then parsing regex. Use tool-use.
- Using `task: "compose-brief"` (Opus) for the outline stage — Sonnet is fine there and 5x cheaper.

## Related skills

- `anthropic-sdk-wrapper` — provides `callClaude({ task: "compose-brief" })` with caching.
- `prompt-library` — hosts `briefOutlinePrompt`, `briefSectionPrompt`, `OUTLINE_TOOL`.
- `rag-retrieval` — provides `retrieveForComposition` returning chunks with IDs.
- `portuguese-legal-prompting` — Brazilian legal register and terminology fidelity.
- `pdf-page-classifier` — upstream pipeline producing the `Findings` this composer consumes.
