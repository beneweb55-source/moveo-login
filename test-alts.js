const urls = [
  "https://frembed.work/api/film.php?id=123",
  "https://multiembed.mov/?video_id=123&tmdb=1",
  "https://vidsrc.to/embed/movie/123",
  "https://vidsrc.me/embed/movie?tmdb=123",
  "https://www.2embed.cc/embed/123",
  "https://player.smashy.stream/movie/123",
  "https://vidlink.pro/movie/123"
];

async function test() {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });
      console.log(url, res.status);
    } catch (e) {
      console.log(url, "Error:", e.message);
    }
  }
}
test();
