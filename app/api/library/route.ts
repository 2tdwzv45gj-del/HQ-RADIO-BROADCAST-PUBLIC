import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "L archivio personale non è accessibile in produzione." }, { status: 403 });
  }
  try {
    const filePath = path.join(process.cwd(), "data", "stations.json");
    const raw = await readFile(filePath, "utf8");
    const library = JSON.parse(raw);
    if (!Array.isArray(library.stations)) {
      return NextResponse.json({ error: "Archivio non valido." }, { status: 500 });
    }
    return NextResponse.json(library, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return NextResponse.json(
      { error: "Impossibile leggere l'archivio radio." },
      { status: 500 }
    );
  }
}
