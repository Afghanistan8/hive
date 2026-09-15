"use client";

import { useMemo, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { LeaguePills, SportsTabs } from "@/components/hive/sports";
import { TxDialog } from "@/components/hive/TxDialog";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/genlayer/wallet";
import { explorerAddress, HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import { formatGen, shortAddress } from "@/lib/hive/format";
import { useAiCalls, useAllPositions, useUsername } from "@/lib/hive/hooks";
import { aiRecord, buildLeaderboard } from "@/lib/hive/leaderboard";
import { cn } from "@/lib/utils";

const NAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;

export default function LeaderboardPage() {
  const [league, setLeague] = useState("");
  const { address } = useWallet();
  const positions = useAllPositions();
  const aiCalls = useAiCalls();
  const { data: myName } = useUsername(address);
  const [name, setName] = useState("");

  const board = useMemo(() => buildLeaderboard(positions.data ?? [], league), [positions.data, league]);
  const ai = useMemo(() => aiRecord(aiCalls.data ?? [], league), [aiCalls.data, league]);
  const me = address?.toLowerCase();
  const myRank = board.findIndex((s) => s.owner === me);

  return (
    <div>
      <PageHeader
        title="Top predictors"
        subtitle="Ranked by correct picks on settled fixtures, then accuracy, then net GEN. Rebuilt live from every position on-chain — nobody can edit a row."
      />
      <SportsTabs />

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <LeaguePills value={league} onChange={setLeague} />
        <Card className="flex items-center gap-3 px-4 py-3">
          <Sparkles className="h-4 w-4 text-[#d9481f]" />
          <div className="text-sm">
            <b>AI Call record</b>{" "}
            <span className="text-ink/70">
              {ai.settled ? `${ai.correct}/${ai.settled} correct · ${Math.round(ai.accuracy * 100)}%` : `${ai.total} calls, none settled yet`}
            </span>
          </div>
        </Card>
      </div>

      {address && (
        <Card className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm">
            {myName ? <>You appear as <b>{myName}</b></> : <>You appear as <code>{shortAddress(address)}</code> — set a public name for the board.</>}
            {myRank >= 0 && <span className="text-ink/60"> · currently #{myRank + 1}</span>}
          </div>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={myName || "username"} className="w-44" aria-label="Username" />
            <TxDialog
              address={HIVE_SPORTS_ADDRESS}
              method="set_username"
              args={[name]}
              variant="outline"
              disabled={!NAME_RE.test(name)}
              title="Set public username"
              description="Stored on-chain in HiveSports. 3–20 letters, digits, _ - or . — unique across all wallets."
              label={myName ? "Rename" : "Set name"}
            />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0">
        {positions.isLoading && <Loading what="every position" />}
        {positions.error && <div className="p-5"><ErrorBox error={positions.error} /></div>}
        {positions.data && board.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">No predictions {league ? "in this league " : ""}yet — the first pick takes the top spot.</p>
        )}
        {board.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-black/10">
                  <th className="w-14 py-2.5 pl-5">Rank</th>
                  <th className="py-2.5">Predictor</th>
                  <th className="py-2.5 text-center">Picks</th>
                  <th className="py-2.5 text-center">Correct</th>
                  <th className="py-2.5 text-center">Accuracy</th>
                  <th className="py-2.5 text-right">Staked</th>
                  <th className="py-2.5 pr-5 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {board.map((s, i) => (
                  <tr key={s.owner} className={cn("border-b border-black/[0.06] last:border-0", s.owner === me ? "bg-[#ee6a2c]/[0.07]" : "hover:bg-black/[0.03]")}>
                    <td className="py-3 pl-5 font-semibold tabular-nums">
                      {i < 3 ? <span className="inline-flex items-center gap-1"><Trophy className={cn("h-3.5 w-3.5", ["text-[#d9a21f]", "text-[#9a9a9a]", "text-[#b87333]"][i])} />{i + 1}</span> : i + 1}
                    </td>
                    <td className="py-3">
                      <a href={explorerAddress(s.owner)} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                        {s.username || shortAddress(s.owner)}
                      </a>
                      {s.owner === me && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] text-[#f6f3ee]">you</span>}
                      <div className="text-[11px] text-muted-foreground">{[...s.leagues].join(" · ")}</div>
                    </td>
                    <td className="py-3 text-center tabular-nums">{s.picks}{s.open ? <span className="text-ink/50"> ({s.open} open)</span> : null}</td>
                    <td className="py-3 text-center font-semibold tabular-nums">{s.correct}</td>
                    <td className="py-3 text-center tabular-nums">{s.settled ? `${Math.round(s.accuracy * 100)}%` : "—"}</td>
                    <td className="py-3 text-right tabular-nums">{formatGen(s.staked)}</td>
                    <td className={cn("py-3 pr-5 text-right font-semibold tabular-nums", s.net > 0n ? "text-emerald-800" : s.net < 0n ? "text-[#b53a17]" : "text-ink/60")}>
                      {s.net > 0n ? "+" : s.net < 0n ? "−" : ""}{formatGen(s.net < 0n ? -s.net : s.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
