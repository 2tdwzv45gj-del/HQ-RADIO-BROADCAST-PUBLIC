"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";

type Station = {
  id: string;
  name: string;
  country: string;
  tags: string;
  codec: string;
  bitrate: number;
  streamUrl: string;
  homepage: string;
  favicon?: string;
  source?: string;
};

const COUNTRY_CODES: Record<string, string> = {
  "Argentina":"AR", "Australia":"AU", "Austria":"AT", "Azerbaijan":"AZ",
  "Belgium":"BE", "Bolivarian Republic Of Venezuela":"VE", "Brazil":"BR",
  "Bulgaria":"BG", "Canada":"CA", "Chile":"CL", "Colombia":"CO",
  "Costa Rica":"CR", "Cuba":"CU", "Curacao":"CW", "Czechia":"CZ",
  "Denmark":"DK", "Ecuador":"EC", "El Salvador":"SV", "Estonia":"EE",
  "Finland":"FI", "France":"FR", "Germany":"DE", "Greece":"GR",
  "Honduras":"HN", "Hungary":"HU", "Iceland":"IS", "India":"IN",
  "Ireland":"IE", "Italy":"IT", "Jamaica":"JM", "Japan":"JP",
  "Latvia":"LV", "Lithuania":"LT", "Luxembourg":"LU", "Martinique":"MQ",
  "Mexico":"MX", "Morocco":"MA", "New Zealand":"NZ", "Nigeria":"NG",
  "Norway":"NO", "Peru":"PE", "Poland":"PL", "Portugal":"PT",
  "Romania":"RO", "Serbia":"RS", "Slovakia":"SK", "Slovenia":"SI",
  "South Africa":"ZA", "Spain":"ES", "Sweden":"SE", "Switzerland":"CH",
  "Thailand":"TH", "The Dominican Republic":"DO",
  "The Falkland Islands Malvinas":"FK", "The Marshall Islands":"MH",
  "The Netherlands":"NL", "The Republic Of Korea":"KR",
  "The Russian Federation":"RU",
  "The United Kingdom Of Great Britain And Northern Ireland":"GB",
  "The United States Of America":"US", "Türkiye":"TR",
  "US Virgin Islands":"VI", "Ukraine":"UA", "Uruguay":"UY"
};
const countryFlag = (country: string, registeredCode = "") => {
  const code = registeredCode || COUNTRY_CODES[country.trim()];
  if (!/^[A-Z]{2}$/i.test(code)) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0)));
};

export default function Home() {
  const [stations, setStations] = useState<Station[]>([]);
  const [publicStations, setPublicStations] = useState<Station[]>([]);
  const [stationLogos, setStationLogos] = useState<Record<string, { logoUrl: string; localLogoUrl: string; fallback: string; countryCode: string }>>({});
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [genre, setGenre] = useState("All stations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const [connecting, setConnecting] = useState("");
  const [selectedStationId, setSelectedStationId] = useState("");
  const playTimeoutRef = useRef<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const currentStation = stations.find(s => s.id === selectedStationId) || stations.find(s => s.id === playing) || stations.find(s => s.id === connecting) || null;
  const logoForStation = (id: string) => { const station = stations.find(s => s.id === id); return id === "manual-a9679866-3021-470f-9afd-4d6d140b9e9a" ? "/kane-fm.png" : stationLogos[id]?.logoUrl || station?.favicon || ""; };
  const [trackTitle, setTrackTitle] = useState("");
  const [theme, setTheme] = useState("amber");
  const [themeReady, setThemeReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [visualStyle, setVisualStyle] = useState("globe");
  const [visualStyleReady, setVisualStyleReady] = useState(false);


  const [sleepMinutes, setSleepMinutes] = useState(30);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [sleepTimerActive, setSleepTimerActive] = useState(false);
  useEffect(() => {
    if (!sleepTimerActive || sleepRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSleepRemaining(previous => {
        if (previous <= 1) {
          window.clearInterval(timer);
          const audio = document.getElementById("hq-audio") as HTMLAudioElement | null;
          audio?.pause();
          if (audio) audio.currentTime = 0;
          setPlaying("");
          setConnecting("");
          setSleepTimerActive(false);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerActive, sleepRemaining]);

  useEffect(() => {
    const saved = window.localStorage.getItem("hq-radio-theme");
    if (["amber", "ocean", "forest", "purple", "ruby", "silver"].includes(saved || "")) setTheme(saved!);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    const savedStyle = window.localStorage.getItem("hq-radio-visual-style");
    if (savedStyle === "globe" || savedStyle === "wave" || savedStyle === "network") setVisualStyle(savedStyle);
    setVisualStyleReady(true);
  }, []);

  useEffect(() => {
    if (visualStyleReady) window.localStorage.setItem("hq-radio-visual-style", visualStyle);
  }, [visualStyle, visualStyleReady]);

  useEffect(() => {
    if (themeReady) window.localStorage.setItem("hq-radio-theme", theme);
  }, [theme, themeReady]);

  useEffect(() => {
    if (!currentStation || !playing) {
      setTrackTitle("");
      return;
    }

    let active = true;
    let busy = false;
    let missedChecks = 0;
    const stationName = currentStation.name;
    const stationHomepage = currentStation.homepage || "";
    const streamUrl = currentStation.streamUrl;

    async function loadMetadata() {
      if (busy || !active) return;
      busy = true;
      try {
        const response = await fetch(
          `/api/metadata?url=${encodeURIComponent(streamUrl)}&name=${encodeURIComponent(stationName)}&homepage=${encodeURIComponent(stationHomepage)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          missedChecks++;
          if (missedChecks >= 2 && active) setTrackTitle("");
          return;
        }
        const data = await response.json();
        if (active && typeof data.title === "string" && data.title.trim()) {
          missedChecks = 0;
          setTrackTitle(data.title.trim());
        } else {
          missedChecks++;
          if (missedChecks >= 2 && active) setTrackTitle("");
        }
      } catch {
        missedChecks++;
      if (missedChecks >= 2 && active) setTrackTitle("");
      } finally {
        busy = false;
      }
    }

    setTrackTitle("");
    loadMetadata();
    const interval = window.setInterval(loadMetadata, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [playing, currentStation?.id, currentStation?.streamUrl]);



  const [libraryUrls, setLibraryUrls] = useState<string[]>([]);
  const [personalStations, setPersonalStations] = useState<Station[]>([]);
  const [personalLibraryReady, setPersonalLibraryReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hq-radio-library");
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setPersonalStations(parsed.filter((item): item is Station =>
            !!item && typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.streamUrl === "string"
          ));
        }
      }
    } catch {
      console.error("Impossibile caricare My Library.");
    } finally {
      setPersonalLibraryReady(true);
    }
  }, []);

  useEffect(() => {
    if (personalLibraryReady) {
      window.localStorage.setItem("hq-radio-library", JSON.stringify(personalStations));
    }
  }, [personalStations, personalLibraryReady]);
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("hq-radio-favorites");
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) setFavoriteUrls(parsed);
      }
    } catch {
      console.error("Impossibile caricare i preferiti salvati.");
    } finally {
      setFavoritesReady(true);
    }
  }, []);

  useEffect(() => {
    if (favoritesReady) window.localStorage.setItem("hq-radio-favorites", JSON.stringify(favoriteUrls));
  }, [favoriteUrls, favoritesReady]);

  const [savingUrl, setSavingUrl] = useState("");
  const [addRadioOpen, setAddRadioOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualStreamUrl, setManualStreamUrl] = useState("");
  const [manualHomepage, setManualHomepage] = useState("");
  const [manualCountry, setManualCountry] = useState("");
  const [manualGenre, setManualGenre] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [country, setCountry] = useState("All countries");
  const [quality, setQuality] = useState("All streams");
  const countries = useMemo(() => Array.from(new Set(stations.map(s => s.country).filter(Boolean))).sort(), [stations]);
  const genres = ["All stations", "Rock", "Metal", "Hard Rock", "Alternative", "Pop", "Dance / EDM", "House", "Techno", "Trance", "Jazz", "Blues", "Ambient", "Lounge / Chillout", "Hip Hop / Rap", "Reggae", "Soul / Funk", "Country", "Folk", "Sport"];

  useEffect(() => {
    fetch("/api/logos")
      .then(response => {
        if (!response.ok) throw new Error("Loghi non disponibili");
        return response.json();
      })
      .then(data => {
        const mapped: Record<string, { logoUrl: string; localLogoUrl: string; fallback: string; countryCode: string }> = {};
        for (const logo of data.logos || []) {
          if (typeof logo.id === "string") {
            mapped[logo.id] = {
              logoUrl: typeof logo.logoUrl === "string" ? logo.logoUrl : "",
              localLogoUrl: typeof logo.localLogoUrl === "string" ? logo.localLogoUrl : "",
              fallback: typeof logo.fallback === "string" ? logo.fallback : "pending_review",
              countryCode: typeof logo.countryCode === "string" ? logo.countryCode : ""
            };
          }
        }
        setStationLogos(mapped);
      })
      .catch(() => setStationLogos({}));
  }, []);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const response = await fetch("/api/stations");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Catalog unavailable");
        setPublicStations((data.stations || []) as Station[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Catalog unavailable");
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, []);

  useEffect(() => {
    if (!personalLibraryReady) return;
    setLibraryUrls(personalStations.map(s => s.streamUrl).filter(Boolean));
    const combined = new Map<string, Station>();
    for (const s of [...publicStations, ...personalStations]) {
      if (s.streamUrl) combined.set(s.streamUrl, s);
    }
    setStations(Array.from(combined.values()));
  }, [publicStations, personalStations, personalLibraryReady]);

  const results = useMemo(() => stations.filter(s => {
    const text = [s.name, s.country, s.tags, s.codec].join(" ").toLowerCase();
    const matchesText = text.includes(query.toLowerCase());
    const normalizeGenre = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const genreAliases: Record<string, string[]> = {
      "Rock": ["rock"], "Metal": ["metal"], "Hard Rock": ["hard rock", "hardrock"],
      "Alternative": ["alternative", "alt rock", "alternative rock"], "Pop": ["pop"],
      "Dance / EDM": ["dance", "edm", "electronic dance", "electro"], "House": ["house", "deep house", "progressive house"],
      "Techno": ["techno", "minimal techno"], "Trance": ["trance", "uplifting trance", "psytrance", "psy trance"],
      "Jazz": ["jazz"], "Blues": ["blues"], "Ambient": ["ambient", "atmospheric"],
      "Lounge / Chillout": ["lounge", "chillout", "chill out", "downtempo"], "Hip Hop / Rap": ["hip hop", "hiphop", "rap"],
      "Reggae": ["reggae", "ska", "dub"], "Soul / Funk": ["soul", "funk", "motown"],
      "Country": ["country", "bluegrass"], "Folk": ["folk", "acoustic", "singer songwriter"],
      "Sport": ["sport", "sports"]
    };
    const normalizedTags = normalizeGenre(s.tags || "");
    const aliases = genreAliases[genre] || [genre.toLowerCase()];
    const matchesGenre = genre === "All stations" || aliases.some(alias => normalizedTags.includes(normalizeGenre(alias)));
    const matchesCountry = country === "All countries" || s.country === country;
    const codec = (s.codec || "").toUpperCase();
    const minBitrate = codec === "AAC" ? 128 : 192;
    const matchesQuality = quality === "All streams" || s.bitrate >= minBitrate;
    return matchesText && matchesGenre && matchesCountry && matchesQuality;
  }), [stations, query, genre, country, quality]);

  const savedStations = useMemo(() => personalStations.filter(s => {
    const text = [s.name, s.country, s.tags, s.codec].join(" ").toLowerCase();
    return text.includes(libraryQuery.trim().toLowerCase());
  }), [personalStations, libraryQuery]);

  const favoriteStations = useMemo(() => stations.filter(s => favoriteUrls.includes(s.streamUrl)), [stations, favoriteUrls]);

  function listen(s: Station) {
    setQuery("");
    const audio = document.getElementById("hq-audio") as HTMLAudioElement | null;
    if (!audio) return;

    const clearPlayTimeout = () => {
      if (playTimeoutRef.current !== null) {
        window.clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    };

    const showPlayError = (stationId: string, message: string) => {
      if (audio.dataset.stationId !== stationId) return;
      clearPlayTimeout();
      setPlaying("");
      setConnecting("");
      setError(message);
    };

    clearPlayTimeout();

    // Pausa della stazione attualmente in riproduzione.
    if (selectedStationId === s.id && playing === s.id && !audio.paused) {
      audio.pause();
      setPlaying("");
      setConnecting("");
      return;
    }

    // Ripresa della stessa sorgente, inclusi i flussi gestiti da hls.js.
    if (
      selectedStationId === s.id &&
      audio.dataset.stationId === s.id &&
      audio.paused &&
      (Boolean(audio.src) || hlsRef.current !== null)
    ) {
      setError("");
      setConnecting(s.id);
      audio.play().catch(() => {
        showPlayError(s.id, "Impossibile riprendere questa radio. Controlla il flusso o riprova.");
      });
      return;
    }

    // Chiude l'eventuale sessione HLS precedente prima di cambiare stazione.
    hlsRef.current?.destroy();
    hlsRef.current = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();

    setSelectedStationId(s.id);
    setError("");
    setPlaying("");
    setConnecting(s.id);
    audio.dataset.stationId = s.id;
    audio.dataset.isPlaying = "false";

    playTimeoutRef.current = window.setTimeout(() => {
      if (audio.dataset.stationId === s.id && audio.dataset.isPlaying !== "true") {
        hlsRef.current?.destroy();
        hlsRef.current = null;
        audio.pause();
        setPlaying("");
        setConnecting("");
        setError("La radio non ha iniziato a riprodurre entro 12 secondi. Il flusso potrebbe non essere disponibile.");
      }
      playTimeoutRef.current = null;
    }, 12000);

    const startPlayback = () => {
      if (audio.dataset.stationId !== s.id) return;
      audio.play().catch(() => {
        showPlayError(s.id, "Impossibile avviare questa radio. Controlla il flusso o riprova.");
      });
    };

    const isHls = /\.m3u8(?:$|[?#])/i.test(s.streamUrl);

    if (isHls && !audio.canPlayType("application/vnd.apple.mpegurl") && Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        if (audio.dataset.stationId === s.id) hls.loadSource(s.streamUrl);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (audio.dataset.stationId === s.id) startPlayback();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || audio.dataset.stationId !== s.id) return;
        clearPlayTimeout();
        hls.destroy();
        if (hlsRef.current === hls) hlsRef.current = null;
        setPlaying("");
        setConnecting("");
        setError("Il flusso HLS non è riproducibile. Controlla il flusso o riprova.");
      });

      hls.attachMedia(audio);
      return;
    }

    if (isHls && !audio.canPlayType("application/vnd.apple.mpegurl") && !Hls.isSupported()) {
      showPlayError(s.id, "Questo browser non supporta la riproduzione HLS di questa radio.");
      return;
    }

    audio.src = s.streamUrl;
    audio.load();
    startPlayback();
  }

  function toggleFavorite(s: Station) {
    setFavoriteUrls(previous => previous.includes(s.streamUrl) ? previous.filter(url => url !== s.streamUrl) : [...previous, s.streamUrl]);
    setSaveMessage(favoriteUrls.includes(s.streamUrl) ? "Removed from favorites." : "Added to favorites.");
  }

  function saveStation(s: Station) {
    setSaveMessage("");
    setPersonalStations(previous => {
      if (previous.some(item => item.streamUrl === s.streamUrl)) {
        setSaveMessage("Radio già presente in My Library.");
        return previous;
      }
      setSaveMessage("Radio salvata in My Library!");
      return [...previous, { ...s }];
    });
    setLibraryUrls(previous => previous.includes(s.streamUrl) ? previous : [...previous, s.streamUrl]);
  }

  function addManualStation() {
    const name = manualName.trim();
    const streamUrl = manualStreamUrl.trim();
    const homepageInput = manualHomepage.trim();
    const homepage = homepageInput ? (/^https?:\/\//i.test(homepageInput) ? homepageInput : `https://${homepageInput}`) : "";
    if (!name || !streamUrl) {
      setSaveMessage("Inserisci il nome della radio e l URL dello streaming.");
      return;
    }
    if (personalStations.some(item => item.streamUrl === streamUrl)) {
      setSaveMessage("Questa radio è già presente in My Library.");
      return;
    }
    const station: Station = {
      id: `personal-${Date.now()}`,
      name,
      country: manualCountry.trim(),
      tags: manualGenre.trim(),
      streamUrl,
      codec: "",
      bitrate: 0,
      homepage,
      favicon: homepage ? new URL("/favicon.ico", homepage).toString() : "",
      source: "manual"
    };
    setPersonalStations(previous => [...previous, station]);
    setLibraryUrls(previous => previous.includes(streamUrl) ? previous : [...previous, streamUrl]);
    setManualName("");
    setManualStreamUrl("");
    setManualHomepage("");
    setManualCountry("");
    setManualGenre("");
    setSaveMessage("Radio aggiunta a My Library. Streaming non ancora verificato.");
  }

  function removeStation(s: Station) {
    if (!window.confirm("Confermi la rimozione di questa stazione da My Library?")) return;
    setPersonalStations(previous => previous.filter(item => item.streamUrl !== s.streamUrl));
    setLibraryUrls(previous => previous.filter(url => url !== s.streamUrl));
    setSaveMessage("Radio rimossa da My Library.");
  }



  const themeColors = { amber: { background: "#0a0d12", accent: "#fcd34d", soft: "#fde68a" }, ocean: { background: "#071521", accent: "#22d3ee", soft: "#a5f3fc" }, forest: { background: "#0b1711", accent: "#4ade80", soft: "#bbf7d0" }, purple: { background: "#160d26", accent: "#c084fc", soft: "#e9d5ff" }, ruby: { background: "#260d15", accent: "#fb7185", soft: "#fecdd3" }, silver: { background: "#16191e", accent: "#d1d5db", soft: "#f3f4f6" } }[theme as "amber" | "ocean" | "forest" | "purple" | "ruby" | "silver"];

  return <main style={{ backgroundColor: themeColors.background, "--theme-accent": themeColors.accent, "--theme-soft": themeColors.soft } as React.CSSProperties} className="min-h-screen pb-28 sm:pb-24 text-white">
    <audio id="hq-audio"
      onPlaying={(e) => {
        const audio = e.currentTarget;
        if (playTimeoutRef.current !== null) {
          window.clearTimeout(playTimeoutRef.current);
          playTimeoutRef.current = null;
        }
        audio.dataset.isPlaying = "true";
        setPlaying(audio.dataset.stationId || "");
        setConnecting("");
        setError("");
      }}
      onError={(e) => {
        const audio = e.currentTarget;
        if (playTimeoutRef.current !== null) {
          window.clearTimeout(playTimeoutRef.current);
          playTimeoutRef.current = null;
        }
        setPlaying("");
        setConnecting("");
        setError("Impossibile riprodurre questa radio. Il flusso potrebbe non essere disponibile.");
      }}
    />
    <header className="border-b border-white/10 px-6 py-5">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--theme-accent)] font-black text-black">HQ</span>
        <div><strong className="tracking-[0.16em]">RADIO BROADCAST</strong><p className="text-xs text-slate-400">THE WORLD, IN HIGH QUALITY</p></div>
        <div className="relative ml-auto"><button type="button" onClick={() => setSettingsOpen(open => !open)} aria-label="Settings" aria-expanded={settingsOpen} className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/5 text-xl text-slate-200 transition hover:border-[var(--theme-accent)]" title="Settings">⚙</button>{settingsOpen && <div className="absolute right-0 top-12 z-50 w-60 rounded-xl border border-white/15 bg-[#151a22] p-4 shadow-2xl"><h2 className="mb-3 text-sm font-semibold text-white">Settings</h2><label htmlFor="hq-theme" className="mb-2 block text-xs text-slate-400">Appearance · Theme</label><select id="hq-theme" value={theme} onChange={e => setTheme(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0a0d12] px-3 py-2 text-sm text-white"><option value="amber">Amber · Solar Gold</option><option value="ocean">Ocean · Electric Blue</option><option value="forest">Forest · Emerald</option><option value="purple">Purple · Cosmic Violet</option><option value="ruby">Ruby · Crimson Pulse</option><option value="silver">Silver · Platinum Night</option></select><label htmlFor="hq-visual-style" className="mb-2 mt-4 block text-xs text-slate-400">Visual Style</label><select id="hq-visual-style" value={visualStyle} onChange={e => setVisualStyle(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#0a0d12] px-3 py-2 text-sm text-white"><option value="globe">Globe Signature</option><option value="wave">Wave Experience</option><option value="network">Global Network</option></select></div>}</div>
      </div>
    </header>
    <section className="mx-auto max-w-7xl px-6 pt-6">
      <div className="flex items-center gap-4 rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-300/[0.10] to-white/[0.02] p-5 sm:p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30 p-2">
          {currentStation && logoForStation(currentStation.id) ? <img src={logoForStation(currentStation.id)} alt={`Logo ${currentStation.name}`} className="h-full w-full object-contain" onError={e => { const img = e.currentTarget; const local = stationLogos[currentStation.id]?.localLogoUrl; if (local && !img.dataset.localFallback) { img.dataset.localFallback = "1"; img.src = local; return; } if (currentStation.source === "manual" && currentStation.homepage && !img.dataset.googleFallback) { img.dataset.googleFallback = "1"; img.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(currentStation.homepage)}&sz=128`; return; } img.style.display = "none"; const fallback = img.parentElement?.querySelector("[data-now-playing-fallback]") as HTMLElement | null; if (fallback) fallback.style.display = "flex"; }} /> : null}<span data-now-playing-fallback className={`h-full w-full items-center justify-center ${currentStation && logoForStation(currentStation.id) ? "hidden" : "flex"}`}>{currentStation ? countryFlag(currentStation.country, stationLogos[currentStation.id]?.countryCode || "") || <span className="text-xl font-black text-[var(--theme-soft)]">HQ</span> : <span className="text-xl font-black text-[var(--theme-soft)]">HQ</span>}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--theme-soft)]">Now Playing</p>
          {currentStation ? <><h2 className="truncate text-xl font-semibold sm:text-2xl">{currentStation.name}</h2>{trackTitle && <p className="mt-1 truncate text-base font-medium text-white">{trackTitle.includes(" - ") ? <><span className="text-[var(--theme-soft)]">{trackTitle.split(" - ")[0]}</span><span> — {trackTitle.split(" - ").slice(1).join(" - ")}</span></> : trackTitle}</p>}<p className="mt-1 text-sm text-slate-400">{currentStation.country || "Country unavailable"} · {currentStation.codec || "Codec n/a"} · {currentStation.bitrate > 0 ? currentStation.bitrate : "Bitrate sconosciuto"}{currentStation.bitrate ? " kbps" : ""}</p>{connecting === currentStation.id && <div role="status" aria-live="polite" className="mt-3 flex items-center gap-3"><div className="flex h-6 items-center gap-1" aria-hidden="true">{[0,1,2,3,4].map(n => <span key={n} className="hq-stream-bar" />)}</div><div><p className="text-sm font-medium text-[var(--theme-accent)]">Connecting to radio...</p><p className="text-xs text-slate-400">Preparing your HQ audio stream. Just a moment.</p></div></div>}{connecting === currentStation.id ? <p className="mt-2 text-xs font-semibold tracking-wider text-[var(--theme-accent)]">● CONNECTING</p> : playing === currentStation.id ? <p className="mt-2 text-xs font-semibold tracking-wider text-[var(--theme-soft)]">● LIVE RADIO</p> : null}</> : <><h2 className="text-lg font-medium text-slate-300">No station playing</h2><p className="mt-1 text-sm text-slate-500">Choose a station and press Listen to start streaming.</p></>}
        </div>
        {currentStation && <button onClick={() => {
          const audio = document.getElementById("hq-audio") as HTMLAudioElement | null;
          if (playTimeoutRef.current !== null) {
            window.clearTimeout(playTimeoutRef.current);
            playTimeoutRef.current = null;
          }
          hlsRef.current?.destroy();
          hlsRef.current = null;
          if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.removeAttribute("src");
            audio.dataset.isPlaying = "false";
            audio.load();
          }
          setPlaying("");
          setConnecting("");
          setError("");
          setTrackTitle("");
        }} className="shrink-0 rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-amber-300/50">Stop</button>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mr-2"><p className="text-sm font-semibold text-[var(--theme-soft)]">Sleep Timer</p><p className="text-xs text-slate-400">Stop playback automatically</p></div>
        {!sleepTimerActive ? <>
          <select aria-label="Sleep timer duration" value={sleepMinutes} onChange={e => setSleepMinutes(Number(e.target.value))} className="rounded-lg border border-white/15 bg-[#111720] px-3 py-2 text-sm text-white">
            <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option>
          </select>
          <button type="button" onClick={() => { setSleepRemaining(sleepMinutes * 60); setSleepTimerActive(true); }} className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/20">Start timer</button>
        </> : <>
          <span className="rounded-lg bg-white/5 px-3 py-2 font-mono text-sm tabular-nums text-white">{String(Math.floor(sleepRemaining / 60)).padStart(2, "0")}:{String(sleepRemaining % 60).padStart(2, "0")} remaining</span>
          <button type="button" onClick={() => { setSleepTimerActive(false); setSleepRemaining(0); }} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:border-amber-300/50">Cancel timer</button>
        </>}
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
      {visualStyle === "globe" ? <img src="/images/radio-universe-banner.png" alt="HQ Radio Broadcast — The World, in High Quality" className="mb-10 block h-auto w-full rounded-2xl border border-white/10 shadow-2xl" /> : visualStyle === "wave" ? <div role="img" aria-label="Wave Experience — luminous sound waves" className="relative mb-10 flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:h-72" style={{background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--theme-accent) 22%, #07111d), #05080f 75%)"}}><div className="absolute inset-0 opacity-50" style={{backgroundImage: "repeating-radial-gradient(ellipse at center, transparent 0 18px, var(--theme-accent) 19px 20px, transparent 21px 35px)"}}/><svg viewBox="0 0 1000 220" preserveAspectRatio="none" className="relative h-full w-full" aria-hidden="true"><defs><linearGradient id="hq-wave-gradient"><stop offset="0%" stopColor="var(--theme-soft)" stopOpacity=".1"/><stop offset="50%" stopColor="var(--theme-accent)"/><stop offset="100%" stopColor="var(--theme-soft)" stopOpacity=".1"/></linearGradient></defs>{Array.from({length: 7},(_,i)=><path key={i} d={`M 0 ${110+i*3} C 100 ${20+i*5}, 150 ${200-i*4}, 250 110 S 400 ${20+i*5}, 500 110 S 650 ${200-i*4}, 750 110 S 900 ${20+i*5}, 1000 110`} fill="none" stroke="url(#hq-wave-gradient)" strokeWidth={i===3?4:1.5} opacity={1-i*.1}/>)}</svg><div className="absolute bottom-5 left-6 text-xs font-semibold uppercase tracking-[.35em] text-[var(--theme-soft)] sm:text-sm">Wave Experience · Feel the frequency</div></div> : <div role="img" aria-label="Global Network — connected cities around the world" className="relative mb-10 flex h-56 w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-2xl sm:h-72" style={{background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--theme-accent) 18%, #0b1220), #03060c 78%)"}}><svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true"><defs><linearGradient id="hq-network-gradient"><stop offset="0%" stopColor="var(--theme-soft)" stopOpacity=".15"/><stop offset="50%" stopColor="var(--theme-accent)"/><stop offset="100%" stopColor="var(--theme-soft)" stopOpacity=".15"/></linearGradient></defs><g fill="none" stroke="url(#hq-network-gradient)" strokeWidth="1.5">{[[120,90,300,170],[300,170,480,80],[480,80,650,190],[650,190,850,90],[120,90,210,240],[210,240,480,80],[480,80,780,250],[780,250,850,90],[300,170,650,190],[210,240,650,190]].map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>)}</g><g fill="var(--theme-accent)">{[[120,90],[300,170],[480,80],[650,190],[850,90],[210,240],[780,250]].map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="5"><animate attributeName="r" values="4;7;4" dur="3s" begin={`${i*.3}s`} repeatCount="indefinite"/></circle>)}</g></svg><div className="absolute bottom-5 left-6 text-xs font-semibold uppercase tracking-[.35em] text-[var(--theme-soft)] sm:text-sm">Global Network · One world, many voices</div></div>}
      <p className="mb-5 text-xs uppercase tracking-widest text-[var(--theme-soft)]">Live radio catalog</p>
      <h1 className="text-5xl font-semibold sm:text-7xl">The world sounds <span className="text-[var(--theme-accent)]">better</span> here.</h1>
      <p className="mt-6 max-w-2xl leading-7 text-slate-400">Discover radio stations around the world with declared bitrate of at least 192 kbps.</p>
      <input value={query} onChange={e => { setQuery(e.target.value); setShowResults(true); }} onKeyDown={e => { if (e.key === "Enter") setShowResults(true); }} placeholder="Search stations, countries or genres..." className="mt-8 w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 outline-none focus:border-amber-300 sm:max-w-2xl" />
      <div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => { setQuery(""); setShowResults(true); }} className="rounded-lg border border-white/15 px-4 py-3 text-base text-slate-200 transition hover:border-amber-300/50">Explore all stations</button><button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} className="group inline-flex items-center gap-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-5 py-3 text-base font-semibold text-amber-100 shadow-lg shadow-amber-950/20 transition hover:border-amber-300 hover:bg-amber-300/15"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 transition-transform group-hover:rotate-12"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg><span>Filters</span><span className="text-xs opacity-70">{filtersOpen ? "−" : "+"}</span></button></div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setLibraryOpen(v => !v)} aria-expanded={libraryOpen} className="rounded-lg border border-white/15 px-3 py-2 text-sm">♡ My Library ({personalStations.length})</button>
        <button onClick={() => setInfoOpen(v => !v)} aria-expanded={infoOpen} className="rounded-lg border border-white/15 px-3 py-2 text-sm">ⓘ INFO</button>
        <button onClick={() => setFavoritesOpen(v => !v)} aria-expanded={favoritesOpen} className="rounded-lg border border-white/15 px-3 py-2 text-sm">♥ Favorites ({favoriteStations.length})</button>
        <button onClick={() => setAddRadioOpen(v => !v)} aria-expanded={addRadioOpen} className="rounded-lg border border-white/15 px-3 py-2 text-sm">＋ Add radio</button>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-6 pb-20">
      {filtersOpen && <>
      <h2 className="mb-5 text-3xl font-semibold">Explore by sound</h2>
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="text-sm text-slate-300">Country
          <select value={country} onChange={e => { setCountry(e.target.value); setShowResults(true); }} className="ml-2 rounded-lg border border-white/10 bg-[#151a22] px-3 py-2">
            <option>All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Quality
          <select value={quality} onChange={e => { setQuality(e.target.value); setShowResults(true); }} className="ml-2 rounded-lg border border-white/10 bg-[#151a22] px-3 py-2">
            <option value="High quality">High quality (AAC ≥128 / others ≥192 kbps)</option>
            <option value="All streams">All streams</option>
          </select>
        </label>
      </div>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        {(() => { const iconFiles: Record<string, string> = { "Rock": "rock", "Metal": "metal", "Hard Rock": "hard-rock", "Alternative": "alternative", "Pop": "pop", "Dance / EDM": "dance-edm", "House": "house", "Techno": "techno", "Trance": "trance", "Jazz": "jazz", "Blues": "blues", "Ambient": "ambient", "Lounge / Chillout": "lounge-chillout", "Hip Hop / Rap": "hip-hop-rap", "Reggae": "reggae", "Soul / Funk": "soul-funk", "Country": "country", "Folk": "folk", "Sport": "sport" }; const icon = iconFiles[genre]; return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-amber-300/30 bg-white/[0.04] p-2">
          {icon ? <img src={`/genres/${icon}.svg`} alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[var(--theme-accent)]/10 text-xl text-[var(--theme-soft)]">◎</span>}
          <label className="flex min-w-0 flex-col gap-1"><span className="text-[10px] uppercase tracking-widest text-slate-500">Explore by sound</span><select value={genre} onChange={e => { setGenre(e.target.value); setShowResults(true); }} className="max-w-full cursor-pointer bg-transparent pr-8 text-sm font-semibold text-white outline-none [&>option]:bg-[#151a22] [&>option]:text-white">{genres.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
        </div>; })()}
        <p className="text-xs text-slate-500">{genre === "All stations" ? "All genres" : `Genre: ${genre}`}</p>
      </div>
      </>}
      {loading && showResults && <p className="text-slate-400">Loading radio catalog...</p>}
      {error && <p className="mb-5 text-[var(--theme-soft)]">{error}</p>}
      {!loading && !error && <p className="mb-5 text-sm text-slate-500">{results.length} stations found · quality filter based on directory-declared bitrate</p>}
      {saveMessage && <p role="status" className="mb-4 text-sm text-[var(--theme-soft)]">{saveMessage}</p>}
      {favoritesOpen && <section className="mb-10 rounded-2xl border border-amber-300/20 bg-[var(--theme-accent)]/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">♥ Favorites</h3>
          <span className="text-sm text-slate-400">{favoriteStations.length} stations saved</span>
        </div>
        {favoriteStations.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{favoriteStations.map(s => <article key={s.streamUrl} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="min-w-0"><p className="truncate font-semibold">{s.name}</p><p className="text-xs text-slate-400">{s.country || "Unknown country"} · {s.bitrate} kbps</p></div>
          <div className="flex shrink-0 flex-col gap-2"><button onClick={() => listen(s)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">▶ Listen</button><button onClick={() => toggleFavorite(s)} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300">♥ Remove</button></div>
        </article>)}</div> : <p className="py-3 text-sm text-slate-400">No favorites yet. Add a station using the heart button in the catalog.</p>}
      </section>}

      {infoOpen && <section className="mb-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">ⓘ INFO — Add Your Own Radio</h2>
          <button type="button" onClick={() => setInfoOpen(false)} className="rounded-lg border border-white/15 px-3 py-2 text-sm">Close</button>
        </div>
        <div className="max-w-4xl space-y-5 text-sm leading-6 text-slate-300">
          <div>
            <h3 className="mb-1 font-semibold text-[var(--theme-soft)]">1. Find a direct audio stream</h3>
            <p>Use the radio station’s official website and look for its live stream. You need a direct audio streaming URL, not just the station’s homepage. Stream links may end in .mp3 or .aac, but some valid streams use other URL formats.</p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[var(--theme-soft)]">2. Ask an AI assistant for help</h3>
            <p>Copy the prompt below into ChatGPT or another AI assistant. Always verify the result: an AI may find outdated links, so never assume a stream is working until you test it.</p>
            <button type="button" onClick={() => { const prompt = "Find the official direct audio streaming URL for [RADIO STATION NAME]. Prefer a stable, high-quality MP3 or AAC stream. Provide the direct stream URL, audio format and bitrate if verifiable, the official homepage, and a source confirming the stream is official. Do not invent URLs. If you cannot verify a working direct stream, clearly say so."; void navigator.clipboard.writeText(prompt).then(() => setSaveMessage("AI prompt copied to clipboard.")).catch(() => setSaveMessage("Copy failed. Please select and copy the AI prompt manually.")); }} className="mt-3 rounded-lg bg-[var(--theme-accent)] px-4 py-2 font-semibold text-black">Copy AI prompt</button>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="mb-2 font-semibold text-white">AI prompt</p>
            <p className="select-text">Find the official direct audio streaming URL for [RADIO STATION NAME]. Prefer a stable, high-quality MP3 or AAC stream. Provide the direct stream URL, audio format and bitrate if verifiable, the official homepage, and a source confirming the stream is official. Do not invent URLs. If you cannot verify a working direct stream, clearly say so.</p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[var(--theme-soft)]">3. Add the station to My Library</h3>
            <p>Open My Library, select Add radio, and enter the station name and direct stream URL. Add the official homepage if you know it; this helps the app try to retrieve the station’s favicon. Then save the station and press Listen to test it.</p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-[var(--theme-soft)]">4. About station logos</h3>
            <p>The app first tries the website favicon and then Google Favicon as a fallback for manually added stations. A favicon is a small website icon and may not be the station’s official logo. If neither source provides an image, the app displays its built-in fallback.</p>
          </div>
          <p className="text-xs text-slate-500">Please add only streams you are allowed to access. Stream availability, format and bitrate may change; always test the station after adding it.</p>
        </div>
      </section>}

      {libraryOpen && <section className="mb-10 rounded-2xl border border-amber-300/20 bg-[var(--theme-accent)]/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold">♥ My Library</h3>
          <span className="text-sm text-slate-400">{personalStations.length} stations saved</span>
        </div>

        {addRadioOpen && <form onSubmit={e => { e.preventDefault(); void addManualStation(); }} className="mb-5 rounded-xl border border-white/10 bg-black/20 p-4">
          <h4 className="mb-3 font-semibold text-[var(--theme-soft)]">＋ Add a station manually</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <input required value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Station name *" className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
            <input required type="url" value={manualStreamUrl} onChange={e => setManualStreamUrl(e.target.value)} placeholder="Direct stream URL * (https://...)" className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
            <input type="url" value={manualHomepage} onChange={e => setManualHomepage(e.target.value)} placeholder="Official website (optional)" className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
            <input value={manualCountry} onChange={e => setManualCountry(e.target.value)} placeholder="Country (optional)" className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
            <input value={manualGenre} onChange={e => setManualGenre(e.target.value)} placeholder="Genre (optional, e.g. Jazz)" className="min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm outline-none focus:border-amber-300" />
            <button type="submit" disabled={!!savingUrl} className="rounded-lg bg-[var(--theme-accent)] px-4 py-3 text-sm font-bold text-black disabled:opacity-60">{savingUrl ? "Please wait..." : "＋ Add to My Library"}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Enter the direct audio stream URL, not just the radio website. The stream is saved as unverified.</p>
        </form>}
        {libraryUrls.length > 0 && <input value={libraryQuery} onChange={e => setLibraryQuery(e.target.value)} placeholder="Search your library by station, country or genre..." className="mb-4 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none focus:border-amber-300" />}
        {savedStations.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{savedStations.map(s => <article key={s.streamUrl} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-1">{logoForStation(s.id) || s.favicon ? <img src={logoForStation(s.id) || s.favicon || ""} alt={`Logo ${s.name}`} className="h-full w-full object-contain" loading="lazy" onError={e => { const img = e.currentTarget; const local = stationLogos[s.id]?.localLogoUrl; if (local && !img.dataset.localFallback) { img.dataset.localFallback = "1"; img.src = local; return; } if (s.source === "manual" && s.homepage && !img.dataset.googleFallback) { img.dataset.googleFallback = "1"; img.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(s.homepage)}&sz=128`; return; } img.style.display = "none"; const fallback = img.parentElement?.querySelector("[data-library-logo-fallback]") as HTMLElement | null; if (fallback) fallback.style.display = "flex"; }} /> : null}<span data-library-logo-fallback className={`h-full w-full items-center justify-center ${logoForStation(s.id) || s.favicon ? "hidden" : "flex"}`}>{countryFlag(s.country, stationLogos[s.id]?.countryCode || "") || <span className="font-bold text-[var(--theme-soft)]">{s.name.slice(0, 2).toUpperCase()}</span>}</span></div><div className="min-w-0"><p className="truncate font-medium">{s.name}</p><p className="mt-1 text-xs text-slate-400">{s.country || "Country unavailable"} · {s.bitrate > 0 ? `${s.bitrate} kbps` : "Bitrate sconosciuto"}</p><p className="mt-1 truncate text-xs text-slate-500">{s.tags || "Genre not specified"}</p></div></div>
          <div className="flex shrink-0 flex-col gap-2">
            <button onClick={() => listen(s)} className="rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-semibold text-black">{playing === s.id ? "Pause" : "Listen"}</button>
            <button onClick={() => removeStation(s)} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs text-red-300">Remove from My Library</button>
          </div>
        </article>)}</div> : <p className="py-3 text-sm text-slate-400">{libraryUrls.length === 0 ? "Your My Library is empty. Save a station from the catalog or add one manually." : "No saved stations match this search."}</p>}
      </section>}
      {showResults && <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">{results.map((s, i) => <article key={s.id || s.name + i} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <div className="mb-5 flex h-16 w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-2">
          {logoForStation(s.id) ? (
            <img src={logoForStation(s.id)} alt={`Logo ${s.name}`} className="h-full w-full object-contain" loading="lazy" onError={e => { const img = e.currentTarget; const local = stationLogos[s.id]?.localLogoUrl; if (local && !img.dataset.localFallback) { img.dataset.localFallback = "1"; img.src = local; return; } if (s.source === "manual" && s.homepage && !img.dataset.googleFallback) { img.dataset.googleFallback = "1"; img.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(s.homepage)}&sz=128`; return; } img.style.display = "none"; const fallback = img.parentElement?.querySelector("[data-logo-fallback]") as HTMLElement | null; if (fallback) fallback.style.display = "flex"; }} />
          ) : null}
          <span data-logo-fallback className={`h-full w-full items-center justify-center ${logoForStation(s.id) ? "hidden" : "flex"}`}>
            {countryFlag(s.country, stationLogos[s.id]?.countryCode || "") ? (
              <span className="text-3xl" title={s.country}>{countryFlag(s.country, stationLogos[s.id]?.countryCode || "")}</span>
            ) : (
              <span className="text-xl font-bold text-[var(--theme-soft)]">{s.name.slice(0, 2).toUpperCase()}</span>
            )}
          </span>
        </div>
        <h3 className="font-semibold">{s.name}</h3>
        <p className="mt-1 text-sm text-slate-400">{s.country || "Country unavailable"}</p>
        <p className="mt-3 line-clamp-2 text-xs text-slate-500">{s.tags || "Genre not specified"}</p>
        <p className="mt-4 text-sm text-slate-300">{s.bitrate > 0 ? `${s.bitrate} kbps` : "Bitrate sconosciuto"} · {s.codec || "Codec n/a"}</p>
        <button onClick={() => listen(s)} className="mt-4 w-full rounded-lg bg-[var(--theme-accent)] px-4 py-3 text-sm font-semibold text-black">{playing === s.id ? "Pause" : "Listen"}</button>
        <button onClick={() => toggleFavorite(s)} disabled={savingUrl === s.streamUrl} className="mt-2 w-full rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 disabled:cursor-wait disabled:opacity-60">{savingUrl === s.streamUrl ? "Please wait..." : favoriteUrls.includes(s.streamUrl) ? "♥ Remove from Favorites" : "♡ Add to Favorites"}</button>

        {s.homepage && <a href={s.homepage} target="_blank" rel="noreferrer" className="mt-3 block text-center text-xs text-slate-400 underline">Official website</a>}
      </article>)}</div>}
      {showResults && !loading && !error && results.length === 0 && <p className="mt-8 text-slate-400">No stations match these filters.</p>}
      <p className="mt-8 text-xs leading-6 text-slate-500">Bitrate and codec are supplied by the directory and are not independent quality certifications. Some streams may not play in every browser.</p>
    </section>
    <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-slate-500">HQ RADIO BROADCAST · A world of radio, selected for sound</footer>
    {currentStation && <div data-hq-fixed-player className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-[#0a0d12]/95 px-3 py-3 shadow-2xl backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] p-1">
          {logoForStation(currentStation.id) ? <img src={logoForStation(currentStation.id)} alt="" className="h-full w-full object-contain" /> : <span className="font-bold text-[var(--theme-soft)]">{countryFlag(currentStation.country, stationLogos[currentStation.id]?.countryCode || "") || currentStation.name.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{currentStation.name}</p>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${playing === currentStation.id ? "text-[var(--theme-accent)]" : "text-slate-500"}`}>{playing === currentStation.id ? "● LIVE" : connecting === currentStation.id ? "CONNECTING" : "PAUSED"}</span>
          </div>
          <p className={`mt-1 truncate text-sm ${trackTitle ? "font-medium text-slate-100" : "text-xs text-slate-500"}`} title={trackTitle || "Track information unavailable"}>
            {trackTitle ? (trackTitle.includes(" - ") ? trackTitle.split(" - ").slice(0, 2).join(" — ") : trackTitle) : "Track / programme information unavailable"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" aria-label="Play or resume" title="Play / Resume" onClick={() => { if (playing !== currentStation.id) listen(currentStation); }} disabled={playing === currentStation.id || connecting === currentStation.id} className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-40">Play</button>
          <button type="button" aria-label="Pause" title="Pause" onClick={() => { const audio = document.getElementById("hq-audio") as HTMLAudioElement | null; if (audio && playing === currentStation.id) { audio.pause(); setPlaying(""); setConnecting(""); } }} disabled={playing !== currentStation.id} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white disabled:opacity-40">Pause</button>
          <button type="button" aria-label="Stop" title="Stop" onClick={() => {
            const audio = document.getElementById("hq-audio") as HTMLAudioElement | null;
            if (playTimeoutRef.current !== null) {
              window.clearTimeout(playTimeoutRef.current);
              playTimeoutRef.current = null;
            }
            hlsRef.current?.destroy();
            hlsRef.current = null;
            if (audio) {
              audio.pause();
              audio.currentTime = 0;
              audio.removeAttribute("src");
              audio.dataset.isPlaying = "false";
              audio.load();
            }
            setPlaying("");
            setConnecting("");
            setError("");
            setTrackTitle("");
          }} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200">Stop</button>
        </div>
      </div>
    </div>}
  </main>;
}
