import { NextRequest, NextResponse } from "next/server";

const SUPABASE_FUNCTION =
  "https://gdcyclcdklrwkekagqpu.supabase.co/functions/v1/environment";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat") ?? "1.3521";
  const lon = request.nextUrl.searchParams.get("lon") ?? "103.8198";

  try {
    const url = new URL(SUPABASE_FUNCTION);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);

    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Environmental data unavailable" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=180, stale-while-revalidate=120"
      }
    });
  } catch {
    return NextResponse.json(
      { error: "Environmental data unavailable" },
      { status: 503 }
    );
  }
}
