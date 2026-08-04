import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import path from "path";
import type { ChatMessage, Conversation, Profile } from "@/lib/types";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const localRoot = path.join(process.cwd(), ".data");

function ensureLocal() {
  if (!existsSync(localRoot)) mkdirSync(localRoot, { recursive: true });
}

let blobError: string | null = null;

async function blobStore() {
  try {
    const { getStore } = await import("@netlify/blobs");
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

    // On Netlify the context is injected automatically; the explicit
    // credentials are the fallback for when it is not.
    const store =
      siteID && token
        ? getStore({ name: "telegrum", siteID, token, consistency: "strong" })
        : getStore({ name: "telegrum", consistency: "strong" });

    blobError = null;
    return store;
  } catch (error) {
    blobError = error instanceof Error ? error.message : String(error);
    // The filesystem fallback is per-container and disappears between
    // invocations, so on Netlify a silent fallback would look like data loss.
    if (process.env.NETLIFY) throw new Error(`Blob store unavailable: ${blobError}`);
    return null;
  }
}

export async function storageDiagnostics() {
  const probeKey = `health/${Date.now()}`;
  try {
    const store = await blobStore();
    if (!store) {
      return { backend: "filesystem", ok: true, netlify: Boolean(process.env.NETLIFY) };
    }
    await store.setJSON(probeKey, { ping: true });
    const read = await store.get(probeKey, { type: "json" });
    await store.delete(probeKey);
    return {
      backend: "netlify-blobs",
      ok: (read as { ping?: boolean } | null)?.ping === true,
      netlify: Boolean(process.env.NETLIFY),
    };
  } catch (error) {
    return {
      backend: "netlify-blobs",
      ok: false,
      netlify: Boolean(process.env.NETLIFY),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getJson<T>(key: string): Promise<T | null> {
  const store = await blobStore();
  if (store) {
    const value = await store.get(key, { type: "json" });
    return (value as T) ?? null;
  }

  ensureLocal();
  const file = path.join(localRoot, `${key.replaceAll("/", "__")}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

async function setJson(key: string, value: Json) {
  const store = await blobStore();
  if (store) {
    await store.setJSON(key, value);
    return;
  }

  ensureLocal();
  const file = path.join(localRoot, `${key.replaceAll("/", "__")}.json`);
  writeFileSync(file, JSON.stringify(value));
}

async function listPrefix(prefix: string) {
  const store = await blobStore();
  if (store) {
    const { blobs } = await store.list({ prefix });
    return blobs.map((blob) => blob.key);
  }

  ensureLocal();
  const needle = prefix.replaceAll("/", "__");
  return readdirSync(localRoot)
    .filter((name) => name.startsWith(needle) && name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length).replaceAll("__", "/"));
}

export async function getProfile(pubkey: string) {
  return getJson<Profile>(`profiles/${pubkey}`);
}

export async function saveProfile(profile: Profile) {
  await setJson(`profiles/${profile.pubkey}`, profile);
  return profile;
}

export async function getConversation(id: string) {
  return getJson<Conversation>(`conversations/${id}`);
}

export async function saveConversation(conversation: Conversation) {
  await setJson(`conversations/${conversation.id}`, conversation);
  for (const member of conversation.memberPubkeys) {
    const indexKey = `index/${member}/conversations`;
    const existing = (await getJson<string[]>(indexKey)) || [];
    if (!existing.includes(conversation.id)) {
      existing.push(conversation.id);
      await setJson(indexKey, existing);
    }
  }
  return conversation;
}

export async function listConversationsFor(pubkey: string) {
  const ids = (await getJson<string[]>(`index/${pubkey}/conversations`)) || [];
  const conversations = await Promise.all(ids.map((id) => getConversation(id)));
  return conversations
    .filter((item): item is Conversation => Boolean(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listMessages(conversationId: string) {
  return (await getJson<ChatMessage[]>(`messages/${conversationId}`)) || [];
}

export async function appendMessage(message: ChatMessage) {
  const existing = await listMessages(message.conversationId);
  existing.push(message);
  await setJson(`messages/${message.conversationId}`, existing);

  const conversation = await getConversation(message.conversationId);
  if (conversation) {
    conversation.updatedAt = message.createdAt;
    conversation.lastMessagePreview =
      message.kind === "image" ? "Photo" : "Encrypted message";
    await setJson(`conversations/${conversation.id}`, conversation);
  }

  return message;
}

export async function saveMedia(id: string, contentType: string, dataBase64: string) {
  await setJson(`media/${id}`, { contentType, dataBase64 });
  return id;
}

export async function getMedia(id: string) {
  return getJson<{ contentType: string; dataBase64: string }>(`media/${id}`);
}

export async function listProfilesByPrefix(_prefix = "") {
  const keys = await listPrefix("profiles/");
  const profiles = await Promise.all(
    keys.map((key) => getJson<Profile>(key)),
  );
  return profiles.filter((item): item is Profile => Boolean(item));
}
