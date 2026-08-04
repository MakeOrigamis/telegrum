"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { shortenAddress } from "@/lib/format";

type Props = {
  label?: string;
  compact?: boolean;
  onDisconnect?: () => void;
};

export function WalletButton({
  label = "Connect Solana wallet",
  compact = false,
  onDisconnect,
}: Props) {
  const { publicKey, connected, connecting, disconnect, select, connect, wallets } =
    useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setError(null);

    const installed = wallets.filter(
      (wallet) => wallet.readyState === WalletReadyState.Installed,
    );

    if (installed.length === 0) {
      setVisible(true);
      return;
    }

    if (installed.length > 1) {
      setVisible(true);
      return;
    }

    try {
      select(installed[0].adapter.name);
      await connect();
    } catch {
      // adapter needs a tick after select on first connect; modal is the fallback
      setVisible(true);
    }
  }, [connect, select, setVisible, wallets]);

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={async () => {
          onDisconnect?.();
          await disconnect();
        }}
        className={
          compact
            ? "rounded-full border border-white/10 px-3 py-1.5 font-mono text-xs text-teal-100/70 transition hover:bg-white/5"
            : "rounded-md border border-white/15 px-4 py-2.5 font-mono text-sm text-teal-50 transition hover:bg-white/5"
        }
        title="Disconnect"
      >
        {shortenAddress(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <div className={compact ? "flex flex-col items-end gap-1" : "space-y-2"}>
      <button
        type="button"
        disabled={connecting}
        onClick={() => void handleConnect()}
        className={
          compact
            ? "rounded-full bg-[#3dd6c6] px-3 py-1.5 text-xs font-semibold text-[#04141a] disabled:opacity-60"
            : "rounded-md bg-[#3dd6c6] px-5 py-3 text-sm font-semibold text-[#04141a] transition hover:bg-[#6ee4d6] disabled:opacity-60"
        }
      >
        {connecting ? "Connecting…" : label}
      </button>
      {error ? (
        <p className="max-w-[240px] text-right text-[11px] text-orange-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
