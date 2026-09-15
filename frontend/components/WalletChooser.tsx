"use client";

import { useState } from "react";
import { ArrowUpRight, Loader2, Wallet } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { GENLAYER_NETWORK } from "@/lib/genlayer/network";
import { INSTALL_LINKS } from "@/lib/genlayer/wallets";
import { error as toastError, userRejected } from "@/lib/utils/toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";

/** The one wallet picker for the whole app: every EIP-6963 wallet the browser announces. */
export function WalletChooser() {
  const { wallets, chooserOpen, setChooserOpen, connectWallet } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const pick = async (id: string) => {
    setPending(id);
    setMessage("");
    try {
      await connectWallet(id);
      setChooserOpen(false);
    } catch (err: any) {
      const text = String(err?.message ?? err);
      if (/reject/i.test(text)) userRejected("Connection cancelled");
      else toastError("Could not connect", { description: text });
      setMessage(text);
    } finally {
      setPending(null);
    }
  };

  const installedNames = new Set(wallets.map((w) => w.name.toLowerCase()));
  const suggestions = INSTALL_LINKS.filter((l) => !installedNames.has(l.name.toLowerCase()));

  return (
    <Dialog open={chooserOpen} onOpenChange={(o) => { setChooserOpen(o); if (!o) setMessage(""); }}>
      <DialogContent className="brand-card border sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-[-0.03em]">Connect a wallet</DialogTitle>
          <DialogDescription>
            HIVE adds and switches your wallet to {GENLAYER_NETWORK.chainName} (chain {parseInt(GENLAYER_NETWORK.chainId, 16)}).
          </DialogDescription>
        </DialogHeader>

        {wallets.length > 0 ? (
          <div className="mt-2 space-y-2">
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w.id)}
                disabled={!!pending}
                className="flex w-full items-center gap-3 rounded-xl border border-black/10 bg-[#f6f3ee]/80 px-4 py-3 text-left transition hover:border-black/30 hover:bg-white disabled:opacity-60"
              >
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" className="h-8 w-8 rounded-lg" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-black/[0.06]"><Wallet className="h-4 w-4" /></span>
                )}
                <span className="flex-1 font-medium">{w.name}</span>
                {pending === w.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-xs text-muted-foreground">Detected</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-ink/75">
            No browser wallet detected. Install one below, then refresh — or open HIVE inside your wallet app&apos;s browser
            (MetaMask, OKX and others work on mobile that way).
          </p>
        )}

        {message && <p className="text-sm text-destructive">{message}</p>}

        {suggestions.length > 0 && (
          <div className="mt-2 border-t border-black/10 pt-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Get a wallet</div>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((l) => (
                <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm hover:border-black/30">
                  {l.name} <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
