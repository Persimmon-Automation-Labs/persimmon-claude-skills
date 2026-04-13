---
name: anthropic-sdk-wrapper
description: Build the canonical src/lib/ai/claude.ts wrapper around @anthropic-ai/sdk for Persimmon Next.js projects. Use when scaffolding a new client project, adding AI to an existing Persimmon app, fixing retry/cost/caching issues, or refactoring direct Anthropic SDK imports out of business logic. Trigger keywords: anthropic sdk, claude client, claude.ts, callClaude, prompt caching, exponential backoff, model routing, pickModel, token accounting, streaming claude.
---

# anthropic-sdk-wrapper

The Persimmon standard wrapper for Anthropic's Claude SDK. Every Persimmon app funnels all Claude traffic through ONE module: `src/lib/ai/claude.ts`. No other file imports `@anthropic-ai/sdk` directly.

## Why this exists

- Retries, caching, cost tracking, and model routing must be applied uniformly. If they live at call sites, they will drift and someone will ship an un-retried call in production.
- The SDK default retry count is 2. Under 529 overload or Railway network blips, that is not enough. Our wrapper retries 3 times with 1s → 4s → 16s backoff.
- Prompt caching saves 80–90% on input tokens for stable system prompts. Cache MUST be applied at the wrapper, not the caller.
- Costs are real. Every call logs token usage so a client can audit spend.

## File layout

```
src/lib/ai/
  claude.ts       # THIS SKILL — the singleton + callClaude + streamClaude + pickModel
  prompts.ts      # prompt-library skill
  cost.ts         # (optional) cost aggregation across requests
```

## Rules

1. ONE file imports `@anthropic-ai/sdk`: `src/lib/ai/claude.ts`. Enforce with an ESLint `no-restricted-imports` rule.
2. Every Claude call goes through `callClaude()` or `streamClaude()`.
3. Apply `cache_control: { type: "ephemeral" }` only when the cached block meets the per-model minimum (Sonnet 4.6 = 2,048; Opus 4.6 / Haiku 4.5 = 4,096; Sonnet 4.5 / Opus 4.1 / Sonnet 3.7 = 1,024). Below the threshold, caching silently no-ops. Verify via `response.usage.cache_creation_input_tokens` / `cache_read_input_tokens` — if both are 0, the threshold wasn't met. Max 4 breakpoints per request; longer-TTL (`ttl: "1h"`) blocks must appear before shorter-TTL ones.
4. Model selection goes through `pickModel(task)`. Do not hardcode `claude-opus-*` at call sites.
5. Log `usage.input_tokens`, `usage.output_tokens`, `usage.cache_read_input_tokens`, `usage.cache_creation_input_tokens` for every call.
6. Prefer tool-use for structured output. JSON-mode prompts are a fallback, not a default.

## The file — `src/lib/ai/claude.ts`

```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  TextBlock,
  ToolUseBlock,
  MessageStreamEvent,
} from "@anthropic-ai/sdk/resources/messages";

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[claude] ANTHROPIC_API_KEY not set — calls will fail.");
}

// --- Singleton client ---------------------------------------------------

let _client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 0, // we implement our own retry
    });
  }
  return _client;
}

// --- Model routing ------------------------------------------------------

export const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-6",
} as const;

export type ModelName = keyof typeof MODELS;

/**
 * Route tasks to the right model. Default to sonnet; escalate to opus only
 * for reasoning-heavy tasks (composition, multi-doc synthesis). Drop to
 * haiku only for high-volume classification with simple taxonomy.
 */
export type TaskKind =
  | "classify-page"        // volume, simple taxonomy -> sonnet
  | "classify-simple"      // <10 classes, short input -> haiku
  | "summarize-short"      // 1-2 paragraphs -> sonnet
  | "summarize-long"       // whole-doc -> sonnet
  | "compose-brief"        // legal drafting -> opus
  | "analyze-findings"     // cross-doc reasoning -> opus
  | "rerank"               // NOT claude — use voyage/cohere -> sonnet fallback
  | "extract-structured";  // tool-use -> sonnet

export function pickModel(task: TaskKind): ModelName {
  switch (task) {
    case "compose-brief":
    case "analyze-findings":
      return "opus";
    case "classify-simple":
      return "haiku";
    default:
      return "sonnet";
  }
}

// --- Cost table (USD per MTok, update on price changes) ----------------

const COST_PER_MTOK_USD: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-4-6":       { in: 15,   out: 75,   cacheRead: 1.5,  cacheWrite: 18.75 },
  "claude-sonnet-4-5":     { in: 3,    out: 15,   cacheRead: 0.3,  cacheWrite: 3.75 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5,   cacheRead: 0.1,  cacheWrite: 1.25 },
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
};

function computeUsage(model: string, u: Anthropic.Usage): Usage {
  const rate = COST_PER_MTOK_USD[model] ?? { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const costUsd =
    (u.input_tokens * rate.in +
      u.output_tokens * rate.out +
      cacheRead * rate.cacheRead +
      cacheWrite * rate.cacheWrite) /
    1_000_000;
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheWrite,
    costUsd,
  };
}

// --- Retry -------------------------------------------------------------

const RETRY_DELAYS_MS = [1_000, 4_000, 16_000];

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; name?: string; message?: string };
  if (e.status === 429 || e.status === 529 || (e.status && e.status >= 500)) return true;
  if (e.name === "APIConnectionError" || e.name === "APIConnectionTimeoutError") return true;
  if (typeof e.message === "string" && /network|timeout|ECONNRESET/i.test(e.message)) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(`[claude:${label}] attempt ${attempt + 1} failed, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// --- Prompt caching helper --------------------------------------------

const CACHE_TOKEN_THRESHOLD = 1024;

/**
 * Approximate char->token ratio (3.5 chars/token for Portuguese/English mix).
 * Good enough to decide whether to attach cache_control.
 */
function shouldCache(text: string): boolean {
  return text.length / 3.5 >= CACHE_TOKEN_THRESHOLD;
}

function buildSystemBlocks(system?: string): Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined;
  const block: Anthropic.TextBlockParam = { type: "text", text: system };
  if (shouldCache(system)) {
    block.cache_control = { type: "ephemeral" };
  }
  return [block];
}

// --- Public API --------------------------------------------------------

export type CallClaudeParams = {
  model?: ModelName;
  task?: TaskKind;              // alternative to model — pickModel(task)
  system?: string;
  messages: MessageParam[];
  tools?: Tool[];
  toolChoice?: Anthropic.MessageCreateParams["tool_choice"];
  maxTokens?: number;
  label?: string;               // for logs
};

export type CallClaudeResult = {
  text: string;                 // concatenated text blocks (may be empty if tool-use)
  toolUses: ToolUseBlock[];     // structured outputs
  stopReason: Anthropic.Message["stop_reason"];
  usage: Usage;
  model: string;
  raw: Anthropic.Message;
};

export async function callClaude(params: CallClaudeParams): Promise<CallClaudeResult> {
  const modelKey = params.model ?? (params.task ? pickModel(params.task) : "sonnet");
  const model = MODELS[modelKey];
  const label = params.label ?? params.task ?? modelKey;

  const res = await withRetry(
    () =>
      getClient().messages.create({
        model,
        max_tokens: params.maxTokens ?? 4096,
        system: buildSystemBlocks(params.system),
        messages: params.messages,
        tools: params.tools,
        tool_choice: params.toolChoice,
      }),
    label,
  );

  const usage = computeUsage(model, res.usage);
  const text = res.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

  console.log(
    `[claude:${label}] model=${model} in=${usage.inputTokens} out=${usage.outputTokens} ` +
    `cacheRead=${usage.cacheReadTokens} cacheWrite=${usage.cacheCreationTokens} ` +
    `cost=$${usage.costUsd.toFixed(4)} stop=${res.stop_reason}`,
  );

  return { text, toolUses, stopReason: res.stop_reason, usage, model, raw: res };
}

// --- Streaming ---------------------------------------------------------

/**
 * Yields text deltas as they arrive. For UI streaming via Next.js Server Actions
 * or an API route with SSE. Still counts usage on completion.
 */
export async function* streamClaude(
  params: CallClaudeParams,
): AsyncGenerator<string, CallClaudeResult, void> {
  const modelKey = params.model ?? (params.task ? pickModel(params.task) : "sonnet");
  const model = MODELS[modelKey];
  const label = params.label ?? params.task ?? modelKey;

  // Retry applies to stream start only; mid-stream errors bubble up.
  const stream = await withRetry(
    () =>
      Promise.resolve(
        getClient().messages.stream({
          model,
          max_tokens: params.maxTokens ?? 4096,
          system: buildSystemBlocks(params.system),
          messages: params.messages,
          tools: params.tools,
          tool_choice: params.toolChoice,
        }),
      ),
    label,
  );

  for await (const event of stream as AsyncIterable<MessageStreamEvent>) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  const usage = computeUsage(model, final.usage);
  const text = final.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const toolUses = final.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

  console.log(
    `[claude:${label}:stream] in=${usage.inputTokens} out=${usage.outputTokens} ` +
    `cacheRead=${usage.cacheReadTokens} cost=$${usage.costUsd.toFixed(4)}`,
  );

  return { text, toolUses, stopReason: final.stop_reason, usage, model, raw: final };
}
```

## Using the wrapper

### Plain text

```ts
import { callClaude } from "@/lib/ai/claude";
import { summarizeDocPrompt } from "@/lib/ai/prompts";

const { system, messages } = summarizeDocPrompt({ text: pageText });
const { text, usage } = await callClaude({
  task: "summarize-short",
  system,
  messages,
  label: "summarize-doc",
});
await db.aiCall.create({ data: { costUsd: usage.costUsd, model: usage.inputTokens } });
```

### Structured output via tool-use (PREFERRED over JSON-mode)

```ts
import { callClaude } from "@/lib/ai/claude";

const classifyTool = {
  name: "emit_classification",
  description: "Emit the page classification.",
  input_schema: {
    type: "object",
    required: ["documentType", "confidence"],
    properties: {
      documentType: { type: "string", enum: ["petição inicial", "contestação", "sentença", "other"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      summary: { type: "string", maxLength: 300 },
    },
  },
} as const;

const { toolUses } = await callClaude({
  task: "classify-page",
  system: INDEXER_SYSTEM,
  messages: [{ role: "user", content: pageText }],
  tools: [classifyTool],
  toolChoice: { type: "tool", name: "emit_classification" },
});

const input = toolUses[0]?.input as { documentType: string; confidence: number };
```

### Streaming to a Server Action

```ts
"use server";
import { streamClaude } from "@/lib/ai/claude";

export async function draftBriefStream(input: { findings: unknown }) {
  const stream = streamClaude({ task: "compose-brief", system: BRIEF_SYSTEM, messages: [...] });
  // consume `stream` and push SSE chunks
}
```

## Checklist — adding this wrapper to a new Persimmon project

- [ ] `npm i @anthropic-ai/sdk`
- [ ] Create `src/lib/ai/claude.ts` with the file above
- [ ] Add `ANTHROPIC_API_KEY` to `.env.local` and Railway env
- [ ] Add ESLint rule:
      ```js
      "no-restricted-imports": ["error", { "patterns": ["@anthropic-ai/sdk"] }]
      ```
      in all files EXCEPT `src/lib/ai/claude.ts`
- [ ] Create an `AiCall` Prisma model for cost logging (optional but recommended)
- [ ] Wire `callClaude` into one test route and verify `cost=` log line appears

## Anti-patterns

- Importing `Anthropic` directly in a route handler. Always go through `callClaude`.
- Hardcoding `model: "claude-opus-4-6"` at a call site. Use `task`.
- Parsing JSON out of a text response. Use tool-use.
- Retrying at the call site when the wrapper already retries — causes 9 attempts instead of 3.
- Attaching `cache_control` to user-turn content. It works on system blocks and long stable tool definitions; don't cache volatile input.

## Related skills

- `prompt-library` — the `prompts.ts` counterpart. Every call to `callClaude` uses a prompt builder from there.
- `rag-retrieval` — consumers of `callClaude` for composition pipelines.
- `legal-brief-composer` — uses `task: "compose-brief"` + prompt caching.
- `pdf-page-classifier` — uses `task: "classify-page"` + tool-use.
