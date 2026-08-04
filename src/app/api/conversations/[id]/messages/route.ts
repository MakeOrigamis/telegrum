import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getBearerToken, verifySessionToken } from "@/lib/session";
import { appendMessage, getConversation, listMessages } from "@/lib/store";
import type { ChatMessage, MessageKind } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation || !conversation.memberPubkeys.includes(session.pubkey)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await listMessages(id);
  return NextResponse.json({ messages, conversation });
}

export async function POST(request: Request, { params }: Params) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const conversation = await getConversation(id);
  if (!conversation || !conversation.memberPubkeys.includes(session.pubkey)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = (["text", "image", "system"].includes(body.kind)
    ? body.kind
    : "text") as MessageKind;
  const nonce = String(body.nonce || "");
  const ciphertext = String(body.ciphertext || "");
  const replyToId = body.replyToId ? String(body.replyToId) : undefined;

  if (!nonce || !ciphertext) {
    return NextResponse.json({ error: "Encrypted payload required" }, { status: 400 });
  }

  const message: ChatMessage = {
    id: randomUUID(),
    conversationId: id,
    sender: session.pubkey,
    kind,
    nonce,
    ciphertext,
    replyToId,
    createdAt: new Date().toISOString(),
  };

  await appendMessage(message);
  return NextResponse.json({ message });
}
