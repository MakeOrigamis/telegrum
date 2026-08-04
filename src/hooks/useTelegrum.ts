"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { apiFetch } from "@/lib/api";
import {
  decodeKey,
  decryptPayload,
  deriveBoxKeyPair,
  encodeKey,
  encryptPayload,
  encryptionMessage,
  randomConversationKey,
  unwrapConversationKey,
  wrapConversationKey,
} from "@/lib/crypto";
import { displayName, shortenAddress } from "@/lib/format";
import type {
  ChatMessage,
  Conversation,
  DecryptedMessage,
  KeyWrap,
  Profile,
} from "@/lib/types";

const TOKEN_KEY = "telegrum.session";
const SECRET_KEY = "telegrum.boxSecret";

type BoxKeys = {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
};

export function useTelegrum() {
  const { publicKey, connected, signMessage, disconnect } = useWallet();
  const pubkey = publicKey?.toBase58() ?? null;

  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [boxKeys, setBoxKeys] = useState<BoxKeys | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [isBooting, setIsBooting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationKeys = useRef<Record<string, Uint8Array>>({});

  const activeConversation =
    conversations.find((item) => item.id === activeId) ?? null;

  const reset = useCallback(() => {
    setToken(null);
    setProfile(null);
    setBoxKeys(null);
    setConversations([]);
    setMessages([]);
    setActiveId(null);
    conversationKeys.current = {};
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(SECRET_KEY);
    }
  }, []);

  const ensureConversationKey = useCallback(
    async (conversation: Conversation, keys: BoxKeys) => {
      if (conversationKeys.current[conversation.id]) {
        return conversationKeys.current[conversation.id];
      }
      const wrap = conversation.keyWraps[pubkey || ""];
      if (!wrap) throw new Error("No key wrap for this wallet");
      const key = unwrapConversationKey(
        wrap,
        decodeKey(wrap.fromBoxPublicKey),
        keys.secretKey,
      );
      conversationKeys.current[conversation.id] = key;
      return key;
    },
    [pubkey],
  );

  const refreshConversations = useCallback(async (sessionToken: string) => {
    setIsSyncing(true);
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>(
        "/api/conversations",
        { token: sessionToken },
      );
      setConversations(data.conversations);

      const missing = Array.from(
        new Set(data.conversations.flatMap((item) => item.memberPubkeys)),
      );
      const nextProfiles: Record<string, Profile> = {};
      await Promise.all(
        missing.map(async (member) => {
          try {
            const result = await apiFetch<{ profile: Profile }>(
              `/api/profile?pubkey=${member}`,
            );
            nextProfiles[member] = result.profile;
          } catch {
            // peer may not be indexed yet
          }
        }),
      );
      setProfiles((prev) => ({ ...prev, ...nextProfiles }));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const refreshMessages = useCallback(
    async (conversation: Conversation, sessionToken: string, keys: BoxKeys) => {
      const data = await apiFetch<{
        messages: ChatMessage[];
        conversation: Conversation;
      }>(`/api/conversations/${conversation.id}/messages`, {
        token: sessionToken,
      });

      const conversationKey = await ensureConversationKey(
        data.conversation,
        keys,
      );

      const decrypted: DecryptedMessage[] = data.messages.map((message) => {
        let text = "";
        let mediaUrl: string | undefined;
        try {
          const plain = decryptPayload(message, conversationKey);
          if (message.kind === "image") {
            const parsed = JSON.parse(plain) as { url: string; caption?: string };
            mediaUrl = parsed.url;
            text = parsed.caption || "";
          } else {
            text = plain;
          }
        } catch {
          text = "[unable to decrypt]";
        }

        return {
          id: message.id,
          conversationId: message.conversationId,
          sender: message.sender,
          kind: message.kind,
          text,
          mediaUrl,
          replyToId: message.replyToId,
          createdAt: message.createdAt,
          fromMe: message.sender === pubkey,
        };
      });

      setMessages(decrypted);
    },
    [ensureConversationKey, pubkey],
  );

  const enableInbox = useCallback(async () => {
    if (!pubkey || !signMessage) return;
    setIsBooting(true);
    setError(null);

    try {
      const challenge = await apiFetch<{ message: string }>("/api/auth/challenge", {
        method: "POST",
        body: JSON.stringify({ pubkey }),
      });

      const authSignature = await signMessage(
        new TextEncoder().encode(challenge.message),
      );

      const encryptionSig = await signMessage(
        new TextEncoder().encode(encryptionMessage(pubkey)),
      );
      const keys = await deriveBoxKeyPair(encryptionSig);
      setBoxKeys(keys);
      localStorage.setItem(SECRET_KEY, encodeKey(keys.secretKey));

      const verified = await apiFetch<{ token: string; profile: Profile }>(
        "/api/auth/verify",
        {
          method: "POST",
          body: JSON.stringify({
            pubkey,
            message: challenge.message,
            signature: bs58.encode(authSignature),
            boxPublicKey: encodeKey(keys.publicKey),
          }),
        },
      );

      localStorage.setItem(TOKEN_KEY, verified.token);
      setToken(verified.token);
      setProfile(verified.profile);
      setProfiles((prev) => ({ ...prev, [pubkey]: verified.profile }));
      await refreshConversations(verified.token);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enable inbox";
      setError(message);
      reset();
    } finally {
      setIsBooting(false);
    }
  }, [pubkey, refreshConversations, reset, signMessage]);

  useEffect(() => {
    if (!connected || !pubkey) {
      reset();
      return;
    }

    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedSecret = localStorage.getItem(SECRET_KEY);
    if (!savedToken || !savedSecret) return;

    (async () => {
      try {
        const secretKey = decodeKey(savedSecret);
        const publicKeyBytes = (
          await import("tweetnacl")
        ).default.box.keyPair.fromSecretKey(secretKey).publicKey;
        setBoxKeys({ publicKey: publicKeyBytes, secretKey });
        setToken(savedToken);
        await refreshConversations(savedToken);
        const me = await apiFetch<{ profile: Profile }>(
          `/api/profile?pubkey=${pubkey}`,
        );
        setProfile(me.profile);
      } catch {
        reset();
      }
    })();
  }, [connected, pubkey, refreshConversations, reset]);

  useEffect(() => {
    if (!token || !boxKeys || !activeConversation) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        await refreshMessages(activeConversation, token, boxKeys);
      } catch (err) {
        if (!cancelled) console.error(err);
      }
    };

    void tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [activeConversation, boxKeys, refreshMessages, token]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => {
      void refreshConversations(token);
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshConversations, token]);

  const startDm = useCallback(
    async (peerPubkey: string) => {
      if (!token || !boxKeys || !pubkey) throw new Error("Inbox not ready");

      const peer = await apiFetch<{ profile: Profile }>(
        `/api/profile?pubkey=${peerPubkey}`,
      );
      const conversationKey = randomConversationKey();
      const members = [pubkey, peer.profile.pubkey];
      const keyWraps: Record<string, KeyWrap> = {};

      for (const member of members) {
        const memberProfile =
          member === pubkey
            ? { boxPublicKey: encodeKey(boxKeys.publicKey) }
            : peer.profile;
        keyWraps[member] = wrapConversationKey(
          conversationKey,
          decodeKey(memberProfile.boxPublicKey),
          boxKeys.secretKey,
          boxKeys.publicKey,
        );
      }

      const created = await apiFetch<{ conversation: Conversation }>(
        "/api/conversations",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            type: "dm",
            memberPubkeys: [peer.profile.pubkey],
            keyWraps,
          }),
        },
      );

      conversationKeys.current[created.conversation.id] = conversationKey;
      setProfiles((prev) => ({ ...prev, [peer.profile.pubkey]: peer.profile }));
      await refreshConversations(token);
      setActiveId(created.conversation.id);
      return created.conversation;
    },
    [boxKeys, pubkey, refreshConversations, token],
  );

  const startGroup = useCallback(
    async (title: string, memberPubkeys: string[]) => {
      if (!token || !boxKeys || !pubkey) throw new Error("Inbox not ready");

      const unique = Array.from(new Set(memberPubkeys.filter(Boolean)));
      const conversationKey = randomConversationKey();
      const keyWraps: Record<string, KeyWrap> = {
        [pubkey]: wrapConversationKey(
          conversationKey,
          boxKeys.publicKey,
          boxKeys.secretKey,
          boxKeys.publicKey,
        ),
      };

      for (const member of unique) {
        const peer = await apiFetch<{ profile: Profile }>(
          `/api/profile?pubkey=${member}`,
        );
        keyWraps[member] = wrapConversationKey(
          conversationKey,
          decodeKey(peer.profile.boxPublicKey),
          boxKeys.secretKey,
          boxKeys.publicKey,
        );
        setProfiles((prev) => ({ ...prev, [member]: peer.profile }));
      }

      const created = await apiFetch<{ conversation: Conversation }>(
        "/api/conversations",
        {
          method: "POST",
          token,
          body: JSON.stringify({
            type: "group",
            title,
            memberPubkeys: unique,
            keyWraps,
          }),
        },
      );

      conversationKeys.current[created.conversation.id] = conversationKey;
      await refreshConversations(token);
      setActiveId(created.conversation.id);
      return created.conversation;
    },
    [boxKeys, pubkey, refreshConversations, token],
  );

  const sendText = useCallback(
    async (text: string, replyToId?: string) => {
      if (!token || !boxKeys || !activeConversation) return;
      const conversationKey = await ensureConversationKey(
        activeConversation,
        boxKeys,
      );
      const payload = encryptPayload(text, conversationKey);
      await apiFetch(`/api/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({
          kind: "text",
          replyToId,
          ...payload,
        }),
      });
      await refreshMessages(activeConversation, token, boxKeys);
      await refreshConversations(token);
    },
    [
      activeConversation,
      boxKeys,
      ensureConversationKey,
      refreshConversations,
      refreshMessages,
      token,
    ],
  );

  const sendImage = useCallback(
    async (file: File, caption = "", replyToId?: string) => {
      if (!token || !boxKeys || !activeConversation) return;

      const dataUrl = await readFileAsDataUrl(file);
      const [, dataBase64 = ""] = dataUrl.split(",");
      const uploaded = await apiFetch<{ url: string }>("/api/media", {
        method: "POST",
        token,
        body: JSON.stringify({
          contentType: file.type,
          dataBase64,
        }),
      });

      const conversationKey = await ensureConversationKey(
        activeConversation,
        boxKeys,
      );
      const payload = encryptPayload(
        JSON.stringify({ url: uploaded.url, caption }),
        conversationKey,
      );

      await apiFetch(`/api/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify({
          kind: "image",
          replyToId,
          ...payload,
        }),
      });

      await refreshMessages(activeConversation, token, boxKeys);
      await refreshConversations(token);
    },
    [
      activeConversation,
      boxKeys,
      ensureConversationKey,
      refreshConversations,
      refreshMessages,
      token,
    ],
  );

  const updateDisplayName = useCallback(
    async (name: string) => {
      if (!token) return;
      const result = await apiFetch<{ profile: Profile }>("/api/profile", {
        method: "PATCH",
        token,
        body: JSON.stringify({ displayName: name }),
      });
      setProfile(result.profile);
      setProfiles((prev) => ({ ...prev, [result.profile.pubkey]: result.profile }));
    },
    [token],
  );

  const conversationTitle = useCallback(
    (conversation: Conversation) => {
      if (conversation.type === "group") return conversation.title;
      const peer = conversation.memberPubkeys.find((item) => item !== pubkey);
      return displayName(peer ? profiles[peer] : null) || shortenAddress(peer);
    },
    [profiles, pubkey],
  );

  const ready = Boolean(token && boxKeys && profile);

  return useMemo(
    () => ({
      connected,
      pubkey,
      ready,
      isBooting,
      isSyncing,
      error,
      profile,
      conversations,
      profiles,
      activeId,
      activeConversation,
      messages,
      setActiveId,
      enableInbox,
      startDm,
      startGroup,
      sendText,
      sendImage,
      updateDisplayName,
      conversationTitle,
      refreshConversations: token
        ? () => refreshConversations(token)
        : async () => {},
      disconnectWallet: async () => {
        reset();
        await disconnect();
      },
    }),
    [
      activeConversation,
      activeId,
      connected,
      conversationTitle,
      conversations,
      disconnect,
      enableInbox,
      error,
      isBooting,
      isSyncing,
      messages,
      profile,
      profiles,
      pubkey,
      ready,
      refreshConversations,
      reset,
      sendImage,
      sendText,
      startDm,
      startGroup,
      token,
      updateDisplayName,
    ],
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
