import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getBearerToken, verifySessionToken } from "@/lib/session";
import {
  getProfile,
  listConversationsFor,
  saveConversation,
} from "@/lib/store";
import type { Conversation, ConversationType, KeyWrap } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversations = await listConversationsFor(session.pubkey);
  return NextResponse.json({ conversations });
}

export async function POST(request: Request) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const type = (body.type === "group" ? "group" : "dm") as ConversationType;
  const title = String(body.title || "").slice(0, 64);
  const memberPubkeys = Array.from(
    new Set<string>([
      session.pubkey,
      ...((body.memberPubkeys as string[]) || []).map(String),
    ]),
  );
  const keyWraps = (body.keyWraps || {}) as Record<string, KeyWrap>;

  if (type === "dm" && memberPubkeys.length !== 2) {
    return NextResponse.json({ error: "DM needs exactly one peer" }, { status: 400 });
  }
  if (type === "group" && memberPubkeys.length < 2) {
    return NextResponse.json({ error: "Group needs members" }, { status: 400 });
  }

  for (const member of memberPubkeys) {
    if (member === session.pubkey) continue;
    const profile = await getProfile(member);
    if (!profile?.boxPublicKey) {
      return NextResponse.json(
        {
          error: `${member} has not opened Telegrum yet. Ask them to connect once.`,
        },
        { status: 400 },
      );
    }
    if (!keyWraps[member]) {
      return NextResponse.json(
        { error: `Missing key wrap for ${member}` },
        { status: 400 },
      );
    }
  }

  if (!keyWraps[session.pubkey]) {
    return NextResponse.json({ error: "Missing creator key wrap" }, { status: 400 });
  }

  const existing = await listConversationsFor(session.pubkey);
  if (type === "dm") {
    const peer = memberPubkeys.find((item) => item !== session.pubkey)!;
    const found = existing.find(
      (conversation) =>
        conversation.type === "dm" &&
        conversation.memberPubkeys.includes(peer) &&
        conversation.memberPubkeys.includes(session.pubkey),
    );
    if (found) return NextResponse.json({ conversation: found });
  }

  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: randomUUID(),
    type,
    title:
      title ||
      (type === "group"
        ? "Group chat"
        : memberPubkeys.find((item) => item !== session.pubkey) || "Direct message"),
    memberPubkeys,
    keyWraps,
    createdAt: now,
    createdBy: session.pubkey,
    updatedAt: now,
  };

  await saveConversation(conversation);
  return NextResponse.json({ conversation });
}
