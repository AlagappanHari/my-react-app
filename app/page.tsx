"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  Bike,
  ChevronLeft,
  CloudSun,
  Droplets,
  Footprints,
  Home as HomeIcon,
  LocateFixed,
  MapPin,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ThermometerSun,
  TrendingDown,
  TrendingUp,
  Wind
} from "lucide-react";
import { captureHazemateEvent } from "@/lib/analytics";

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

type Screen =
  | "splash"
  | "onboarding1"
  | "onboarding2"
  | "location"
  | "home"
  | "map"
  | "activity"
  | "mask"
  | "trends"
  | "indoor"
  | "alerts";

const REGION_COORDS: Record<string, [number, number]> = {
  north: [1.418, 103.82],
  south: [1.285, 103.833],
  east: [1.35, 103.955],
  west: [1.35, 103.705],
  central: [1.3521, 103.8198]
};

const REGION_PSI = [
  { name: "North", value: 68, tone: "moderate" },
  { name: "West", value: 112, tone: "unhealthy" },
  { name: "Central", value: 42, tone: "good" },
  { name: "East", value: 78, tone: "moderate" },
  { name: "South", value: 56, tone: "moderate" }
];

function psiLabel(psi: number | null) {
  if (psi == null) return ["Unavailable", "neutral"] as const;
  if (psi <= 50) return ["Good", "good"] as const;
  if (psi <= 100) return ["Moderate", "moderate"] as const;
  if (psi <= 200) return ["Unhealthy", "unhealthy"] as const;
  if (psi <= 300) return ["Very Unhealthy", "very-unhealthy"] as const;
  return ["Hazardous", "hazardous"] as const;
}

function guidance(psi: number | null, pm25: number | null) {
  const p = psi ?? 0;
  const pm = pm25 ?? 0;
  if (p > 300) return "Stay indoors where practical. Avoid strenuous outdoor activity and follow official advisories.";
  if (p > 200) return "Minimise prolonged outdoor activity, especially for vulnerable groups.";
  if (p > 100 || pm >= 55) return "Consider reducing strenuous outdoor activities.";
  if (pm >= 35) return "Keep outdoor sessions shorter and lighter.";
  return "Great time for outdoor activities!";
}

function maskGuidance(psi: number | null) {
  const p = psi ?? 0;
  if (p > 300) return "Consider a well-fitting N95 if you must remain outdoors for several hours.";
  if (p > 200) return "Vulnerable users should minimise outdoor exposure; an N95 may help if prolonged exposure cannot be avoided.";
  return "Not needed right now";
}

function fmtRegion(region?: string) {
  if (!region) return "Central";
  return region.charAt(0).toUpperCase() + region.slice(1);
}

const activities = [
  { title: "Walking", subtitle: "Generally safe", status: "Good", icon: Footprints, tone: "good" },
  { title: "Running", subtitle: "Consider reducing intensity", status: "Moderate", icon: Activity, tone: "moderate" },
  { title: "Cycling", subtitle: "Generally safe", status: "Good", icon: Bike, tone: "good" },
  { title: "Outdoor sports", subtitle: "Limit prolonged activities", status: "Moderate", icon: Activity, tone: "moderate" },
  { title: "Outdoor with kids", subtitle: "Keep activities short", status: "Moderate", icon: Sparkles, tone: "moderate" }
];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regionChoice, setRegionChoice] = useState("central");
  const [locating, setLocating] = useState(false);
  const [previousPm, setPreviousPm] = useState<number | null>(null);
  const [segment, setSegment] = useState("General");
  const [metric, setMetric] = useState("PSI");
  const [period, setPeriod] = useState("Today");

  async function load(lat: number, lon: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/environment?lat=${lat}&lon=${lon}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Environmental data is temporarily unavailable.");
      const next = await res.json();
      setPreviousPm(data?.haze?.pm25_1h ?? null);
      setData(next);
      captureHazemateEvent("environment_loaded", {
        region: next?.region ?? null,
        psi24h: next?.haze?.psi24h ?? null,
        pm25_1h: next?.haze?.pm25_1h ?? null
      });
    } catch (e) {
      captureHazemateEvent("environment_load_failed", {
        message: e instanceof Error ? e.message : "unknown"
      });
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
    captureHazemateEvent("location_permission_requested");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        captureHazemateEvent("location_permission_granted");
        load(position.coords.latitude, position.coords.longitude).finally(() => {
          setLocating(false);
          localStorage.setItem("hazemate-onboarded", "1");
          setScreen("home");
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

  function chooseRegion(value: string) {
    captureHazemateEvent("region_selected", { region: value });
    setRegionChoice(value);
    const [lat, lon] = REGION_COORDS[value];
    load(lat, lon);
    localStorage.setItem("hazemate-onboarded", "1");
    setScreen("home");
  }

  useEffect(() => {
    load(...REGION_COORDS.central);
    if (!localStorage.getItem("hazemate-onboarded")) {
      setScreen("splash");
      const timer = window.setTimeout(() => setScreen("onboarding1"), 900);
      return () => window.clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [label, tone] = psiLabel(data?.haze?.psi24h ?? null);
  const pmTrend = useMemo(() => {
    const current = data?.haze?.pm25_1h;
    if (current == null || previousPm == null) return "steady";
    return current > previousPm ? "rising" : current < previousPm ? "falling" : "steady";
  }, [data, previousPm]);

  const displayPsi = data?.haze?.psi24h ?? 56;
  const displayPm = data?.haze?.pm25_1h ?? 21;
  const unhealthy = displayPsi > 100;

  function Shell({ children, title, back = false }: { children: React.ReactNode; title?: string; back?: boolean }) {
    return (
      <div className="phoneShell">
        <div className="statusBar">
          <span>9:41</span>
          <span>▮▮ Wi‑Fi ▰</span>
        </div>
        {title ? (
          <div className="screenHeader">
            {back ? <button className="backBtn" onClick={() => setScreen("home")}><ChevronLeft size={20} /></button> : <span />}
            <strong>{title}</strong>
            <button className="iconBtn"><SlidersHorizontal size={18} /></button>
          </div>
        ) : null}
        <div className="screenBody">{children}</div>
        {["home","map","activity","mask","trends","indoor","alerts"].includes(screen) ? <BottomNav /> : null}
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

  if (screen === "splash") {
    return (
      <Shell>
        <section className="splashScreen">
          <div className="skyCloud cloudOne" />
          <div className="skyCloud cloudTwo" />
          <div className="splashBrand">
            <h1>Hazemate</h1>
            <p>Your mate for<br />clearer outdoor decisions</p>
          </div>
          <div className="sgSkyline">Singapore</div>
          <img src="/mascot.svg" alt="Hazemate mascot" className="splashMascot" />
          <span className="splashTagline">Cleaner Air<br />Brighter Days</span>
        </section>
      </Shell>
    );
  }

  if (screen === "onboarding1") {
    return (
      <Shell>
        <section className="onboardingScreen">
          <div>
            <h1>A healthier you,<br />for brighter<br />tomorrows.</h1>
            <p>Real-time air quality, personalised advice, and healthier choices — all in one app.</p>
          </div>
          <img src="/mascot.svg" alt="Hazemate mascot" className="onboardMascot" />
          <div className="pagerDots"><span className="active" /><span /><span /></div>
          <button className="primaryBtn" onClick={() => setScreen("onboarding2")}>Next →</button>
          <button className="textBtn" onClick={() => setScreen("location")}>Skip</button>
        </section>
      </Shell>
    );
  }

  if (screen === "onboarding2") {
    const benefits = [
      ["loc","Live air quality","at your location"],
      ["advice","Personalised advice","for your activities"],
      ["mask","Mask guidance","when you need it"],
      ["indoor","Indoor air insights","with compatible devices"]
    ];
    return (
      <Shell>
        <section className="onboardingScreen compact">
          <div>
            <h1>Know.<br />Plan.<br />Breathe.</h1>
            <div className="benefitList">
              {benefits.map(([key,title,sub], i) => (
                <div className="benefitRow" key={key}>
                  <div className={`benefitIcon benefit${i}`}>{i === 0 ? <MapPin size={20}/> : i === 1 ? <Sparkles size={20}/> : i === 2 ? <ShieldCheck size={20}/> : <HomeIcon size={20}/>}</div>
                  <div><strong>{title}</strong><span>{sub}</span></div>
                </div>
              ))}
            </div>
          </div>
          <div className="pagerDots"><span /><span className="active" /><span /></div>
          <button className="primaryBtn" onClick={() => setScreen("location")}>Next →</button>
          <button className="textBtn" onClick={() => setScreen("location")}>Skip</button>
        </section>
      </Shell>
    );
  }

  if (screen === "location") {
    return (
      <Shell>
        <section className="locationScreen">
          <div className="locationHero">
            <img src="/mascot.svg" alt="Hazemate mascot" />
            <div className="pinOrb"><MapPin size={34}/></div>
          </div>
          <h1>Use your location</h1>
          <p>Allow Hazemate to find your nearest region and show you the most relevant air quality and advice.</p>
          <div className="locationBenefits">
            <span><LocateFixed size={17}/> Show local air quality (near you)</span>
            <span><ShieldCheck size={17}/> Personalise recommendations</span>
            <span><Sparkles size={17}/> Help you plan your activities</span>
          </div>
          {error ? <div className="miniAlert">{error}</div> : null}
          <button className="primaryBtn" onClick={useLocation} disabled={locating}>{locating ? "Finding you…" : "Allow Location Access"}</button>
          <button className="textBtn" onClick={() => setScreen("home")}>Choose manually</button>
          <select className="regionSelect" value={regionChoice} onChange={(e) => chooseRegion(e.target.value)} aria-label="Choose region">
            {Object.keys(REGION_COORDS).map((r) => <option key={r} value={r}>{fmtRegion(r)} Singapore</option>)}
          </select>
        </section>
      </Shell>
    );
  }

  if (screen === "home") {
    return (
      <Shell>
        <section className={unhealthy ? "homeScreen unhealthyHome" : "homeScreen"}>
          <header className="homeTop">
            <div>
              <div className="wordmark">Haze<span>mate</span></div>
              <p>{unhealthy ? "Good evening," : "Good morning,"}<br/><strong>Jamie!</strong></p>
            </div>
            <div className="homeMascotWrap"><img src="/mascot.svg" alt="Hazemate mascot" /></div>
            <Bell size={20} className="bell" />
          </header>

          <div className="locationChip">
            <MapPin size={18}/>
            <div><strong>{regionChoice === "west" ? "Jurong" : "Queenstown"}</strong><span>({fmtRegion(data?.region ?? regionChoice)} Region)</span><small>Updated {data?.haze?.updatedAt ? new Date(data.haze.updatedAt).toLocaleTimeString("en-SG",{hour:"numeric",minute:"2-digit"}) : "9:30 AM"}</small></div>
          </div>

          {loading ? <div className="miniAlert">Refreshing environmental readings…</div> : null}

          <div className={`airHeroCard ${tone}`}>
            <div>
              <span>PSI (24-hr)</span>
              <strong>{displayPsi}</strong>
              <em>{label}</em>
            </div>
            <div>
              <span>PM2.5 (1-hr)</span>
              <strong>{displayPm}<small> µg/m³</small></strong>
              <em>{displayPm >= 35 ? "Elevated" : "Normal"}</em>
            </div>
          </div>

          <div className={unhealthy ? "trendCard warning" : "trendCard"}>
            <div className="trendIcon">{unhealthy ? "!" : pmTrend === "rising" ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</div>
            <div><strong>{unhealthy ? "Air quality is unhealthy today." : "Trending lower"}</strong><span>{guidance(displayPsi, displayPm)}</span></div>
          </div>

          <h3>Quick Actions</h3>
          <div className="quickActions">
            <button onClick={() => setScreen("activity")}><Footprints size={20}/><span>Walk</span></button>
            <button onClick={() => setScreen("activity")} className={unhealthy ? "warnAction" : ""}><Activity size={20}/><span>Run</span></button>
            <button onClick={() => setScreen("activity")}><Bike size={20}/><span>Cycle</span></button>
            <button onClick={() => setScreen("activity")}><Sparkles size={20}/><span>Outdoors</span></button>
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
        <div className="segmented"><button className="selected">PSI</button><button>PM2.5</button></div>
        <div className="mapCanvas">
          <div className="mapGrid" />
          {REGION_PSI.map((r, i) => (
            <div key={r.name} className={`regionBubble region${i} ${r.tone}`}>
              <span>{r.name}</span><strong>{r.value}</strong><small>{r.tone === "good" ? "Good" : r.tone === "unhealthy" ? "Unhealthy" : "Moderate"}</small>
            </div>
          ))}
          <div className="youDot"><span/></div>
        </div>
        <div className="legend">
          {["Good 0–50","Moderate 51–100","Unhealthy 101–200","Very Unhealthy 201–300","Hazardous >300"].map((x,i)=><span key={x}><i className={`legendDot d${i}`}/>{x}</span>)}
        </div>
      </Shell>
    );
  }

  if (screen === "activity") {
    return (
      <Shell title="Activity Advisor" back>
        <div className="pillTabs">
          {["General","Children","Elderly","Sensitive"].map((x)=><button key={x} onClick={()=>setSegment(x)} className={segment===x?"selected":""}>{x}</button>)}
        </div>
        <div className="activityList">
          {activities.map(({title,subtitle,status,icon:Icon,tone})=>(
            <div className="activityRow" key={title}>
              <div className={`roundIcon ${tone}`}><Icon size={21}/></div>
              <div className="grow"><strong>{title}</strong><span>{subtitle}</span></div>
              <em className={`statusPill ${tone}`}>{status}</em>
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
          <img src="/mascot.svg" alt="Hazemate mascot wearing protective guidance theme" className="maskMascot"/>
          <h2>Do I need a mask today?</h2>
          <div className="maskDecision">
            <div className="decisionIcon"><ShieldCheck size={22}/></div>
            <div><strong>{maskGuidance(displayPsi)}</strong><span>PSI {displayPsi} · {label}</span><p>For short outdoor activities, reducing exposure is usually more important than wearing a mask.</p></div>
          </div>
          <h3>When a mask may help</h3>
          <ul className="maskList">
            <li>Air quality is Very Unhealthy or worse</li>
            <li>Prolonged outdoor exposure (several hours)</li>
            <li>Vulnerable individuals with medical guidance</li>
          </ul>
        </section>
      </Shell>
    );
  }

  if (screen === "trends") {
    const bars=[30,42,54,48,60,51,44,38,35,43,39,46,41,50,45,48,44,52,49,55,47,43,46,40];
    return (
      <Shell title="Trends" back>
        <div className="pillTabs">
          {["PSI","PM2.5","Temperature","Humidity"].map((x)=><button key={x} onClick={()=>setMetric(x)} className={metric===x?"selected":""}>{x}</button>)}
        </div>
        <div className="trendPanel">
          <span>{metric} (24-hour)</span>
          <div className="bigNumber">{displayPsi}<em>↓ 20%</em></div>
          <small className="statusPill moderate">{label}</small>
          <div className="miniChart" aria-label="24-hour air quality trend">
            {bars.map((h,i)=><i key={i} style={{height:`${h}%`}} />)}
          </div>
          <div className="chartAxis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
        </div>
        <div className="periodTabs">{["Today","7 Days","30 Days"].map((x)=><button key={x} onClick={()=>setPeriod(x)} className={period===x?"selected":""}>{x}</button>)}</div>
        <div className="forecastCard"><TrendingDown size={19}/><div><strong>Forecast (Next 24 hours)</strong><span>Air quality is expected to improve tomorrow.</span></div></div>
      </Shell>
    );
  }

  if (screen === "indoor") {
    return (
      <Shell title="Indoor Air" back>
        <section className="indoorScreen">
          <div className="roomIllustration">
            <HomeIcon size={74}/>
            <div className="purifier">●</div>
          </div>
          <h2>Connect your air purifier<br/>or air quality device</h2>
          <div className="indoorBenefits">
            <span>Track indoor PM2.5 and air quality</span>
            <span>Compare indoor vs outdoor</span>
            <span>Get smarter recommendations</span>
            <span>Supports popular brands</span>
          </div>
          <button className="primaryBtn">Add a Device</button>
          <button className="textBtn">Learn more</button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Alerts" back>
      <div className="segmented alertTabs"><button className="selected">Notifications</button><button>Preferred Region</button></div>
      <div className="alertsList">
        {[
          ["red","Air quality has turned unhealthy in West Region","PSI 112 · 6:15 PM"],
          ["amber","PM2.5 rising","PM2.5 increased by 40% in the last 3 hours."],
          ["green","Conditions improving","PSI expected to drop to Moderate tomorrow."],
          ["blue","Haze advisory issued","Regional haze conditions may persist for the next few days."]
        ].map(([tone,title,sub])=>(
          <div className="alertRow" key={title}>
            <div className={`alertDot ${tone}`}>!</div>
            <div><strong>{title}</strong><span>{sub}</span></div>
            <span>›</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
