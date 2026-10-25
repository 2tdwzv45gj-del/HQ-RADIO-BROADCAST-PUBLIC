import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Configurare l'accesso sicuro prima di abilitare la rimozione in produzione." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    if (!body || typeof body.streamUrl !== "string" || !body.streamUrl.trim()) {
      return NextResponse.json(
        { error: "URL della radio obbligatorio." },
        { status: 400 }
      );
    }

    const streamUrl = body.streamUrl.trim();
    const url = new URL(streamUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return NextResponse.json(
        { error: "Usare un URL HTTP o HTTPS." },
        { status: 400 }
      );
    }

    const file = path.join(process.cwd(), "data", "stations.json");
    const library = JSON.parse(await readFile(file, "utf8"));

    if (!Array.isArray(library.stations)) {
      throw new Error("Archivio non valido");
    }

    const before = library.stations.length;
    library.stations = library.stations.filter(
      (station: { streamUrl?: string }) => station.streamUrl !== streamUrl
    );

    if (library.stations.length === before) {
      return NextResponse.json(
        { error: "Radio non presente nella libreria." },
        { status: 404 }
      );
    }

    await writeFile(file, JSON.stringify(library, null, 2) + "\n", "utf8");

    return NextResponse.json({
      success: true,
      count: library.stations.length
    });
  } catch {
    return NextResponse.json(
      { error: "Dati non validi o impossibile aggiornare l'archivio." },
      { status: 400 }
    );
  }
}
