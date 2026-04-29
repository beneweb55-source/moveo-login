const https = require('https');

https.get('https://api.themoviedb.org/3/tv/235?api_key=8d6d91941230817f7807d643736e8a49', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log(json.seasons.map(s => `S${s.season_number}: ${s.episode_count} eps`).join(', '));
  });
});
