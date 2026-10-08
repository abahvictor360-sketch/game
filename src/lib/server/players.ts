import 'server-only';
import { audit } from './audit';
import type { Queryable } from './db';
import { AppError } from './errors';

export type Player = {
  id: string;
  kind: 'guest' | 'account';
  displayName: string;
  avatarKey: string;
  countryCode: string | null;
  email: string | null;
  settings: PlayerSettings;
  role: 'admin' | 'editor' | null;
  createdAt: Date;
};

export type PlayerSettings = {
  sound?: boolean;
  /** Allow completed runs to be replayed as a labelled "recorded player". */
  allowGhostReplay?: boolean;
  /** Phase 2: opt in to Ask the Audience invitations. */
  helpOthers?: boolean;
};

export const AVATARS = ['baobab', 'kente', 'drum', 'sun', 'river', 'mountain', 'star', 'shield'] as const;

const GUEST_WORDS = ['Baobab', 'Kora', 'Savanna', 'Sahel', 'Zambezi', 'Kilimanjaro', 'Okapi', 'Kente', 'Djembe', 'Ubuntu', 'Nile', 'Atlas'];

export function guestName(): string {
  const word = GUEST_WORDS[Math.floor(Math.random() * GUEST_WORDS.length)];
  const n = 1000 + Math.floor(Math.random() * 9000);
  return `${word} ${n}`;
}

type PlayerRow = {
  id: string;
  kind: 'guest' | 'account';
  display_name: string;
  avatar_key: string;
  country_code: string | null;
  email: string | null;
  settings: PlayerSettings;
  merged_into: string | null;
  role: 'admin' | 'editor' | null;
  created_at: Date;
};

function toPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    kind: r.kind,
    displayName: r.display_name,
    avatarKey: r.avatar_key,
    countryCode: r.country_code,
    email: r.email,
    settings: r.settings ?? {},
    role: r.role,
    createdAt: r.created_at,
  };
}

const SELECT = `select p.id, p.kind, p.display_name, p.avatar_key, p.country_code, p.email, p.settings, p.merged_into,
                       r.role, p.created_at
                  from public.players p left join public.staff_roles r on r.player_id = p.id`;

/** Load a player, following guest→account merges. */
export async function getPlayer(q: Queryable, id: string): Promise<Player | null> {
  let current = id;
  for (let i = 0; i < 5; i++) {
    const [row] = await q.query<PlayerRow>(`${SELECT} where p.id = $1`, [current]);
    if (!row) return null;
    if (!row.merged_into) return toPlayer(row);
    current = row.merged_into;
  }
  return null;
}

export async function createGuest(q: Queryable): Promise<Player> {
  const [row] = await q.query<PlayerRow>(
    `insert into public.players(kind, display_name, settings) values ('guest', $1, '{"allowGhostReplay": true}'::jsonb)
     returning id, kind, display_name, avatar_key, country_code, email, settings, merged_into, null as role, created_at`,
    [guestName()],
  );
  return toPlayer(row);
}

/**
 * Link a verified identity (Supabase Auth user) to a player.
 *  - Known identity: the current guest (if any) is merged into that account.
 *  - New identity: the current guest becomes the account (progress kept).
 * Results played as a guest stay unranked; see docs/GAME_RULES.md.
 */
export async function linkAccount(
  q: Queryable,
  args: { authUserId: string; email: string | null; currentPlayerId: string | null; suggestedName?: string | null },
): Promise<Player> {
  const [existing] = await q.query<{ id: string }>('select id from public.players where auth_user_id = $1 for update', [args.authUserId]);
  let playerId: string;
  if (existing) {
    playerId = existing.id;
    if (args.currentPlayerId && args.currentPlayerId !== existing.id) {
      const [cur] = await q.query<{ kind: string; merged_into: string | null }>('select kind, merged_into from public.players where id = $1 for update', [
        args.currentPlayerId,
      ]);
      if (cur && cur.kind === 'guest' && !cur.merged_into) await mergeGuestInto(q, args.currentPlayerId, existing.id);
    }
    await q.query('update public.players set email = coalesce($2, email), updated_at = now() where id = $1', [existing.id, args.email]);
  } else {
    const [cur] = args.currentPlayerId
      ? await q.query<{ id: string; kind: string; merged_into: string | null }>('select id, kind, merged_into from public.players where id = $1 for update', [
          args.currentPlayerId,
        ])
      : [];
    if (cur && cur.kind === 'guest' && !cur.merged_into) {
      await q.query(
        `update public.players set kind = 'account', auth_user_id = $2, email = $3, updated_at = now(),
                display_name = coalesce($4, display_name) where id = $1`,
        [cur.id, args.authUserId, args.email, cleanName(args.suggestedName)],
      );
      playerId = cur.id;
    } else {
      const [row] = await q.query<{ id: string }>(
        `insert into public.players(kind, auth_user_id, email, display_name, settings)
         values ('account', $1, $2, $3, '{"allowGhostReplay": true}'::jsonb) returning id`,
        [args.authUserId, args.email, cleanName(args.suggestedName) ?? guestName()],
      );
      playerId = row.id;
    }
  }
  await grantBootstrapAdmin(q, playerId, args.email);
  await audit(q, playerId, 'player.link_account', 'player', playerId, { merged: args.currentPlayerId !== playerId });
  return (await getPlayer(q, playerId))!;
}

function cleanName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 24);
  return n.length >= 2 ? n : null;
}

/**
 * Admin bootstrap from server configuration (ADMIN_BOOTSTRAP_EMAILS), matched
 * against the identity provider's verified email — never against anything
 * the player can edit.
 */
async function grantBootstrapAdmin(q: Queryable, playerId: string, email: string | null) {
  if (!email) return;
  const list = (process.env.ADMIN_BOOTSTRAP_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!list.includes(email.toLowerCase())) return;
  await q.query(`insert into public.staff_roles(player_id, role) values ($1, 'admin') on conflict (player_id) do nothing`, [playerId]);
}

/**
 * Move a guest's progress into an account. Daily and friend-challenge attempts
 * move only where the account has none for that challenge, so no duplicate
 * entries are created. All sessions move so history is preserved; sessions
 * played as a guest remain unranked.
 */
export async function mergeGuestInto(q: Queryable, guestId: string, accountId: string) {
  await q.query(
    `update public.daily_attempts g set player_id = $2
      where g.player_id = $1
        and not exists (select 1 from public.daily_attempts a where a.player_id = $2 and a.challenge_id = g.challenge_id)`,
    [guestId, accountId],
  );
  await q.query(
    `update public.friend_challenge_attempts g set player_id = $2
      where g.player_id = $1
        and not exists (select 1 from public.friend_challenge_attempts a where a.player_id = $2 and a.challenge_id = g.challenge_id)`,
    [guestId, accountId],
  );
  // An account has one active Classic run at a time; keep the guest's newest.
  await q.query(
    `update public.game_sessions set status = 'abandoned', updated_at = now()
      where player_id = $1 and mode = 'classic' and status = 'active'
        and exists (select 1 from public.game_sessions where player_id = $2 and mode = 'classic' and status = 'active')`,
    [accountId, guestId],
  );
  await q.query('update public.game_sessions set player_id = $2 where player_id = $1', [guestId, accountId]);
  await q.query(
    `insert into public.player_question_history(player_id, question_id, times_seen, last_seen_at)
     select $2, question_id, times_seen, last_seen_at from public.player_question_history where player_id = $1
     on conflict (player_id, question_id) do update
       set times_seen = player_question_history.times_seen + excluded.times_seen,
           last_seen_at = greatest(player_question_history.last_seen_at, excluded.last_seen_at)`,
    [guestId, accountId],
  );
  await q.query('delete from public.player_question_history where player_id = $1', [guestId]);
  await q.query('update public.friend_challenges set creator_id = $2 where creator_id = $1', [guestId, accountId]);
  await q.query('update public.ghost_recordings set source_player_id = $2 where source_player_id = $1', [guestId, accountId]);
  await q.query('delete from public.matchmaking_entries where player_id = $1', [guestId]);
  await q.query('delete from public.helper_presence where player_id = $1', [guestId]);
  await q.query('update public.players set merged_into = $2, updated_at = now() where id = $1', [guestId, accountId]);
}

export async function updateProfile(
  q: Queryable,
  playerId: string,
  input: { displayName: string; avatarKey: string; countryCode: string | null; settings: PlayerSettings },
) {
  const name = cleanName(input.displayName);
  if (!name) throw new AppError('bad_request', 'Display names need 2–24 letters, numbers or spaces.');
  if (!(AVATARS as readonly string[]).includes(input.avatarKey)) throw new AppError('bad_request', 'Choose one of the available avatars.');
  if (input.countryCode && !/^[A-Z]{2}$/.test(input.countryCode)) throw new AppError('bad_request', 'Invalid country.');
  await q.query(
    `update public.players set display_name = $2, avatar_key = $3, country_code = $4,
            settings = settings || $5::jsonb, updated_at = now() where id = $1`,
    [playerId, name, input.avatarKey, input.countryCode, JSON.stringify(input.settings)],
  );
}

export function canEditContent(p: Player | null): boolean {
  return !!p && p.kind === 'account' && (p.role === 'admin' || p.role === 'editor');
}

export function isAdmin(p: Player | null): boolean {
  return !!p && p.kind === 'account' && p.role === 'admin';
}
