# Design system — “quiz-show stage”

Direction requested by Fastora: a modern take on the classic TV quiz-show look
(deep-blue spotlight stage, angled answer bars joined by side rails, a circular
emblem, gold highlights, round lifeline buttons) — with Fastora’s own original
identity (no third-party logos or trade dress).

All tokens live in `src/app/globals.css` (`@theme`), so final branding can be
swapped in one place. The brand mark and wordmark are in
`src/components/Brand.tsx`.

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

System font stack (no web-font download for low-end devices and slow
networks), rounded display stack for headings and numbers, tabular numerals
for scores and timers. Body 15–16 px on phones.

## Components

| Component | File | States |
|---|---|---|
| Hex bar (question, headings) | `ui.tsx` `HexBar`, `.hex` | optional side rails (`.railed`) |
| Answer button | `game/AnswerButton.tsx` | idle, hover/focus (gold border), selected (gold fill), correct (emerald), wrong (coral), removed (50:50), dim |
| Timer emblem | `game/TimerEmblem.tsx` | running, urgent ≤5 s, paused (audience), done |
| Points ribbon | `.ribbon` | — |
| Ladder | `game/Ladder.tsx` | strip (phone) / vertical ladder (desktop); current, correct, wrong, upcoming |
| Lifelines | `game/Lifelines.tsx`, `.lifeline` | available, loading, used (struck through), hidden when disabled |
| Buttons | `.btn-gold`, `.btn-flame`, `.btn-blue`, `.btn-ghost` | ≥48 px tall; pressed scale |
| Panels, badges, tabs, empty/error states, skeletons | `ui.tsx` | — |
| Leaderboard rows | `site/LeaderboardTable.tsx` | current player highlighted |
| Dialog | `game/ReportDialog.tsx` (native `<dialog>`) | — |
| Toasts | inline in `GameClient` | error / info |

## Interaction & accessibility

- Mobile-first from 360 px; one-handed layout with lifelines at the bottom;
  44 px+ touch targets.
- Keyboard: 1–4 or A–D to answer; visible gold focus rings; skip link.
- Screen readers: live region announces correct/incorrect and the right
  answer; timer has an accessible label; ladder steps and result grids have
  text equivalents; lifeline states are in their labels.
- Motion: small pop/rise animations; all motion and spotlight beams are
  disabled under `prefers-reduced-motion`.
- Sound: synthesised (no downloads), optional, with a visible mute toggle
  remembered per device.
