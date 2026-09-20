import { NextRequest, NextResponse } from "next/server";

const SUPABASE_FUNCTION =
  "https://gdcyclcdklrwkekagqpu.supabase.co/functions/v1/environment";

export const revalidate = 0;

function parseCoordinate(
  value: string | null,
  fallback: number,
  min: number,
  max: number
) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"), 1.3521, 1.15, 1.5);
  const lon = parseCoordinate(request.nextUrl.searchParams.get("lon"), 103.8198, 103.55, 104.1);

  if (lat == null || lon == null) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_LOCATION",
          message: "Location coordinates are outside Hazemate's supported Singapore range."
        }
      },
      { status: 400 }
    );
  }

  try {
    const url = new URL(SUPABASE_FUNCTION);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(9000)
    });
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.error ?? {
            code: "ENVIRONMENT_UNAVAILABLE",
            message: "Environmental data is temporarily unavailable."
          }
        },
        { status: response.status }
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60"
      }
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "ENVIRONMENT_UNAVAILABLE",
          message: "Environmental data is temporarily unavailable."
        }
      },
      { status: 503 }
    );
  }
}
