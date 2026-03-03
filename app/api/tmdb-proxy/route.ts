import { NextResponse } from "next/server";
import axios from "axios";

const BASE_URL = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Get the TMDB API Key from environment variables
  const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY;

  if (!TMDB_API_KEY) {
    return NextResponse.json(
      { error: "TMDB API key is missing in environment variables" },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  // Handle specific "q" parameter for search (as requested in the prompt)
  const q = searchParams.get("q");
  
  // Handle generic "endpoint" parameter for the rest of the app
  const endpoint = searchParams.get("endpoint");

  let targetUrl = "";
  let params: Record<string, string> = {};

  // Extract all other parameters
  searchParams.forEach((value, key) => {
    if (key !== "q" && key !== "endpoint") {
      params[key] = value;
    }
  });

  if (q) {
    targetUrl = `${BASE_URL}/search/multi`;
    params.query = q;
    params.include_adult = 'false';
  } else if (endpoint) {
    targetUrl = `${BASE_URL}${endpoint}`;
  } else {
    return NextResponse.json(
      { error: "Missing 'q' or 'endpoint' parameter" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  try {
    const { data } = await axios.get(targetUrl, {
      headers: {
        Authorization: `Bearer ${TMDB_API_KEY}`,
      },
      params,
    });

    return NextResponse.json(data, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "s-maxage=60, stale-while-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch data from TMDB" },
      { 
        status: error.response?.status || 500,
        headers: { "Access-Control-Allow-Origin": "*" } 
      }
    );
  }
}
