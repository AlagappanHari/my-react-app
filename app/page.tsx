"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Bike,
  ChevronLeft,
  CloudSun,
  Droplets,
  Footprints,
  Home as HomeIcon,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ThermometerSun,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { captureHazemateEvent } from "@/lib/analytics";

type RegionName = "north" | "south" | "east" | "west" | "central";

type RegionReading = {
  name: RegionName;
  psi24h: number | null;
  pm25_1h: number | null;
  pm25_24h: number | null;
};

type WeatherReading = {
  value: number | null;
  stationName: string;
  distanceKm: number;
  unit: string;
  timestamp?: string | null;
};

type EnvData = {
  region: RegionName;
  haze: {
    psi24h: number | null;
    pm25_1h: number | null;
    pm25_24h: number | null;
    updatedAt: string | null;
  };
  regions: RegionReading[];
  weather: {
    temperature: WeatherReading | null;
    humidity: WeatherReading | null;
  };
  observedAt: string | null;
  source: string;
};

type HistoryPoint = {
  region: RegionName;
  psi24h: number | null;
  pm25_1h: number | null;
  pm25_24h: number | null;
  observed_at: string;
};

type Screen =
  | "home"
  | "map"
  | "activity"
  | "mask"
  | "trends"
  | "indoor"
  | "alerts";

type Audience = "General" | "Children" | "Elderly" | "Sensitive";
type TrendMetric = "PSI" | "PM2.5";

const REGION_COORDS: Record<RegionName, [number, number]> = {
  north: [1.418, 103.82],
  south: [1.285, 103.833],
  east: [1.35, 103.955],
  west: [1.35, 103.705],
  central: [1.3521, 103.8198]
};

const REGION_LABELS: Record<RegionName, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
  central: "Central"
};

const REGION_POSITIONS: Record<RegionName, string> = {
  north: "region0",
  west: "region1",
  central: "region2",
  east: "region3",
  south: "region4"
};

function psiLabel(psi: number | null) {
  if (psi == null) return ["Unavailable", "neutral"] as const;
  if (psi <= 50) return ["Good", "good"] as const;
  if (psi <= 100) return ["Moderate", "moderate"] as const;
  if (psi <= 200) return ["Unhealthy", "unhealthy"] as const;
  if (psi <= 300) return ["Very Unhealthy", "very-unhealthy"] as const;
  return ["Hazardous", "hazardous"] as const;
}

function guidance(psi: number | null, pm25: number | null, audience: Audience = "General") {
  const p = psi ?? 0;
  const pm = pm25 ?? 0;
  const sensitive = audience !== "General";

  if (p > 300) return "Avoid strenuous outdoor activity and stay indoors where practical.";
  if (p > 200) return sensitive
    ? "Minimise outdoor exposure and avoid strenuous activity."
    : "Reduce prolonged or strenuous outdoor activity.";
  if (p > 100 || pm >= 55) return sensitive
    ? "Keep outdoor activity short and light."
    : "Consider reducing strenuous outdoor activities.";
  if (pm >= 35) return "Conditions are elevated. Prefer shorter, lighter outdoor sessions.";
  return "Outdoor activities are generally suitable. Keep checking conditions.";
}

function maskGuidance(psi: number | null, audience: Audience = "General") {
  const p = psi ?? 0;
  if (p > 300) return "If prolonged outdoor exposure is unavoidable, consider a well-fitting N95 and follow official health advice.";
  if (p > 200 && audience !== "General") return "Minimise outdoor exposure. If you must stay outdoors for a prolonged period, seek guidance on suitable respiratory protection.";
  return "A mask is generally not needed for short outdoor exposure. Reducing exposure remains the priority.";
}

function activityStatus(psi: number | null, audience: Audience, intensity: "light" | "moderate" | "high") {
  const p = psi ?? 0;
  const sensitive = audience !== "General";
  const limit = sensitive ? 100 : 150;

  if (p > 200) return { label: "Avoid", tone: "unhealthy", subtitle: "Choose an indoor alternative" };
  if (p > limit || (p > 100 && intensity === "high")) return { label: "Limit", tone: "moderate", subtitle: "Shorten duration and reduce intensity" };
  if (p > 100 && intensity !== "light") return { label: "Moderate", tone: "moderate", subtitle: "Keep the session light" };
  return { label: "Good", tone: "good", subtitle: "Generally suitable" };
}

function formatTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-SG", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" });
}

const tabs: { id: Screen; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "map", label: "Map", icon: MapPin },
  { id: "mask", label: "Advice", icon: ShieldCheck },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "alerts", label: "More", icon: Menu }
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [data, setData] = useState<EnvData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [regionChoice, setRegionChoice] = useState<RegionName>("central");
  const [locating, setLocating] = useState(false);
  const [audience, setAudience] = useState<Audience>("General");
  const [mapMetric, setMapMetric] = useState<TrendMetric>("PSI");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("PSI");
  const [period, setPeriod] = useState<"Today" | "7 Days" | "30 Days">("Today");
  const [previousPm, setPreviousPm] = useState<number | null>(null);
  const [alertPsi, setAlertPsi] = useState(101);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [indoorPm25, setIndoorPm25] = useState<number | "">("");
  const [indoorSaved, setIndoorSaved] = useState<number | null>(null);

  const load = useCallback(async (lat: number, lon: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lon=${lon}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Environmental data is temporarily unavailable.");
      const next: EnvData = await res.json();
      setPreviousPm((current) => current ?? next.haze.pm25_1h ?? null);
      setData(next);
      setRegionChoice(next.region);
      captureHazemateEvent("environment_loaded", {
        region: next.region,
        psi24h: next.haze.psi24h,
        pm25_1h: next.haze.pm25_1h
      });
    } catch (e) {
      captureHazemateEvent("environment_load_failed", {
        message: e instanceof Error ? e.message : "unknown"
      });
      setError(e instanceof Error ? e.message : "Unable to load air quality.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRegion = useCallback(async (region: RegionName) => {
    const [lat, lon] = REGION_COORDS[region];
    setRegionChoice(region);
    localStorage.setItem("hazemate-region", region);
    await load(lat, lon);
  }, [load]);

  const loadHistory = useCallback(async (region: RegionName, selectedPeriod: typeof period) => {
    setHistoryLoading(true);
    try {
      const hours = selectedPeriod === "Today" ? 24 : selectedPeriod === "7 Days" ? 24 * 7 : 24 * 30;
      const res = await fetch(`/api/environment/history?region=${region}&hours=${hours}`, { cache: "no-store" });
      if (!res.ok) throw new Error("History unavailable");
      const json = await res.json();
      setHistory(Array.isArray(json.readings) ? json.readings : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function useLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }
    setLocating(true);
    captureHazemateEvent("location_permission_requested");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        captureHazemateEvent("location_permission_granted");
        load(position.coords.latitude, position.coords.longitude).finally(() => {
          setLocating(false);
          localStorage.setItem("hazemate-location-mode", "gps");
        });
      },
      () => {
        captureHazemateEvent("location_permission_denied");
        setError("Location permission was not granted. Choose a Singapore region instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }

  function chooseRegion(value: RegionName) {
    captureHazemateEvent("region_selected", { region: value });
    localStorage.setItem("hazemate-location-mode", "manual");
    void loadRegion(value);
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    if (result === "granted") {
      setAlertsEnabled(true);
      localStorage.setItem("hazemate-alerts-enabled", "1");
    }
  }

  function saveIndoorReading() {
    if (indoorPm25 === "" || indoorPm25 < 0) return;
    setIndoorSaved(Number(indoorPm25));
    localStorage.setItem("hazemate-indoor-pm25", String(indoorPm25));
  }

  useEffect(() => {
    const storedRegion = (localStorage.getItem("hazemate-region") as RegionName | null) ?? "central";
    if (storedRegion in REGION_COORDS) setRegionChoice(storedRegion);

    const storedAlert = Number(localStorage.getItem("hazemate-alert-psi") ?? "101");
    if (Number.isFinite(storedAlert)) setAlertPsi(storedAlert);

    setAlertsEnabled(localStorage.getItem("hazemate-alerts-enabled") === "1");

    const indoor = Number(localStorage.getItem("hazemate-indoor-pm25"));
    if (Number.isFinite(indoor) && indoor >= 0) {
      setIndoorSaved(indoor);
      setIndoorPm25(indoor);
    }

    if ("Notification" in window) setNotificationPermission(Notification.permission);
    else setNotificationPermission("unsupported");

    void load(...REGION_COORDS[storedRegion]);

  }, [load]);

  useEffect(() => {
    if (screen === "trends") void loadHistory(regionChoice, period);
  }, [screen, regionChoice, period, loadHistory]);

  useEffect(() => {
    const psi = data?.haze.psi24h;
    if (!alertsEnabled || psi == null || psi < alertPsi) return;
    if (notificationPermission !== "granted") return;

    const key = `hazemate-last-alert-${regionChoice}-${alertPsi}`;
    const last = Number(localStorage.getItem(key) ?? "0");
    if (Date.now() - last < 60 * 60 * 1000) return;

    new Notification("Hazemate air-quality alert", {
      body: `${REGION_LABELS[regionChoice]} Region PSI is ${psi}.`
    });
    localStorage.setItem(key, String(Date.now()));
  }, [alertsEnabled, alertPsi, data, notificationPermission, regionChoice]);

  const [label, tone] = psiLabel(data?.haze.psi24h ?? null);
  const displayPsi = data?.haze.psi24h ?? null;
  const displayPm = data?.haze.pm25_1h ?? null;
  const temperature = data?.weather.temperature?.value ?? null;
  const humidity = data?.weather.humidity?.value ?? null;
  const unhealthy = (displayPsi ?? 0) > 100;

  const pmTrend = useMemo(() => {
    if (displayPm == null || previousPm == null || displayPm === previousPm) return "steady";
    return displayPm > previousPm ? "rising" : "falling";
  }, [displayPm, previousPm]);

  const chartValues = useMemo(() => {
    const raw = history
      .map((p) => trendMetric === "PSI" ? p.psi24h : p.pm25_1h)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    if (!raw.length) return [];
    const max = Math.max(...raw, 1);
    return raw.map((v) => Math.max(8, Math.round((v / max) * 100)));
  }, [history, trendMetric]);

  const trendDelta = useMemo(() => {
    if (history.length < 2) return null;
    const first = trendMetric === "PSI" ? history[0].psi24h : history[0].pm25_1h;
    const last = trendMetric === "PSI" ? history.at(-1)?.psi24h : history.at(-1)?.pm25_1h;
    if (first == null || last == null || first === 0) return null;
    return Math.round(((last - first) / first) * 100);
  }, [history, trendMetric]);

  const activities = useMemo(() => [
    { title: "Walking", icon: Footprints, ...activityStatus(displayPsi, audience, "light") },
    { title: "Running", icon: Activity, ...activityStatus(displayPsi, audience, "high") },
    { title: "Cycling", icon: Bike, ...activityStatus(displayPsi, audience, "moderate") },
    { title: "Outdoor sports", icon: Activity, ...activityStatus(displayPsi, audience, "high") },
    { title: "Outdoor with kids", icon: Sparkles, ...activityStatus(displayPsi, audience === "General" ? "Children" : audience, "moderate") }
  ], [displayPsi, audience]);

  function Shell({ children, title, back = false }: { children: React.ReactNode; title?: string; back?: boolean }) {
    return (
      <div className="appShell">
        <header className="appHeader">
          <button className="brandButton" onClick={() => setScreen("home")} aria-label="Hazemate home">
            <img src="/mascot.svg" alt="" aria-hidden="true" />
            <span className="wordmark">Haze<span>mate</span></span>
          </button>

          <nav className="desktopNav" aria-label="Primary">
            {tabs.map((item) => {
              const Icon = item.icon;
              const selected = screen === item.id || (item.id === "alerts" && ["alerts","trends","indoor"].includes(screen));
              return (
                <button key={item.id} className={selected ? "desktopNavItem active" : "desktopNavItem"} onClick={() => setScreen(item.id)}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="headerControls">
            <select className="headerRegionSelect" value={regionChoice} onChange={(e) => chooseRegion(e.target.value as RegionName)} aria-label="Choose region">
              {Object.keys(REGION_COORDS).map((r) => <option key={r} value={r}>{REGION_LABELS[r as RegionName]}</option>)}
            </select>
            <button className="headerIconButton" onClick={useLocation} disabled={locating} aria-label="Use my location">
              <MapPin size={18} />
            </button>
            <button className="headerIconButton" onClick={() => void loadRegion(regionChoice)} aria-label="Refresh data">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {title ? (
          <div className="pageHeader">
            {back ? <button className="backBtn" onClick={() => setScreen("home")} aria-label="Back"><ChevronLeft size={20} /></button> : <span />}
            <div>
              <strong>{title}</strong>
              <small>{REGION_LABELS[regionChoice]} Region · updated {formatTime(data?.haze.updatedAt)}</small>
            </div>
            <span />
          </div>
        ) : null}

        <main className="appContent">{children}</main>
        <BottomNav />
      </div>
    );
  }

  function BottomNav() {
    return (
      <nav className="bottomNav" aria-label="Primary">
        {tabs.map((item) => {
          const Icon = item.icon;
          const selected = screen === item.id || (item.id === "alerts" && ["alerts","trends","indoor"].includes(screen));
          return (
            <button key={item.id} className={selected ? "navItem active" : "navItem"} onClick={() => setScreen(item.id)}>
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  if (screen === "home") {
    return (
      <Shell>
        <section className={unhealthy ? "homeScreen unhealthyHome" : "homeScreen"}>
          <header className="homeTop">
            <div className="homeIntro">
              <p className="eyebrow">Singapore air quality</p>
              <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}</h1>
              <p>Live outdoor conditions and practical guidance for your day.</p>
            </div>
            <div className="homeMascotWrap"><img src="/mascot.svg" alt="Hazemate mascot" /></div>
            <button className="bellButton" onClick={() => setScreen("alerts")} aria-label="Open alerts"><Bell size={20} /></button>
          </header>

          <div className="mobileLocationControls">
            <select className="regionSelect" value={regionChoice} onChange={(e) => chooseRegion(e.target.value as RegionName)} aria-label="Choose region">
              {Object.keys(REGION_COORDS).map((r) => <option key={r} value={r}>{REGION_LABELS[r as RegionName]} Singapore</option>)}
            </select>
            <button className="locationAction" onClick={useLocation} disabled={locating}><MapPin size={17}/>{locating ? "Locating…" : "Use my location"}</button>
          </div>

          <div className="locationChip">
            <MapPin size={18}/>
            <div>
              <strong>{REGION_LABELS[regionChoice]} Singapore</strong>
              <span>{data?.source ?? "NEA / data.gov.sg"}</span>
              <small>Updated {formatTime(data?.haze.updatedAt)}</small>
            </div>
            <button className="chipRefresh" onClick={() => void loadRegion(regionChoice)} aria-label="Refresh current readings"><RefreshCw size={16}/></button>
          </div>

          {error ? <div className="miniAlert">{error}</div> : null}
          {loading ? <div className="miniAlert">Refreshing environmental readings…</div> : null}

          <div className={`airHeroCard ${tone}`}>
            <div><span>PSI (24-hr)</span><strong>{displayPsi ?? "—"}</strong><em>{label}</em></div>
            <div><span>PM2.5 (1-hr)</span><strong>{displayPm ?? "—"}<small> µg/m³</small></strong><em>{displayPm == null ? "—" : displayPm >= 35 ? "Elevated" : "Normal"}</em></div>
          </div>

          <div className="weatherStrip">
            <div><ThermometerSun size={18}/><span>Temperature</span><strong>{temperature ?? "—"}°C</strong></div>
            <div><Droplets size={18}/><span>Humidity</span><strong>{humidity ?? "—"}%</strong></div>
          </div>

          <div className={unhealthy ? "trendCard warning" : "trendCard"}>
            <div className="trendIcon">{unhealthy ? "!" : pmTrend === "rising" ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</div>
            <div><strong>{unhealthy ? "Air quality is unhealthy." : pmTrend === "falling" ? "PM2.5 is improving" : pmTrend === "rising" ? "PM2.5 is rising" : "Current outdoor guidance"}</strong><span>{guidance(displayPsi, displayPm, audience)}</span></div>
          </div>

          <h3>Quick Actions</h3>
          <div className="quickActions">
            <button onClick={() => setScreen("activity")}><Footprints size={20}/><span>Walk</span></button>
            <button onClick={() => setScreen("activity")} className={unhealthy ? "warnAction" : ""}><Activity size={20}/><span>Run</span></button>
            <button onClick={() => setScreen("activity")}><Bike size={20}/><span>Cycle</span></button>
            <button onClick={() => setScreen("map")}><MapPin size={20}/><span>Regions</span></button>
            <button onClick={() => setScreen("alerts")}><Menu size={20}/><span>More</span></button>
          </div>

          <div className="moreCards">
            <button onClick={() => setScreen("trends")}><TrendingDown size={18}/><span>View trends</span></button>
            <button onClick={() => setScreen("indoor")}><HomeIcon size={18}/><span>Indoor air</span></button>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "map") {
    return (
      <Shell title="Air Quality Map" back>
        <div className="segmented"><button onClick={() => setMapMetric("PSI")} className={mapMetric === "PSI" ? "selected" : ""}>PSI</button><button onClick={() => setMapMetric("PM2.5")} className={mapMetric === "PM2.5" ? "selected" : ""}>PM2.5</button></div>
        <div className="mapCanvas">
          <div className="mapGrid" />
          {(data?.regions ?? []).map((r) => {
            const value = mapMetric === "PSI" ? r.psi24h : r.pm25_1h;
            const [, rTone] = psiLabel(r.psi24h);
            return (
              <button key={r.name} className={`regionBubble ${REGION_POSITIONS[r.name]} ${rTone} ${regionChoice === r.name ? "current" : ""}`} onClick={() => void loadRegion(r.name)}>
                <span>{REGION_LABELS[r.name]}</span><strong>{value ?? "—"}</strong><small>{mapMetric === "PSI" ? psiLabel(r.psi24h)[0] : "µg/m³"}</small>
              </button>
            );
          })}
          <div className="youDot"><span/></div>
        </div>
        <div className="legend">
          {["Good 0–50","Moderate 51–100","Unhealthy 101–200","Very Unhealthy 201–300","Hazardous >300"].map((x,i)=><span key={x}><i className={`legendDot d${i}`}/>{x}</span>)}
        </div>
        <div className="mapFooter">Tap a region to make it your current Hazemate region.</div>
      </Shell>
    );
  }

  if (screen === "activity") {
    return (
      <Shell title="Activity Advisor" back>
        <div className="pillTabs">
          {(["General","Children","Elderly","Sensitive"] as Audience[]).map((x)=><button key={x} onClick={()=>setAudience(x)} className={audience===x?"selected":""}>{x}</button>)}
        </div>
        <div className="contextCard"><strong>{REGION_LABELS[regionChoice]} · PSI {displayPsi ?? "—"}</strong><span>{guidance(displayPsi, displayPm, audience)}</span></div>
        <div className="activityList">
          {activities.map(({title,subtitle,label:status,tone:activityTone,icon:Icon})=>(
            <div className="activityRow" key={title}>
              <div className={`roundIcon ${activityTone}`}><Icon size={21}/></div>
              <div className="grow"><strong>{title}</strong><span>{subtitle}</span></div>
              <em className={`statusPill ${activityTone}`}>{status}</em>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (screen === "mask") {
    return (
      <Shell title="Mask Guidance" back>
        <section className="maskScreen">
          <img src="/mascot.svg" alt="Hazemate mascot" className="maskMascot"/>
          <h2>Do I need a mask today?</h2>
          <div className="pillTabs audienceTabs">
            {(["General","Children","Elderly","Sensitive"] as Audience[]).map((x)=><button key={x} onClick={()=>setAudience(x)} className={audience===x?"selected":""}>{x}</button>)}
          </div>
          <div className="maskDecision">
            <div className="decisionIcon"><ShieldCheck size={22}/></div>
            <div><strong>{maskGuidance(displayPsi, audience)}</strong><span>PSI {displayPsi ?? "—"} · {label}</span><p>Hazemate uses official air-quality context to support decisions. During severe haze, follow current NEA/MOH advisories.</p></div>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "trends") {
    const current = trendMetric === "PSI" ? displayPsi : displayPm;
    return (
      <Shell title="Trends" back>
        <div className="pillTabs">
          {(["PSI","PM2.5"] as TrendMetric[]).map((x)=><button key={x} onClick={()=>setTrendMetric(x)} className={trendMetric===x?"selected":""}>{x}</button>)}
        </div>
        <div className="trendPanel">
          <span>{trendMetric} · {REGION_LABELS[regionChoice]}</span>
          <div className="bigNumber">{current ?? "—"}{trendDelta != null ? <em className={trendDelta > 0 ? "deltaUp" : ""}>{trendDelta > 0 ? "↑" : "↓"} {Math.abs(trendDelta)}%</em> : null}</div>
          <small className={`statusPill ${tone}`}>{label}</small>
          {historyLoading ? <div className="miniAlert">Loading stored readings…</div> : null}
          {chartValues.length ? (
            <>
              <div className="miniChart" aria-label="Historical air quality trend">{chartValues.map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div>
              <div className="chartAxis"><span>Older</span><span>{history.length} stored readings</span><span>Now</span></div>
            </>
          ) : <div className="emptyChart">Hazemate is collecting readings. Trend history will fill in over time.</div>}
        </div>
        <div className="periodTabs">{(["Today","7 Days","30 Days"] as const).map((x)=><button key={x} onClick={()=>setPeriod(x)} className={period===x?"selected":""}>{x}</button>)}</div>
        <div className="forecastCard"><CloudSun size={19}/><div><strong>Data freshness</strong><span>Latest reading: {formatDateTime(data?.observedAt)}</span></div></div>
      </Shell>
    );
  }

  if (screen === "indoor") {
    const outdoor = displayPm;
    const difference = indoorSaved != null && outdoor != null ? Math.round((indoorSaved - outdoor) * 10) / 10 : null;
    return (
      <Shell title="Indoor Air" back>
        <section className="indoorScreen">
          <div className="roomIllustration"><HomeIcon size={74}/><div className="purifier">●</div></div>
          <h2>Compare indoor and outdoor air</h2>
          <p className="indoorIntro">Enter a PM2.5 reading from your purifier or indoor air-quality monitor.</p>
          <div className="indoorInputRow">
            <input type="number" min="0" inputMode="decimal" placeholder="Indoor PM2.5" value={indoorPm25} onChange={(e)=>setIndoorPm25(e.target.value === "" ? "" : Number(e.target.value))}/>
            <button onClick={saveIndoorReading}>Save</button>
          </div>
          <div className="comparisonGrid">
            <div><span>Outdoor</span><strong>{outdoor ?? "—"}</strong><small>µg/m³</small></div>
            <div><span>Indoor</span><strong>{indoorSaved ?? "—"}</strong><small>µg/m³</small></div>
          </div>
          {difference != null ? <div className="contextCard"><strong>{difference <= 0 ? "Indoor air is cleaner" : "Indoor air is more polluted"}</strong><span>{Math.abs(difference)} µg/m³ difference compared with outside.</span></div> : null}
          <div className="indoorBenefits">
            <span>Reading is stored only on this device</span>
            <span>Use your monitor's PM2.5 value</span>
            <span>Future device integrations can automate this</span>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Alerts" back>
      <div className="alertsSettings">
        <div className="settingRow"><div><strong>PSI alert threshold</strong><span>Notify when your selected region reaches this level.</span></div><input type="number" min="51" max="500" value={alertPsi} onChange={(e)=>{const v=Number(e.target.value);setAlertPsi(v);localStorage.setItem("hazemate-alert-psi",String(v));}}/></div>
        <div className="settingRow"><div><strong>In-app alerts</strong><span>Current region: {REGION_LABELS[regionChoice]}</span></div><label className="switch"><input type="checkbox" checked={alertsEnabled} onChange={(e)=>{setAlertsEnabled(e.target.checked);localStorage.setItem("hazemate-alerts-enabled",e.target.checked?"1":"0");}}/><span/></label></div>
        <button className="primaryBtn" onClick={requestNotifications}>{notificationPermission === "granted" ? "Browser notifications enabled" : notificationPermission === "unsupported" ? "Notifications not supported" : "Enable browser notifications"}</button>
      </div>
      <div className="alertsList">
        <div className="alertRow"><div className={`alertDot ${unhealthy ? "red" : "green"}`}>!</div><div><strong>{unhealthy ? "Current air quality is unhealthy" : "Current air quality update"}</strong><span>{REGION_LABELS[regionChoice]} Region · PSI {displayPsi ?? "—"}</span></div><span>›</span></div>
        {displayPm != null ? <div className="alertRow"><div className={`alertDot ${pmTrend === "rising" ? "amber" : "blue"}`}>!</div><div><strong>PM2.5 {pmTrend === "rising" ? "is rising" : pmTrend === "falling" ? "is improving" : "current reading"}</strong><span>{displayPm} µg/m³ · updated {formatTime(data?.haze.updatedAt)}</span></div><span>›</span></div> : null}
      </div>
    </Shell>
  );
}
