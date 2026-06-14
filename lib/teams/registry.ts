// Canonical country registry — the reconciliation layer that lets multiple data
// origins (openfootball, TheSportsDB, the snapshot) be joined on one stable key.
//
// Each origin spells country names differently ("South Korea" vs "Korea
// Republic", "Ivory Coast" vs "Côte d'Ivoire", "Turkey" vs "Türkiye"). We
// normalise every incoming name to a 3-letter `code` and resolve a single
// canonical Team from it. Ratings seed the prediction model.

import type { Team } from "@/lib/types";

interface Country {
  code: string; // canonical 3-letter key
  name: string; // display name
  flag: string; // emoji
  rating: number; // Elo-style strength seed
  aliases: string[]; // alternate spellings across sources
}

// The 48 participants of the 2026 World Cup (as listed by openfootball).
// Ratings are illustrative strength seeds, not official rankings.
const COUNTRIES: Country[] = [
  { code: "ARG", name: "Argentina", flag: "🇦🇷", rating: 2090, aliases: [] },
  { code: "FRA", name: "France", flag: "🇫🇷", rating: 2060, aliases: [] },
  { code: "ESP", name: "Spain", flag: "🇪🇸", rating: 2050, aliases: [] },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", rating: 2030, aliases: [] },
  { code: "BRA", name: "Brazil", flag: "🇧🇷", rating: 2020, aliases: [] },
  { code: "POR", name: "Portugal", flag: "🇵🇹", rating: 2000, aliases: [] },
  { code: "GER", name: "Germany", flag: "🇩🇪", rating: 1990, aliases: [] },
  { code: "NED", name: "Netherlands", flag: "🇳🇱", rating: 1980, aliases: ["Holland"] },
  { code: "BEL", name: "Belgium", flag: "🇧🇪", rating: 1960, aliases: [] },
  { code: "CRO", name: "Croatia", flag: "🇭🇷", rating: 1900, aliases: [] },
  { code: "MAR", name: "Morocco", flag: "🇲🇦", rating: 1880, aliases: [] },
  { code: "URU", name: "Uruguay", flag: "🇺🇾", rating: 1860, aliases: [] },
  { code: "COL", name: "Colombia", flag: "🇨🇴", rating: 1850, aliases: [] },
  { code: "SEN", name: "Senegal", flag: "🇸🇳", rating: 1830, aliases: [] },
  { code: "SUI", name: "Switzerland", flag: "🇨🇭", rating: 1820, aliases: [] },
  { code: "JPN", name: "Japan", flag: "🇯🇵", rating: 1810, aliases: [] },
  { code: "AUT", name: "Austria", flag: "🇦🇹", rating: 1790, aliases: [] },
  { code: "KOR", name: "South Korea", flag: "🇰🇷", rating: 1780, aliases: ["Korea Republic", "Korea, South", "Republic of Korea"] },
  { code: "USA", name: "USA", flag: "🇺🇸", rating: 1770, aliases: ["United States", "United States of America"] },
  { code: "NOR", name: "Norway", flag: "🇳🇴", rating: 1770, aliases: [] },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨", rating: 1760, aliases: [] },
  { code: "MEX", name: "Mexico", flag: "🇲🇽", rating: 1790, aliases: [] },
  { code: "CAN", name: "Canada", flag: "🇨🇦", rating: 1740, aliases: [] },
  { code: "TUR", name: "Turkey", flag: "🇹🇷", rating: 1740, aliases: ["Türkiye", "Turkiye"] },
  { code: "CZE", name: "Czech Republic", flag: "🇨🇿", rating: 1730, aliases: ["Czechia"] },
  { code: "EGY", name: "Egypt", flag: "🇪🇬", rating: 1720, aliases: [] },
  { code: "SWE", name: "Sweden", flag: "🇸🇪", rating: 1710, aliases: [] },
  { code: "AUS", name: "Australia", flag: "🇦🇺", rating: 1700, aliases: [] },
  { code: "IRN", name: "Iran", flag: "🇮🇷", rating: 1700, aliases: ["IR Iran", "Iran, Islamic Republic of"] },
  { code: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", rating: 1700, aliases: [] },
  { code: "CIV", name: "Ivory Coast", flag: "🇨🇮", rating: 1700, aliases: ["Côte d'Ivoire", "Cote d'Ivoire"] },
  { code: "ALG", name: "Algeria", flag: "🇩🇿", rating: 1680, aliases: [] },
  { code: "BIH", name: "Bosnia & Herzegovina", flag: "🇧🇦", rating: 1680, aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia"] },
  { code: "TUN", name: "Tunisia", flag: "🇹🇳", rating: 1650, aliases: [] },
  { code: "GHA", name: "Ghana", flag: "🇬🇭", rating: 1640, aliases: [] },
  { code: "RSA", name: "South Africa", flag: "🇿🇦", rating: 1640, aliases: [] },
  { code: "COD", name: "DR Congo", flag: "🇨🇩", rating: 1640, aliases: ["Congo DR", "Democratic Republic of the Congo", "DR Congo (Zaire)"] },
  { code: "PAR", name: "Paraguay", flag: "🇵🇾", rating: 1620, aliases: [] },
  { code: "UZB", name: "Uzbekistan", flag: "🇺🇿", rating: 1600, aliases: [] },
  { code: "PAN", name: "Panama", flag: "🇵🇦", rating: 1560, aliases: [] },
  { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦", rating: 1560, aliases: [] },
  { code: "IRQ", name: "Iraq", flag: "🇮🇶", rating: 1560, aliases: [] },
  { code: "CPV", name: "Cape Verde", flag: "🇨🇻", rating: 1560, aliases: ["Cabo Verde"] },
  { code: "QAT", name: "Qatar", flag: "🇶🇦", rating: 1550, aliases: [] },
  { code: "NZL", name: "New Zealand", flag: "🇳🇿", rating: 1500, aliases: [] },
  { code: "JOR", name: "Jordan", flag: "🇯🇴", rating: 1520, aliases: [] },
  { code: "HAI", name: "Haiti", flag: "🇭🇹", rating: 1480, aliases: [] },
  { code: "CUW", name: "Curaçao", flag: "🇨🇼", rating: 1470, aliases: ["Curacao"] },
];

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, ""); // drop spaces/punctuation
}

// Stable team id = position in code-sorted order (1..48).
const SORTED_CODES = [...COUNTRIES.map((c) => c.code)].sort();
const ID_BY_CODE = new Map(SORTED_CODES.map((code, i) => [code, i + 1]));

const BY_NORM = new Map<string, Country>();
for (const c of COUNTRIES) {
  BY_NORM.set(normalize(c.name), c);
  BY_NORM.set(normalize(c.code), c);
  for (const a of c.aliases) BY_NORM.set(normalize(a), c);
}
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
const BY_ID = new Map(COUNTRIES.map((c) => [ID_BY_CODE.get(c.code)!, c]));

function toTeam(c: Country, group: string): Team {
  return {
    id: ID_BY_CODE.get(c.code)!,
    name: c.name,
    code: c.code,
    flag: c.flag,
    group,
    rating: c.rating,
  };
}

/** Resolve a team from any source's spelling. Returns null for placeholders. */
export function resolveTeam(name: string, group = "?"): Team | null {
  const c = BY_NORM.get(normalize(name));
  return c ? toTeam(c, group) : null;
}

export function teamByCodeRegistry(code: string, group = "?"): Team | null {
  const c = BY_CODE.get(code);
  return c ? toTeam(c, group) : null;
}

export function teamByIdRegistry(id: number, group = "?"): Team | null {
  const c = BY_ID.get(id);
  return c ? toTeam(c, group) : null;
}

export function allCountries(): Team[] {
  return COUNTRIES.map((c) => toTeam(c, "?"));
}
