import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Eliminazione non abilitata in produzione senza accesso sicuro." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    if (typeof body?.id !== "string" || !body.id.trim()) {
      return NextResponse.json(
        { error: "ID della stazione obbligatorio." },
        { status: 400 }
      );
    }

    const file = path.join(process.cwd(), "data", "stations.json");
    const library = JSON.parse(await readFile(file, "utf8"));

    if (!Array.isArray(library.stations)) {
      throw new Error("Archivio non valido.");
    }

    const index = library.stations.findIndex(
      (station: { id?: string; source?: string }) =>
        station.id === body.id && station.source === "manual"
    );

    if (index === -1) {
      return NextResponse.json(
        { error: "Stazione manuale non trovata." },
        { status: 404 }
      );
    }

    const [removed] = library.stations.splice(index, 1);

    await writeFile(file, JSON.stringify(library, null, 2) + "\n", "utf8");

    return NextResponse.json({
      success: true,
      removed: removed.name,
      count: library.stations.length
    });
  } catch {
    return NextResponse.json(
      { error: "Impossibile eliminare la stazione." },
      { status: 400 }
    );
  }
}