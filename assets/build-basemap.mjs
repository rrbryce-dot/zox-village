/**
 * Builds assets/corridor-basemap.svg — a static satellite/hybrid illustration
 * of the Detroit → Jersey City corridor. No tile API. Same projection as
 * the coordinates in js/config.js (CORRIDOR.view).
 *
 * Run: node assets/build-basemap.mjs
 */
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const W = 960;
const LON0 = -84.35;
const LON1 = -73.55;
/* Same degrees-per-pixel as the original 960×440 strip (lat 43.25–39.70),
   with 90 user units of geography added north and south so the board fills. */
const LAT_OLD0 = 43.25;
const LAT_OLD1 = 39.7;
const PAD = 90;
const H_OLD = 440;
const H = H_OLD + PAD * 2;
const pxPerDeg = H_OLD / (LAT_OLD0 - LAT_OLD1);
const dLat = PAD / pxPerDeg;
const LAT0 = LAT_OLD0 + dLat;
const LAT1 = LAT_OLD1 - dLat;

function P(lon, lat) {
  const x = ((lon - LON0) / (LON1 - LON0)) * W;
  const y = ((LAT0 - lat) / (LAT0 - LAT1)) * H;
  return [round(x), round(y)];
}

function round(n) {
  return Math.round(n * 10) / 10;
}

function pathOf(lonLats, close) {
  const pts = lonLats.map(([lon, lat]) => P(lon, lat));
  let d = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join("");
  if (close) d += "Z";
  return d;
}

function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rand = rng(20260323);

function pip(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const LAKE_ERIE = [
  [-83.48, 41.7],
  [-83.15, 41.58],
  [-82.9, 41.45],
  [-82.72, 41.5],
  [-82.45, 41.38],
  [-82.1, 41.42],
  [-81.75, 41.49],
  [-81.35, 41.58],
  [-80.95, 41.78],
  [-80.55, 42.02],
  [-80.1, 42.16],
  [-79.55, 42.28],
  [-79.05, 42.62],
  [-78.88, 42.9],
  [-78.95, 43.05],
  [-79.3, 42.78],
  [-79.85, 42.58],
  [-80.45, 42.55],
  [-81.05, 42.32],
  [-81.7, 42.12],
  [-82.35, 41.95],
  [-82.8, 41.82],
  [-83.2, 41.74],
  [-83.48, 41.7],
];

const LAKE_ST_CLAIR = [
  [-82.95, 42.28],
  [-82.78, 42.32],
  [-82.55, 42.42],
  [-82.42, 42.58],
  [-82.5, 42.68],
  [-82.75, 42.7],
  [-83.0, 42.62],
  [-83.12, 42.45],
  [-83.05, 42.32],
  [-82.95, 42.28],
];

const LAKE_ONTARIO = [
  [-79.78, 43.98],
  [-76.05, 43.98],
  [-76.28, 43.62],
  [-76.55, 43.42],
  [-77.15, 43.25],
  [-78.05, 43.28],
  [-78.85, 43.26],
  [-79.35, 43.32],
  [-79.78, 43.55],
];

const CHESAPEAKE = [
  [-76.42, 39.52],
  [-76.28, 39.32],
  [-76.12, 39.12],
  [-76.05, 38.98],
  [-76.28, 38.98],
  [-76.4, 39.12],
  [-76.55, 39.32],
  [-76.48, 39.48],
];

function inWater(lon, lat) {
  if (pip(lon, lat, LAKE_ERIE)) return true;
  if (pip(lon, lat, LAKE_ST_CLAIR)) return true;
  if (pip(lon, lat, LAKE_ONTARIO)) return true;
  if (pip(lon, lat, CHESAPEAKE)) return true;
  if (lat > 42.78 && lon < -82.28) return true;
  if (lat > 43.35 && lon > -74.15 && lon < -73.7) return true;
  return false;
}

const farmColors = ["#7d8d46", "#90984c", "#a49756", "#6b7e3c", "#b4a15e", "#61753c", "#98a156", "#8a7844", "#748a46", "#c2ad6a", "#5d7040"];
const forestColors = ["#2a452c", "#314e32", "#243c28", "#3a5736", "#1e3422", "#34583a", "#2c4030"];

const parts = [];

parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
parts.push(`<defs>`);
parts.push(`<linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="#1a5f86"/>
  <stop offset="45%" stop-color="#1e6f98"/>
  <stop offset="100%" stop-color="#164e72"/>
</linearGradient>`);
parts.push(`<linearGradient id="waterDeep" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="#174e70"/>
  <stop offset="100%" stop-color="#0f3a56"/>
</linearGradient>`);
parts.push(`<pattern id="streets" width="7" height="7" patternUnits="userSpaceOnUse">
  <rect width="7" height="7" fill="#8a8478"/>
  <path d="M0 3.5H7M3.5 0V7" stroke="#5e5a54" stroke-width="0.7"/>
  <path d="M0 1.2H7M0 5.8H7M1.2 0V7M5.8 0V7" stroke="#7a756c" stroke-width="0.28"/>
</pattern>`);
parts.push(`<pattern id="blocks" width="11" height="11" patternUnits="userSpaceOnUse">
  <rect width="11" height="11" fill="#7d7870"/>
  <path d="M0 5.5H11M5.5 0V11" stroke="#4e4a44" stroke-width="0.9"/>
  <rect x="1" y="1" width="3.2" height="3.2" fill="#6a655e"/>
  <rect x="6.4" y="1" width="3.2" height="3.2" fill="#908a80"/>
  <rect x="1" y="6.4" width="3.2" height="3.2" fill="#918b82"/>
  <rect x="6.4" y="6.4" width="3.2" height="3.2" fill="#5f5b55"/>
</pattern>`);
parts.push(`<filter id="grain" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="4" result="n"/>
  <feColorMatrix in="n" type="matrix" result="tint" values="0 0 0 0 0.35  0 0 0 0 0.4  0 0 0 0 0.22  0 0 0 0.35 0"/>
  <feBlend in="SourceGraphic" in2="tint" mode="multiply"/>
</filter>`);
parts.push(`<filter id="canopy" x="-5%" y="-5%" width="110%" height="110%">
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" result="n"/>
  <feColorMatrix in="n" type="matrix" result="tint" values="0 0 0 0 0.15  0 0 0 0 0.28  0 0 0 0 0.12  0 0 0 0.45 0"/>
  <feBlend in="SourceGraphic" in2="tint" mode="multiply"/>
</filter>`);
parts.push(`</defs>`);

parts.push(`<rect width="${W}" height="${H}" fill="#6d8244"/>`);

parts.push(`<g filter="url(#grain)">`);

const fields = [];
for (let lon = -84.32; lon < -80.45; lon += 0.145) {
  for (let lat = 42.55; lat > 39.02; lat -= 0.095) {
    if (inWater(lon + 0.05, lat - 0.04)) continue;
    if (lon > -80.7 && lat < 42.15 && lon > -80.55) continue;
    const [x, y] = P(lon, lat);
    const [x2, y2] = P(lon + 0.135, lat - 0.085);
    const w = Math.abs(x2 - x);
    const h = Math.abs(y2 - y);
    const color = farmColors[Math.floor(rand() * farmColors.length)];
    fields.push(`<rect x="${x + 0.3}" y="${y + 0.25}" width="${round(w - 0.7)}" height="${round(h - 0.45)}" fill="${color}"/>`);
  }
}
const ontarioFields = [];
for (let lon = -82.95; lon < -79.55; lon += 0.16) {
  for (let lat = 43.9; lat > 42.62; lat -= 0.1) {
    if (inWater(lon + 0.04, lat - 0.04)) continue;
    const [x, y] = P(lon, lat);
    const [x2, y2] = P(lon + 0.15, lat - 0.09);
    const color = farmColors[Math.floor(rand() * farmColors.length)];
    ontarioFields.push(
      `<rect x="${x + 0.3}" y="${y + 0.25}" width="${round(Math.abs(x2 - x) - 0.7)}" height="${round(Math.abs(y2 - y) - 0.45)}" fill="${color}"/>`
    );
  }
}
parts.push(`<g id="fields">${fields.join("")}${ontarioFields.join("")}</g>`);

const forest = [];
for (let lon = -80.85; lon < -74.7; lon += 0.18) {
  for (let lat = 43.85; lat > 39.0; lat -= 0.14) {
    if (inWater(lon, lat)) continue;
    if (lon > -75.15 && lat < 41.2) continue;
    if (lon < -79.7 && lat > 43.15) continue;
    const [x, y] = P(lon, lat);
    const [x2, y2] = P(lon + 0.2, lat - 0.15);
    const color = forestColors[Math.floor(rand() * forestColors.length)];
    const jitter = (rand() - 0.5) * 4;
    forest.push(
      `<rect x="${round(x + jitter)}" y="${round(y)}" width="${round(Math.abs(x2 - x) + 2)}" height="${round(Math.abs(y2 - y) + 1)}" fill="${color}" opacity="0.92"/>`
    );
  }
}
parts.push(`<g id="forest" filter="url(#canopy)">${forest.join("")}</g>`);

const ridges = [];
for (let i = 0; i < 18; i++) {
  const lon0 = -80.05 + i * 0.26;
  const lat0 = 39.05;
  const lon1 = lon0 + 1.15;
  const lat1 = 42.35;
  const [a, b] = [P(lon0, lat0), P(lon1, lat1)];
  ridges.push(
    `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" fill="none" stroke="${i % 2 ? "#1c3320" : "#3e5c38"}" stroke-width="${i % 3 === 0 ? 3.2 : 1.4}" opacity="0.45" stroke-linecap="round"/>`
  );
}
parts.push(`<g id="ridges">${ridges.join("")}</g>`);

const valley = pathOf(
  [
    [-77.55, 41.08],
    [-77.2, 40.7],
    [-76.95, 40.35],
    [-76.7, 40.0],
    [-76.35, 39.42],
    [-76.18, 39.06],
    [-75.82, 39.14],
    [-76.05, 39.55],
    [-76.35, 40.08],
    [-76.72, 40.52],
    [-77.08, 40.98],
    [-77.42, 41.18],
  ],
  true
);
parts.push(`<path d="${valley}" fill="#7f8d4e" opacity="0.55"/>`);

const nj = pathOf(
  [
    [-75.3, 41.35],
    [-74.7, 41.1],
    [-74.0, 40.95],
    [-73.9, 40.55],
    [-74.35, 39.35],
    [-74.7, 39.02],
    [-75.25, 39.02],
    [-75.4, 40.2],
    [-75.35, 40.9],
  ],
  true
);
parts.push(`<path d="${nj}" fill="#8a9354" opacity="0.72"/>`);

parts.push(`</g>`);

function waterPath(poly, fill) {
  return `<path d="${pathOf(poly, true)}" fill="${fill || "url(#water)"}" stroke="#c5d5c4" stroke-width="1.1"/>`;
}

const huron = [
  [-84.35, 43.98],
  [-82.32, 43.98],
  [-82.4, 43.15],
  [-82.55, 42.85],
  [-82.75, 42.72],
  [-83.45, 42.82],
  [-84.35, 43.15],
];
parts.push(waterPath(huron));
parts.push(waterPath(LAKE_ST_CLAIR));

const river = pathOf([
  [-82.95, 42.3],
  [-83.05, 42.22],
  [-83.1, 42.05],
  [-83.15, 41.9],
  [-83.25, 41.75],
]);
parts.push(`<path d="${river}" fill="none" stroke="#1e6f98" stroke-width="3.4" stroke-linecap="round"/>`);
parts.push(`<path d="${river}" fill="none" stroke="#8fb8c4" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>`);

parts.push(waterPath(LAKE_ERIE));

const erieShade = pathOf(
  [
    [-82.6, 42.15],
    [-81.4, 42.05],
    [-80.2, 42.35],
    [-79.2, 42.7],
    [-79.4, 42.45],
    [-80.6, 42.15],
    [-81.6, 41.9],
    [-82.5, 41.95],
  ],
  true
);
parts.push(`<path d="${erieShade}" fill="#0f3d5c" opacity="0.28"/>`);

parts.push(waterPath(LAKE_ONTARIO, "url(#waterDeep)"));
parts.push(waterPath(CHESAPEAKE));

const rivers = [
  [
    [-84.05, 41.2],
    [-83.7, 41.45],
    [-83.54, 41.62],
  ],
  [
    [-81.85, 41.15],
    [-81.72, 41.4],
    [-81.69, 41.5],
  ],
  [
    [-79.05, 41.45],
    [-79.5, 40.95],
    [-80.0, 40.44],
  ],
  [
    [-79.7, 39.75],
    [-79.9, 40.1],
    [-80.0, 40.44],
  ],
  [
    [-80.0, 40.44],
    [-80.55, 40.05],
    [-80.9, 39.75],
  ],
  [
    [-80.7, 39.85],
    [-81.45, 39.25],
    [-82.2, 39.05],
    [-83.4, 38.99],
  ],
  [
    [-76.8, 41.6],
    [-76.85, 41.1],
    [-76.88, 40.26],
    [-76.45, 39.55],
    [-76.3, 39.2],
  ],
  [
    [-75.05, 41.4],
    [-74.95, 40.9],
    [-75.05, 40.35],
    [-75.2, 39.45],
    [-75.35, 39.05],
  ],
  [
    [-77.4, 39.55],
    [-77.05, 39.28],
    [-76.55, 39.05],
  ],
  [
    [-73.78, 42.7],
    [-73.9, 42.1],
    [-74.02, 41.2],
    [-74.02, 40.7],
  ],
];

const riverMarkup = rivers
  .map((line) => {
    const d = pathOf(line, false);
    return `<path d="${d}" fill="none" stroke="#1b6288" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
  })
  .join("");
parts.push(`<g id="rivers">${riverMarkup}</g>`);

const harbor = pathOf(
  [
    [-74.12, 40.82],
    [-74.02, 40.78],
    [-73.92, 40.7],
    [-74.02, 40.58],
    [-74.18, 40.55],
    [-74.22, 40.68],
    [-74.16, 40.8],
  ],
  true
);
parts.push(`<path d="${harbor}" fill="url(#water)" stroke="#c5d5c4" stroke-width="0.8"/>`);

function blob(lon, lat, rxDeg, ryDeg, fill) {
  const [cx, cy] = P(lon, lat);
  const [ex] = P(lon + rxDeg, lat);
  const [, ey] = P(lon, lat - ryDeg);
  const rx = Math.abs(ex - cx);
  const ry = Math.abs(ey - cy);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${round(rx)}" ry="${round(ry)}" fill="${fill}"/>`;
}

const towns = [
  [-83.05, 42.33, 0.34, 0.22, "url(#blocks)"],
  [-83.25, 42.28, 0.18, 0.1, "url(#streets)"],
  [-83.54, 41.66, 0.16, 0.09, "url(#streets)"],
  [-82.98, 41.45, 0.08, 0.045, "url(#streets)"],
  [-81.69, 41.5, 0.28, 0.14, "url(#blocks)"],
  [-81.52, 41.08, 0.14, 0.08, "url(#streets)"],
  [-80.65, 41.1, 0.1, 0.06, "url(#streets)"],
  [-80.08, 42.13, 0.08, 0.05, "url(#streets)"],
  [-80.0, 40.44, 0.22, 0.12, "url(#blocks)"],
  [-78.9, 42.9, 0.1, 0.06, "url(#streets)"],
  [-76.88, 40.26, 0.1, 0.06, "url(#streets)"],
  [-75.47, 40.6, 0.1, 0.055, "url(#streets)"],
  [-74.66, 40.35, 0.05, 0.035, "url(#streets)"],
  [-76.61, 39.29, 0.1, 0.06, "url(#streets)"],
  [-74.17, 40.74, 0.16, 0.1, "url(#blocks)"],
  [-74.04, 40.72, 0.12, 0.1, "url(#blocks)"],
  [-73.95, 40.73, 0.14, 0.12, "url(#blocks)"],
];
const woodlots = [];
for (let i = 0; i < 36; i++) {
  const lon = -84.15 + rand() * 3.4;
  const lat = 39.15 + rand() * 3.15;
  if (inWater(lon, lat)) continue;
  if (lon > -80.7) continue;
  woodlots.push(blob(lon, lat, 0.045 + rand() * 0.05, 0.028 + rand() * 0.03, forestColors[i % forestColors.length]));
}
parts.push(`<g id="woodlots">${woodlots.join("")}</g>`);
parts.push(`<g id="towns">${towns.map((t) => blob(t[0], t[1], t[2], t[3], t[4])).join("")}</g>`);

const borders = [
  [
    [-84.35, 41.73],
    [-83.35, 41.7],
  ],
  [
    [-80.52, 42.25],
    [-80.52, 39.02],
  ],
  [
    [-79.76, 42.26],
    [-75.35, 42.0],
  ],
  [
    [-75.35, 41.35],
    [-75.05, 40.4],
    [-75.2, 39.05],
  ],
];
parts.push(
  `<g id="borders" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.15" stroke-dasharray="5 4" stroke-linejoin="round">${borders
    .map((line) => `<path d="${pathOf(line, false)}"/>`)
    .join("")}</g>`
);

function road(line) {
  return pathOf(line, false);
}

const highways = [
  [
    [-83.05, 42.55],
    [-83.05, 42.33],
    [-83.4, 41.92],
    [-83.54, 41.66],
    [-83.62, 41.15],
  ],
  [
    [-83.75, 42.27],
    [-83.05, 42.33],
    [-82.7, 42.45],
  ],
  [
    [-83.55, 41.64],
    [-82.9, 41.48],
    [-82.1, 41.4],
    [-81.4, 41.55],
    [-80.7, 41.9],
    [-80.15, 42.05],
  ],
  [
    [-81.7, 41.5],
    [-81.85, 41.15],
    [-82.3, 40.55],
  ],
  [
    [-80.52, 41.15],
    [-80.35, 40.9],
    [-79.6, 40.35],
    [-78.85, 40.32],
    [-77.6, 40.22],
    [-76.8, 40.28],
    [-76.1, 40.22],
    [-75.4, 40.45],
  ],
  [
    [-80.08, 42.13],
    [-80.05, 41.4],
    [-80.0, 40.44],
  ],
  [
    [-77.2, 41.25],
    [-76.9, 40.7],
    [-76.88, 40.26],
    [-76.75, 39.8],
  ],
  [
    [-76.7, 40.32],
    [-75.9, 40.45],
    [-75.47, 40.6],
    [-74.7, 40.7],
    [-74.18, 40.74],
  ],
  [
    [-80.4, 41.22],
    [-78.6, 41.05],
    [-76.8, 40.95],
    [-75.2, 40.9],
    [-74.5, 40.85],
  ],
  [
    [-74.15, 40.95],
    [-74.12, 40.74],
    [-74.2, 40.45],
  ],
  [
    [-83.05, 42.33],
    [-82.85, 42.4],
    [-82.4, 42.65],
  ],
];

const hwy = highways
  .map((line) => {
    const d = road(line);
    return `<path d="${d}" fill="none" stroke="#b9a15a" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#f6e7a6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;
  })
  .join("");
parts.push(`<g id="highways">${hwy}</g>`);

const arterials = [];
for (let lon = -84.1; lon < -80.7; lon += 0.55) {
  arterials.push([
    [lon, 42.2],
    [lon, 40.0],
  ]);
}
for (let lat = 40.2; lat < 42.3; lat += 0.38) {
  arterials.push([
    [-84.2, lat],
    [-80.7, lat],
  ]);
}
parts.push(
  `<g id="arterials" fill="none" stroke="rgba(255,252,245,0.55)" stroke-width="0.7" stroke-linecap="round">${arterials
    .map((line) => `<path d="${pathOf(line, false)}"/>`)
    .join("")}</g>`
);

const [sx, sy] = P(-84.12, 39.18);
parts.push(`<g id="scale" font-family="Arial, Helvetica, sans-serif">
  <rect x="${sx}" y="${sy}" width="86" height="6" fill="#f4f1e8" stroke="#222" stroke-width="0.6"/>
  <rect x="${sx}" y="${sy}" width="43" height="6" fill="#222"/>
  <text x="${sx}" y="${sy - 3}" fill="#1a1a1a" stroke="#f4f1e8" stroke-width="2" paint-order="stroke" font-size="9" font-weight="700">0</text>
  <text x="${sx + 86}" y="${sy - 3}" text-anchor="end" fill="#1a1a1a" stroke="#f4f1e8" stroke-width="2" paint-order="stroke" font-size="9" font-weight="700">50 mi</text>
  <text x="${W - 18}" y="22" text-anchor="middle" fill="#1a1a1a" stroke="#f7f4ea" stroke-width="2" paint-order="stroke" font-size="11" font-weight="700">N</text>
  <path d="M${W - 18} 26 l4 10 h-3 v8 h-2 v-8 h-3 z" fill="#1a1a1a" stroke="#f7f4ea" stroke-width="0.6"/>
</g>`);

parts.push(`</svg>`);

const out = join(dirname(fileURLToPath(import.meta.url)), "corridor-basemap.svg");
writeFileSync(out, parts.join("\n"));
console.log("wrote", out, "bytes", Buffer.byteLength(parts.join("\n")));

const spots = {
  detroit: P(-83.05, 42.33),
  toledo: P(-83.54, 41.66),
  monroe: P(-83.4, 41.92),
  sandusky: P(-82.71, 41.45),
  cleveland: P(-81.69, 41.5),
  erieField: P(-81.22, 41.58),
  ashtabula: P(-80.79, 41.87),
  youngstown: P(-80.65, 41.1),
  pittsburgh: P(-80.0, 40.44),
  altoona: P(-78.39, 40.52),
  harrisburg: P(-76.88, 40.26),
  princeton: P(-74.66, 40.35),
  jersey: P(-74.08, 40.73),
  buffalo: P(-78.88, 42.89),
  eriePa: P(-80.08, 42.13),
  akron: P(-81.52, 41.08),
  lake: P(-81.3, 42.2),
};
console.log(JSON.stringify(spots, null, 2));
