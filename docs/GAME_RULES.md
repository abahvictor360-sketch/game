# Game rules (proposed defaults)

The proposal left final scoring and timer decisions open. Everything below is a
**proposed default**, stored as a versioned row in `game_config` and editable in
**Admin → Settings**. Each game records the ruleset version it started with, so
changing settings never changes a game already underway.

| Setting | Default | Where |
|---|---|---|
| Classic length | 15 questions | `rules.classic.distribution` |
| Difficulty progression | 5 easy → 5 medium → 5 hard | `rules.classic.distribution` |
| Answer format | 4 options, 1 correct | schema |
| Timers | easy 20 s · medium 18 s · hard 15 s | `rules.timersMs` |
| Points | easy 100 · medium 200 · hard 300 | `rules.points` |
| Wrong answer / timeout | 0 points | engine |
| Classic progression | continue through all questions | `rules.classic.endOnWrongAnswer = false` |
| Latency grace | 1 s after the deadline | `rules.latencyGraceMs` |
| Daily length | 10 questions (4 easy, 3 medium, 3 hard) | `rules.daily.distribution` |
| Daily timer | 20 s per question | `rules.daily.timerMs` |
| Daily lifelines | disabled | `modeRules('daily')` |
| Daily reset | midnight, Africa/Lagos | `rules.daily.timezone` |
| Daily ranking | signed-in players only | `rules.daily.requireAccountForLeaderboard` |
| Daily question reuse | avoided for 180 days where content allows | `rules.daily.reuseCooldownDays` |
| Freshness window | avoid repeats seen in the last 30 days | `rules.freshness.recentWindowDays` |
| Versus length | 15 questions, same ladder | `rules.versus` |
| Versus scoring | base + `floor(base × 0.25 × remaining / duration)` | `rules.versus.speedBonusFactor` |
| Multiplayer lifelines | disabled | `modeRules('match')` |
| Matchmaking fallback | 30 s | `rules.versus.matchmakingFallbackMs` |
| Reconnection window | 20 s | `rules.versus.reconnectWindowMs` |
| Friend challenge expiry | 7 days | `rules.friendChallenge.expiryDays` |
| Ask the Audience | ≥5 live helpers, 15 s voting, 2 min helper cooldown, ≥20 historical answers | `rules.audience` |
| Observed difficulty | ≥30 unassisted answers; ≥70 % correct = easy, <40 % = hard | `rules.calibration` |

## Classic

- Questions are selected on the server, one at a time, from approved live versions:
  never repeated within a run, avoiding questions the player saw within the
  freshness window, balancing categories within the run.
- The server issues the question with a deadline. The browser only displays
  the remaining time; the server judges timeliness (deadline + grace) and
  correctness. Answers arrive as an option id — never a score.
- **Elimination** (`endOnWrongAnswer`) is available as an explicit setting.

## Lifelines (once each per Classic game)

| Lifeline | Behaviour |
|---|---|
| 50:50 | Removes two wrong options, keeps the correct one and one distractor. Timer keeps running. |
| Change Question | Replaces the question with another approved question of the same (effective) difficulty, with a fresh timer. If none is available the lifeline is **not** consumed. |
| Ask the Audience (Phase 2) | Live vote when ≥5 eligible helpers are online; the question timer is **paused** (persisted server timestamps) and resumes with its remaining time when voting closes. Otherwise the historical answer distribution for that exact version. If neither has enough data: “Not enough audience data” and the lifeline is restored. |

Rules common to all lifelines: not usable after the answer is locked; a used
lifeline stays used after Change Question; duplicate requests (same request
key) are no-ops; usage is persisted so refreshes cannot restore it.

**Combinations:** while the audience is voting, answering and other lifelines
are blocked. 50:50 after the audience shows the audience result with the two
removed options greyed out. Changing the question after asking the audience
discards that result (it belonged to the replaced question). Answers given
with 50:50 or the audience are excluded from difficulty calibration and from
historical audience data.

## Daily Challenge

- One immutable set per date, published on first request or by the sweeper the
  day before. Everyone gets the same versions, order and option order.
- One attempt per player identity per date (row lock + primary key). Refresh
  resumes the attempt without touching the deadline.
- Guests may play; their result is shown but not ranked, and guest identity
  is per-device (cookie), so cross-device enforcement is weaker. Signing in
  afterwards keeps the result in history (unranked) and never creates a second
  attempt for the same day.
- If a set cannot be published (not enough approved content) players see an
  honest “not available” state and administrators get an alert.

## Leaderboards

- Daily: eligible completed attempts for that day. All-time Classic: each
  player’s best eligible completed run under the current **scoring key**
  (a signature of every score-affecting setting — changing points, timers or
  the ladder starts a fresh board instead of mixing incomparable results).
- Ranking: score ↓, correct answers ↓, total validated response time ↑; exact
  ties share a rank (1, 1, 3).
- Public fields only: display name, avatar, optional country flag, score.

## Versus (Phase 2)

- Live: both players get the same 15 versions, order and timers. Answers are
  private until the round closes (both answered or deadline + grace); then the
  correct answer, both outcomes and explanations are revealed.
- Disconnect: a player without a heartbeat for 6 s is shown as disconnected;
  20 s later they forfeit. Reconnecting within the window restores state —
  timers are never restarted. The remaining player finishes and wins by
  forfeit. Both gone, or a player missing at kick-off: cancelled, no result.
- Ghost: after ~30 s without a live opponent the player may race a recording
  of a real, completed, lifeline-free Classic run with a compatible ladder and
  timers, labelled “recorded player” under a pseudonym. Recordings are only
  made for players who allow it (Profile → settings). No recording → solo or
  keep waiting; an opponent is never invented.
- Friend challenges replay the creator’s exact versions and option order, no
  lifelines, one attempt per invited player, unguessable expiring links
  (only a SHA-256 hash is stored). Casual: never ranked.

Latency note: timing is judged at the server, so slow connections can lose a
fraction of a second (the 1 s grace absorbs typical latency).
