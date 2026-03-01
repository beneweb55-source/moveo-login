import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { tmdbId, mediaType, action } = await req.json();

  try {
    if (action === "watchlist") {
      await db.watchlist.create({
        data: { userId: session.user.id, tmdbId, mediaType },
      });
    } else if (action === "favorite") {
      await db.favorite.create({
        data: { userId: session.user.id, tmdbId, mediaType },
      });
    } else if (action === "watched") {
      await db.watched.create({
        data: { userId: session.user.id, tmdbId, mediaType },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return new NextResponse("Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { tmdbId, mediaType, action } = await req.json();

  try {
    if (action === "watchlist") {
      await db.watchlist.deleteMany({
        where: { userId: session.user.id, tmdbId, mediaType },
      });
    } else if (action === "favorite") {
      await db.favorite.deleteMany({
        where: { userId: session.user.id, tmdbId, mediaType },
      });
    } else if (action === "watched") {
      await db.watched.deleteMany({
        where: { userId: session.user.id, tmdbId, mediaType },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return new NextResponse("Error", { status: 500 });
  }
}
