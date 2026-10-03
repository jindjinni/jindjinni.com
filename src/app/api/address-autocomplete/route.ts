import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { AddressSuggestion } from "@/lib/address-autocomplete-types";

// Server-side proxy for US street address autocomplete, used by every
// address field in Purchasing (customers, the inline new-customer-on-
// quotation form) and the Business Profile (business + shipping address).
//
// Backed by Photon (https://photon.komoot.io), a free public geocoder built
// specifically for search-as-you-type use, no API key required. Per the
// user's choice: this is the "free, no-signup" option -- it's rate-limited
// and not meant for heavy commercial traffic, so if usage grows this is the
// one place to swap in Mapbox/Google Places later (same response shape,
// same call site in every form).
//
// Routed through our own API (rather than called directly from the
// browser) so: (1) only signed-in users of this app can use it, not the
// open internet, (2) results are filtered down to US addresses and
// reshaped into exactly what the forms need before they ever reach the
// client, and (3) swapping providers later never touches form code.

export const dynamic = "force-dynamic";

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "puerto rico": "PR",
  "virgin islands": "VI",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
};

function toStateAbbreviation(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBREVIATIONS[trimmed.toLowerCase()] ?? trimmed;
}

type PhotonFeature = {
  properties?: {
    countrycode?: string;
    housenumber?: string;
    street?: string;
    name?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
};

export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "jindjinni-ledger-app (US address autocomplete)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const features = Array.isArray(data.features) ? data.features : [];

    const seen = new Set<string>();
    const suggestions: AddressSuggestion[] = [];
    for (const f of features) {
      const p = f.properties ?? {};
      if (p.countrycode !== "US") continue;

      const street1 = [p.housenumber, p.street ?? p.name].filter(Boolean).join(" ").trim() || null;
      const city = p.city ?? p.district ?? p.county ?? null;
      const state = toStateAbbreviation(p.state);
      const zip = p.postcode ? String(p.postcode).slice(0, 5) : null;
      const label = [street1, [city, state, zip].filter(Boolean).join(", ")].filter(Boolean).join(", ");
      if (!label || seen.has(label)) continue;
      seen.add(label);
      suggestions.push({ label, street1, city, state, zip });
      if (suggestions.length >= 6) break;
    }

    return NextResponse.json({ suggestions });
  } catch {
    // The free demo service is rate-limited and not guaranteed -- never
    // break address entry over it, just fall back to no suggestions.
    return NextResponse.json({ suggestions: [] });
  }
}
