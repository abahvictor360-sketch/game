import { Avatar } from '../Avatar';
import { EmptyState } from '../ui';
import type { Board } from '@/lib/server/game/leaderboard';
import { COUNTRY_NAMES } from '@/lib/shared/countries';

function flag(code: string | null) {
  if (!code) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function LeaderboardTable({ board, empty }: { board: Board; empty: string }) {
  if (!board.entries.length) return <EmptyState title="No entries yet">{empty}</EmptyState>;
  const meVisible = board.entries.some((e) => e.isMe);
  const rows = meVisible || !board.me ? board.entries : [...board.entries, board.me];
  return (
    <div className="panel overflow-hidden p-2">
      <table className="w-full text-sm">
        <caption className="sr-only">{board.label}</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-blue-100/75">
            <th scope="col" className="w-12 px-2 py-2 text-center">
              Rank
            </th>
            <th scope="col" className="px-2 py-2">
              Player
            </th>
            <th scope="col" className="hidden px-2 py-2 text-right sm:table-cell">
              Correct
            </th>
            <th scope="col" className="px-2 py-2 text-right">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.playerId + i} className={e.isMe ? 'bg-gold-400/15 outline outline-1 outline-gold-400' : i % 2 ? 'bg-white/[0.03]' : ''} aria-current={e.isMe ? 'true' : undefined}>
              <td className="px-2 py-2 text-center font-display font-black text-gold-400">{e.rank}</td>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <Avatar name={e.avatarKey} size={28} />
                  <span className="truncate font-semibold">
                    {e.displayName}
                    {e.isMe ? ' (you)' : ''}
                  </span>
                  {e.countryCode ? (
                    <span title={COUNTRY_NAMES[e.countryCode]} aria-label={COUNTRY_NAMES[e.countryCode]}>
                      {flag(e.countryCode)}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell">{e.correct}</td>
              <td className="px-2 py-2 text-right font-display font-black tabular-nums">{e.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
