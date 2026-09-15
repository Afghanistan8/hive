// Server-side only (Node / GitHub Actions / API route). Never import from client components.
import { ESPN_HEADERS, ESPN_SLUGS, fold } from "../hive/espn";

// Finds upcoming top-5-league fixtures on ESPN and keeps only pairings the BBC
// Sports scores page for that date actually lists, so every registered fixture
// is one validators can settle. Mirrors scripts/generate_fixtures.py.

const BBC_NAMES: Record<string, string> = {
  "Hamburg SV": "Hamburger SV",
  Internazionale: "Inter Milan",
  "Atlético Madrid": "Atletico Madrid",
  "FC Cologne": "Cologne",
  "1. FC Heidenheim 1846": "Heidenheim",
  Mainz: "Mainz 05",
  "Hellas Verona": "Verona",
  "AS Roma": "Roma",
  "Stade Rennais": "Rennes",
  "AS Monaco": "Monaco",
  "Olympique Lyonnais": "Lyon",
  "Olympique de Marseille": "Marseille",
};

export interface Candidate {
  league: string;
  espn_event_id: string;
  home: string;
  away: string;
  kickoff_ts: number;
}

function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

function keyToken(name: string): string {
  const words = fold(name).replace(/[-.]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
  return words.sort((a, b) => b.length - a.length)[0] ?? fold(name);
}

/** Same rule as the contract's narrow_page: both names within 350 chars. */
export function pairingListed(text: string, home: string, away: string): boolean {
  const t = fold(text);
  for (const [h, a] of [[fold(home), fold(away)], [keyToken(home), keyToken(away)]]) {
    let from = 0;
    for (let i = 0; i < 12; i++) {
      const idx = t.indexOf(h, from);
      if (idx < 0) break;
      const lo = Math.max(0, idx - 350), hi = Math.min(t.length, idx + h.length + 350);
      if (t.slice(lo, hi).includes(a)) return true;
      from = idx + h.length;
    }
  }
  return false;
}

export async function discoverFixtures(opts: { days: number; perLeague: number; minLeadSec: number; exclude: Set<string> }): Promise<Candidate[]> {
  const now = Math.floor(Date.now() / 1000);
  const start = new Date(now * 1000);
  const end = new Date((now + opts.days * 86_400) * 1000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
  const bbcCache = new Map<string, string>();
  const out: Candidate[] = [];

  for (const [league, slug] of Object.entries(ESPN_SLUGS)) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${ymd(start)}-${ymd(end)}&limit=200`, { headers: ESPN_HEADERS, cache: "no-store" });
    if (!res.ok) continue;
    const data = await res.json();
    let taken = 0;
    const events = [...(data.events ?? [])].sort((a: any, b: any) => Date.parse(a.date) - Date.parse(b.date));
    for (const ev of events) {
      if (taken >= opts.perLeague) break;
      const comp = ev.competitions?.[0];
      if (comp?.status?.type?.state !== "pre") continue;
      const kickoff = Math.floor(Date.parse(ev.date) / 1000);
      const matchId = `${league.toLowerCase()}-${ev.id}`;
      if (kickoff < now + opts.minLeadSec || opts.exclude.has(matchId)) continue;
      const teams: Record<string, any> = {};
      for (const c of comp.competitors ?? []) teams[c.homeAway] = c.team;
      const date = new Date(kickoff * 1000).toISOString().slice(0, 10);
      if (!bbcCache.has(date)) {
        const page = await fetch(`https://www.bbc.com/sport/football/scores-fixtures/${date}`, { headers: { "User-Agent": ESPN_HEADERS["User-Agent"] }, cache: "no-store" });
        bbcCache.set(date, page.ok ? pageText(await page.text()) : "");
      }
      const text = bbcCache.get(date)!;
      const homes = [BBC_NAMES[teams.home?.displayName], teams.home?.displayName, teams.home?.shortDisplayName].filter(Boolean) as string[];
      const aways = [BBC_NAMES[teams.away?.displayName], teams.away?.displayName, teams.away?.shortDisplayName].filter(Boolean) as string[];
      let pair: [string, string] | null = null;
      for (const h of homes) {
        for (const a of aways) {
          if (!pair && pairingListed(text, h, a)) pair = [h, a];
        }
      }
      if (!pair) continue;
      out.push({ league, espn_event_id: String(ev.id), home: pair[0], away: pair[1], kickoff_ts: kickoff });
      taken++;
    }
  }
  return out.sort((a, b) => a.kickoff_ts - b.kickoff_ts);
}
