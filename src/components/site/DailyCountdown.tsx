'use client';
import { useEffect, useState } from 'react';

export function DailyCountdown({ resetAt }: { resetAt: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span>--:--:--</span>;
  const ms = Math.max(0, new Date(resetAt).getTime() - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <time dateTime={resetAt} className="font-display font-black tabular-nums text-white">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </time>
  );
}
