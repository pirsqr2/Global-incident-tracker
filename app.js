const incidents = window.INCIDENTS || [];

const canvas = document.getElementById("globe");
const popup = document.getElementById("incident-popup");
const popupTitle = document.getElementById("popup-title");
const popupSubtitle = document.getElementById("popup-subtitle");
const popupDate = document.getElementById("popup-date");
const popupDescription = document.getElementById("popup-description");
const popupLink = document.getElementById("popup-link");
const popupClose = document.getElementById("popup-close");
const incidentCards = document.getElementById("incident-cards");
const incidentCount = document.getElementById("incident-count");
const zoomInButton = document.getElementById("zoom-in");
const zoomOutButton = document.getElementById("zoom-out");

const W = Math.min(680, window.innerWidth - 40);
const H = 520;
canvas.width = W;
canvas.height = H;

const ctx = canvas.getContext("2d");
const cx = W / 2;
const cy = H / 2;

let radius = Math.min(W, H) * 0.38;
let rotation = [0, 0];
let dragging = false;
let lastX;
let lastY;
let world = null;
let selectedIncident = null;
let markerHits = [];
let autoRotate = null;

const incidentSummary = `Now showing ${incidents.length} incidents across refineries, terminals, platforms, ports, and power plants.`;
incidentCount.textContent = incidentSummary;

function renderIncidentCards() {
  if (!incidentCards) return;

  const continentOrder = ["North America", "South America", "Europe", "Asia", "Oceania", "Africa"];
  const groupedIncidents = incidents.reduce((accumulator, incident) => {
    const key = incident.continent || "Other";
    if (!accumulator[key]) accumulator[key] = [];
    accumulator[key].push(incident);
    return accumulator;
  }, {});

  incidentCards.innerHTML = continentOrder
    .filter((continent) => groupedIncidents[continent]?.length)
    .map((continent) => `
      <section class="continent-group" data-continent="${continent}">
        <div class="continent-header">
          <div class="continent-title-row">
            <h3 class="continent-title">${continent}</h3>
            <span class="continent-count">${groupedIncidents[continent].length} incident${groupedIncidents[continent].length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div class="continent-grid">
          ${groupedIncidents[continent]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map((incident) => `
            <article class="incident-card" data-incident-id="${incident.id}" style="--incident-color: ${incident.color};">
              <div class="card-label">
                <span class="card-dot"></span>
                Incident marker
              </div>
              <h4 class="card-title">${incident.title}</h4>
              <div class="card-subtitle">${incident.subtitle}</div>
              <div class="card-date">${incident.date}</div>
              <p class="card-description">${incident.description}</p>
              <div class="card-actions">
                <button type="button" class="card-button" data-incident-button="${incident.id}">Show on globe</button>
                <a href="${incident.url}" target="_blank" rel="noreferrer" class="card-link">Open article</a>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `)
    .join("");

  incidentCards.querySelectorAll("[data-incident-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const incident = incidents.find((item) => item.id === button.getAttribute("data-incident-button"));
      if (!incident) return;
      showPopup(incident);
      drawWithLand();
      canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function showPopup(incident) {
  selectedIncident = incident;
  popupTitle.textContent = incident.title;
  popupSubtitle.textContent = incident.subtitle;
  popupDate.textContent = incident.date;
  popupDescription.textContent = incident.description;
  popupLink.href = incident.url;
  popup.hidden = false;
}

function hidePopup() {
  selectedIncident = null;
  popup.hidden = true;
}

function drawStars() {
  const seed = 42;
  for (let i = 0; i < 180; i += 1) {
    const x = (Math.sin(i * 127.1 + seed) * 0.5 + 0.5) * W;
    const y = (Math.sin(i * 311.7 + seed) * 0.5 + 0.5) * H;
    const r = Math.sin(i * 91.3) * 0.5 + 0.8;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < radius + 10) continue;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.abs(Math.sin(i * 53.1)) * 0.5})`;
    ctx.fill();
  }
}

function isFrontFacing(lng, lat) {
  const geoDist = d3.geoDistance([lng, lat], [-rotation[0], rotation[1]]);
  return geoDist <= Math.PI / 2;
}

function drawIncidentMarker(proj, incident, now) {
  const coords = proj([incident.lng, incident.lat]);
  if (!coords || !isFrontFacing(incident.lng, incident.lat)) return;

  const [x, y] = coords;
  const pulse = 4 + Math.abs(Math.sin(now / 500 + incident.lng)) * 3;
  const isSelected = selectedIncident && selectedIncident.id === incident.id;

  ctx.beginPath();
  ctx.arc(x, y, pulse + 4, 0, 2 * Math.PI);
  ctx.fillStyle = `${incident.color}22`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, pulse, 0, 2 * Math.PI);
  ctx.fillStyle = `${incident.color}44`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, isSelected ? 5 : 4, 0, 2 * Math.PI);
  ctx.fillStyle = incident.color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 245, 240, 0.9)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  markerHits.push({ incident, x, y, radius: 12 });

  if (!isSelected) return;

  ctx.beginPath();
  ctx.moveTo(x + 6, y - 6);
  ctx.lineTo(x + 18, y - 18);
  ctx.strokeStyle = incident.color;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "600 11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#fff0ea";
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.lineWidth = 3;
  ctx.strokeText(incident.title, x + 22, y - 20);
  ctx.fillText(incident.title, x + 22, y - 20);
}

function drawWithLand() {
  markerHits = [];
  ctx.clearRect(0, 0, W, H);
  drawStars();

  const glow = ctx.createRadialGradient(cx, cy, radius * 0.92, cx, cy, radius * 1.12);
  glow.addColorStop(0, "rgba(60,120,220,0.18)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, 2 * Math.PI);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = "#0a1628";
  ctx.fill();
  ctx.strokeStyle = "#1a3a6a";
  ctx.lineWidth = 0.5;
  ctx.stroke();

  if (world) {
    const proj = d3.geoOrthographic()
      .scale(radius)
      .translate([cx, cy])
      .rotate([rotation[0], -rotation[1], 0]);
    const pathGen = d3.geoPath(proj, ctx);

    ctx.beginPath();
    pathGen(world);
    ctx.fillStyle = "#1a3d2b";
    ctx.strokeStyle = "#2d6644";
    ctx.lineWidth = 0.5;
    ctx.fill();
    ctx.stroke();

    const graticule = d3.geoGraticule()();
    ctx.beginPath();
    pathGen(graticule);
    ctx.strokeStyle = "rgba(60,100,180,0.12)";
    ctx.lineWidth = 0.4;
    ctx.stroke();

    const now = Date.now();
    incidents.forEach((incident) => drawIncidentMarker(proj, incident, now));
  }

  const highlight = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, 0, cx, cy, radius);
  highlight.addColorStop(0, "rgba(255,255,255,0.07)");
  highlight.addColorStop(0.5, "rgba(255,255,255,0)");
  highlight.addColorStop(1, "rgba(0,0,20,0.3)");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.fillStyle = highlight;
  ctx.fill();
}

function zoom(factor) {
  radius = Math.max(80, Math.min(W * 0.6, radius * factor));
  drawWithLand();
}

function startAutoRotate() {
  if (autoRotate) clearInterval(autoRotate);
  autoRotate = setInterval(() => {
    if (!dragging) {
      rotation[0] += 0.15;
      drawWithLand();
    }
  }, 30);
}

popupClose.addEventListener("click", hidePopup);
zoomInButton.addEventListener("click", () => zoom(1.15));
zoomOutButton.addEventListener("click", () => zoom(0.87));

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = markerHits.find((marker) => Math.hypot(marker.x - x, marker.y - y) <= marker.radius);
  if (!hit) {
    hidePopup();
    drawWithLand();
    return;
  }
  showPopup(hit.incident);
  drawWithLand();
});

canvas.addEventListener("mousedown", (event) => {
  dragging = true;
  lastX = event.clientX;
  lastY = event.clientY;
  canvas.style.cursor = "grabbing";
  if (autoRotate) clearInterval(autoRotate);
});

window.addEventListener("mouseup", () => {
  dragging = false;
  canvas.style.cursor = "grab";
});

window.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  rotation[0] += (event.clientX - lastX) * 0.4;
  rotation[1] += (event.clientY - lastY) * 0.4;
  rotation[1] = Math.max(-80, Math.min(80, rotation[1]));
  lastX = event.clientX;
  lastY = event.clientY;
  drawWithLand();
});

canvas.addEventListener("touchstart", (event) => {
  dragging = true;
  lastX = event.touches[0].clientX;
  lastY = event.touches[0].clientY;
  if (autoRotate) clearInterval(autoRotate);
}, { passive: true });

canvas.addEventListener("touchend", () => {
  dragging = false;
});

canvas.addEventListener("touchmove", (event) => {
  if (!dragging) return;
  rotation[0] += (event.touches[0].clientX - lastX) * 0.4;
  rotation[1] -= (event.touches[0].clientY - lastY) * 0.4;
  rotation[1] = Math.max(-80, Math.min(80, rotation[1]));
  lastX = event.touches[0].clientX;
  lastY = event.touches[0].clientY;
  drawWithLand();
  event.preventDefault();
}, { passive: false });

canvas.addEventListener("wheel", (event) => {
  radius = Math.max(80, Math.min(W * 0.6, radius * (event.deltaY < 0 ? 1.08 : 0.93)));
  drawWithLand();
  event.preventDefault();
}, { passive: false });

window.addEventListener("resize", () => {
  const nextWidth = Math.min(680, window.innerWidth - 40);
  canvas.width = nextWidth;
  canvas.height = H;
  drawWithLand();
});

fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
  .then((response) => response.json())
  .then((data) => {
    world = topojson.feature(data, data.objects.countries);
    drawWithLand();
  })
  .catch(() => drawWithLand());

renderIncidentCards();
startAutoRotate();
