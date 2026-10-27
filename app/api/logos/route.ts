import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";

type LogoRecord = {
  stationId: string;
  stationName: string;
  countryCode?: string;
  approvedLogoUrl?: string;
  existingLogoUrl?: string;
  approvedByUser?: boolean;
  logoSource?: string;
  fallback?: string;
};

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "logo_registry.json");
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw) as { stations?: LogoRecord[] };
    const stations = Array.isArray(data.stations) ? data.stations : [];

    const logoDir = path.join(process.cwd(), "public", "radio-logos");
    const localFiles = await readdir(logoDir);
    const normalize = (value: string) =>
      value.normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const localByName = new Map<string, string>();
    for (const filename of localFiles) {
      const stem = path.parse(filename).name;
      const key = normalize(stem);
      if (key && !localByName.has(key)) localByName.set(key, filename);
    }
    const familyLogo = (name: string): string => {
      const n = normalize(name);
      if (n.includes("80s80s")) return "80s80s.png";
      if (n.includes("90s90s")) return "90s90s.png";
      if (n.includes("bigradio")) return "BigR radio.png";
      if (n.includes("bigfm")) return "BigFm.png";
      if (n.includes("nightride")) return "Nightride.png";
      if (n.includes("radiocaroline")) return "Radio Caroline.png";
      if (n.includes("rockfm")) return "Rock fm.png";
      if (n.includes("technobasefm")) return "Technobase.fm.png";
      if (n.includes("kissfm")) return "Kiss Fm.png";
      return "";
    };

    const logos = stations.map((station) => {
      const exactLocal = localByName.get(normalize(station.stationName));
      const family = familyLogo(station.stationName);
      const localFile = exactLocal || (localFiles.includes(family) ? family : "");
      const approved =
        station.approvedByUser === true &&
        station.logoSource === "manual_selection" &&
        typeof station.approvedLogoUrl === "string" &&
        station.approvedLogoUrl.length > 0;

      return {
        id: station.stationId,
        name: station.stationName,
        logoUrl: approved ? station.approvedLogoUrl : (station.existingLogoUrl || ""),
        localLogoUrl: localFile ? "/radio-logos/" + encodeURIComponent(localFile) : "",
        fallback: station.fallback === "country_flag" ? "country_flag" : (approved || station.existingLogoUrl) ? "none" : "pending_review",
        countryCode: station.countryCode || "",
      };
    });

    return NextResponse.json(
      { logos, count: logos.length },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Registro dei loghi non disponibile." },
      { status: 500 },
    );
  }
}
