// /api/admin/spots/[id]/videos — admin curation of a spot's YouTube videos
//
// POST   { links: string[] | link: string, contentType? }  add videos from YouTube links
// PATCH  { videoRowId, contentType?, pinned? }               change category / pin to top
// DELETE ?videoRowId=                                        remove a video from the spot
//
// Uses YouTube's free oEmbed endpoint for titles — no SerpApi credits.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db/prisma";
import { requireAdminApi } from "@/lib/auth/api-guard";
import { addSpotVideoFromUrl, isVideoContentType, MANUAL_VIDEO_SCORE } from "@/lib/services/spotVideoService";

type Params = { params: Promise<{ id: string }> };

async function spotIdFrom(params: Params["params"]) {
  const id = parseInt((await params).id);
  return isNaN(id) ? null : id;
}

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;
  const spotId = await spotIdFrom(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const raw: string[] = Array.isArray(body.links) ? body.links : body.link ? [body.link] : [];
  const links = raw
    .flatMap((l) => String(l).split(/[\s,]+/))
    .map((l) => l.trim())
    .filter(Boolean);
  if (links.length === 0) return NextResponse.json({ error: "Paste at least one YouTube link" }, { status: 400 });
  if (links.length > 20) return NextResponse.json({ error: "Add at most 20 links at a time" }, { status: 400 });

  const exists = await prisma.spot.findUnique({ where: { id: spotId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Spot not found" }, { status: 404 });

  const contentType = isVideoContentType(body.contentType) ? body.contentType : undefined;
  const added: Array<{ id: number; title: string }> = [];
  const failed: Array<{ link: string; error: string }> = [];
  for (const link of links) {
    try {
      const v = await addSpotVideoFromUrl(spotId, link, contentType);
      added.push({ id: v.id, title: v.title });
    } catch (err) {
      failed.push({ link, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ added, failed }, { status: added.length ? 201 : 400 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;
  const spotId = await spotIdFrom(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const rowId = Number(body.videoRowId);
  const data: { contentType?: string; relevanceScore?: number } = {};
  if (isVideoContentType(body.contentType)) data.contentType = body.contentType;
  if (typeof body.pinned === "boolean") data.relevanceScore = body.pinned ? MANUAL_VIDEO_SCORE : 50;

  const { count } = await prisma.spotVideo.updateMany({ where: { id: rowId, spotId }, data });
  if (count === 0) return NextResponse.json({ error: "Video not found for this spot" }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const guard = await requireAdminApi();
  if (!guard.authorized) return guard.response;
  const spotId = await spotIdFrom(params);
  if (spotId === null) return NextResponse.json({ error: "Invalid spot id" }, { status: 400 });

  const rowId = Number(request.nextUrl.searchParams.get("videoRowId"));
  const { count } = await prisma.spotVideo.deleteMany({ where: { id: rowId, spotId } });
  if (count === 0) return NextResponse.json({ error: "Video not found for this spot" }, { status: 404 });
  return NextResponse.json({ success: true });
}
