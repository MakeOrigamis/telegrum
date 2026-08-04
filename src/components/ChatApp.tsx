"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { ConnectScreen } from "@/components/ConnectScreen";
import { NewChatModal } from "@/components/NewChatModal";
import { WalletButton } from "@/components/WalletButton";
import { useTelegrum } from "@/hooks/useTelegrum";
import {
  displayName,
  formatListTime,
  formatMessageTime,
  shortenAddress,
} from "@/lib/format";

export function ChatApp() {
  const app = useTelegrum();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [modal, setModal] = useState<"dm" | "group" | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return app.conversations;
    return app.conversations.filter((conversation) => {
      const title = app.conversationTitle(conversation).toLowerCase();
      return (
        title.includes(needle) ||
        conversation.memberPubkeys.some((member) =>
          member.toLowerCase().includes(needle),
        )
      );
    });
  }, [app, search]);

  const replyTarget = app.messages.find((message) => message.id === replyToId);

  if (!app.ready) {
    return (
      <ConnectScreen
        connected={app.connected}
        isBooting={app.isBooting}
        error={app.error}
        onEnableInbox={app.enableInbox}
      />
    );
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await app.sendText(draft, replyToId || undefined);
      setDraft("");
      setReplyToId(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-1 bg-[#071116] text-[#eef6f4]">
      <aside
        className={`w-full border-r border-white/8 bg-[#0a161c] sm:w-[340px] lg:w-[380px] ${
          mobileThreadOpen ? "hidden sm:flex" : "flex"
        } flex-col`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4">
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-lg tracking-wide">
              Telegrum
            </p>
            <p className="truncate text-xs text-teal-100/45">
              {displayName(app.profile)} · Solana
              {app.isSyncing ? " · syncing" : ""}
            </p>
          </div>
          <WalletButton compact onDisconnect={() => void app.disconnectWallet()} />
        </div>

        <div className="space-y-2 border-b border-white/8 px-4 py-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#3dd6c6]/40"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModal("dm")}
              className="rounded-lg bg-[#3dd6c6] px-3 py-2.5 text-sm font-semibold text-[#04141a]"
            >
              New DM
            </button>
            <button
              type="button"
              onClick={() => setModal("group")}
              className="rounded-lg border border-white/10 px-3 py-2.5 text-sm text-teal-100/80 transition hover:bg-white/5"
            >
              New group
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingName(true);
              setNameDraft(app.profile?.displayName || "");
            }}
            className="w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-teal-100/55 transition hover:bg-white/5"
          >
            Set display name · {shortenAddress(app.pubkey)}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-sm leading-relaxed text-teal-100/45">
              No chats yet. Start a DM or group with any Solana wallet that has
              enabled Telegrum.
            </div>
          ) : (
            filtered.map((conversation) => {
              const selected = conversation.id === app.activeId;
              const title = app.conversationTitle(conversation);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    app.setActiveId(conversation.id);
                    setMobileThreadOpen(true);
                  }}
                  className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3.5 text-left transition ${
                    selected ? "bg-[#123039]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#9945FF,#14F195)] text-sm font-semibold text-[#04141a]">
                    {title.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">
                        {title}
                        {conversation.type === "group" ? (
                          <span className="ml-2 text-[10px] tracking-wide text-teal-100/40 uppercase">
                            group
                          </span>
                        ) : null}
                      </p>
                      <span className="shrink-0 text-[11px] text-teal-100/40">
                        {formatListTime(new Date(conversation.updatedAt))}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-teal-100/45">
                      {conversation.lastMessagePreview || "No messages yet"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <main
        className={`min-w-0 flex-1 flex-col ${
          mobileThreadOpen ? "flex" : "hidden sm:flex"
        }`}
      >
        {app.activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-white/8 px-4 py-4">
              <button
                type="button"
                className="text-sm text-teal-100/60 sm:hidden"
                onClick={() => setMobileThreadOpen(false)}
              >
                Back
              </button>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {app.conversationTitle(app.activeConversation)}
                </p>
                <p className="truncate font-mono text-xs text-teal-100/40">
                  {app.activeConversation.type === "group"
                    ? `${app.activeConversation.memberPubkeys.length} members`
                    : app.activeConversation.memberPubkeys.find(
                        (item) => item !== app.pubkey,
                      )}
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
              {app.messages.map((message) => {
                const reply = message.replyToId
                  ? app.messages.find((item) => item.id === message.replyToId)
                  : null;
                return (
                  <div
                    key={message.id}
                    className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[70%] ${
                        message.fromMe
                          ? "rounded-br-md bg-[#1f6f68] text-[#f4fffd]"
                          : "rounded-bl-md bg-[#15242b] text-[#e8f2ef]"
                      }`}
                    >
                      {!message.fromMe &&
                      app.activeConversation?.type === "group" ? (
                        <p className="mb-1 text-[11px] font-medium text-[#14F195]/80">
                          {displayName(app.profiles[message.sender]) ||
                            shortenAddress(message.sender)}
                        </p>
                      ) : null}

                      {reply ? (
                        <div className="mb-2 rounded-md border-l-2 border-[#3dd6c6]/70 bg-black/20 px-2 py-1 text-xs opacity-80">
                          {reply.text || (reply.mediaUrl ? "Photo" : "Message")}
                        </div>
                      ) : null}

                      {message.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.mediaUrl}
                          alt={message.text || "Shared image"}
                          className="mb-2 max-h-72 rounded-lg object-cover"
                        />
                      ) : null}

                      {message.text ? (
                        <p className="whitespace-pre-wrap break-words">
                          {message.text}
                        </p>
                      ) : null}

                      <div className="mt-1 flex items-center justify-end gap-3 text-[10px] opacity-55">
                        <button
                          type="button"
                          onClick={() => setReplyToId(message.id)}
                          className="hover:opacity-100"
                        >
                          Reply
                        </button>
                        <span>
                          {formatMessageTime(new Date(message.createdAt))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {replyTarget ? (
              <div className="flex items-center justify-between border-t border-white/8 bg-[#0d1a20] px-4 py-2 text-xs text-teal-100/60">
                <p className="truncate">
                  Replying to:{" "}
                  {replyTarget.text || (replyTarget.mediaUrl ? "Photo" : "Message")}
                </p>
                <button type="button" onClick={() => setReplyToId(null)}>
                  Cancel
                </button>
              </div>
            ) : null}

            <form
              onSubmit={handleSend}
              className="flex items-end gap-2 border-t border-white/8 px-4 py-3"
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setSending(true);
                  try {
                    await app.sendImage(file, draft, replyToId || undefined);
                    setDraft("");
                    setReplyToId(null);
                  } catch (err) {
                    alert(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setSending(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-white/10 px-3 py-2.5 text-sm text-teal-100/70"
                title="Send image"
              >
                Img
              </button>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={1}
                placeholder="Message…"
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#3dd6c6]/40"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="rounded-xl bg-[#3dd6c6] px-4 py-2.5 text-sm font-semibold text-[#04141a] disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-[family-name:var(--font-display)] text-3xl text-[#f3f7f6]">
              Pick a chat
            </p>
            <p className="max-w-sm text-sm text-teal-100/50">
              Start an encrypted DM or group with any Solana address on Telegrum.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setModal("dm")}
                className="rounded-lg bg-[#3dd6c6] px-4 py-2.5 text-sm font-semibold text-[#04141a]"
              >
                New DM
              </button>
              <button
                type="button"
                onClick={() => setModal("group")}
                className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-teal-100/80"
              >
                New group
              </button>
            </div>
          </div>
        )}
      </main>

      <NewChatModal
        open={modal !== null}
        mode={modal || "dm"}
        busy={busy}
        onClose={() => setModal(null)}
        onStartDm={async (address) => {
          setBusy(true);
          try {
            await app.startDm(address);
            setMobileThreadOpen(true);
          } finally {
            setBusy(false);
          }
        }}
        onStartGroup={async (title, members) => {
          setBusy(true);
          try {
            await app.startGroup(title, members);
            setMobileThreadOpen(true);
          } finally {
            setBusy(false);
          }
        }}
      />

      {editingName ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <form
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d1c22] p-5"
            onSubmit={async (event) => {
              event.preventDefault();
              await app.updateDisplayName(nameDraft);
              setEditingName(false);
            }}
          >
            <h2 className="font-[family-name:var(--font-display)] text-lg">
              Display name
            </h2>
            <input
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[#3dd6c6]/40"
              placeholder="Optional nickname"
              maxLength={32}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-[#3dd6c6] px-3 py-2 text-sm font-semibold text-[#04141a]"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
