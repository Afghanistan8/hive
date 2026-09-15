// Display-only sports data (tables, crests, live scores) from ESPN's public API.
// Settlement never reads this: the contract fetches ESPN + BBC itself under consensus.

export const ESPN_SLUGS: Record<string, string> = {
  PL: "eng.1",
  PD: "esp.1",
  BL1: "ger.1",
  SA: "ita.1",
  FL1: "fra.1",
};

export const LEAGUE_META: { code: string; label: string; name: string }[] = [
  { code: "PL", label: "Premier League", name: "English Premier League" },
  { code: "PD", label: "La Liga", name: "Spanish La Liga" },
  { code: "BL1", label: "Bundesliga", name: "German Bundesliga" },
  { code: "SA", label: "Serie A", name: "Italian Serie A" },
  { code: "FL1", label: "Ligue 1", name: "French Ligue 1" },
];

// ESPN rejects many generic/browser user agents; the same honest one the contracts use works.
export const ESPN_HEADERS = { Accept: "application/json", "User-Agent": "curl/8.5.0 (HIVE GenLayer validator)" };

export interface StandingRow {
  rank: number;
  team: string;
  short: string;
  abbr: string;
  logo: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: string;
  points: number;
  note: string;
  noteColor: string;
}

export interface LiveEvent {
  id: string;
  state: "pre" | "in" | "post";
  detail: string;
  homeScore: string;
  awayScore: string;
  homeLogo: string;
  awayLogo: string;
  homeName: string;
  awayName: string;
}

export function normalizeStandings(data: any): { season: string; rows: StandingRow[] } {
  const standings = data?.children?.[0]?.standings ?? {};
  const rows: StandingRow[] = (standings.entries ?? []).map((e: any) => {
    const st: Record<string, string> = {};
    for (const s of e.stats ?? []) st[s.name] = String(s.displayValue ?? s.value ?? "");
    const num = (k: string) => Number(st[k] ?? 0) || 0;
    return {
      rank: num("rank"),
      team: e.team?.displayName ?? "?",
      short: e.team?.shortDisplayName ?? e.team?.displayName ?? "?",
      abbr: e.team?.abbreviation ?? "",
      logo: e.team?.logos?.[0]?.href ?? "",
      played: num("gamesPlayed"),
      won: num("wins"),
      drawn: num("ties"),
      lost: num("losses"),
      gf: num("pointsFor"),
      ga: num("pointsAgainst"),
      gd: st.pointDifferential ?? "0",
      points: num("points"),
      note: e.note?.description ?? "",
      noteColor: e.note?.color ?? "",
    };
  });
  rows.sort((a, b) => a.rank - b.rank);
  return { season: standings.seasonDisplayName ?? data?.name ?? "", rows };
}

export function normalizeScoreboard(data: any): Record<string, LiveEvent> {
  const out: Record<string, LiveEvent> = {};
  for (const ev of data?.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const teams: Record<string, any> = {};
    for (const c of comp.competitors ?? []) teams[c.homeAway] = c;
    const type = comp.status?.type ?? {};
    out[String(ev.id)] = {
      id: String(ev.id),
      state: type.state ?? "pre",
      detail: type.state === "in" ? comp.status?.displayClock ?? type.shortDetail ?? "" : type.shortDetail ?? "",
      homeScore: String(teams.home?.score ?? ""),
      awayScore: String(teams.away?.score ?? ""),
      homeLogo: teams.home?.team?.logo ?? "",
      awayLogo: teams.away?.team?.logo ?? "",
      homeName: teams.home?.team?.displayName ?? "",
      awayName: teams.away?.team?.displayName ?? "",
    };
  }
  return out;
}

export function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Match a stored (BBC-style) club name to an ESPN standings row. */
export function findStanding(rows: StandingRow[], name: string): StandingRow | undefined {
  const target = fold(name);
  const token = target.split(/[\s.-]+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0] ?? target;
  return (
    rows.find((r) => fold(r.team) === target || fold(r.short) === target) ??
    rows.find((r) => fold(r.team).includes(target) || target.includes(fold(r.short))) ??
    rows.find((r) => fold(r.team).includes(token))
  );
}
