"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  ShieldCheck,
  RefreshCw,
  ThermometerSun,
  TrendingDown,
  TrendingUp,
  Wind
} from "lucide-react";

type EnvData = {
  region: string;
  location: { latitude: number; longitude: number };
  haze: {
    psi24h: number | null;
    pm25_1h: number | null;
    pm25_24h: number | null;
    updatedAt: string | null;
  };
  temperature: { value: number | null; stationName: string; distanceKm: number; unit: string } | null;
  humidity: { value: number | null; stationName: string; distanceKm: number; unit: string } | null;
  observedAt: string | null;
  source: string;
};

const REGION_COORDS: Record<string, [number, number]> = {
  north: [1.418, 103.82],
  south: [1.285, 103.833],
  east: [1.35, 103.955],
  west: [1.35, 103.705],
  central: [1.3521, 103.8198]
};

function psiLabel(psi: number | null) {
  if (psi == null) return ["Unavailable", "neutral"];
  if (psi <= 50) return ["Good", "good"];
  if (psi <= 100) return ["Moderate", "moderate"];
  if (psi <= 200) return ["Unhealthy", "unhealthy"];
  if (psi <= 300) return ["Very Unhealthy", "very-unhealthy"];
  return ["Hazardous", "hazardous"];
}

function guidance(psi: number | null, pm25: number | null) {
  const p = psi ?? 0;
  const pm = pm25 ?? 0;
  if (p > 300) return "Stay indoors where practical. Avoid strenuous outdoor activity and follow official advisories.";
  if (p > 200) return "Minimise prolonged outdoor activity, especially for vulnerable groups.";
  if (p > 100 || pm >= 55) return "Take it easy outdoors. Reduce prolonged or strenuous exercise.";
  if (pm >= 35) return "Conditions are elevated. Short outdoor activities are generally preferable to long strenuous sessions.";
  return "Outdoor activities are generally okay. Keep an eye on changing conditions.";
}

function maskGuidance(psi: number | null) {
  const p = psi ?? 0;
  if (p > 300) return "Consider a well-fitting N95 if you must remain outdoors for several hours.";
  if (p > 200) return "Vulnerable users should minimise outdoor exposure; an N95 may help if prolonged outdoor exposure cannot be avoided.";
  return "An N95 is generally not needed for short outdoor exposure. Reducing exposure is more important.";
}

export default function Home() {
  const [data, setData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regionChoice, setRegionChoice] = useState("central");
  const [locating, setLocating] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [previousPm, setPreviousPm] = useState<number | null>(null);

  async function load(lat: number, lon: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lon=${lon}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Environmental data is temporarily unavailable.");
      const next = await res.json();
      setPreviousPm(data?.haze?.pm25_1h ?? null);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load air quality.");
    } finally {
      setLoading(false);
    }
  }

  function useLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        load(position.coords.latitude, position.coords.longitude).finally(() => setLocating(false));
      },
      () => {
        setError("Location permission was not granted. Choose a Singapore region instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  function chooseRegion(value: string) {
    setRegionChoice(value);
    const [lat, lon] = REGION_COORDS[value];
    load(lat, lon);
  }

  useEffect(() => {
    load(...REGION_COORDS.central);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const installHandler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", installHandler);
    return () => window.removeEventListener("beforeinstallprompt", installHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [label, tone] = psiLabel(data?.haze?.psi24h ?? null);
  const pmTrend = useMemo(() => {
    const current = data?.haze?.pm25_1h;
    if (current == null || previousPm == null) return "steady";
    return current > previousPm ? "rising" : current < previousPm ? "falling" : "steady";
  }, [data, previousPm]);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <img src="/mascot.svg" alt="" className="brandMascot" />
          <div>
            <strong>Hazemate</strong>
            <span>Your mate for clearer outdoor decisions</span>
          </div>
        </div>
        <button className="iconButton" onClick={() => data && load(data.location.latitude, data.location.longitude)} aria-label="Refresh data">
          <RefreshCw size={18} />
        </button>
      </header>

      <section className="hero">
        <div className="heroCopy">
          <span className="eyebrow"><MapPin size={14} /> Singapore environmental companion</span>
          <h1>Know the air.<br />Plan your day.</h1>
          <p>Hazemate combines haze, temperature and humidity into one simple mobile-first view.</p>
          <div className="heroActions">
            <button className="primary" onClick={useLocation} disabled={locating}>
              <LocateFixed size={18} /> {locating ? "Finding you…" : "Use my location"}
            </button>
            {installPrompt && (
              <button className="secondary" onClick={install}>Install app</button>
            )}
          </div>
        </div>
        <img src="/mascot.svg" alt="Hazemate mascot" className="heroMascot" />
      </section>

      <section className="locationBar">
        <div>
          <span className="muted">Current area</span>
          <strong>{data?.region ? data.region[0].toUpperCase() + data.region.slice(1) : "Central"} Singapore</strong>
        </div>
        <label>
          <span className="srOnly">Choose region</span>
          <select value={regionChoice} onChange={(e) => chooseRegion(e.target.value)}>
            {Object.keys(REGION_COORDS).map((r) => (
              <option value={r} key={r}>{r[0].toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </label>
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="alert">Refreshing environmental readings…</div>}

      <section className="metricGrid">
        <article className={`metricCard psi ${tone}`}>
          <div className="metricHeader"><Wind size={18} /> 24-hour PSI</div>
          <div className="metricValue">{data?.haze?.psi24h ?? "—"}</div>
          <span className="pill">{label}</span>
        </article>

        <article className="metricCard">
          <div className="metricHeader"><CloudSun size={18} /> PM2.5 · 1 hour</div>
          <div className="metricValue">{data?.haze?.pm25_1h ?? "—"} <small>µg/m³</small></div>
          <div className="trend">
            {pmTrend === "rising" ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {pmTrend === "rising" ? "Rising" : pmTrend === "falling" ? "Improving" : "Current reading"}
          </div>
        </article>

        <article className="metricCard">
          <div className="metricHeader"><ThermometerSun size={18} /> Temperature</div>
          <div className="metricValue">{data?.temperature?.value ?? "—"}<small>°C</small></div>
          <span className="muted">{data?.temperature?.stationName ?? "Nearest station"}</span>
        </article>

        <article className="metricCard">
          <div className="metricHeader"><Droplets size={18} /> Humidity</div>
          <div className="metricValue">{data?.humidity?.value ?? "—"}<small>%</small></div>
          <span className="muted">{data?.humidity?.stationName ?? "Nearest station"}</span>
        </article>
      </section>

      <section className="adviceGrid">
        <article className="adviceCard">
          <div className="adviceIcon activity"><Activity size={21} /></div>
          <div>
            <span className="muted">Outdoor guidance</span>
            <h2>What should I do?</h2>
            <p>{guidance(data?.haze?.psi24h ?? null, data?.haze?.pm25_1h ?? null)}</p>
          </div>
        </article>

        <article className="adviceCard">
          <div className="adviceIcon mask"><ShieldCheck size={21} /></div>
          <div>
            <span className="muted">Mask guidance</span>
            <h2>Do I need a mask?</h2>
            <p>{maskGuidance(data?.haze?.psi24h ?? null)}</p>
          </div>
        </article>
      </section>

      <section className="statusCard">
        <div>
          <Bell size={18} />
          <div>
            <strong>Live source status</strong>
            <span>{data?.source ?? "NEA / data.gov.sg"}</span>
          </div>
        </div>
        <div className="statusDot" aria-label="Live"></div>
      </section>

      <footer>
        <p>
          Last updated: {data?.haze?.updatedAt ? new Date(data.haze.updatedAt).toLocaleString("en-SG") : "—"}.
          Hazemate provides decision support; follow official NEA/MOH advisories during haze events.
        </p>
        <p className="installHelp">iPhone/iPad: Safari → Share → Add to Home Screen. Android: browser menu → Install app.</p>
      </footer>
    </main>
  );
}
