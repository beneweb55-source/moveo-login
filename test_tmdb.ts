import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function test() {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/235/season/1?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}`);
    console.log(res.data.episodes.slice(0, 5).map((e: any) => e.episode_number));
  } catch (e: any) {
    console.log(e.message);
  }
}
test();
