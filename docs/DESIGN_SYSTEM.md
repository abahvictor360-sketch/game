# Design system: “quiz-show stage”

Direction requested by Fastora: a modern take on the classic TV quiz-show look
(deep-blue spotlight stage, angled answer bars joined by side rails, a circular
emblem, gold highlights, round lifeline buttons): with Fastora’s own original
identity (no third-party logos or trade dress).

Colour, type and radius tokens live in `src/app/globals.css` (`@theme`). The
brand name, tagline, wordmark, monogram and a JS mirror of the colours (for
generated images, app icons, the manifest and the browser theme colour) live
in `src/lib/shared/brand.ts`; the logo SVG is in `src/components/Brand.tsx`.
No screen hardcodes the name or a brand hex value, so rebranding touches
those three files.

## Colour

Palette taken from the reference screens Fastora supplied. **Pending:** replace
with the official palette from fastora.africa when available (that site was
not reachable from the build environment).

| Token | Hex | Use |
|---|---|---|
| `stage-700` → `stage-950` | `#1253B8` → `#04103A` | Stage background gradient |
| `stage-500` | `#3D8BF2` | Spotlight glow |
| `bar` / `bar-hi` | `#1E1B38` / `#2B2850` | Question & answer bar fill |
| `rail` | `#E6EDFF` | Bar borders and side rails |
| `gold-400` | `#FCC81A` | Letters A–D, score, timer ring, primary buttons, ribbons |
| `flame-400` / `flame-500` | `#FF9A3C` / `#BF5500` | Daily Challenge call-outs (orange pill in references); the darker tone carries white text at ≥4.5:1 |
| `violet-500` | `#5B34B8` | Floor glow, opponent strip |
| `emerald-500` | `#12B76A` | Correct answer |
| `coral-500` | `#F2603F` | Wrong answer, urgent timer (≤5 s), errors |
| `ivory-50` | `#FFFDF7` | Explanation cards, admin surfaces |

Contrast: white on stage blues ≥ 6:1; gold on bar ≥ 9:1; ink on ivory ≥ 12:1.

## Typography

- **Display:** Bricolage Grotesque (variable), for headings, scores, the
  timer and buttons with `font-display`. Bold and characterful, fitting the
  quiz-show stage.
- **Body:** Plus Jakarta Sans (variable), clean and very readable on small
  screens.
- Both are self-hosted from npm (`@fontsource-variable/*`, imported in
  `src/app/layout.tsx`), so there are no requests to Google. The Latin subsets
  weigh about 70 KB together; other subsets load only if a page needs them.
  Text shows immediately in the system font and swaps in when ready
  (`font-display: swap`).
- Tabular numerals for scores and timers. Body 15–16 px on phones.
- To change fonts: install the new `@fontsource-variable` packages, swap the
  two imports in `layout.tsx`, and update `--font-sans` / `--font-display` in
  `globals.css`.

Type scale tokens (Tailwind utilities generated from `@theme`):

| Utility | Size | Use |
|---|---|---|
| `text-eyebrow` | 11 px, 0.18em tracking | Category / mode labels above titles (with `uppercase font-bold`) |
| `text-label` | 12 px, 0.1em tracking | Stat labels, small caps headers |
| `text-title` | 20 px | Panel titles |
| `text-headline` | 30 px | Page headlines |
| `text-hero` | 36 px | Home hero |
| `text-score` | 40 px | Large scores |

Spacing follows Tailwind's 4 px base: 16 px page gutters (`px-4`), 20 px
panel padding (`p-5`), 12 px between related controls (`gap-3`), 32 px between
page sections (`space-y-8`).

## Components

| Component | File | States |
|---|---|---|
| Hex bar (question, headings) | `ui.tsx` `HexBar`, `.hex` | optional side rails (`.railed`) |
| Answer button | `game/AnswerButton.tsx` | idle, hover/focus (gold border), selected (gold fill), correct (emerald), wrong (coral), removed (50:50), dim |
| Timer emblem | `game/TimerEmblem.tsx` | running, urgent ≤5 s, paused (audience), done |
| Points ribbon | `.ribbon` | - |
| Ladder | `game/Ladder.tsx` | strip (phone) / vertical ladder (desktop); current, correct, wrong, upcoming |
| Lifelines | `game/Lifelines.tsx`, `.lifeline` | available, loading, used (struck through), hidden when disabled |
| Buttons | `.btn-gold`, `.btn-flame`, `.btn-blue`, `.btn-ghost`, `.btn-light` (ivory), `.btn-coral`/`.btn-danger` | ≥48 px tall (`.btn-sm` 44 px); pressed scale; disabled |
| Panels, badges, tabs, empty/error states | `ui.tsx` | - |
| Skeletons | `ui.tsx` `Skeleton`, `GameSkeleton`; `loading.tsx` for site, gameplay, live match and admin | dark and ivory variants |
| Leaderboard rows | `site/LeaderboardTable.tsx` | current player highlighted |
| Dialogs | `feedback.tsx` `ConfirmDialog`, `game/ReportDialog.tsx` (native `<dialog>`, Esc closes, focus returns) | danger / primary |
| Toasts | `feedback.tsx` `Toast` + `useToast` | error / info / success; auto-dismiss, dismiss button |
| Mute toggle | `feedback.tsx` `MuteButton` | on every screen that plays sound (games, live match) |
| Celebration | `ui.tsx` `Confetti` (CSS only) | strong results and wins; hidden for reduced motion |

## Interaction & accessibility

- Mobile-first from 360 px; one-handed layout with lifelines at the bottom;
  44 px+ touch targets.
- Keyboard: 1–4 or A–D to answer; visible gold focus rings; skip link.
- Screen readers: live region announces correct/incorrect and the right
  answer; timer has an accessible label; ladder steps and result grids have
  text equivalents; lifeline states are in their labels.
- Motion: small pop/rise animations, a score "bump" when points are added,
  confetti on strong results; all motion, confetti and spotlight beams are
  disabled under `prefers-reduced-motion`.
- Connectivity: `useOnline` drives offline banners in games, live matches,
  the Versus lobby and the audience page.
- Sound: synthesised (no downloads), **off by default**; the visible sound
  toggle turns it on, and the choice is remembered per device.
- Home → "Play Classic" opens the Classic setup screen (rules summary +
  Start), still with no sign-up form before the first question.
