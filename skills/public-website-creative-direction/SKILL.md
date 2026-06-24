---
name: public-website-creative-direction
description: "Use before designing any bespoke public-facing page or landing page for a Persimmon client. Derives a non-generic visual direction from the client's own strategy: intake questions, one organizing concept, a signature element, and a strategy-to-token table."
---

# Public Website — Creative Direction

Generic design is an upstream information problem, not an aesthetic one: a site looks templated because nothing specific was fed into it. This skill extracts the information only this client possesses (their onliness, enemy, origin, voice), compresses it into one organizing concept and one signature element, and translates it into visual tokens with a provenance line per decision. `frontend-public-site-conventions` owns *what values are good*; this skill owns *why this client gets these values and no other client could*.

## Trigger

- "Design the homepage / landing page / brand direction for…"
- "Make this site look less generic / less AI / less templated"
- Before the first bespoke public mockup in `workflow-brainstorm`
- "What should this client's site feel like?"

## The layered rule — where the creative budget goes

A landing page runs two jobs at once: **convert** (rewards convention) and **be remembered** (rewards distinctiveness). They live in different layers:

| Layer | Rule | Why |
|---|---|---|
| **Persuasion skeleton** (hero → social proof → features → testimonials → pricing → FAQ → CTA) | Keep conventional | It answers the visitor's internal questions in the order their brain asks them — trust before evaluation, value before price, objections before the ask. It carries zero identity information, so following it costs nothing. |
| **Interaction conventions** (nav placement, button affordances, form behavior, scroll) | Keep conventional, at most ONE signature deviation | Users learned these on ten thousand other sites (Jakob's law). Deviation here spends their cognitive budget on decoding instead of deciding. |
| **Identity skin** (type, color, voice, imagery, ratio, texture, motion, *how* each section answers its question) | Spend 100% of the creative budget here | Memory encodes deviation. One devastating specific quote instead of a logo wall is still "social proof" — same skeleton, unrecognizably different animal. |

**Pick 1–3 deliberate risks** (extreme type scale, a strange color, an off-balance ratio, one signature interaction) and execute them with total consistency. One committed choice reads as intent; ten safe ones read as a template; ten risks read as error.

**At least one risk must be a *craft* risk that lands in the pixels** — type scale, surface, layout asymmetry, or motion — not only a strategy/copy choice. This is the second failure mode: a site can have a sound concept and a clean translation table and *still* render generic because the execution defaulted to safe craft (timid 2:1 type, pure-white surfaces, a centered hero over three even cards, fade-in-on-everything). Art direction is the layer template/AI output omits — tone, mood, emotion made physical. The concept names the mood; the **craft layer in `frontend-public-site-conventions` is where it must actually show up**, or the strategy was theatre. When a finished mockup still reads as AI, the fix is almost never *more concept* — it's the concept *executed* in scale/surface/layout/motion.

## Instructions

### 1. Run the intake (during the brainstorm, one question at a time)

These fit `workflow-brainstorm`'s AskUserQuestion flow. Eight questions, in order:

1. **Onliness:** "We are the only ___ that ___." No filler words in either blank.
2. **The enemy:** not a competitor — an idea the client is against (bureaucracy, bloat, fake politeness, how their industry talks). The enemy generates the design's negative space: everything the enemy's websites do, this one doesn't.
3. **Trait pairs (×3):** "We are X but never Y" — e.g. "confident but never loud, technical but never cold." The *but never* clause sets the ceiling on every visual choice.
4. **One real customer:** describe an actual person who loves them — what's on their desk, what they read, what annoyed them today. Not a segment.
5. **The unfakeable origin detail:** the founding story specific enough that it couldn't be invented — a garage, a failed first version, a grandmother's recipe, a real city.
6. **The world's materials:** if the brand were a room, what is it made of — steel and paper? walnut and brass? concrete and neon? These nouns convert directly to palette, texture, photography direction.
7. **Banned words:** what the site will never say ("seamless," "unlock," "empower," "solutions"…). A banned-words list does more anti-AI work than any font choice.
8. **The insider joke:** something only their customers would get. Inside knowledge signals authenticity instantly.

**Four rules for valid answers** — an answer that breaks these is re-asked, not recorded:

- **Ban category-generic answers.** If a competitor could give the same answer, it's invalid. "Quality and customer focus" produces Inter-on-white.
- **Every answer names a sacrifice.** A positioning that excludes nobody designs nothing. "Premium" only means something if they can say what they're willing to look too expensive for.
- **Concrete nouns and scenes, not adjectives.** "Tested in the Lake District" designs a website; "high quality" doesn't. Adjectives are the native language of templates.
- **The first answer is never the real one.** Ask "why" or "what does that look like, specifically" at least once more on every question.

For SMB clients who can't sit a session: harvest the same material from the SOW, the existing site's own copy, and the onboarding interview notes — the founder's actual phrasing is raw material, not something to sand down.

### 2. Pick the concept — one organizing metaphor

From the answers, propose **candidate metaphors (diverge to ~5, genuinely distinct — different organizing ideas, not one idea in three colorways)** and pick one with Renato/the client: *"the site is a field notebook"*, *"the site is a control room"*, *"the site is a menu at a 12-seat restaurant."* The metaphor answers downstream questions mechanically — a field notebook has serif annotations, taped-in photos, off-white paper; a control room has mono type, dense data, status colors. A direction with no named concept is improvisation, and improvisation converges to the median.

This proposal step is the **diverge** stage of `premium-web-method` — generate the candidates with constraints *set aside* (brand tokens, requirements, a11y come later, in convergence), because applying them now collapses the options to the average. Take the *first* metaphor the model offers as a warning sign, not a decision: the first answer is the statistical mode. `premium-web-method` owns why the AI regresses to the median and the full diverge→select→converge→gate loop this sits inside.

### 2b. Derive the section set from THIS client — never replay a prior project

The persuasion skeleton (above) is universal; the **content sections that fill it are not.** Each content section (a locations map, a capabilities spec-sheet, a products grid, a sourcing-origin story) must be earned by *this* client's real content and concept — derived, not copied from the last site you built. A section a client has no real content for is the **over-fit tell**: a one-pin map, an empty spec grid, a "capabilities" table for a business that doesn't make anything. When a prior project's section has no true analog here, **transform it** or **drop it** — don't force the skeleton. If two different businesses get the same section list, the concept was templated, not derived. (Industry deep-research is what tells you which sections the best sites in *this* business actually run.)

### 3. Name the signature element

ONE distinctive asset someone would describe to a friend: "the site where the cursor is a ___", "the one with the giant ticking counter", "the menu that reads like a letter." Design it first, with the most care, and repeat it everywhere — it's the memory hook the whole site hangs on. Beautiful-but-anonymous scores zero.

**Singularity is the whole point — name exactly ONE, and make sure it's the *ownable* one.** The trap is defining the signature as two things. **Describability test:** write the one-sentence description, then delete the generic half — if it still identifies the site, the surviving half is load-bearing and the other was filler.

**Concept-fidelity test (run this, not just "is a signature present?"):** does the motif read as *meaning* or as *decoration*? If a visitor reads it as ornament, the concept collapses into the adjacent trend it borrowed from. The gate is "does the motif carry the strategy," not "does a motif exist."

**The strongest signature is a bespoke *structural* artifact — the business's own work made into the interface, not a decorative line laid on top.** Ask: *what artifact does this business make, send, or read every day* (a work order, a spec sheet, a tasting menu, a case docket) — and can the page borrow its **structure** (its fields, its layout, its vocabulary)? A decorative motif (a ridgeline, a swoosh) is supporting execution at best.

### 4. Build the translation table

Every visual token traces to an intake answer. Format (lives in the spec's design rationale, alongside the asset-provenance tags from `workflow-brainstorm`):

```
| Token / decision | Value | Because (intake answer) |
|---|---|---|
| --font-display | Fraunces | "established but never stuffy" (trait pair 2) |
| --color-bg | #FAF8F5 warm cream | "walnut and brass, never clinical" (materials) |
| Hero ratio | 5:8 asymmetric split | enemy = "the slick corporate template" |
| Hero copy | founder's own sentence, verbatim | origin detail + banned-words list |
```

A visual decision with no provenance line is, by definition, a default — and defaults are the AI look. **Self-audit: every token in the final spec gets a `Because` line or gets flagged.**

### 5. Annotate references the right way

`frontend-public-site-conventions` → "Research live references" owns the gallery list and the 8–12 reference pull. When collecting:

- **Steal the principle, not the pixel.** Annotate *why* each reference works in abstract terms ("trust section = one devastating quote instead of a logo wall," "10:1 scale contrast on the hero") — then re-derive the execution from this client's intake answers.
- **Pair every aspirational reference with a conversion reference** for the same section so the convert/remember tension stays visible while designing.
- **Pull cross-category.** Same-category collection produces regression to the niche mean. Pull from at least three categories, including non-web (print editorial, album art, packaging) — non-web references force translation, and translation is where authorship enters.

## Idea bank — moves that work, and who proved them

Possible ideas, not prescriptions. Each is a *principle* an exemplar executes — adapt the move to the client's intake answers, never copy the surface.

| Move | Proven by | When to reach for it |
|---|---|---|
| **Conventional skeleton, distinctive skin** — follow the persuasion formula exactly while typography and craft carry all the identity | Stripe | The default posture for every Persimmon conversion page. |
| **Restraint as the brand** — one type voice, monochrome, motion so disciplined the rigor itself is the identity | Linear, Teenage Engineering | Clients whose credibility claim is precision/engineering. |
| **Enemy-driven palette** — the visual language derived from what the brand is against | Daylight Computer | When intake Q2 produces a strong enemy. |
| **Voice-led design** — copy carries everything; layout stays simple and subordinate to the writing | Oatly, Liquid Death, Basecamp | Clients with a real personality and strong opinions. |
| **One signature interaction with a point of view** — a single custom motion moment that fits the content | Family, Amie | When the budget allows one crafted interaction. Scroll-triggered fade-on-everything is the #1 template tell. |
| **Reading-first typography** — the text *is* the interface; generous measure, serious type, nothing competing | iA | Content-heavy professional services (legal, advisory) where the writing demonstrates competence. |

## Output Format

Recorded in the brainstorm spec's design rationale (per `workflow-brainstorm`):

1. The intake answers (validated against the four rules)
2. The chosen **concept**, with the 1–2 rejected candidates and why
3. The **signature element**
4. The **translation table** (every token's provenance)
5. The 1–3 deliberate risks, named

## When NOT to Use This Skill

- Internal/admin screens — deliberately templated (`frontend-page-templates`); distinctiveness is a defect there.
- Template-stage work (T0 brochure on a tight budget where the client chose speed) — apply the house defaults from `frontend-public-site-conventions` and skip the intake; don't fake a concept the engagement didn't buy.
- Choosing specific fonts/colors/icons — that's `frontend-public-site-conventions`; this skill supplies the *reasons* those choices cite.

## Relationship to Other Skills

| Skill | What it owns |
|---|---|
| `premium-web-method` | The process this runs inside (diverge→select→converge→gate) and why an AI defaults to the median |
| `frontend-public-site-conventions` | The value-picking layer: fonts, palettes, icons, spacing, craft layer, AI-tell audit |
| `workflow-brainstorm` | The gate this runs inside — intake during brainstorm, outputs recorded in the spec |
| `client-onboarding` | Captures the raw material (brand assets, existing copy, founder interview) this intake mines |
| `frontend-css-architecture` | Where the translated tokens get wired |
