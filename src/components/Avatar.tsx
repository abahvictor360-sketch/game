const PATHS: Record<string, string> = {
  baobab: 'M12 21v-6m0 0c-3 0-6-2-6-5 0-2 2-3 3-3 0-2 1.5-3 3-3s3 1 3 3c1 0 3 1 3 3 0 3-3 5-6 5zm-1.5 6h3',
  kente: 'M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16',
  drum: 'M6 6c0-1.7 2.7-3 6-3s6 1.3 6 3-2.7 3-6 3-6-1.3-6-3zm0 0v8c0 2 2.7 4 6 4s6-2 6-4V6M8 8l4 9 4-9',
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zm0-5v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  river: 'M3 7c3-2 5 2 9 0s6 2 9 0M3 12c3-2 5 2 9 0s6 2 9 0M3 17c3-2 5 2 9 0s6 2 9 0',
  mountain: 'M2 20l7-12 4 6 3-4 6 10zM9 8l2 3',
  star: 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7.1L12 17.3 5.8 21l1.6-7.1L2 9.2l7.1-.6z',
  shield: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM12 6v12M7 9h10',
};

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const d = PATHS[name] ?? PATHS.baobab;
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: 'radial-gradient(circle at 50% 30%, #2a55c8, #06133d)', boxShadow: 'inset 0 0 0 2px #ffc93d' }}
      aria-hidden="true"
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#ffe08a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

export const AVATAR_LABELS: Record<string, string> = {
  baobab: 'Baobab tree',
  kente: 'Woven pattern',
  drum: 'Drum',
  sun: 'Sun',
  river: 'River',
  mountain: 'Mountain',
  star: 'Star',
  shield: 'Shield',
};
