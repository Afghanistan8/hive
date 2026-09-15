"use client";

// Remembers the transactions this browser submitted so the portfolio can link
// each one to the explorer. Purely a convenience; the chain is the record.
export interface TxLogEntry {
  hash: string;
  label: string;
  at: number;
  ok?: boolean;
}

const KEY = "hive.txlog.v1";

export function readTxLog(): TxLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function pushTxLog(entry: TxLogEntry) {
  try {
    const next = [entry, ...readTxLog().filter((e) => e.hash !== entry.hash)].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — ignore
  }
}
