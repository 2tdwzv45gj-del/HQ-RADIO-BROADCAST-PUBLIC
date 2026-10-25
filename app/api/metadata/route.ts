
import { NextResponse } from "next/server";
import { parseIcyResponse } from "@music-metadata/icy";
import { icecastStatusTitle } from "./icecast-fallback";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";


const TIMEOUT_MS = 7000;

function privateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);

  return p.length !== 4 ||
    p.some(n => !Number.isInteger(n) || n < 0 || n > 255) ||
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    p[0] >= 224;
}

function privateIPv6(ip: string): boolean {
  const value = ip.toLowerCase().split("%")[0];

  return value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("::ffff:") ||
    value.startsWith("2001:db8:");
}

async function validateStreamUrl(raw: string): Promise<URL> {
  const url = new URL(raw);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Protocollo non consentito");
  }

  if (url.username || url.password) {
    throw new Error("Credenziali non consentite");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Destinazione non consentita");
  }

  const version = isIP(host);

  if (version === 4 && privateIPv4(host)) {
    throw new Error("Destinazione non consentita");
  }

  if (version === 6 && privateIPv6(host)) {
    throw new Error("Destinazione non consentita");
  }

  if (!version) {
    const addresses = await lookup(host, {
      all: true,
      verbatim: true,
    });

    if (
      addresses.length === 0 ||
      addresses.some(item =>
        isIP(item.address) === 4
          ? privateIPv4(item.address)
          : privateIPv6(item.address)
      )
    ) {
      throw new Error("Destinazione non consentita");
    }
  }

  return url;
}

export async function GET(request: Request) {
  const rawUrl = new URL(request.url).searchParams.get("url");

  if (!rawUrl || rawUrl.length > 2048) {
    return NextResponse.json(
      { available: false, title: "" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const streamUrl = await validateStreamUrl(rawUrl);

    let response: Response | undefined;
    let targetUrl = streamUrl;

    for (let hop = 0; hop <= 5; hop++) {
      response = await fetch(targetUrl, {
        headers: {
          "Icy-MetaData": "1",
          "User-Agent": "HQ-Radio-Broadcast/1.0",
          Accept: "*/*",
        },
        signal: controller.signal,
        redirect: "manual",
        cache: "no-store",
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location || hop === 5) {
        throw new Error("Redirect non valido o limite raggiunto");
      }
      targetUrl = await validateStreamUrl(new URL(location, targetUrl).toString());
    }

    if (!response) {
      throw new Error("Nessuna risposta ricevuta dallo stream");
    }

    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => {});
      return NextResponse.json(
        { available: false, title: "" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    let settled = false;
    let resolveMetadata!: (value: { title: string; available: boolean }) => void;

    const result = new Promise<{ title: string; available: boolean }>(resolve => {
      resolveMetadata = resolve;
    });

    const finish = (value: { title: string; available: boolean }) => {
      if (settled) return;
      settled = true;
      resolveMetadata(value);
    };

    const audioStream = parseIcyResponse(response, ({ metadata }) => {
      const title = typeof metadata.StreamTitle === "string"
        ? metadata.StreamTitle.replace(/\0/g, "").trim().slice(0, 300)
        : "";

      if (title) finish({ title, available: true });
    });

    const reader = audioStream.getReader();

    void (async () => {
      try {
        while (!settled) {
          const { done } = await reader.read();
          if (done) break;
        }
        finish({ title: "", available: false });
      } catch {
        finish({ title: "", available: false });
      }
    })();

    const timeoutResult = new Promise<{ title: string; available: boolean }>(resolve => {
      setTimeout(() => resolve({ title: "", available: false }), TIMEOUT_MS - 500);
    });

    const resultValue = await Promise.race([result, timeoutResult]);

    await reader.cancel().catch(() => {});
    if (!resultValue.title) {
      const fallbackTitle = await icecastStatusTitle(targetUrl, validateStreamUrl);
      if (fallbackTitle) {
        resultValue.title = fallbackTitle;
        resultValue.available = true;
      }
    }

    return NextResponse.json(
      {
        ...resultValue,
        contentType: contentType || "unknown",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { available: false, title: "" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timer);
  }
}
