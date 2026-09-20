import { NextRequest, NextResponse } from "next/server";

const SUPABASE_FUNCTION =
  "https://gdcyclcdklrwkekagqpu.supabase.co/functions/v1/environment";
const REGIONS = new Set(["north", "south", "east", "west", "central"]);
const ALLOWED_HOURS = new Set([24, 168, 720]);

export const revalidate = 0;

export async function GET(request: NextRequest) {
  const region = request.nextUrl.searchParams.get("region") ?? "central";
  const hours = Number(request.nextUrl.searchParams.get("hours") ?? "24");

  if (!REGIONS.has(region) || !ALLOWED_HOURS.has(hours)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_HISTORY_QUERY",
          message: "History requires a supported region and one of 24, 168 or 720 hours."
        }
      },
      { status: 400 }
    );
  }

  try {
    const url = new URL(SUPABASE_FUNCTION);
    url.searchParams.set("mode", "history");
    url.searchParams.set("region", region);
    url.searchParams.set("hours", String(hours));

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000)
    });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error ?? {
            code: "HISTORY_UNAVAILABLE",
            message: "Historical environmental data is temporarily unavailable."
          }
        },
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
      {
        error: {
          code: "HISTORY_UNAVAILABLE",
          message: "Historical environmental data is temporarily unavailable."
        }
      },
      { status: 503 }
    );
  }
}
