import { NextRequest, NextResponse } from "next/server";

const SUPABASE_FUNCTION =
  "https://gdcyclcdklrwkekagqpu.supabase.co/functions/v1/environment";

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region") ?? "central";
  const hours = request.nextUrl.searchParams.get("hours") ?? "24";

  try {
    const url = new URL(SUPABASE_FUNCTION);
    url.searchParams.set("mode", "history");
    url.searchParams.set("region", region);
    url.searchParams.set("hours", hours);

    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error ?? "Historical environmental data unavailable" },
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
      { error: "Historical environmental data unavailable" },
      { status: 503 }
    );
  }
}
