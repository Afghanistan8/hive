import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 pb-24 pt-40 text-center">
      <p className="text-sm uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Nothing on-chain here</h1>
      <p className="mt-4 text-muted-foreground">
        The contracts don&apos;t know this fixture or market. It may have a different id, or it was never registered.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/sports" className="rounded-full bg-ink px-5 py-2 text-sm text-[#f6f3ee]">Fixtures</Link>
        <Link href="/crypto" className="rounded-full border border-black/15 px-5 py-2 text-sm">Crypto markets</Link>
      </div>
    </main>
  );
}
