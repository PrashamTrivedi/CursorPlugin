---
name: cheap-browsing
description: Token-efficient browser automation — read pages as text, fill forms by ref, extract form structure from saved HTML, and screenshot only when a visual assertion is the deliverable. Use when browsing at volume (job boards, ATS applications, scraping, lead lists), when filling web forms, when a browser session is growing large, or when the user mentions browser cost, quota, usage, screenshots being expensive, or asks to browse cheaply.
---

# Cheap browsing

Browser automation dominates quota when driven by screenshots. This skill is the
cheap path: text in, refs out, pixels almost never.

## The numbers

Measured from one week of real `jobhunt` + `clienthunt` transcripts, plus live
fetches of Greenhouse and Lever pages.

| Approach | Tokens | Note |
|---|---|---|
| Raw HTML into context | 16,000–74,000 | Greenhouse app 20,837 · Lever 74,322 |
| `chrome:browser_batch` | 1,801/call | worst real offender — batches screenshots |
| Screenshot (`chrome:computer`) | ~1,500 | jpeg, full viewport |
| `chrome:get_page_text` | 1,244/call | 921-call average |
| `chrome:read_page` | 1,111/call | a11y tree + refs |
| `chrome:find` | 339/call | |
| `chrome:form_input` | 232/call | per field |
| HTML → file → field manifest | **87** | 240× smaller than the same page's HTML |

One week's damage: **6,671 screenshots ≈ 10.5M image tokens**. `jobhunt` alone
was 4,754 shots / 7.5M tokens. `claude-in-chrome` = 51% of the weekly quota.

The multiplier that makes this hurt: an image stays in context and is re-sent on
every subsequent turn. A screenshot on turn 3 of a 40-turn session is charged
across 37 more turns. Cache reads soften it; they don't remove it.

## Reading a page

```
chrome:navigate  →  chrome:get_page_text
```

That's it. No screenshot, no `read_page`, no HTML. For a job posting, a
docs page, an article, a profile — `get_page_text` is the whole answer.

Use `chrome:find` instead when you want one specific thing ("the Apply button",
"the salary line") — it's 4× cheaper than reading the page and returns a ref you
can act on.

Use `chrome:read_page` only when you need refs for interaction. It is not a
reading tool despite the name.

## Filling a form

The cheap sequence, ~2,500 tokens for a 12-field form:

```
chrome:read_page                    # once — get refs           1,111
chrome:form_input × N               # fill by ref, no pixels    232 each
chrome:computer (screenshot)        # ONE frame before submit   1,500
```

The expensive sequence people fall into, ~29,000 tokens for the same form:

```
screenshot → click → screenshot → type → screenshot → scroll → screenshot ...
```

Roughly **10× the cost for the same outcome**, and every one of those frames
keeps billing for the rest of the session.

`form_input` handles text, selects, checkboxes and radios by ref. `file_upload`
(259/call) handles the résumé. Neither needs to see anything.

### When the a11y tree comes back useless

Some ATS forms are custom widgets with no usable refs. Before reaching for
screenshots:

1. `chrome:find` for the field by its visible label.
2. `chrome:javascript_tool` to set the value directly and dispatch an `input`
   event — 410/call, cheaper than a single frame.
3. Only then, screenshots.

## Getting form structure without paying for HTML

HTML is the most expensive thing you can put in context and the most useful
thing to have on disk. Keep it on disk.

```bash
# 1. dump the live DOM to a file (the tool returns a path/short ack, not the HTML)
chrome:javascript_tool → document.documentElement.outerHTML → write to
  $CLAUDE_JOB_DIR/tmp/page.html   (or /tmp if no job dir)

# 2. read only the manifest
python3 ~/.claude/skills/cheap-browsing/extract_form.py page.html
```

Real output, from a live Greenhouse application page whose HTML is 20,837 tokens:

```
first_name  text  REQUIRED   — First Name *
last_name   text  REQUIRED   — Last Name *
email       text  REQUIRED   — Email *
country     text             — Country
phone       tel              — Phone
resume      file             — Attach
question_14364081008  text  REQUIRED   — Please note that you will not be...

7 fields
```

87 tokens. It reports `name`, `type`, `required`, label, current value, and
select options (capped at 12, with an overflow marker). `--json` for
machine-readable output.

**Never `Read` the saved HTML file.** That defeats the entire point — it puts
the 20k tokens straight into context. Always run a script over it and read only
what the script prints. If the manifest comes back empty the page is
JS-rendered; fall back to `read_page` for refs.

### The human-paste variant

For a high-stakes application the user wants to review anyway: produce the
manifest, write the answers to a file alongside it, and hand over both paths.
The user pastes. Agent cost drops to near zero and they get a review gate they
wanted regardless. Worth offering when the form is long, the role matters, or
the ATS is known to break under automation — not as the default, since it
spends their time instead of tokens.

## Screenshot policy

Take one when:

1. A visual assertion is the deliverable — "how does this look", layout or CSS
   debugging, a before/after.
2. The a11y tree failed and `find` + `javascript_tool` both struck out.
3. One confirmation frame before an irreversible action — submit, pay, send.
4. The user asked to see it.

Otherwise don't. In particular: don't screenshot to confirm a click worked
(`find` or `get_page_text` confirms it for a third the price), don't screenshot
each step of a flow, and don't let `browser_batch` bundle a frame into every
batched step — it is the single most expensive call in the measured data.

## Session shape

- **`/clear` between independent targets.** One posting, one company, one lead
  per session. `/compact` is a consolation prize — the images have already been
  paid for by the time you compact.
- **Subagents amplify, they don't isolate.** A browser subagent loads the Chrome
  schemas and runs its own requests. One agent per *board* returning text
  findings is right; one per *posting* is a fleet, and that's how a week gets to
  70% subagent-heavy.
- **Turn the server off** for résumé writing, cover letters, proposals — no
  browser needed, and a connected server carries schemas and leftovers.
- **Push bulk reads to `pi`.** Fetching and summarising postings is the
  highest-volume, lowest-difficulty work in the loop and it doesn't need to
  touch Anthropic quota at all. See the `pi-agent` skill.

## Auditing your own usage

`audit_browser_cost.py` scans transcripts and reports screenshot counts and
per-tool token averages by project:

```bash
python3 ~/.claude/skills/cheap-browsing/audit_browser_cost.py --since 2026-08-10
```

It reads only sizes and dimensions — image bytes never enter context.
