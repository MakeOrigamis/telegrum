import { NextResponse } from "next/server";
import { getBearerToken, verifySessionToken } from "@/lib/session";
import { getProfile, listProfilesByPrefix, saveProfile } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pubkey = searchParams.get("pubkey");
  const q = searchParams.get("q");

  if (q) {
    const profiles = await listProfilesByPrefix();
    const needle = q.toLowerCase();
    return NextResponse.json({
      profiles: profiles
        .filter(
          (profile) =>
            profile.pubkey.toLowerCase().includes(needle) ||
            profile.displayName.toLowerCase().includes(needle),
        )
        .slice(0, 20),
    });
  }

  if (!pubkey) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  const profile = await getProfile(pubkey);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const displayName = String(body.displayName || "").slice(0, 32);
  const existing = await getProfile(session.pubkey);
  if (!existing) {
    return NextResponse.json({ error: "Profile missing" }, { status: 404 });
  }

  const profile = await saveProfile({
    ...existing,
    displayName,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ profile });
}
