"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GenLayerTransactionPanel, type SubmitInput, type TrackedStatus } from "@genlayer/transaction-kit-react";
import { ExternalLink } from "lucide-react";
import { GENLAYER_NETWORK } from "@/lib/genlayer/network";
import { useTransactionKit } from "@/lib/genlayer/kit";
import { useWallet } from "@/lib/genlayer/wallet";
import { explorerTx } from "@/lib/hive/config";
import { useInvalidateHive } from "@/lib/hive/hooks";
import { pushTxLog } from "@/lib/hive/txlog";
import { error, success } from "@/lib/utils/toast";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

interface TxDialogProps {
  /** Contract address */
  address: string;
  method: string;
  args: unknown[];
  /** Native GEN (wei) sent with a payable call */
  value?: bigint;
  title: string;
  description: ReactNode;
  label: ReactNode;
  disabled?: boolean;
  variant?: "gradient" | "outline" | "secondary" | "default" | "blue";
  size?: "default" | "sm" | "lg";
  className?: string;
  onSuccess?: () => void;
}

/**
 * Wraps the official Transaction Kit panel: live fee quote from the network's
 * fee policy, hold-to-sign in the wallet, then tracking until decided.
 */
export function TxDialog({
  address, method, args, value, title, description, label, disabled, variant = "gradient", size, className, onSuccess,
}: TxDialogProps) {
  const { address: account, isConnected, isOnCorrectNetwork, connectWallet } = useWallet();
  const kit = useTransactionKit(account);
  const invalidate = useInvalidateHive();
  const [open, setOpen] = useState(false);
  const [lastHash, setLastHash] = useState<string | null>(null);
  // Stable identity: the panel re-estimates whenever `tx` changes.
  const tx = useMemo<SubmitInput>(
    () => ({ kind: "write", address: address as `0x${string}`, method, args }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, method, JSON.stringify(args)],
  );

  const handleDone = (status: TrackedStatus) => {
    const hash = status.genlayerTxId ?? "";
    setLastHash(hash || null);
    const ok = status.successful !== false && status.executionResultName !== "FINISHED_WITH_ERROR";
    if (hash) pushTxLog({ hash, label: `${method}(${args.map(String).join(", ")})`, at: Date.now(), ok });
    invalidate();
    if (ok) {
      success(`${title} confirmed`, { description: "Decided by GenLayer consensus." });
      onSuccess?.();
    } else {
      error(`${title} did not succeed`, {
        description: status.executionResultName
          ? `Execution: ${status.executionResultName}. The contract rejected the call — check the rules shown on this page.`
          : "The transaction completed without a successful outcome.",
      });
    }
  };

  if (!isConnected) {
    return (
      <Button variant={variant} size={size} className={className} disabled={disabled} onClick={() => connectWallet().catch(() => undefined)}>
        Connect wallet
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLastHash(null); }}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className} disabled={disabled || !kit || !address}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{description}</div>
          </DialogDescription>
        </DialogHeader>
        {!isOnCorrectNetwork && (
          <p className="text-sm text-yellow-400">Your wallet is not on {GENLAYER_NETWORK.chainName}. Reconnect to switch networks.</p>
        )}
        {kit && open ? (
          <GenLayerTransactionPanel
            kit={kit}
            tx={tx}
            userValue={value}
            network={GENLAYER_NETWORK.chainName}
            theme="dark"
            trackUntil="decided"
            onDone={handleDone}
          />
        ) : null}
        {lastHash && (
          <a href={explorerTx(lastHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
            View transaction on explorer <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
