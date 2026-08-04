"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
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
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

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
    <button
      type="button"
      onClick={() => setVisible(true)}
      className={
        compact
          ? "rounded-full bg-[#3dd6c6] px-3 py-1.5 text-xs font-semibold text-[#04141a]"
          : "rounded-md bg-[#3dd6c6] px-5 py-3 text-sm font-semibold text-[#04141a] transition hover:bg-[#6ee4d6]"
      }
    >
      {label}
    </button>
  );
}
