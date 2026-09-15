// Server-side only (Node / GitHub Actions / API route). Never import from client components.

// Server-side writer for the Supabase read-mirror. Uses the service-role key,
// which must only ever live in server env (never NEXT_PUBLIC_*).
// The mirror is a cache for fast page loads — the contracts stay the source of truth.

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const mirrorEnabled = () => Boolean(URL_ && SERVICE_KEY);

export async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<number> {
  if (!mirrorEnabled() || rows.length === 0) return 0;
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`supabase upsert ${table}: ${res.status} ${await res.text()}`);
    written += chunk.length;
  }
  return written;
}

export async function insert(table: string, row: Record<string, unknown>): Promise<void> {
  if (!mirrorEnabled()) return;
  const res = await fetch(`${URL_}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`supabase insert ${table}: ${res.status} ${await res.text()}`);
}
