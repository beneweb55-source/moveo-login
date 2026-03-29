const urlGood = "https://voe.sx/e/8x8x8x8x8x8x";
const urlBad = "https://voe.sx/e/invalid_id_12345";

async function test(url) {
  try {
    const res = await fetch(`http://localhost:3000/api/check-server?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    console.log(url, res.status, data);
  } catch (e) {
    console.log(url, "Error:", e.message);
  }
}

async function run() {
  await test(urlGood);
  await test(urlBad);
}
run();
