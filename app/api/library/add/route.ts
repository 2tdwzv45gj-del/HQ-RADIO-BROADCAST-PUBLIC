import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Pubblicazione temporaneamente disabilitata: accesso amministrativo non ancora configurato." },
    { status: 403 }
  );
}
