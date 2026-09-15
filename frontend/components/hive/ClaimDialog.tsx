"use client";

import { useState } from "react";
import { createClient } from "genlayer-js";
import { ExternalLink } from "lucide-react";
import { GENLAYER_CHAIN } from "@/lib/genlayer/network";
import { getEthereumProvider } from "@/lib/genlayer/client";
import { useWallet } from "@/lib/genlayer/wallet";
import { explorerTx } from "@/lib/hive/config";
import { formatGen } from "@/lib/hive/format";
import { useInvalidateHive } from "@/lib/hive/hooks";
import { pushTxLog } from "@/lib/hive/txlog";
import { error, success } from "@/lib/utils/toast";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

interface ClaimDialogProps {
  address: string;
  method: "claim" | "refund";
  args: unknown[];
  amount: bigint;
  label: string;
}

type Step = "idle" | "quoting" | "ready" | "signing" | "tracking" | "done" | "failed";

/**
 * Claims pay out by emitting a value-transfer message from the contract. On
 * GenLayer the transaction that emits it must budget that message
 * (`fees.messageAllocations`), which Transaction Kit 0.1.0-rc.2 cannot pass
 * yet. So claims use genlayer-js directly: Studio simulates the call and
 * returns the exact fee preset, including the message allocation.
 */
export function ClaimDialog({ address, method, args, amount, label }: ClaimDialogProps) {
  const { address: account, isConnected, requestConnect } = useWallet();
  const invalidate = useInvalidateHive();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [quote, setQuote] = useState<any>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const client = () =>
    createClient({ chain: GENLAYER_CHAIN, provider: getEthereumProvider() as any, account: account as `0x${string}` } as any) as any;

  const fetchQuote = async () => {
    setStep("quoting");
    setMessage("");
    try {
      const q = await Promise.race([
        client().estimateTransactionFeesForWrite({ address, functionName: method, args, value: 0n }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Studio did not return a fee quote within 30 s")), 30_000)),
      ]);
      setQuote(q);
      setStep("ready");
    } catch (e: any) {
      // Claims need the simulated preset (it budgets the payout message), so never fall back to a guess.
      setMessage(`Could not simulate this ${method}: ${e?.shortMessage || e?.message || String(e)}. Nothing was sent — press Retry.`);
      setStep("failed");
    }
  };

  const submit = async () => {
    if (!quote) return;
    setStep("signing");
    try {
      const c = client();
      const txHash = await c.writeContract({
        address,
        functionName: method,
        args,
        value: 0n,
        fees: { distribution: quote.distribution, messageAllocations: quote.messageAllocations, feeValue: quote.feeValue },
      });
      setHash(txHash);
      setStep("tracking");
      const receipt = await c.waitForTransactionReceipt({ hash: txHash, waitUntil: "decided", retries: 200, interval: 3000 });
      const ok = receipt.txExecutionResultName === "FINISHED_WITH_RETURN";
      pushTxLog({ hash: txHash, label: `${method}(${args.map(String).join(", ")})`, at: Date.now(), ok });
      invalidate();
      if (ok) {
        success("Claim decided", { description: `${formatGen(amount)} GEN is sent to your wallet when the transaction finalizes.` });
        setStep("done");
      } else {
        setMessage(`Execution: ${receipt.txExecutionResultName}`);
        setStep("failed");
      }
    } catch (e: any) {
      const text = e?.shortMessage || e?.message || String(e);
      setMessage(text);
      setStep("failed");
      if (!/reject/i.test(text)) error("Claim failed", { description: text });
    }
  };

  if (!isConnected) {
    return <Button variant="gradient" onClick={requestConnect}>Connect wallet</Button>;
  }

  const messageBudget = (quote?.messageAllocations ?? []).reduce((s: bigint, a: any) => s + BigInt(a.budget ?? 0), 0n);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void fetchQuote(); else { setStep("idle"); setHash(null); } }}>
      <DialogTrigger asChild>
        <Button variant="gradient">{label}</Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{method === "refund" ? "Refund stake" : "Claim winnings"}</DialogTitle>
          <DialogDescription>
            The contract transfers {formatGen(amount)} GEN to your wallet. Fees are simulated by the network for this exact call.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Row label="You receive" value={`${formatGen(amount)} GEN`} />
          {quote && (
            <>
              <Row label="Fee deposit" value={`${formatGen(quote.feeValue, 4)} GEN`} />
              <Row label="  incl. payout message budget" value={`${formatGen(messageBudget, 4)} GEN`} />
              <p className="text-xs text-muted-foreground">Unused fees are refunded after execution.</p>
            </>
          )}
          {step === "quoting" && <p className="text-muted-foreground">Simulating the claim on {GENLAYER_CHAIN.name}…</p>}
          {step === "signing" && <p className="text-muted-foreground">Confirm in your wallet…</p>}
          {step === "tracking" && <p className="text-muted-foreground">Waiting for validators to decide…</p>}
          {step === "done" && <p className="text-emerald-700">Decided. The payout is delivered on finalization.</p>}
          {message && <p className="break-words text-destructive">{message}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="gradient" className="flex-1" disabled={step !== "ready"} onClick={submit}>Sign &amp; {method}</Button>
          {step === "failed" && <Button variant="outline" onClick={fetchQuote}>Retry</Button>}
        </div>
        {hash && (
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            View transaction on explorer <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground whitespace-pre">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
