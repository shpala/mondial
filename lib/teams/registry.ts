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
  rating: number; // World Football Elo (eloratings.net)
  aliases: string[]; // alternate spellings across sources
  host?: boolean; // 2026 co-host (USA/Mexico/Canada)
}

// The 48 participants of the 2026 World Cup (as listed by openfootball).
// Ratings are World Football Elo ratings sourced from eloratings.net
// (snapshot: June 2026), ordered strongest first. They are a team's true
// strength; the host home-field bump is applied separately at prediction time
// (see HOST_ADVANTAGE in lib/prediction.ts), so the three co-hosts carry their
// raw Elo here.
const COUNTRIES: Country[] = [
  { code: "ESP", name: "Spain", flag: "🇪🇸", rating: 2129, aliases: [] },
  { code: "ARG", name: "Argentina", flag: "🇦🇷", rating: 2115, aliases: [] },
  { code: "FRA", name: "France", flag: "🇫🇷", rating: 2063, aliases: [] },
  { code: "ENG", name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", rating: 2024, aliases: [] },
  { code: "POR", name: "Portugal", flag: "🇵🇹", rating: 1989, aliases: [] },
  { code: "COL", name: "Colombia", flag: "🇨🇴", rating: 1982, aliases: [] },
  { code: "BRA", name: "Brazil", flag: "🇧🇷", rating: 1978, aliases: [] },
  { code: "NED", name: "Netherlands", flag: "🇳🇱", rating: 1944, aliases: ["Holland"] },
  { code: "GER", name: "Germany", flag: "🇩🇪", rating: 1939, aliases: [] },
  { code: "NOR", name: "Norway", flag: "🇳🇴", rating: 1914, aliases: [] },
  { code: "CRO", name: "Croatia", flag: "🇭🇷", rating: 1912, aliases: [] },
  { code: "JPN", name: "Japan", flag: "🇯🇵", rating: 1910, aliases: [] },
  { code: "BEL", name: "Belgium", flag: "🇧🇪", rating: 1894, aliases: [] },
  { code: "URU", name: "Uruguay", flag: "🇺🇾", rating: 1892, aliases: [] },
  { code: "ECU", name: "Ecuador", flag: "🇪🇨", rating: 1890, aliases: [] },
  { code: "MEX", name: "Mexico", flag: "🇲🇽", rating: 1881, aliases: [], host: true },
  { code: "SUI", name: "Switzerland", flag: "🇨🇭", rating: 1865, aliases: [] },
  { code: "SEN", name: "Senegal", flag: "🇸🇳", rating: 1860, aliases: [] },
  { code: "TUR", name: "Turkey", flag: "🇹🇷", rating: 1849, aliases: ["Türkiye", "Turkiye"] },
  { code: "MAR", name: "Morocco", flag: "🇲🇦", rating: 1840, aliases: [] },
  { code: "AUS", name: "Australia", flag: "🇦🇺", rating: 1839, aliases: [] },
  { code: "AUT", name: "Austria", flag: "🇦🇹", rating: 1830, aliases: [] },
  { code: "SCO", name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", rating: 1794, aliases: [] },
  { code: "KOR", name: "South Korea", flag: "🇰🇷", rating: 1786, aliases: ["Korea Republic", "Korea, South", "Republic of Korea"] },
  { code: "PAR", name: "Paraguay", flag: "🇵🇾", rating: 1780, aliases: [] },
  { code: "USA", name: "USA", flag: "🇺🇸", rating: 1780, aliases: ["United States", "United States of America"], host: true },
  { code: "ALG", name: "Algeria", flag: "🇩🇿", rating: 1772, aliases: [] },
  { code: "IRN", name: "Iran", flag: "🇮🇷", rating: 1772, aliases: ["IR Iran", "Iran, Islamic Republic of"] },
  { code: "CAN", name: "Canada", flag: "🇨🇦", rating: 1767, aliases: [], host: true },
  { code: "SWE", name: "Sweden", flag: "🇸🇪", rating: 1755, aliases: [] },
  { code: "CIV", name: "Ivory Coast", flag: "🇨🇮", rating: 1743, aliases: ["Côte d'Ivoire", "Cote d'Ivoire"] },
  { code: "PAN", name: "Panama", flag: "🇵🇦", rating: 1730, aliases: [] },
  { code: "UZB", name: "Uzbekistan", flag: "🇺🇿", rating: 1714, aliases: [] },
  { code: "CZE", name: "Czech Republic", flag: "🇨🇿", rating: 1712, aliases: ["Czechia"] },
  { code: "EGY", name: "Egypt", flag: "🇪🇬", rating: 1696, aliases: [] },
  { code: "JOR", name: "Jordan", flag: "🇯🇴", rating: 1680, aliases: [] },
  { code: "COD", name: "DR Congo", flag: "🇨🇩", rating: 1652, aliases: ["Congo DR", "Democratic Republic of the Congo", "DR Congo (Zaire)"] },
  { code: "BIH", name: "Bosnia & Herzegovina", flag: "🇧🇦", rating: 1616, aliases: ["Bosnia and Herzegovina", "Bosnia-Herzegovina", "Bosnia"] },
  { code: "IRQ", name: "Iraq", flag: "🇮🇶", rating: 1607, aliases: [] },
  { code: "CPV", name: "Cape Verde", flag: "🇨🇻", rating: 1606, aliases: ["Cabo Verde"] },
  { code: "TUN", name: "Tunisia", flag: "🇹🇳", rating: 1585, aliases: [] },
  { code: "KSA", name: "Saudi Arabia", flag: "🇸🇦", rating: 1576, aliases: [] },
  { code: "NZL", name: "New Zealand", flag: "🇳🇿", rating: 1562, aliases: [] },
  { code: "HAI", name: "Haiti", flag: "🇭🇹", rating: 1536, aliases: [] },
  { code: "RSA", name: "South Africa", flag: "🇿🇦", rating: 1511, aliases: [] },
  { code: "GHA", name: "Ghana", flag: "🇬🇭", rating: 1510, aliases: [] },
  { code: "QAT", name: "Qatar", flag: "🇶🇦", rating: 1447, aliases: [] },
  { code: "CUW", name: "Curaçao", flag: "🇨🇼", rating: 1427, aliases: ["Curacao"] },
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
    ...(c.host ? { host: true } : {}),
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

/** Canonical, origin-independent team id for a country code (1..48), or
 *  undefined if the code is not a registered participant. */
export function registryId(code: string): number | undefined {
  return ID_BY_CODE.get(code);
}

export function teamByIdRegistry(id: number, group = "?"): Team | null {
  const c = BY_ID.get(id);
  return c ? toTeam(c, group) : null;
}

export function allCountries(): Team[] {
  return COUNTRIES.map((c) => toTeam(c, "?"));
}
