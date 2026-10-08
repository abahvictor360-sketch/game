# Content guide — question bank, import and moderation

## Launch content

The proposal targets **1,000–1,500 verified questions** supplied by Fastora or
a separate content-production process. This repository ships only **72
development fixtures** (`src/lib/server/fixtures.ts`, flagged `is_fixture`,
tag `dev-fixture`). They were written for testing, are **not verified**, and
are only seeded into the embedded development database. The admin overview
shows a warning while any fixture is live. Archive them before launch.

Suggested minimum pool so players rarely see repeats (15-question Classic,
5/5/5 ladder): ≥200 approved questions per difficulty, spread across all nine
categories. The admin overview flags a difficulty as “low” below 4× the
ladder slots.

## Fields

| Field | Notes |
|---|---|
| Question | 10–400 characters; neutral, unambiguous wording |
| Options A–D | One correct; options must differ (checked) |
| Explanation | 10–800 characters; shown after every answer — teach something |
| Category | history, geography, culture, languages, arts, sports, science, innovation, society |
| Country scope | ISO codes (`NG`, `KE`…) or regions (`AFRICA`, `NORTH`, `WEST`, `CENTRAL`, `EAST`, `SOUTHERN`, `DIASPORA`) |
| Difficulty | Editorial difficulty: easy / medium / hard |
| Age rating | all / 13+ / 16+ (16+ is not served by default) |
| Tags, language | Free tags; language code (default `en`) |
| Sources + verified on | At least one reputable source and the date it was checked |
| Sponsor reference | Optional; reserved for future sponsor campaigns (not used by gameplay) |

Stable ids, versions, author, reviewer and timestamps are recorded automatically.

## Workflow

```
draft ──submit──▶ review ──approve (admin)──▶ approved (live)
  ▲                 │
  └──── send back ◀─┘ (with a note)
approved ──edit──▶ new draft version (live version keeps serving until the new one is approved)
any ──archive (admin)──▶ archived (never served; restorable)
```

- **Editors** create, edit and submit. **Admins** also approve, archive,
  restore, lock difficulty and change settings.
- Editing a published question always creates a new version. Games in
  progress, Daily Challenges, friend challenges and ghost recordings keep the
  exact version they used. Reports point at the version the player saw.
- Every action is written to `audit_events` and shown on the question page.
- Duplicate detection: normalised wording (case, accents, punctuation) is
  compared against the whole bank on save and on import.

## CSV import

1. **Admin → Import → Download CSV template.**
2. One question per row, UTF-8. Columns:
   `question, option_a, option_b, option_c, option_d, correct, explanation,
   category, difficulty, country_scope, age_rating, tags, language, sources,
   verified_at, sponsor_ref`.
   Lists use `;`. Sources are `Title|https://url;Title 2|https://url2`.
   `correct` is `A`–`D`. Dates are `YYYY-MM-DD`.
3. Upload → **Validate**. Nothing is saved; you get a row-by-row error list
   (line numbers match the spreadsheet).
4. Choose **In review** or **Draft** and import. Valid rows are created in one
   transaction; invalid rows are skipped and listed. Imports never publish.
5. Review and approve imported questions from **Questions → status: review**.

Limits: 2,000 rows / 2 MB per file; 30 imports per hour per editor.

## Difficulty calibration

The game records **unassisted** answers per version (no 50:50, no audience).
Once a version has ≥30 such answers, its observed difficulty is used for
selection (≥70 % correct → easy, <40 % → hard, otherwise medium). Admins can
**lock** the editorial difficulty on a question to override this. Thresholds
are in Settings (`rules.calibration`).

## Player reports and moderation

Players can report any question they were shown (wrong answer, outdated,
unclear, typo, offensive, other). **Admin → Reports** lists open reports with
the exact version. Typical handling:

- Factual error → edit (new version) and approve, or archive immediately if
  the live question is wrong; resolve the report with a note.
- Offensive or culturally insensitive → archive first, then review.
- Not an issue → dismiss with a note.

Editorial principles: represent Africa’s diversity — avoid treating the
continent as one culture; prefer specific, verifiable facts; avoid
stereotypes, politically inflammatory framing and questions whose answers
change frequently (or set a review date via `verified_at`).
