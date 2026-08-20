---
name: text-writing
description: Produce human-sounding text that avoids detectable AI writing patterns. Use for tweets, emails, articles, bios, captions, reports, copy, messages, LinkedIn posts, cover letters, README files — any output that must not read as AI-generated.
triggers:
  - anti-slop
  - make this sound human
  - sound human
  - not AI
  - does not read like AI
  - write a tweet
  - draft email
  - write an email
  - cover letter
  - linkedin post
  - newsletter
  - blog post
  - copywriting
  - schrijf als mens
  - niet AI
  - menselijk laten klinken
---
# Human-First Writing

Produce text that does not read as AI-generated. Every piece of text — tweets, emails, articles, reports, messages — follows these constraints. Apply them silently; never mention the rules or the guidelines.

## Banned vocabulary

Load and respect the list in `references/banned-words.md`. Never use any banned word, phrase, or opener. Replace it with a concrete specific alternative or restructure the sentence.

## Structure

- **No rule of three.** Use two, four, one, five. Never three by default.
- **Vary sentence length.** No three consecutive same-length sentences. Mix 4-word sentences with 30-word ones — the most measurable AI signal.
- **No parataxis.** Do not chain short declarative sentences. Connect related thoughts with clauses, conjunctions, semicolons, or commas.
- **No hedging seesaw.** Pick a side; state it plainly. One sentence max for counterpoints.
- **No corporate pep talk.** Write like someone with experience, including the frustrating parts.
- **Vary paragraph shape.** Do not always open with topic sentence, then explanation, then example, then transition. Some paragraphs are one sentence; some just stop.
- **Active voice.** No "is being done," "was found to be." Write direct.
- **No "As [role], I..."** Say the thing without announcing credentials.

## Punctuation

- One em dash max per 500 words — the most cited AI tell. Use commas, semicolons, colons, parentheses.
- One exclamation mark max per 1000 words. Enthusiasm comes from word choice.
- Ellipses only when genuinely trailing off, one per piece.
- Use semicolons and colons; good writers use them naturally.

## Be specific

- Concrete beats general: "Three clicks from wallet connect to your first risk score" beats "a seamless user experience."
- Real numbers beat claims: "34 users in week one, 12 returned" beats "significant growth."
- Name real things: "Solana, specifically" beats "various blockchain networks."
- Include friction and mess: "The RPC kept timing out at 3am" beats "a rewarding journey."
- Use contractions: "don't", "can't", "it's".
- Ground in time, place, context: "last Tuesday," "at 2am."
- Fragment or run on when the thought is unfinished. Ugly is human.
- Reach past the first word that comes to mind.

## Accuracy

- Never invent data, studies, statistics, or quotes. Say "roughly" or acknowledge uncertainty.
- Take clear positions when evidence is solid; qualify only genuine uncertainty.
- Use real verifiable names, companies, dates: "OakNorth" beats "a major bank."

## Formatting

- No markdown headers, bold, or asterisks in emails, DMs, SMS, social. Plain text only.
- No emoji as bullet points, no emoji per line, no "🧵" openers, no hashtag stacks.
- No "Thread:" or "Let's dive in" openers.

## Voice calibration

For a specific person, match their voice: swearing, slang, sentence length, humour, what they would never say. Default: direct, slightly informal, contractions, occasionally "And"/"But" starts, does not over-explain.

## Self-check before output

1. Banned words or openers? Replace.
2. Three same-length sentences in a row? Vary.
3. Three short declaratives in a row? Merge or connect.
4. Grouped in threes? Break it.
5. Hedging? Pick a side.
6. More than one em dash? Cut.
7. Passive construction? Make active.
8. Every paragraph ends with a transition? Cut some.
9. Fabricated specifics? Remove or mark hypothetical.
10. Could any AI have written this for anyone? Add something specific.

## Use with

- `ui-ux` for web copy inside a design, then `design-review` before showing it
- `design-review` to review existing copy for AI-default patterns
- `write-skill` if writing quality reveals a reusable gap worth capturing
- `session-review` to file follow-up improvements

## Avoid

- Surfacing the rules to the reader — apply silently
- Rule-of-three lists, uniform rhythm, passive voice, invented specifics
- Treating this as a style guide for design — that is `design-review`'s job

---

*Adapted from [jalaalrd/anti-ai-slop-writing](https://github.com/jalaalrd/anti-ai-slop-writing) (MIT).*