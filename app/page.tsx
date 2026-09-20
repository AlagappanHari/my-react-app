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
  Info,
  MapPin,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThermometerSun,
  TrendingDown
} from "lucide-react";
import { captureHazemateEvent } from "@/lib/analytics";
import {
  Audience,
  DECISION_RULE_VERSION,
  HEALTH_GUIDANCE_REVIEWED_AT,
  FreshnessStatus,
  classifyPm25,
  classifyPsi,
  getMaskGuidance,
  getOutdoorDecision
} from "@/lib/hazemate-decision";

type RegionName = "north" | "south" | "east" | "west" | "central";
type TrendMetric = "PSI" | "PM2.5";
type Period = "Last 24 Hours" | "7 Days" | "30 Days";
type Screen = "home" | "map" | "activity" | "mask" | "trends" | "indoor" | "alerts";

type RegionReading = {
  name: RegionName;
  psi24h: number | null;
  pm25_1h: number | null;
  pm25_24h: number | null;
};

type WeatherReading = {
  value: number | null;
  stationName: string;
  distanceKm: number | null;
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
  freshness?: {
    status: FreshnessStatus;
    ageMinutes: number | null;
    isStale: boolean;
    thresholdMinutes: number;
  };
  sources?: Record<string, string>;
  errors?: Array<{ source: string; message: string }>;
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

const tabs: { id: Screen; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "map", label: "Regions", icon: MapPin },
  { id: "mask", label: "Advice", icon: ShieldCheck },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "alerts", label: "More", icon: Menu }
];

function formatTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore"
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore"
  });
}

function fallbackFreshness(data: EnvData | null): FreshnessStatus {
  if (!data) return "unavailable";
  if (data.freshness?.status) return data.freshness.status;
  const available = [data.haze.psi24h, data.haze.pm25_1h].filter((v) => v != null).length;
  return available === 0 ? "unavailable" : available === 1 ? "partial" : "fresh";
}

function staleCachedData(cached: EnvData): EnvData {
  const observed = cached.observedAt ? new Date(cached.observedAt).getTime() : NaN;
  const ageMinutes = Number.isFinite(observed)
    ? Math.max(15, Math.round((Date.now() - observed) / 60000))
    : null;
  return {
    ...cached,
    freshness: {
      status: "stale",
      ageMinutes,
      isStale: true,
      thresholdMinutes: 15
    }
  };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [data, setData] = useState<EnvData | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const [regionChoice, setRegionChoice] = useState<RegionName>("central");
  const [locating, setLocating] = useState(false);
  const [audience, setAudience] = useState<Audience>("General");
  const [mapMetric, setMapMetric] = useState<TrendMetric>("PSI");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("PSI");
  const [period, setPeriod] = useState<Period>("Last 24 Hours");
  const [alertPsi, setAlertPsi] = useState(101);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission | "unsupported">("default");
  const [indoorPm25, setIndoorPm25] = useState<number | "">("");
  const [indoorSaved, setIndoorSaved] = useState<number | null>(null);

  const load = useCallback(async (lat: number, lon: number, fallbackRegion?: RegionName) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lon=${lon}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error?.message ?? "Environmental data is temporarily unavailable.");
      }

      const next: EnvData = payload;
      setData(next);
      setRegionChoice(next.region);
      localStorage.setItem("hazemate-region", next.region);
      localStorage.setItem("hazemate-last-environment", JSON.stringify(next));

      captureHazemateEvent("environment_loaded", {
        region: next.region,
        psi24h: next.haze.psi24h,
        pm25_1h: next.haze.pm25_1h,
        freshness: next.freshness?.status ?? "unknown"
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to load air quality.";
      captureHazemateEvent("environment_load_failed", { message });

      const raw = localStorage.getItem("hazemate-last-environment");
      if (raw) {
        try {
          const cached = JSON.parse(raw) as EnvData;
          if (!fallbackRegion || cached.region === fallbackRegion) {
            setData(staleCachedData(cached));
            setRegionChoice(cached.region);
            setError("You are offline or current data could not be refreshed. Showing the last saved reading as stale.");
            return;
          }
        } catch {
          // Ignore invalid local cache and show the normal error below.
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRegion = useCallback(async (region: RegionName) => {
    const [lat, lon] = REGION_COORDS[region];
    setRegionChoice(region);
    localStorage.setItem("hazemate-region", region);
    await load(lat, lon, region);
  }, [load]);

  const loadHistory = useCallback(async (region: RegionName, selectedPeriod: Period) => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const hours =
        selectedPeriod === "Last 24 Hours" ? 24 :
        selectedPeriod === "7 Days" ? 24 * 7 :
        24 * 30;
      const res = await fetch(`/api/environment/history?region=${region}&hours=${hours}`, {
        cache: "no-store"
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "History unavailable");
      setHistory(Array.isArray(json.readings) ? json.readings : []);
    } catch {
      setHistory([]);
      setHistoryError("Historical readings are temporarily unavailable. Current air-quality information is still available.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function useLocation() {
    if (!navigator.geolocation) {
      setError("Location is not supported on this device. Choose a Singapore region instead.");
      return;
    }

    setLocating(true);
    setError("");
    captureHazemateEvent("location_permission_requested");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        captureHazemateEvent("location_permission_granted");
        localStorage.setItem("hazemate-location-mode", "gps");
        load(position.coords.latitude, position.coords.longitude).finally(() => setLocating(false));
      },
      (locationError) => {
        captureHazemateEvent("location_permission_denied");
        setError(
          locationError.code === 3
            ? "Location request timed out. Your selected region is unchanged."
            : "Location permission was not granted. Your selected region is unchanged."
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  function chooseRegion(value: RegionName) {
    localStorage.setItem("hazemate-location-mode", "manual");
    localStorage.setItem("hazemate-region", value);
    captureHazemateEvent("region_selected", { region: value });
    void loadRegion(value);
  }

  function changeAudience(next: Audience) {
    setAudience(next);
    captureHazemateEvent("activity_profile_changed", { profile: next });
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      captureHazemateEvent("notification_permission_result", { result: "unsupported" });
      return;
    }
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    captureHazemateEvent("notification_permission_result", { result });
    if (result === "granted") {
      setAlertsEnabled(true);
      localStorage.setItem("hazemate-alerts-enabled", "1");
    }
  }

  function saveIndoorReading() {
    if (indoorPm25 === "" || !Number.isFinite(indoorPm25) || indoorPm25 < 0) {
      return;
    }
    const value = Math.round(Number(indoorPm25) * 10) / 10;
    setIndoorSaved(value);
    setIndoorPm25(value);
    localStorage.setItem("hazemate-indoor-pm25", String(value));
  }

  useEffect(() => {
    const storedRegion = (localStorage.getItem("hazemate-region") as RegionName | null) ?? "central";
    if (storedRegion in REGION_COORDS) setRegionChoice(storedRegion);

    const storedAlert = Number(localStorage.getItem("hazemate-alert-psi") ?? "101");
    if (Number.isFinite(storedAlert)) setAlertPsi(Math.min(500, Math.max(51, storedAlert)));

    setAlertsEnabled(localStorage.getItem("hazemate-alerts-enabled") === "1");

    const indoorRaw = localStorage.getItem("hazemate-indoor-pm25");
    if (indoorRaw != null) {
      const indoor = Number(indoorRaw);
      if (Number.isFinite(indoor) && indoor >= 0) {
        setIndoorSaved(indoor);
        setIndoorPm25(indoor);
      }
    }

    if ("Notification" in window) setNotificationPermission(Notification.permission);
    else setNotificationPermission("unsupported");

    void load(...REGION_COORDS[storedRegion], storedRegion);
  }, [load]);

  useEffect(() => {
    if (screen === "trends") void loadHistory(regionChoice, period);
  }, [screen, regionChoice, period, loadHistory]);

  useEffect(() => {
    const psi = data?.haze.psi24h;
    const freshness = fallbackFreshness(data);
    if (!alertsEnabled || psi == null || psi < alertPsi) return;
    if (freshness !== "fresh" && freshness !== "partial") return;
    if (notificationPermission !== "granted") return;

    const key = `hazemate-last-alert-${regionChoice}-${alertPsi}`;
    const last = Number(localStorage.getItem(key) ?? "0");
    if (Date.now() - last < 60 * 60 * 1000) return;

    new Notification("Hazemate air-quality alert", {
      body: `${REGION_LABELS[regionChoice]} Region PSI is ${psi}. Open Hazemate for current guidance.`
    });
    localStorage.setItem(key, String(Date.now()));
  }, [alertsEnabled, alertPsi, data, notificationPermission, regionChoice]);

  const displayPsi = data?.haze.psi24h ?? null;
  const displayPm = data?.haze.pm25_1h ?? null;
  const temperature = data?.weather.temperature?.value ?? null;
  const humidity = data?.weather.humidity?.value ?? null;
  const freshness = fallbackFreshness(data);
  const psiStatus = classifyPsi(displayPsi);
  const pmStatus = classifyPm25(displayPm);

  const dashboardDecision = useMemo(
    () => getOutdoorDecision({
      psi24h: displayPsi,
      pm25_1h: displayPm,
      audience,
      intensity: "moderate",
      freshness
    }),
    [displayPsi, displayPm, audience, freshness]
  );

  const activities = useMemo(() => {
    const configs = [
      { title: "Walking", icon: Footprints, intensity: "light" as const, profile: audience },
      { title: "Running", icon: Activity, intensity: "high" as const, profile: audience },
      { title: "Cycling", icon: Bike, intensity: "moderate" as const, profile: audience },
      { title: "Outdoor sports", icon: Activity, intensity: "high" as const, profile: audience },
      {
        title: "Outdoor with kids",
        icon: Sparkles,
        intensity: "moderate" as const,
        profile: audience === "General" ? "Children" as const : audience
      }
    ];
    return configs.map((item) => ({
      ...item,
      decision: getOutdoorDecision({
        psi24h: displayPsi,
        pm25_1h: displayPm,
        audience: item.profile,
        intensity: item.intensity,
        freshness
      })
    }));
  }, [audience, displayPsi, displayPm, freshness]);

  const mask = useMemo(
    () => getMaskGuidance({ psi24h: displayPsi, audience, freshness }),
    [displayPsi, audience, freshness]
  );

  const chartValues = useMemo(() => {
    const raw = history
      .map((point) => trendMetric === "PSI" ? point.psi24h : point.pm25_1h)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!raw.length) return [];
    const max = Math.max(...raw, 1);
    return raw.map((value) => Math.max(8, Math.round((value / max) * 100)));
  }, [history, trendMetric]);

  const trendDelta = useMemo(() => {
    const valid = history
      .map((point) => trendMetric === "PSI" ? point.psi24h : point.pm25_1h)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (valid.length < 2 || valid[0] === 0) return null;
    return Math.round(((valid[valid.length - 1] - valid[0]) / valid[0]) * 100);
  }, [history, trendMetric]);

  function Shell({
    children,
    title,
    back = false
  }: {
    children: React.ReactNode;
    title?: string;
    back?: boolean;
  }) {
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
              const selected =
                screen === item.id ||
                (item.id === "alerts" && ["alerts", "trends", "indoor"].includes(screen));
              return (
                <button
                  key={item.id}
                  className={selected ? "desktopNavItem active" : "desktopNavItem"}
                  onClick={() => setScreen(item.id)}
                  aria-current={selected ? "page" : undefined}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="headerControls">
            <select
              className="headerRegionSelect"
              value={regionChoice}
              onChange={(event) => chooseRegion(event.target.value as RegionName)}
              aria-label="Choose region"
            >
              {Object.keys(REGION_COORDS).map((region) => (
                <option key={region} value={region}>
                  {REGION_LABELS[region as RegionName]}
                </option>
              ))}
            </select>
            <button
              className="headerIconButton"
              onClick={useLocation}
              disabled={locating}
              aria-label="Use my location"
              title="Use my location"
            >
              <MapPin size={18} />
            </button>
            <button
              className="headerIconButton"
              onClick={() => void loadRegion(regionChoice)}
              aria-label="Refresh data"
              title="Refresh data"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {title ? (
          <div className="pageHeader">
            {back ? (
              <button className="backBtn" onClick={() => setScreen("home")} aria-label="Back to home">
                <ChevronLeft size={20} />
              </button>
            ) : <span />}
            <div>
              <strong>{title}</strong>
              <small>
                {REGION_LABELS[regionChoice]} Region · updated {formatTime(data?.haze.updatedAt)}
              </small>
            </div>
            <span />
          </div>
        ) : null}

        <main className="appContent">{children}</main>

        <footer className="appFootnote">
          <span>Official environmental data: NEA / data.gov.sg.</span>
          <span>Hazemate supports everyday decisions and does not replace official health advisories or medical advice.</span>
        </footer>

        <BottomNav />
      </div>
    );
  }

  function BottomNav() {
    return (
      <nav className="bottomNav" aria-label="Primary">
        {tabs.map((item) => {
          const Icon = item.icon;
          const selected =
            screen === item.id ||
            (item.id === "alerts" && ["alerts", "trends", "indoor"].includes(screen));
          return (
            <button
              key={item.id}
              className={selected ? "navItem active" : "navItem"}
              onClick={() => setScreen(item.id)}
              aria-current={selected ? "page" : undefined}
            >
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
        <section className="homeScreen">
          <header className="homeTop">
            <div className="homeIntro">
              <p className="eyebrow">Singapore air quality</p>
              <h1>Can I go outside now?</h1>
              <p>Live conditions and practical guidance for your day.</p>
            </div>
            <div className="homeMascotWrap">
              <img src="/mascot.svg" alt="Hazemate mascot" />
            </div>
            <button className="bellButton" onClick={() => setScreen("alerts")} aria-label="Open alerts">
              <Bell size={20} />
            </button>
          </header>

          <div className="mobileLocationControls">
            <select
              className="regionSelect"
              value={regionChoice}
              onChange={(event) => chooseRegion(event.target.value as RegionName)}
              aria-label="Choose region"
            >
              {Object.keys(REGION_COORDS).map((region) => (
                <option key={region} value={region}>
                  {REGION_LABELS[region as RegionName]} Singapore
                </option>
              ))}
            </select>
            <button className="locationAction" onClick={useLocation} disabled={locating}>
              <MapPin size={17} />
              {locating ? "Locating…" : "Use my location"}
            </button>
          </div>

          <div className="locationChip">
            <MapPin size={18} />
            <div>
              <strong>{REGION_LABELS[regionChoice]} Singapore</strong>
              <span>{data?.source ?? "NEA / data.gov.sg"}</span>
              <small>
                Updated {formatTime(data?.haze.updatedAt)}
                {data?.freshness?.ageMinutes != null ? ` · ${data.freshness.ageMinutes} min old` : ""}
              </small>
            </div>
            <button
              className="chipRefresh"
              onClick={() => void loadRegion(regionChoice)}
              aria-label="Refresh current readings"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {error ? <div className="miniAlert warningNotice" role="status" aria-live="polite">{error}</div> : null}
          {loading ? <div className="miniAlert" role="status" aria-live="polite">Refreshing environmental readings…</div> : null}
          {freshness === "stale" ? (
            <div className="dataState stale" role="status">
              <strong>Stale data</strong>
              <span>Refresh before making a time-sensitive outdoor decision.</span>
            </div>
          ) : freshness === "partial" ? (
            <div className="dataState partial" role="status">
              <strong>Limited data</strong>
              <span>One core air-quality reading is unavailable. Guidance is intentionally more cautious.</span>
            </div>
          ) : null}

          <div className="airHeroCard accessibleStatus">
            <div>
              <span>PSI (24-hr)</span>
              <strong>{displayPsi ?? "—"}</strong>
              <em className={psiStatus.tone}>{psiStatus.label}</em>
            </div>
            <div>
              <span>PM2.5 (1-hr)</span>
              <strong>{displayPm ?? "—"}<small> µg/m³</small></strong>
              <em className={pmStatus.tone}>{pmStatus.label}</em>
            </div>
          </div>

          <div className="weatherStrip">
            <div>
              <ThermometerSun size={18} />
              <span>Temperature</span>
              <strong>{temperature ?? "—"}{temperature != null ? "°C" : ""}</strong>
            </div>
            <div>
              <Droplets size={18} />
              <span>Humidity</span>
              <strong>{humidity ?? "—"}{humidity != null ? "%" : ""}</strong>
            </div>
          </div>

          <div className={`decisionCard ${dashboardDecision.tone}`} aria-live="polite">
            <div className="decisionTopline">
              <span className="decisionState">{dashboardDecision.suitability}</span>
              <span className="confidencePill">{dashboardDecision.confidence}</span>
            </div>
            <h2>{dashboardDecision.headline}</h2>
            <p>{dashboardDecision.recommendation}</p>
            <small>{dashboardDecision.reason}</small>
          </div>

          <div className="audienceInline">
            <span>Guidance for</span>
            <div className="pillTabs compactPills">
              {(["General", "Children", "Elderly", "Sensitive"] as Audience[]).map((profile) => (
                <button
                  key={profile}
                  onClick={() => changeAudience(profile)}
                  className={audience === profile ? "selected" : ""}
                  aria-pressed={audience === profile}
                >
                  {profile}
                </button>
              ))}
            </div>
          </div>

          <h3>Quick Actions</h3>
          <div className="quickActions">
            <button onClick={() => setScreen("activity")}><Footprints size={20} /><span>Walk</span></button>
            <button onClick={() => setScreen("activity")}><Activity size={20} /><span>Run</span></button>
            <button onClick={() => setScreen("activity")}><Bike size={20} /><span>Cycle</span></button>
            <button onClick={() => setScreen("map")}><MapPin size={20} /><span>Regions</span></button>
            <button onClick={() => setScreen("alerts")}><Menu size={20} /><span>More</span></button>
          </div>

          <div className="moreCards">
            <button onClick={() => setScreen("trends")}><TrendingDown size={18} /><span>View trends</span></button>
            <button onClick={() => setScreen("indoor")}><HomeIcon size={18} /><span>Indoor air</span></button>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "map") {
    return (
      <Shell title="Regional Air Quality" back>
        <div className="contextCard">
          <strong>Schematic five-region view</strong>
          <span>This is a regional comparison, not a precise geographic pollution map.</span>
        </div>
        <div className="segmented">
          <button
            onClick={() => setMapMetric("PSI")}
            className={mapMetric === "PSI" ? "selected" : ""}
            aria-pressed={mapMetric === "PSI"}
          >
            PSI
          </button>
          <button
            onClick={() => setMapMetric("PM2.5")}
            className={mapMetric === "PM2.5" ? "selected" : ""}
            aria-pressed={mapMetric === "PM2.5"}
          >
            PM2.5
          </button>
        </div>
        <div className="mapCanvas" aria-label="Schematic Singapore regional air quality comparison">
          <div className="mapGrid" />
          {(data?.regions ?? []).map((region) => {
            const value = mapMetric === "PSI" ? region.psi24h : region.pm25_1h;
            const status = classifyPsi(region.psi24h);
            return (
              <button
                key={region.name}
                className={`regionBubble ${REGION_POSITIONS[region.name]} ${status.tone} ${regionChoice === region.name ? "current" : ""}`}
                onClick={() => chooseRegion(region.name)}
                aria-label={`${REGION_LABELS[region.name]} region, ${mapMetric} ${value ?? "unavailable"}, ${status.label}`}
              >
                <span>{REGION_LABELS[region.name]}</span>
                <strong>{value ?? "—"}</strong>
                <small>{mapMetric === "PSI" ? status.label : "µg/m³"}</small>
              </button>
            );
          })}
        </div>
        <div className="legend" aria-label="PSI status legend">
          {["Good 0–50", "Moderate 51–100", "Unhealthy 101–200", "Very Unhealthy 201–300", "Hazardous >300"].map((item, index) => (
            <span key={item}><i className={`legendDot d${index}`} aria-hidden="true" />{item}</span>
          ))}
        </div>
        <div className="mapFooter">Select a region to make it your current Hazemate context.</div>
      </Shell>
    );
  }

  if (screen === "activity") {
    return (
      <Shell title="Activity Advisor" back>
        <div className="pillTabs">
          {(["General", "Children", "Elderly", "Sensitive"] as Audience[]).map((profile) => (
            <button
              key={profile}
              onClick={() => changeAudience(profile)}
              className={audience === profile ? "selected" : ""}
              aria-pressed={audience === profile}
            >
              {profile}
            </button>
          ))}
        </div>

        <div className="contextCard">
          <strong>{REGION_LABELS[regionChoice]} · PSI {displayPsi ?? "—"} · PM2.5 {displayPm ?? "—"} µg/m³</strong>
          <span>Recommendations use the more cautious result from current PSI, PM2.5, audience and activity intensity.</span>
        </div>

        <div className="activityList">
          {activities.map(({ title, icon: Icon, decision }) => (
            <div className="activityRow" key={title}>
              <div className={`roundIcon ${decision.tone}`}><Icon size={21} /></div>
              <div className="grow">
                <strong>{title}</strong>
                <span>{decision.recommendation}</span>
                <small>{decision.reason}</small>
              </div>
              <em className={`statusPill ${decision.tone}`}>{decision.suitability}</em>
            </div>
          ))}
        </div>
        <div className="healthNote">
          <Info size={17} />
          <p>Hazemate provides general guidance only. If you have symptoms or a medical condition, follow advice from your healthcare professional and current official advisories.</p>
        </div>
      </Shell>
    );
  }

  if (screen === "mask") {
    return (
      <Shell title="Mask Guidance" back>
        <section className="maskScreen">
          <img src="/mascot.svg" alt="Hazemate mascot" className="maskMascot" />
          <h2>Do I need a mask today?</h2>

          <div className="pillTabs audienceTabs">
            {(["General", "Children", "Elderly", "Sensitive"] as Audience[]).map((profile) => (
              <button
                key={profile}
                onClick={() => changeAudience(profile)}
                className={audience === profile ? "selected" : ""}
                aria-pressed={audience === profile}
              >
                {profile}
              </button>
            ))}
          </div>

          <div className="maskDecision">
            <div className="decisionIcon"><ShieldCheck size={22} /></div>
            <div>
              <strong>{mask.title}</strong>
              <span>PSI {displayPsi ?? "—"} · {psiStatus.label} · Data {freshness}</span>
              <p>{mask.body}</p>
            </div>
          </div>

          <div className="healthNote">
            <Info size={17} />
            <p>
              Exposure reduction comes first. Hazemate supports everyday decisions and does not make a respirator suitable for everyone.
              Follow current NEA/MOH guidance and medical advice where relevant.
            </p>
          </div>

          <div className="contentMeta">
            <span>Decision rules: {DECISION_RULE_VERSION}</span>
            <span>Health guidance reviewed: {HEALTH_GUIDANCE_REVIEWED_AT}</span>
          </div>
        </section>
      </Shell>
    );
  }

  if (screen === "trends") {
    const current = trendMetric === "PSI" ? displayPsi : displayPm;
    const chartSummary =
      history.length > 0
        ? `${history.length} stored readings for ${REGION_LABELS[regionChoice]} over ${period}.`
        : "No stored readings are available for this period.";

    return (
      <Shell title="Trends" back>
        <div className="pillTabs">
          {(["PSI", "PM2.5"] as TrendMetric[]).map((metric) => (
            <button
              key={metric}
              onClick={() => setTrendMetric(metric)}
              className={trendMetric === metric ? "selected" : ""}
              aria-pressed={trendMetric === metric}
            >
              {metric}
            </button>
          ))}
        </div>

        <div className="trendPanel">
          <span>{trendMetric} · {REGION_LABELS[regionChoice]} · {period}</span>
          <div className="bigNumber">
            {current ?? "—"}
            {trendDelta != null ? (
              <em className={trendDelta > 0 ? "deltaUp" : ""}>
                {trendDelta > 0 ? "↑" : "↓"} {Math.abs(trendDelta)}%
              </em>
            ) : null}
          </div>
          <small className={`statusPill ${psiStatus.tone}`}>
            {trendMetric === "PSI" ? psiStatus.label : pmStatus.label}
          </small>

          {historyLoading ? <div className="miniAlert">Loading stored readings…</div> : null}
          {historyError ? <div className="miniAlert warningNotice" role="status">{historyError}</div> : null}

          {chartValues.length ? (
            <>
              <div
                className="miniChart"
                role="img"
                aria-label={`Historical ${trendMetric} trend. ${chartSummary}`}
              >
                {chartValues.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
              </div>
              <div className="chartAxis">
                <span>Older</span><span>{history.length} readings</span><span>Latest</span>
              </div>
            </>
          ) : (
            <div className="emptyChart">
              Hazemate is collecting readings. No trend line is fabricated when historical data is missing.
            </div>
          )}
        </div>

        <div className="periodTabs">
          {(["Last 24 Hours", "7 Days", "30 Days"] as Period[]).map((value) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={period === value ? "selected" : ""}
              aria-pressed={period === value}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="forecastCard">
          <CloudSun size={19} />
          <div>
            <strong>Data freshness</strong>
            <span>Latest observation: {formatDateTime(data?.observedAt)} · {freshness}</span>
          </div>
        </div>
      </Shell>
    );
  }

  if (screen === "indoor") {
    const outdoor = displayPm;
    const difference =
      indoorSaved != null && outdoor != null
        ? Math.round((indoorSaved - outdoor) * 10) / 10
        : null;

    return (
      <Shell title="Indoor Air" back>
        <section className="indoorScreen">
          <div className="roomIllustration"><HomeIcon size={74} /><div className="purifier">●</div></div>
          <h2>Compare indoor and outdoor air</h2>
          <p className="indoorIntro">
            Enter the PM2.5 value from your own purifier or indoor air-quality monitor. Hazemate does not connect to the device in this release.
          </p>

          <label className="inputLabel" htmlFor="indoor-pm25">Indoor PM2.5 (µg/m³)</label>
          <div className="indoorInputRow">
            <input
              id="indoor-pm25"
              type="number"
              min="0"
              inputMode="decimal"
              placeholder="Indoor PM2.5"
              value={indoorPm25}
              onChange={(event) =>
                setIndoorPm25(event.target.value === "" ? "" : Number(event.target.value))
              }
            />
            <button onClick={saveIndoorReading}>Save</button>
          </div>

          <div className="comparisonGrid">
            <div><span>Outdoor</span><strong>{outdoor ?? "—"}</strong><small>µg/m³ · official reading</small></div>
            <div><span>Indoor</span><strong>{indoorSaved ?? "—"}</strong><small>µg/m³ · manually entered</small></div>
          </div>

          {difference != null ? (
            <div className="contextCard">
              <strong>{difference <= 0 ? "Indoor air is cleaner" : "Indoor air is more polluted"}</strong>
              <span>{Math.abs(difference)} µg/m³ difference compared with outside.</span>
            </div>
          ) : null}

          <div className="indoorBenefits">
            <span>Your indoor reading is stored only on this device/browser.</span>
            <span>The manual indoor value is not sent to Hazemate analytics or the backend.</span>
            <span>Future device integrations would require separate consent and integration design.</span>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="More & Alerts" back>
      <div className="alertsSettings">
        <div className="settingRow">
          <div>
            <strong>PSI alert threshold</strong>
            <span>In-session/browser notification when your selected region reaches this level.</span>
          </div>
          <input
            aria-label="PSI alert threshold"
            type="number"
            min="51"
            max="500"
            value={alertPsi}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (!Number.isFinite(value)) return;
              const bounded = Math.min(500, Math.max(51, value));
              setAlertPsi(bounded);
              localStorage.setItem("hazemate-alert-psi", String(bounded));
            }}
          />
        </div>

        <div className="settingRow">
          <div>
            <strong>In-session alerts</strong>
            <span>Current region: {REGION_LABELS[regionChoice]}. Background Web Push is not enabled in this release.</span>
          </div>
          <label className="switch">
            <input
              aria-label="Enable in-session alerts"
              type="checkbox"
              checked={alertsEnabled}
              onChange={(event) => {
                setAlertsEnabled(event.target.checked);
                localStorage.setItem("hazemate-alerts-enabled", event.target.checked ? "1" : "0");
              }}
            />
            <span aria-hidden="true" />
          </label>
        </div>

        <button
          className="primaryBtn"
          onClick={requestNotifications}
          disabled={notificationPermission === "unsupported"}
        >
          {notificationPermission === "granted"
            ? "Browser notifications enabled"
            : notificationPermission === "denied"
              ? "Notifications blocked in browser settings"
              : notificationPermission === "unsupported"
                ? "Notifications not supported"
                : "Enable browser notifications"}
        </button>
      </div>

      <div className="alertsList">
        <div className="alertRow">
          <div className={`alertDot ${displayPsi != null && displayPsi > 100 ? "red" : "green"}`}>!</div>
          <div>
            <strong>Current air-quality update</strong>
            <span>{REGION_LABELS[regionChoice]} Region · PSI {displayPsi ?? "—"} · {freshness}</span>
          </div>
          <span>›</span>
        </div>
        {displayPm != null ? (
          <div className="alertRow">
            <div className={`alertDot ${pmStatus.tone === "good" ? "blue" : "amber"}`}>!</div>
            <div>
              <strong>PM2.5 status: {pmStatus.label}</strong>
              <span>{displayPm} µg/m³ · updated {formatTime(data?.haze.updatedAt)}</span>
            </div>
            <span>›</span>
          </div>
        ) : null}
      </div>

      <div className="privacyCard">
        <ShieldCheck size={20} />
        <div>
          <strong>Privacy & data</strong>
          <p>
            Precise browser location is used only to resolve a Singapore region and nearby weather station.
            Hazemate stores the selected region, alert preferences and manual indoor reading locally on your device.
            Precise latitude/longitude is not sent to product analytics.
          </p>
        </div>
      </div>

      <div className="privacyCard">
        <Info size={20} />
        <div>
          <strong>How guidance is produced</strong>
          <p>
            Hazemate combines available PSI, 1-hour PM2.5, your selected audience and activity intensity.
            If data is partial or stale, guidance becomes more cautious or is withheld.
          </p>
          <small>Decision rules {DECISION_RULE_VERSION} · Health content reviewed {HEALTH_GUIDANCE_REVIEWED_AT}</small>
        </div>
      </div>
    </Shell>
  );
}
