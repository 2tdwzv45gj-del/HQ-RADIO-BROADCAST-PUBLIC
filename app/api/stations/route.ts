import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

type CuratedStation = {
  id: string;
  name: string;
  country?: string;
  countryCode?: string;
  state?: string;
  language?: string;
  genres?: string[];
  codecDeclared?: string;
  bitrateDeclared?: number;
  streamUrl?: string;
  homepage?: string;
  favicon?: string;
  votes?: number;
  lastCheckOk?: boolean;
  reviewDecision?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim().slice(0, 100).toLowerCase();
  const country = (searchParams.get("country") || "").trim().slice(0, 100).toLowerCase();
  const tag = (searchParams.get("tag") || "").trim().slice(0, 60).toLowerCase();

  try {
    const dataDir = path.join(process.cwd(), "data");
    const curatedRaw = await readFile(path.join(dataDir, "curated_stations.json"), "utf8");
    const manualRaw = await readFile(path.join(dataDir, "stations.json"), "utf8");
    const curatedData = JSON.parse(curatedRaw) as { stations?: CuratedStation[] };
    const manualData = JSON.parse(manualRaw) as { stations?: Array<Record<string, unknown>> };
    const curated = Array.isArray(curatedData.stations) ? curatedData.stations : [];
    const manual = Array.isArray(manualData.stations) ? manualData.stations : [];

    const curatedResults = curated
      .filter((station) =>
        station.reviewDecision === "KEEP" &&
        typeof station.name === "string" &&
        typeof station.streamUrl === "string" &&
        station.streamUrl.length > 0
      )
      .map((station) => ({
        id: station.id,
        name: station.name,
        country: station.country || "",
        countryCode: station.countryCode || "",
        state: station.state || "",
        language: station.language || "",
        tags: Array.isArray(station.genres) ? station.genres.join(", ") : "",
        codec: station.codecDeclared || "",
        bitrate: Number(station.bitrateDeclared) || 0,
        streamUrl: station.streamUrl,
        homepage: station.homepage || "",
        favicon: station.favicon || (station.homepage ? `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(station.homepage)}&sz=128` : ""),
        votes: Number(station.votes) || 0,
        lastCheckOk: station.lastCheckOk === true,
        source: "curated",
      }));
    const manualResults = manual
      .filter((station) =>
        station.source === "manual" &&
        typeof station.name === "string" &&
        typeof station.streamUrl === "string" &&
        station.streamUrl.length > 0
      )
      .map((station) => ({
        id: String(station.id || station.streamUrl),
        name: String(station.name),
        country: typeof station.country === "string" ? station.country : "",
        countryCode: typeof station.countryCode === "string" ? station.countryCode : "",
        state: "",
        language: "",
        tags: Array.isArray(station.genres) ? station.genres.filter((g): g is string => typeof g === "string").join(", ") : "",
        codec: typeof station.codec === "string" ? station.codec : "",
        bitrate: Number(station.bitrate) || 0,
        streamUrl: String(station.streamUrl),
        homepage: typeof station.homepage === "string" ? station.homepage : "",
        favicon: typeof station.favicon === "string" && station.favicon ? station.favicon : (typeof station.homepage === "string" && station.homepage ? `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(station.homepage)}&sz=128` : ""),
        votes: 0,
        lastCheckOk: station.verification === "verified",
        source: "manual",
      }));
    const byUrl = new Map<string, (typeof curatedResults)[number] | (typeof manualResults)[number]>();
    for (const station of [...manualResults, ...curatedResults]) {
      if (typeof station.streamUrl === "string" && station.streamUrl.length > 0 && !byUrl.has(station.streamUrl)) {
        byUrl.set(station.streamUrl, station);
      }
    }
    const results = Array.from(byUrl.values())
      .filter((station) =>
        (!query || station.name.toLowerCase().includes(query)) &&
        (!country || station.country.toLowerCase().includes(country)) &&
        (!tag || station.tags.toLowerCase().includes(tag))
      );

    return NextResponse.json(
      {
        stations: results,
        count: results.length,
        source: "curated_stations.json",
        note: "Catalogo curato manualmente. Il bitrate dichiarato non certifica da solo la qualità audio effettiva.",
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Impossibile leggere il catalogo radio curato." },
      { status: 500 },
    );
  }
}
