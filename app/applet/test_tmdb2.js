const axios = require("axios");

async function test() {
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/235?api_key=8d6d91941230817f7807d643736e8a49`);
    console.log(res.data.seasons.map((s) => ({ season: s.season_number, episodes: s.episode_count })));
  } catch (e) {
    console.log(e.message);
  }
}
test();
