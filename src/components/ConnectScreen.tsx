"use client";

import { WalletButton } from "@/components/WalletButton";

type Props = {
  connected: boolean;
  isBooting: boolean;
  error: string | null;
  onEnableInbox: () => void;
};

export function ConnectScreen({
  connected,
  isBooting,
  error,
  onEnableInbox,
}: Props) {
  return (
    <section className="relative flex min-h-dvh flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(61,214,198,0.18),transparent_45%),radial-gradient(ellipse_at_85%_15%,rgba(153,69,255,0.16),transparent_40%),linear-gradient(165deg,#061016_0%,#0b1c24_48%,#10262f_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between px-6 py-8 sm:px-10 sm:py-12">
        <header className="flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-sm tracking-[0.28em] text-teal-200/80 uppercase">
            Telegrum
          </p>
          <WalletButton compact />
        </header>

        <div className="max-w-xl space-y-6 py-16 sm:py-24">
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[0.95] tracking-tight text-[#f3f7f6] sm:text-7xl">
            Solana-native
            <br />
            encrypted chat.
          </h1>
          <p className="max-w-md text-base leading-relaxed text-teal-50/70 sm:text-lg">
            Your Solana address is your identity. No phone number. DMs, groups,
            replies, and image sharing — end-to-end encrypted in the browser.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!connected ? (
              <WalletButton />
            ) : (
              <button
                type="button"
                onClick={onEnableInbox}
                disabled={isBooting}
                className="rounded-md bg-[#3dd6c6] px-5 py-3 text-sm font-semibold text-[#04141a] transition hover:bg-[#6ee4d6] disabled:cursor-wait disabled:opacity-70"
              >
                {isBooting ? "Unlocking inbox…" : "Enable encrypted inbox"}
              </button>
            )}
          </div>

          {error ? (
            <p className="max-w-md rounded-md border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="grid gap-3 text-xs text-teal-100/45 sm:grid-cols-3">
          <p>Identity = Solana wallet (Phantom / Solflare)</p>
          <p>Messages are E2EE with NaCl before they hit the relay</p>
          <p>Web / PWA first — no App Store gate</p>
        </footer>
      </div>
    </section>
  );
}
