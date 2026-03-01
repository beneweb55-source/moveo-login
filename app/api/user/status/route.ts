import { auth } from "@/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tmdbId = searchParams.get("tmdbId");
  const mediaType = searchParams.get("mediaType");

  if (!tmdbId || !mediaType) {
    return new NextResponse("Missing params", { status: 400 });
  }

  const watchlist = await db.watchlist.findFirst({
    where: { userId: session.user.id, tmdbId: Number(tmdbId), mediaType },
  });

  const favorite = await db.favorite.findFirst({
    where: { userId: session.user.id, tmdbId: Number(tmdbId), mediaType },
  });

  const watched = await db.watched.findFirst({
    where: { userId: session.user.id, tmdbId: Number(tmdbId), mediaType },
  });

  return NextResponse.json({
    watchlist: !!watchlist,
    favorite: !!favorite,
    watched: !!watched,
  });
}
