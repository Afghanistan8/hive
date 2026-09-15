"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, LogOut, RefreshCw, User, Wallet } from "lucide-react";
import { useWallet } from "@/lib/genlayer/wallet";
import { GENLAYER_NETWORK } from "@/lib/genlayer/network";
import { switchToGenLayerNetwork } from "@/lib/genlayer/client";
import { getWalletOption } from "@/lib/genlayer/wallets";
import { STUDIO_URL } from "@/lib/hive/config";
import { error, userRejected } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";

export function AccountPanel() {
  const {
    address, isConnected, isOnCorrectNetwork, isLoading, walletId, walletName, walletIcon,
    requestConnect, disconnectWallet, switchWalletAccount,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isConnected) {
    return (
      <Button variant="gradient" disabled={isLoading} onClick={requestConnect}>
        <Wallet className="mr-2 h-4 w-4" />
        Connect Wallet
      </Button>
    );
  }

  const run = async (fn: () => Promise<unknown>, label: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (err: any) {
      if (/reject/i.test(err?.message ?? "")) userRejected(`${label} cancelled`);
      else error(`${label} failed`, { description: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  const icon = walletIcon ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={walletIcon} alt="" className="h-4 w-4 rounded" />
  ) : (
    <User className="h-4 w-4" />
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="brand-card flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-sm hover:border-black/25">
          {icon}
          <AddressDisplay address={address} maxLength={12} />
          {!isOnCorrectNetwork && <span className="text-xs text-amber-700">wrong network</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="brand-card border sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.03em]">
            {walletIcon && <img src={walletIcon} alt="" className="h-6 w-6 rounded" />}
            {walletName ?? "Wallet"}
          </DialogTitle>
          <DialogDescription>Connected to HIVE on {GENLAYER_NETWORK.chainName}.</DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <div className="brand-card space-y-1 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
            <code className="block break-all text-sm">{address}</code>
          </div>

          {!isOnCorrectNetwork ? (
            <Alert variant="default" className="border-amber-600/25 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>Wrong network</AlertTitle>
              <AlertDescription className="space-y-2">
                <span>Switch {walletName ?? "your wallet"} to {GENLAYER_NETWORK.chainName} to stake and claim.</span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => switchToGenLayerNetwork(getWalletOption(walletId)?.provider ?? undefined), "Network switch")}>
                  Switch network
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> On {GENLAYER_NETWORK.chainName}
            </div>
          )}

          <div className="brand-card space-y-1 p-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Need GEN?</p>
            <p>
              Use the faucet in <a className="underline decoration-ember underline-offset-4" href={STUDIO_URL} target="_blank" rel="noreferrer">GenLayer Studio Next</a>,
              then check your <Link className="underline decoration-ember underline-offset-4" href="/portfolio" onClick={() => setOpen(false)}>portfolio</Link>.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-black/10 pt-4">
            <Button variant="outline" disabled={busy || isLoading} onClick={() => run(switchWalletAccount, "Account switch")}>
              <RefreshCw className="mr-2 h-4 w-4" /> Switch account
            </Button>
            <Button
              variant="outline"
              disabled={busy || isLoading}
              onClick={() => {
                disconnectWallet();
                setOpen(false);
                requestConnect();
              }}
            >
              <Wallet className="mr-2 h-4 w-4" /> Change wallet
            </Button>
            <Button
              variant="outline"
              className="col-span-2 text-destructive hover:text-destructive"
              disabled={busy || isLoading}
              onClick={() => {
                disconnectWallet();
                setOpen(false);
              }}
            >
              <LogOut className="mr-2 h-4 w-4" /> Disconnect
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
