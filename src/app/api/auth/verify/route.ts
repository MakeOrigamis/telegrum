import { NextResponse } from "next/server";
import { verifySolanaSignature } from "@/lib/crypto";
import { createSessionToken } from "@/lib/session";
import { getProfile, saveProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const pubkey = String(body.pubkey || "");
  const message = String(body.message || "");
  const signature = String(body.signature || "");
  const boxPublicKey = String(body.boxPublicKey || "");
  const displayName = String(body.displayName || "").slice(0, 32);

  if (!pubkey || !message || !signature || !boxPublicKey) {
    return NextResponse.json({ error: "Missing auth fields" }, { status: 400 });
  }

  if (!message.includes(pubkey) || !message.startsWith("Sign in to Telegrum")) {
    return NextResponse.json({ error: "Invalid auth message" }, { status: 400 });
  }

  if (!verifySolanaSignature(message, signature, pubkey)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const existing = await getProfile(pubkey);
  const profile = await saveProfile({
    pubkey,
    displayName: displayName || existing?.displayName || "",
    boxPublicKey,
    updatedAt: new Date().toISOString(),
  });

  const token = createSessionToken(pubkey);
  return NextResponse.json({ token, profile });
}
