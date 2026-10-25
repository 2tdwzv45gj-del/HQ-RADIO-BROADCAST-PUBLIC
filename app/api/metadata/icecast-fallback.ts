export async function icecastStatusTitle(
  streamUrl: URL,
  validateUrl: (raw: string) => Promise<URL>,
): Promise<string> {
  let statusUrl: URL;
  try {
    statusUrl = new URL("/status-json.xsl", streamUrl.origin);
    await validateUrl(statusUrl.toString());
  } catch {
    return "";
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2200);

  try {
    const response = await fetch(statusUrl, {
      headers: {
        "User-Agent": "HQ-Radio-Broadcast/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
      redirect: "error",
      cache: "no-store",
    });

    if (!response.ok) return "";

    const data: unknown = await response.json();
    const root = data as { icestats?: { source?: unknown } };
    const sourceValue = root?.icestats?.source;
    const sources = Array.isArray(sourceValue) ? sourceValue : [sourceValue];

    for (const item of sources) {
      if (!item || typeof item !== "object") continue;
      const source = item as Record<string, unknown>;
      const title = [source.title, source.artist, source.yp_currently_playing]
        .filter((value): value is string => typeof value === "string")
        .map(value => value.trim())
        .filter(Boolean)
        .join(" - ")
        .slice(0, 300);

      if (title) return title;
    }
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }

  return "";
}
