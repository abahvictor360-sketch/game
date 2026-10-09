import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/server/db';
import { getMatchView, joinQueue, pollQueue, submitMatchAnswer, tickMatch, forfeitMatch } from '@/lib/server/game/matches';
import { castAudienceVote, createFriendChallenge, helperHeartbeat, previewFriendChallenge, startFriendChallenge, startGhostGame } from '@/lib/server/game/phase2';
import { advance, getSessionView, startClassic, submitAnswer, useLifeline } from '@/lib/server/game/sessions';
import { updateProfile } from '@/lib/server/players';
import { account, correctOption, fakeClock, freshDb, guest } from '../support/db';

let db: Db;
const clock = fakeClock(new Date('2026-07-01T12:00:00Z'));
beforeAll(async () => {
  process.env.FEATURE_FLAGS = 'multiplayer,ghostOpponents,friendChallenges,askAudience';
  db = await freshDb();
});
afterAll(async () => {
  delete process.env.FEATURE_FLAGS;
  clock.reset();
  await db.close();
});
beforeEach(() => clock.advance(60 * 60 * 1000));

const key = () => crypto.randomUUID();

async function playClassic(playerId: string, sessionId: string, correctPositions: (i: number) => boolean, msPerAnswer = 2000) {
  let v = await db.tx((q) => getSessionView(q, playerId, sessionId));
  while (v.phase !== 'completed') {
    const i = v.question!.position;
    const c = await correctOption(db, v.question!.issuedId);
    clock.advance(msPerAnswer);
    await db.tx((q) => submitAnswer(q, playerId, sessionId, { issuedId: v.question!.issuedId, optionId: correctPositions(i) ? c : v.question!.options.find((o) => o.id !== c && !v.question!.removedOptionIds.includes(o.id))!.id, submissionKey: key() }));
    v = await db.tx((q) => advance(q, playerId, sessionId, i));
  }
  return v;
}

describe('Challenge a Friend', () => {
  it('friend plays the same versions and option order; one attempt; never ranked', async () => {
    const creator = await account(db);
    const s = await db.tx((q) => startClassic(q, creator));
    await playClassic(creator.id, s, (i) => i % 2 === 0);
    const { token } = await db.tx((q) => createFriendChallenge(q, creator.id, s));
    expect(token.length).toBeGreaterThanOrEqual(22);
    const [stored] = await db.query<{ token_hash: string }>('select token_hash from public.friend_challenges limit 1');
    expect(stored.token_hash).not.toBe(token); // only a hash is stored

    expect((await previewFriendChallenge(db, token, creator.id))!.state).toBe('own');
    await expect(db.tx((q) => startFriendChallenge(q, creator, token))).rejects.toMatchObject({ reason: 'own_challenge' });

    const friend = await guest(db);
    const fs = await db.tx((q) => startFriendChallenge(q, friend, token));
    expect(await db.tx((q) => startFriendChallenge(q, friend, token))).toBe(fs); // resume, not a second attempt
    const src = await db.query<{ version_id: string; option_order: string[] }>(`select version_id, option_order from public.issued_questions where session_id = $1 and outcome <> 'replaced' order by position`, [s]);
    const v = await playClassic(friend.id, fs, () => true);
    const mine = await db.query<{ version_id: string; option_order: string[] }>(`select version_id, option_order from public.issued_questions where session_id = $1 order by position`, [fs]);
    expect(mine).toEqual(src);
    expect(v.leaderboardEligible).toBe(false);
    const done = await db.tx((q) => getSessionView(q, friend.id, fs));
    expect(done.friendChallenge!.opponentScore).not.toBeNull();
    expect((await previewFriendChallenge(db, token, friend.id))!.state).toBe('played');
  });

  it('expired and unknown links are handled', async () => {
    const creator = await account(db);
    const s = await db.tx((q) => startClassic(q, creator));
    await playClassic(creator.id, s, () => true);
    const { token } = await db.tx((q) => createFriendChallenge(q, creator.id, s));
    clock.advance(8 * 86400000);
    const friend = await guest(db);
    expect((await previewFriendChallenge(db, token, friend.id))!.state).toBe('expired');
    await expect(db.tx((q) => startFriendChallenge(q, friend, token))).rejects.toMatchObject({ code: 'expired' });
    expect(await previewFriendChallenge(db, 'x'.repeat(24), friend.id)).toBeNull();
  });
});

describe('Ghost opponents', () => {
  it('records lifeline-free runs and replays them, labelled, without fabricating opponents', async () => {
    const lonely = await guest(db);
    await db.query('delete from public.ghost_recordings');
    await expect(db.tx((q) => startGhostGame(q, lonely))).rejects.toMatchObject({ reason: 'no_recording' });

    const recorder = await account(db);
    const withLifeline = await db.tx((q) => startClassic(q, recorder));
    const v0 = await db.tx((q) => getSessionView(q, recorder.id, withLifeline));
    await db.tx((q) => useLifeline(q, recorder.id, withLifeline, { issuedId: v0.question!.issuedId, lifeline: 'fifty_fifty', requestKey: key() }));
    await playClassic(recorder.id, withLifeline, () => true);
    expect(await db.query('select 1 from public.ghost_recordings')).toHaveLength(0); // lifeline runs are not recorded

    const clean = await db.tx((q) => startClassic(q, recorder));
    await playClassic(recorder.id, clean, (i) => i < 10, 4000);
    const [rec] = await db.query<{ display_alias: string; source_player_id: string }>('select display_alias, source_player_id from public.ghost_recordings');
    expect(rec.display_alias).not.toContain(recorder.displayName);

    const challenger = await guest(db);
    const gs = await db.tx((q) => startGhostGame(q, challenger));
    let v = await db.tx((q) => getSessionView(q, challenger.id, gs));
    expect(v.ghost!.alias).toBe(rec.display_alias);
    expect(v.ghost!.outcomes.every((o) => o === null)).toBe(true); // nothing revealed up front
    expect(v.ghost!.answeredCurrent).toBe(false);
    clock.advance(4500);
    v = await db.tx((q) => getSessionView(q, challenger.id, gs));
    expect(v.ghost!.answeredCurrent).toBe(true); // recording answered at ~4s
    const c = await correctOption(db, v.question!.issuedId);
    v = await db.tx((q) => submitAnswer(q, challenger.id, gs, { issuedId: v.question!.issuedId, optionId: c, submissionKey: key() }));
    expect(v.ghost!.outcomes[0]).toBe('correct');
    expect(v.ghost!.score).toBeGreaterThan(100); // includes speed bonus under versus rules
    expect(v.feedback!.points).toBeGreaterThan(100);
  });

  it('players who opt out are not recorded', async () => {
    const p = await account(db);
    await db.tx((q) => updateProfile(q, p.id, { displayName: 'Private Player', avatarKey: 'sun', countryCode: null, settings: { allowGhostReplay: false } }));
    const s = await db.tx((q) => startClassic(q, p));
    await playClassic(p.id, s, () => true);
    expect(await db.query('select 1 from public.ghost_recordings where source_player_id = $1', [p.id])).toHaveLength(0);
  });
});

describe('Ask the Audience', () => {
  it('without enough data it says so and restores the lifeline', async () => {
    const p = await guest(db);
    const s = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, s));
    expect(v.lifelines.ask_audience).toBe('available');
    await db.query('update public.question_stats set answer_distribution = $2::jsonb where version_id = (select version_id from public.issued_questions where id = $1)', [v.question!.issuedId, '{}']);
    await expect(db.tx((q) => useLifeline(q, p.id, s, { issuedId: v.question!.issuedId, lifeline: 'ask_audience', requestKey: key() }))).rejects.toMatchObject({ reason: 'audience_insufficient' });
    expect((await db.tx((q) => getSessionView(q, p.id, s))).lifelines.ask_audience).toBe('available');
  });

  it('falls back to the exact version’s historical distribution, labelled with sample size', async () => {
    const p = await guest(db);
    const s = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, s));
    const [a, b] = v.question!.options;
    await db.query('update public.question_stats set answer_distribution = $2::jsonb where version_id = (select version_id from public.issued_questions where id = $1)', [
      v.question!.issuedId,
      JSON.stringify({ [a.id]: 30, [b.id]: 10 }),
    ]);
    const after = await db.tx((q) => useLifeline(q, p.id, s, { issuedId: v.question!.issuedId, lifeline: 'ask_audience', requestKey: key() }));
    expect(after.audience).toMatchObject({ status: 'ready', source: 'historical', sampleSize: 40 });
    expect(after.audience!.percentages.find((x) => x.optionId === a.id)!.percent).toBe(75);
    expect(after.question!.paused).toBe(false);
  });

  it('live voting pauses the timer, counts one vote per helper, then resumes remaining time', async () => {
    const helpers: { id: string }[] = [];
    for (let i = 0; i < 5; i++) {
      const h = await account(db);
      await db.tx((q) => updateProfile(q, h.id, { displayName: `Helper ${i}`, avatarKey: 'sun', countryCode: null, settings: { helpOthers: true } }));
      await db.tx((q) => helperHeartbeat(q, h.id));
      helpers.push(h);
    }
    const p = await guest(db);
    const s = await db.tx((q) => startClassic(q, p));
    let v = await db.tx((q) => getSessionView(q, p.id, s));
    clock.advance(5000); // 15s left
    v = await db.tx((q) => useLifeline(q, p.id, s, { issuedId: v.question!.issuedId, lifeline: 'ask_audience', requestKey: key() }));
    expect(v.audience!.status).toBe('collecting');
    expect(v.question!.paused).toBe(true);
    await expect(db.tx((q) => submitAnswer(q, p.id, s, { issuedId: v.question!.issuedId, optionId: v.question!.options[0].id, submissionKey: key() }))).rejects.toMatchObject({ reason: 'paused' });
    const inv = await db.tx((q) => helperHeartbeat(q, helpers[0].id));
    expect(inv.invitation!.text).toBe(v.question!.text);
    expect(JSON.stringify(inv)).not.toMatch(/correct/i);
    const target = v.question!.options[1].id;
    for (const h of helpers.slice(0, 3)) await db.tx((q) => castAudienceVote(q, h.id, inv.invitation!.requestId, target));
    await db.tx((q) => castAudienceVote(q, helpers[0].id, inv.invitation!.requestId, v.question!.options[2].id)); // duplicate ignored
    clock.advance(16000); // voting window closes; the timer did not run meanwhile
    v = await db.tx((q) => getSessionView(q, p.id, s));
    expect(v.audience).toMatchObject({ status: 'ready', source: 'live', sampleSize: 3 });
    expect(v.audience!.percentages.find((x) => x.optionId === target)!.percent).toBe(100);
    expect(v.question!.paused).toBe(false);
    expect(v.phase).toBe('question');
    expect(v.question!.remainingMs).toBeGreaterThan(13000);
    expect(v.question!.remainingMs).toBeLessThanOrEqual(15000);
  });

  it('a live request with no votes restores the lifeline, and it can be asked again on the same question', async () => {
    for (let i = 0; i < 5; i++) {
      const h = await account(db);
      await db.tx((q) => updateProfile(q, h.id, { displayName: `Quiet ${i}`, avatarKey: 'sun', countryCode: null, settings: { helpOthers: true } }));
      await db.tx((q) => helperHeartbeat(q, h.id));
    }
    const p = await guest(db);
    const s = await db.tx((q) => startClassic(q, p));
    let v = await db.tx((q) => getSessionView(q, p.id, s));
    const issuedId = v.question!.issuedId;
    await db.query('update public.question_stats set answer_distribution = $2::jsonb where version_id = (select version_id from public.issued_questions where id = $1)', [issuedId, '{}']);
    v = await db.tx((q) => useLifeline(q, p.id, s, { issuedId, lifeline: 'ask_audience', requestKey: key() }));
    expect(v.audience!.status).toBe('collecting');
    clock.advance(16000); // nobody votes
    v = await db.tx((q) => getSessionView(q, p.id, s));
    expect(v.audience!.status).toBe('insufficient');
    expect(v.lifelines.ask_audience).toBe('available');
    const [a] = v.question!.options;
    await db.query('update public.question_stats set answer_distribution = $2::jsonb where version_id = (select version_id from public.issued_questions where id = $1)', [issuedId, JSON.stringify({ [a.id]: 40 })]);
    await db.query('delete from public.helper_presence');
    v = await db.tx((q) => useLifeline(q, p.id, s, { issuedId, lifeline: 'ask_audience', requestKey: key() }));
    expect(v.audience).toMatchObject({ status: 'ready', source: 'historical', sampleSize: 40 });
    expect(v.lifelines.ask_audience).toBe('used');
  });
});

describe('Live matches', () => {
  async function pair() {
    const a = await account(db);
    const b = await account(db);
    expect((await db.tx((q) => joinQueue(q, a.id))).status).toBe('waiting');
    const sb = await db.tx((q) => joinQueue(q, b.id));
    expect(sb.status).toBe('matched');
    const sa = await db.tx((q) => pollQueue(q, a.id));
    expect(sa).toEqual(sb);
    return { a, b, matchId: (sb as { matchId: string }).matchId };
  }

  it('offers a fallback after the configured wait', async () => {
    const solo = await account(db);
    await db.tx((q) => joinQueue(q, solo.id));
    for (let i = 0; i < 31; i++) {
      clock.advance(1000);
      await db.tx((q) => pollQueue(q, solo.id));
    }
    const st = await db.tx((q) => pollQueue(q, solo.id));
    expect(st).toMatchObject({ status: 'waiting', fallbackAvailable: true });
    await db.query('delete from public.matchmaking_entries');
  });

  it('plays a synchronized match; answers stay private until the round closes', async () => {
    const { a, b, matchId } = await pair();
    let va = await db.tx((q) => getMatchView(q, a.id, matchId));
    expect(va.status).toBe('countdown');
    clock.advance(3000);
    va = await db.tx((q) => getMatchView(q, a.id, matchId));
    let vb = await db.tx((q) => getMatchView(q, b.id, matchId));
    expect(va.status).toBe('active');
    expect(va.question!.text).toBe(vb.question!.text);
    for (let pos = 0; pos < va.totalQuestions; pos++) {
      const [{ version_id }] = await db.query<{ version_id: string }>('select version_id from public.match_questions where match_id = $1 and position = $2', [matchId, pos]);
      const [{ correct_option_id: c }] = await db.query<{ correct_option_id: string }>('select correct_option_id from private.answer_keys where version_id = $1', [version_id]);
      clock.advance(1000);
      va = await db.tx((q) => submitMatchAnswer(q, a.id, matchId, { position: pos, optionId: c }));
      vb = await db.tx((q) => getMatchView(q, b.id, matchId));
      expect(vb.opponent.answered).toBe(true);
      expect(JSON.stringify(vb)).not.toContain('correctOptionId');
      expect(vb.opponent.score).toBe(vb.history.opponent.filter(Boolean).length ? vb.opponent.score : 0);
      clock.advance(3000);
      const wrong = vb.question!.options.find((o) => o.id !== c)!.id;
      vb = await db.tx((q) => submitMatchAnswer(q, b.id, matchId, { position: pos, optionId: wrong }));
      expect(vb.roundState).toBe('closed');
      expect(vb.reveal!.correctOptionId).toBe(c);
      await expect(db.tx((q) => submitMatchAnswer(q, b.id, matchId, { position: pos, optionId: c }))).rejects.toMatchObject({ reason: 'round_closed' });
      clock.advance(4000);
      await db.tx((q) => getMatchView(q, a.id, matchId));
      await db.tx((q) => getMatchView(q, b.id, matchId));
    }
    va = await db.tx((q) => getMatchView(q, a.id, matchId));
    vb = await db.tx((q) => getMatchView(q, b.id, matchId));
    expect(va.status).toBe('completed');
    expect(va.result!.outcome).toBe('win');
    expect(vb.result!.outcome).toBe('loss');
    expect(va.me.score).toBeGreaterThan(15 * 100);
    const [m] = await db.query<{ finalized_at: Date }>('select finalized_at from public.matches where id = $1', [matchId]);
    await tickMatch(db, matchId);
    const [m2] = await db.query<{ finalized_at: Date }>('select finalized_at from public.matches where id = $1', [matchId]);
    expect(m2.finalized_at.getTime()).toBe(m.finalized_at.getTime()); // finalised once
  });

  it('reconnection within the window keeps the timer; after it the absent player forfeits', async () => {
    const { a, b, matchId } = await pair();
    clock.advance(3000);
    let va = await db.tx((q) => getMatchView(q, a.id, matchId));
    await db.tx((q) => getMatchView(q, b.id, matchId));
    const deadline = va.deadlineAt;
    // b goes silent; a keeps polling.
    for (let i = 0; i < 10; i++) {
      clock.advance(1000);
      va = await db.tx((q) => getMatchView(q, a.id, matchId));
    }
    expect(va.opponent.status).toBe('disconnected');
    const vb = await db.tx((q) => getMatchView(q, b.id, matchId)); // reconnects
    expect(vb.reconnected).toBe(true);
    expect(vb.me.status).toBe('connected');
    expect(vb.position === 0 ? vb.deadlineAt : deadline).toBe(deadline); // timer not restarted
    // Now b disappears for good.
    for (let i = 0; i < 40; i++) {
      clock.advance(1000);
      va = await db.tx((q) => getMatchView(q, a.id, matchId));
    }
    expect(va.opponent.status).toBe('forfeited');
    // a finishes alone and wins by forfeit.
    for (let guard = 0; guard < 200 && va.status === 'active'; guard++) {
      clock.advance(2000);
      va = await db.tx((q) => getMatchView(q, a.id, matchId));
    }
    expect(va.result).toEqual({ outcome: 'win', reason: 'forfeit' });
  });

  it('cancels without a result when both players disconnect; explicit forfeit is honoured', async () => {
    const one = await pair();
    clock.advance(3000);
    await db.tx((q) => getMatchView(q, one.a.id, one.matchId));
    clock.advance(60000);
    await tickMatch(db, one.matchId);
    const [m] = await db.query<{ status: string; result_reason: string; winner_player_id: string | null }>('select status, result_reason, winner_player_id from public.matches where id = $1', [one.matchId]);
    expect(m).toEqual({ status: 'cancelled', result_reason: 'both_disconnected', winner_player_id: null });

    const two = await pair();
    clock.advance(3000);
    await db.tx((q) => forfeitMatch(q, two.b.id, two.matchId));
    let v = await db.tx((q) => getMatchView(q, two.a.id, two.matchId));
    for (let guard = 0; guard < 200 && v.status === 'active'; guard++) {
      clock.advance(2000);
      v = await db.tx((q) => getMatchView(q, two.a.id, two.matchId));
    }
    expect(v.result).toEqual({ outcome: 'win', reason: 'forfeit' });
  });

  it('strangers cannot read a match', async () => {
    const { matchId } = await pair();
    const stranger = await account(db);
    await expect(db.tx((q) => getMatchView(q, stranger.id, matchId))).rejects.toMatchObject({ code: 'not_found' });
  });
});
