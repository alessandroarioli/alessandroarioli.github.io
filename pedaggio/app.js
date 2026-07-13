const KEY_STORAGE = "pedaggio_here_key";

const el = (id) => document.getElementById(id);
const keyPanel = el("key-panel");
const searchPanel = el("search-panel");
const results = el("results");
const statusEl = el("status");

let map = null;
let mapLayers = [];
let pendingFitBounds = null;

window.addEventListener("resize", () => {
  if (!map) return;
  map.invalidateSize();
  if (pendingFitBounds?.isValid() && map.getSize().x > 0) {
    map.fitBounds(pendingFitBounds, { padding: [30, 30] });
    pendingFitBounds = null;
  }
});

// ---------- API key handling ----------

function getKey() {
  return localStorage.getItem(KEY_STORAGE) || "";
}

function showPanels() {
  const hasKey = !!getKey();
  keyPanel.classList.toggle("hidden", hasKey);
  searchPanel.classList.toggle("hidden", !hasKey);
}

el("save-key-btn").addEventListener("click", () => {
  const key = el("api-key-input").value.trim();
  if (!key) return;
  localStorage.setItem(KEY_STORAGE, key);
  el("api-key-input").value = "";
  showPanels();
});

el("change-key-btn").addEventListener("click", () => {
  localStorage.removeItem(KEY_STORAGE);
  showPanels();
});

// ---------- HERE APIs ----------

async function geocode(query) {
  const url = new URL("https://geocode.search.hereapi.com/v1/geocode");
  url.searchParams.set("q", query);
  url.searchParams.set("in", "countryCode:ITA,FRA,CHE,AUT,SVN,DEU,ESP");
  url.searchParams.set("apiKey", getKey());
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Geocoding fallito (HTTP ${resp.status})`);
  const data = await resp.json();
  const item = data.items?.[0];
  if (!item) throw new Error(`Località non trovata: "${query}"`);
  return { ...item.position, label: item.title };
}

async function hereRoutes(o, d, { avoidTolls = false, alternatives = 0, polyline = true } = {}) {
  const url = new URL("https://router.hereapi.com/v8/routes");
  url.searchParams.set("transportMode", "car");
  url.searchParams.set("origin", `${o.lat},${o.lng}`);
  url.searchParams.set("destination", `${d.lat},${d.lng}`);
  url.searchParams.set("return", polyline ? "summary,polyline,tolls" : "summary,tolls");
  if (alternatives > 0) url.searchParams.set("alternatives", String(alternatives));
  if (avoidTolls) url.searchParams.set("avoid[features]", "tollRoad");
  url.searchParams.set("currency", "EUR");
  url.searchParams.set("apiKey", getKey());

  const resp = await fetch(url);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.title || err.cause || `HTTP ${resp.status}`);
  }
  return (await resp.json()).routes || [];
}

let lastTrip = null; // { origin, destination } of the last successful search

async function computeRoutes(originQuery, destinationQuery) {
  const [origin, destination] = await Promise.all([
    geocode(originQuery),
    geocode(destinationQuery),
  ]);
  const routes = await hereRoutes(origin, destination, { alternatives: 2 });
  lastTrip = { origin, destination };
  return { routes, origin, destination };
}

async function nearestTown(lat, lng) {
  // nearest locality to a route point — routing to the town (not the raw highway
  // point) forces the route through a real exit gate, so the toll fare is charged
  try {
    const url = new URL("https://revgeocode.search.hereapi.com/v1/revgeocode");
    url.searchParams.set("at", `${lat},${lng}`);
    url.searchParams.set("types", "city");
    url.searchParams.set("lang", "it-IT");
    url.searchParams.set("apiKey", getKey());
    const data = await (await fetch(url)).json();
    const item = data.items?.[0];
    if (!item?.position) return null;
    return { name: item.address?.city || item.title, ...item.position };
  } catch {
    return null;
  }
}

// Aggregate one HERE route: distance, duration, toll total, path points
function summarizeRoute(route) {
  let distanceMeters = 0;
  let durationSeconds = 0;
  let toll = 0;
  let tollCount = 0;
  let tollUnknown = false;
  const path = [];
  const operators = new Set();

  for (const section of route.sections || []) {
    distanceMeters += section.summary?.length || 0;
    durationSeconds += section.summary?.duration || 0;
    for (const t of section.tolls || []) {
      tollCount++;
      const eurFares = (t.fares || []).filter((f) => f.price?.currency === "EUR");
      if (eurFares.length > 0) {
        // cheapest payment method for this toll segment
        toll += Math.min(...eurFares.map((f) => f.price.value));
      } else {
        tollUnknown = true;
      }
      if (t.tollSystem) operators.add(t.tollSystem);
    }
    if (section.polyline) path.push(...decodeFlexPolyline(section.polyline));
  }

  return { distanceMeters, durationSeconds, toll, tollCount, tollUnknown, path, operators };
}

// ---------- HERE flexible polyline decoder ----------
// https://github.com/heremaps/flexible-polyline (pure-Number arithmetic, no 32-bit ops)

const FP_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const FP_TABLE = Object.fromEntries([...FP_CHARS].map((c, i) => [c, i]));

function decodeFlexPolyline(encoded) {
  let index = 0;

  function varint() {
    let result = 0;
    let shift = 1;
    while (index < encoded.length) {
      const b = FP_TABLE[encoded[index++]];
      result += (b & 0x1f) * shift;
      if ((b & 0x20) === 0) return result;
      shift *= 32;
    }
    throw new Error("Polyline troncata");
  }

  function signedVarint() {
    const r = varint();
    return r % 2 === 1 ? -(r + 1) / 2 : r / 2;
  }

  const version = varint();
  if (version !== 1) throw new Error(`Versione polyline non supportata: ${version}`);
  const header = varint();
  const precision = 10 ** (header & 15);
  const thirdDim = (header >> 4) & 7;
  const thirdDimPrecision = 10 ** ((header >> 7) & 15);

  const points = [];
  let lat = 0, lng = 0, z = 0;
  while (index < encoded.length) {
    lat += signedVarint();
    lng += signedVarint();
    if (thirdDim) z += signedVarint(); // decoded but unused
    points.push([lat / precision, lng / precision]);
  }
  return points;
}

// ---------- Exit analysis ----------

function pathDistances(path) {
  // cumulative km along path (equirectangular approx, fine at route scale)
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const [lat1, lng1] = path[i - 1];
    const [lat2, lng2] = path[i];
    const dlat = (lat2 - lat1) * 111.32;
    const dlng = (lng2 - lng1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    cum.push(cum[i - 1] + Math.hypot(dlat, dlng));
  }
  return cum;
}

function pointAtFraction(path, cum, frac) {
  const target = cum[cum.length - 1] * frac;
  let i = cum.findIndex((d) => d >= target);
  if (i < 0) i = cum.length - 1;
  return { lat: path[i][0], lng: path[i][1], km: cum[i] };
}

function legCosts(routes, consumption, fuelPrice) {
  // toll + fuel + time for a list of legs (route objects)
  let toll = 0, km = 0, seconds = 0;
  for (const route of routes) {
    const s = summarizeRoute(route);
    toll += s.toll;
    km += s.distanceMeters / 1000;
    seconds += s.durationSeconds;
  }
  return { toll, km, seconds, fuel: (km / 100) * consumption * fuelPrice };
}

async function analyzeExits(idx, btn) {
  const summary = currentSummaries[idx];
  const container = document.getElementById(`exit-analysis-${idx}`);
  if (!lastTrip || !summary) return;
  btn.disabled = true;
  btn.textContent = "Analisi in corso…";

  const consumption = parseFloat(el("consumption").value) || 6.5;
  const fuelPrice = parseFloat(el("fuel-price").value) || 1.75;
  const { origin, destination } = lastTrip;
  const cum = pathDistances(summary.path);

  // hybrid candidates: highway until the cut point, toll-free roads after
  const cuts = [0.25, 0.5, 0.75].map((f) => pointAtFraction(summary.path, cum, f));

  const attempts = await Promise.all([
    // full toll-free route as the extreme case
    hereRoutes(origin, destination, { avoidTolls: true, polyline: false })
      .then(async (routes) => routes.length ? { label: "Tutta statale (niente autostrada)", routes } : null)
      .catch(() => null),
    ...cuts.map((cut) =>
      nearestTown(cut.lat, cut.lng)
        .then((town) => {
          const via = town || cut; // fallback: raw point (toll may be underestimated)
          return Promise.all([
            hereRoutes(origin, via, { polyline: false }),
            hereRoutes(via, destination, { avoidTolls: true, polyline: false }),
          ]).then(([leg1, leg2]) => {
            if (!leg1.length || !leg2.length) return null;
            const where = town ? `a ${town.name}` : `al km ${cut.km.toFixed(0)}`;
            return { label: `Esci ${where} (≈ km ${cut.km.toFixed(0)})`, routes: [leg1[0], leg2[0]] };
          });
        })
        .catch(() => null)
    ),
  ]);

  const base = {
    toll: summary.toll,
    fuel: (summary.distanceMeters / 1000 / 100) * consumption * fuelPrice,
    seconds: summary.durationSeconds,
  };
  base.total = base.toll + base.fuel;

  const options = attempts
    .filter(Boolean)
    .map((a) => {
      const c = legCosts(a.routes, consumption, fuelPrice);
      return { label: a.label, ...c, total: c.toll + c.fuel };
    })
    .sort((a, b) => a.total - b.total);

  if (options.length === 0) {
    container.innerHTML = '<p class="status error">Analisi non riuscita, riprova.</p>';
    btn.remove();
    return;
  }

  const best = options[0];
  container.innerHTML = `
    <table class="exit-table">
      <tr><th></th><th>Totale</th><th>Pedaggio</th><th>Risparmio</th><th>Tempo extra</th></tr>
      <tr class="base-row"><td>Percorso attuale</td><td>${formatEur(base.total)}</td><td>${formatEur(base.toll)}</td><td>—</td><td>—</td></tr>
      ${options.map((o) => {
        const saving = base.total - o.total;
        const extraMin = Math.round((o.seconds - base.seconds) / 60);
        return `<tr class="${o === best && saving > 0 ? "best-row" : ""}">
          <td>${o.label}</td>
          <td>${formatEur(o.total)}</td>
          <td>${formatEur(o.toll)}</td>
          <td>${saving > 0 ? "−" + formatEur(saving) : "nessuno"}</td>
          <td>${extraMin > 0 ? "+" + extraMin + " min" : extraMin + " min"}</td>
        </tr>`;
      }).join("")}
    </table>
    <p class="exit-note">Uscite simulate a ¼, ½ e ¾ del percorso: dal punto di uscita si prosegue su strade senza pedaggio.</p>`;
  btn.remove();
}

// ---------- Formatting ----------

function formatEur(n) {
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// ---------- Map (Leaflet + OSM) ----------

function drawRoutes(summaries, selectedIdx) {
  if (typeof L === "undefined") {
    el("map").classList.add("hidden");
    return;
  }
  el("map").classList.remove("hidden");
  if (!map) {
    map = L.map("map").setView([42.5, 12.5], 6);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
  }
  map.invalidateSize();
  mapLayers.forEach((l) => l.remove());
  mapLayers = [];

  const bounds = L.latLngBounds([]);
  let selectedLine = null;
  summaries.forEach((s, i) => {
    if (s.path.length === 0) return;
    const selected = i === selectedIdx;
    const line = L.polyline(s.path, {
      color: selected ? "#0b57d0" : "#9aa0a6",
      weight: selected ? 6 : 4,
      opacity: selected ? 0.95 : 0.6,
    }).addTo(map);
    if (selected) selectedLine = line;
    line.on("click", () => selectRoute(i));
    mapLayers.push(line);
    bounds.extend(line.getBounds());
  });
  // defer: container may have just become visible, Leaflet's cached size is stale
  setTimeout(() => {
    map.invalidateSize();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
      // container not laid out yet (e.g. hidden pane): refit when it gets a real size
      pendingFitBounds = map.getSize().x === 0 ? bounds : null;
    }
    if (selectedLine) selectedLine.bringToFront();
  }, 0);
}

// ---------- Results rendering ----------

let currentSummaries = [];

function selectRoute(idx) {
  document.querySelectorAll(".route-card").forEach((card, i) => {
    card.classList.toggle("selected", i === idx);
  });
  drawRoutes(currentSummaries, idx);
}

function detailMode() {
  return document.querySelector('input[name="detail-mode"]:checked')?.value || "simple";
}

let lastRoutes = null;

function renderResults(routes) {
  lastRoutes = routes;
  const list = el("routes-list");
  list.innerHTML = "";

  const full = detailMode() === "full";
  const consumption = parseFloat(el("consumption").value) || 6.5;
  const fuelPrice = parseFloat(el("fuel-price").value) || 1.75;

  currentSummaries = routes.map(summarizeRoute);
  const totals = currentSummaries.map((s) => {
    const km = s.distanceMeters / 1000;
    const fuel = (km / 100) * consumption * fuelPrice;
    return { fuel, total: full ? s.toll + fuel : s.toll };
  });
  const cheapest = totals.reduce((best, t, i) => (t.total < totals[best].total ? i : best), 0);

  currentSummaries.forEach((s, i) => {
    const km = s.distanceMeters / 1000;
    const { fuel, total } = totals[i];
    const hasToll = s.tollCount > 0;

    const card = document.createElement("div");
    card.className = "route-card" + (i === 0 ? " selected" : "");
    card.innerHTML = `
      <div class="route-header">
        <h3>Percorso ${i + 1}
          ${i === 0 ? '<span class="badge">più veloce</span>' : ""}
          ${i === cheapest ? '<span class="badge">più economico</span>' : ""}
          ${!hasToll ? '<span class="badge">senza pedaggio</span>' : ""}
          ${s.tollUnknown ? '<span class="badge">pedaggio parziale: alcuni importi mancanti</span>' : ""}
        </h3>
        <span class="total">${hasToll || full ? formatEur(total) : "0 €"}</span>
      </div>
      <div class="breakdown">
        <span>🎫 Pedaggio <strong>${hasToll ? formatEur(s.toll) : "—"}</strong></span>
        ${full ? `<span>⛽ Carburante <strong>${formatEur(fuel)}</strong></span>` : ""}
        <span>📏 <strong>${km.toFixed(0)} km</strong></span>
        <span>⏱️ <strong>${formatDuration(s.durationSeconds)}</strong></span>
      </div>
      ${full && hasToll ? `<button class="analyze-btn" data-idx="${i}">🔀 Conviene uscire prima?</button>` : ""}
      <div class="exit-analysis" id="exit-analysis-${i}"></div>`;
    card.addEventListener("click", () => selectRoute(i));
    const analyzeBtn = card.querySelector(".analyze-btn");
    if (analyzeBtn) {
      analyzeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        analyzeExits(i, analyzeBtn);
      });
    }
    list.appendChild(card);
  });

  drawRoutes(currentSummaries, 0);
}

document.querySelectorAll('input[name="detail-mode"]').forEach((radio) =>
  radio.addEventListener("change", () => {
    el("fuel-opts").classList.toggle("hidden", detailMode() !== "full");
    if (lastRoutes) renderResults(lastRoutes);
  })
);

// ---------- Search flow ----------

async function search() {
  const origin = el("origin").value.trim();
  const destination = el("destination").value.trim();
  if (!origin || !destination) {
    setStatus("Inserisci partenza e arrivo.", true);
    return;
  }

  setStatus("Calcolo percorsi…");
  el("go-btn").disabled = true;

  try {
    const { routes, origin: o, destination: d } = await computeRoutes(origin, destination);
    if (routes.length === 0) {
      setStatus("Nessun percorso trovato.", true);
      return;
    }
    setStatus(`${o.label} → ${d.label}: ${routes.length} percorsi.`);
    results.classList.remove("hidden");
    renderResults(routes);
  } catch (e) {
    setStatus(`Errore: ${e.message}`, true);
  } finally {
    el("go-btn").disabled = false;
  }
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

el("go-btn").addEventListener("click", search);
[el("origin"), el("destination")].forEach((input) =>
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") search(); })
);

showPanels();
