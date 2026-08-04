import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getBearerToken, verifySessionToken } from "@/lib/session";
import { getMedia, saveMedia } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 900_000;

export async function POST(request: Request) {
  const session = verifySessionToken(getBearerToken(request));
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const contentType = String(body.contentType || "application/octet-stream");
  const dataBase64 = String(body.dataBase64 || "");

  if (!dataBase64) {
    return NextResponse.json({ error: "dataBase64 required" }, { status: 400 });
  }

  const approxBytes = Math.ceil((dataBase64.length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max ~700KB)" }, { status: 400 });
  }

  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Only images supported" }, { status: 400 });
  }

  const id = randomUUID();
  await saveMedia(id, contentType, dataBase64);
  return NextResponse.json({ id, url: `/api/media?id=${id}` });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const media = await getMedia(id);
  if (!media) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const bytes = Buffer.from(media.dataBase64, "base64");
  return new NextResponse(bytes, {
    headers: {
      "content-type": media.contentType,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
