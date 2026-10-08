export const DEFAULT_CATEGORIES = [
  { id: 'history', name: 'History', description: 'Kingdoms, movements, independence and people who shaped the continent.' },
  { id: 'geography', name: 'Geography', description: 'Countries, capitals, rivers, mountains and landscapes.' },
  { id: 'culture', name: 'Culture', description: 'Festivals, food, dress, traditions and everyday life.' },
  { id: 'languages', name: 'Languages', description: 'The languages of Africa and how they are written and spoken.' },
  { id: 'arts', name: 'Arts', description: 'Music, literature, film, visual arts and architecture.' },
  { id: 'sports', name: 'Sports', description: 'Athletes, teams, tournaments and records.' },
  { id: 'science', name: 'Science', description: 'Discoveries, scientists, nature and the environment.' },
  { id: 'innovation', name: 'Innovation', description: 'Technology, entrepreneurs and new ideas.' },
  { id: 'society', name: 'Society', description: 'Government, economy, institutions and public life.' },
] as const;

/** Regions usable in country_scope besides ISO 3166-1 alpha-2 codes. */
export const REGION_SCOPES = ['AFRICA', 'NORTH', 'WEST', 'CENTRAL', 'EAST', 'SOUTHERN', 'DIASPORA'] as const;
