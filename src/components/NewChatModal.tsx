"use client";

import { useState, type FormEvent } from "react";
import { isSolanaAddress } from "@/lib/format";

type Props = {
  open: boolean;
  mode: "dm" | "group";
  busy: boolean;
  onClose: () => void;
  onStartDm: (address: string) => Promise<void>;
  onStartGroup: (title: string, members: string[]) => Promise<void>;
};

export function NewChatModal({
  open,
  mode,
  busy,
  onClose,
  onStartDm,
  onStartGroup,
}: Props) {
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      if (mode === "dm") {
        const address = value.trim();
        if (!isSolanaAddress(address)) {
          setError("Enter a valid Solana address.");
          return;
        }
        await onStartDm(address);
      } else {
        const members = value
          .split(/[\n, ]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (!title.trim()) {
          setError("Give the group a name.");
          return;
        }
        if (members.length < 1 || members.some((item) => !isSolanaAddress(item))) {
          setError("Add at least one valid Solana address.");
          return;
        }
        await onStartGroup(title.trim(), members);
      }
      setValue("");
      setTitle("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start chat");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1c22] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[#f3f7f6]">
              {mode === "dm" ? "New message" : "New group"}
            </h2>
            <p className="mt-1 text-sm text-teal-100/55">
              {mode === "dm"
                ? "Chat any Solana wallet that has opened Telegrum."
                : "Create an encrypted group with Solana addresses."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-teal-100/50 transition hover:text-teal-50"
          >
            Close
          </button>
        </div>

        {mode === "group" ? (
          <label className="mb-3 block text-xs tracking-wide text-teal-100/50 uppercase">
            Group name
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Degens"
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-[#f3f7f6] outline-none focus:ring-2 focus:ring-[#3dd6c6]/50"
            />
          </label>
        ) : null}

        <label className="block text-xs tracking-wide text-teal-100/50 uppercase">
          {mode === "dm" ? "Recipient address" : "Member addresses"}
          <textarea
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={mode === "dm" ? 2 : 4}
            placeholder={
              mode === "dm"
                ? "So1111… or any Solana pubkey"
                : "Paste addresses separated by commas or new lines"
            }
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 font-mono text-sm text-[#f3f7f6] outline-none focus:ring-2 focus:ring-[#3dd6c6]/50"
          />
        </label>

        {error ? <p className="mt-3 text-sm text-orange-200">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-[#3dd6c6] px-4 py-3 text-sm font-semibold text-[#04141a] transition hover:bg-[#6ee4d6] disabled:opacity-60"
        >
          {busy
            ? "Opening…"
            : mode === "dm"
              ? "Start encrypted DM"
              : "Create group"}
        </button>
      </form>
    </div>
  );
}
