import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title         = searchParams.get("title") || "";
  const originalTitle = searchParams.get("originalTitle") || "";
  const type          = searchParams.get("type") || "tv";
  const season        = searchParams.get("season") || "1";
  const episode       = searchParams.get("episode") || "1";
  const lang          = searchParams.get("lang") || "VOSTFR";

  const ep = String(episode).padStart(2, "0");
  const langTag = lang === "VF" ? "VF" : "VOSTFR";
  
  const queries = [];
  if (type === "movie") {
    queries.push(`${title} ${langTag}`);
    if (originalTitle && originalTitle !== title) {
      queries.push(`${originalTitle} ${langTag}`);
    }
  } else {
    queries.push(`${title} S${String(season).padStart(2,"0")}E${ep} ${langTag}`);
    queries.push(`${title} E${ep} ${langTag}`);
    queries.push(`${title} ${ep} ${langTag}`);
    if (originalTitle && originalTitle !== title) {
      queries.push(`${originalTitle} S${String(season).padStart(2,"0")}E${ep} ${langTag}`);
    }
  }

  try {
    for (const query of queries) {
      const res = await fetch(`https://video.sibnet.ru/search.php?text=${encodeURIComponent(query)}`, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cache-Control": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1"
        },
        next: { revalidate: 3600 }
      });

      if (!res.ok) continue;
      const html = await res.text();
      
      const regex = /<a[^>]+href="\/video(\d+)-([^"]+)"/g;
      const matches = [];
      let matchArr;
      while ((matchArr = regex.exec(html)) !== null) {
        matches.push({ videoid: matchArr[1], title: matchArr[2] });
      }

      if (matches.length === 0) continue;

      let match = null;
      if (type === "tv") {
        match = matches.find((v) => {
          const t = decodeURIComponent(v.title).toLowerCase().replace(/_/g, ' ');
          return t.includes(`e${ep}`) || t.includes(` ${ep}`) || t.includes(`ep${ep}`) || t.includes(`episode ${ep}`) || t.includes(`episode ${parseInt(episode)}`);
        });
      } else {
        match = matches[0];
      }

      if (match?.videoid) {
        return NextResponse.json({
          found: true,
          videoid: match.videoid,
          embed_url: `https://video.sibnet.ru/shell.php?videoid=${match.videoid}`,
          title: decodeURIComponent(match.title).replace(/_/g, ' '),
        });
      }
    }

    return NextResponse.json({ found: false });
  } catch (error) {
    console.error("Sibnet API Error:", error);
    return NextResponse.json({ found: false });
  }
}
