/**
 * Buyable mosaic squares for the corridor.
 * Geometry matches assets/build-basemap.mjs (same projection, same field/forest
 * loops, same RNG) so a purchased fill sits on the visible square.
 * Water and dense city cores are not for sale. Each square is one acre at
 * BUILDINGS.farm.cost so income/acre and the 3-vs-6 deed math stay put.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const W = 960;
  const LON0 = -84.35;
  const LON1 = -73.55;
  const LAT_OLD0 = 43.25;
  const LAT_OLD1 = 39.7;
  const PAD = 90;
  const H_OLD = 440;
  const H = H_OLD + PAD * 2;
  const pxPerDeg = H_OLD / (LAT_OLD0 - LAT_OLD1);
  const dLat = PAD / pxPerDeg;
  const LAT0 = LAT_OLD0 + dLat;
  const LAT1 = LAT_OLD1 - dLat;

  function round(n) {
    return Math.round(n * 10) / 10;
  }

  function P(lon, lat) {
    const x = ((lon - LON0) / (LON1 - LON0)) * W;
    const y = ((LAT0 - lat) / (LAT0 - LAT1)) * H;
    return [round(x), round(y)];
  }

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

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
    [-83.48, 41.7], [-83.15, 41.58], [-82.9, 41.45], [-82.72, 41.5], [-82.45, 41.38],
    [-82.1, 41.42], [-81.75, 41.49], [-81.35, 41.58], [-80.95, 41.78], [-80.55, 42.02],
    [-80.1, 42.16], [-79.55, 42.28], [-79.05, 42.62], [-78.88, 42.9], [-78.95, 43.05],
    [-79.3, 42.78], [-79.85, 42.58], [-80.45, 42.55], [-81.05, 42.32], [-81.7, 42.12],
    [-82.35, 41.95], [-82.8, 41.82], [-83.2, 41.74], [-83.48, 41.7],
  ];
  const LAKE_ST_CLAIR = [
    [-82.95, 42.28], [-82.78, 42.32], [-82.55, 42.42], [-82.42, 42.58], [-82.5, 42.68],
    [-82.75, 42.7], [-83.0, 42.62], [-83.12, 42.45], [-83.05, 42.32], [-82.95, 42.28],
  ];
  const LAKE_ONTARIO = [
    [-79.78, 43.98], [-76.05, 43.98], [-76.28, 43.62], [-76.55, 43.42], [-77.15, 43.25],
    [-78.05, 43.28], [-78.85, 43.26], [-79.35, 43.32], [-79.78, 43.55],
  ];
  const CHESAPEAKE = [
    [-76.42, 39.52], [-76.28, 39.32], [-76.12, 39.12], [-76.05, 38.98], [-76.28, 38.98],
    [-76.4, 39.12], [-76.55, 39.32], [-76.48, 39.48],
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

  /* Inner cores of the block-pattern cities. The surrounding mosaic stays farmland. */
  const CORES = [
    [-83.05, 42.33, 0.22, 0.13],
    [-81.69, 41.5, 0.16, 0.08],
    [-80.0, 40.44, 0.13, 0.07],
    [-74.06, 40.73, 0.2, 0.12],
  ];

  function inCity(lon, lat) {
    for (let i = 0; i < CORES.length; i++) {
      const c = CORES[i];
      const dx = (lon - c[0]) / c[2];
      const dy = (lat - c[1]) / c[3];
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  }

  function inChrome(x, y) {
    if (x < 128 && y > H - 78) return true;
    if (x > W - 42 && y < 50) return true;
    return false;
  }

  function regionName(lon, lat) {
    if (lat > 42.75) return "Ontario";
    if (lon < -83.35) return "Monroe";
    if (lon < -82.55) return "Toledo";
    if (lon < -81.85) return "Sandusky";
    if (lon < -80.95) return "Erie";
    if (lon < -80.15) return "Youngstown";
    if (lon < -78.6) return "Pittsburgh";
    if (lon < -77.2) return "Altoona";
    if (lon < -75.9) return "Harrisburg";
    if (lon < -74.9) return "Easton";
    return "Princeton";
  }

  function hashId(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function sellerFor(id) {
    const list = Zox.FARMERS || ["A local farmer"];
    return list[hashId(id) % list.length];
  }

  function pointInRect(px, py, rect) {
    return px >= rect.x && py >= rect.y && px <= rect.x + rect.w && py <= rect.y + rect.h;
  }

  function covered(px, py, rects) {
    for (let i = 0; i < rects.length; i++) {
      if (pointInRect(px, py, rects[i])) return true;
    }
    return false;
  }

  function makeParcel(id, name, lon, lat, rect, kind) {
    const cx = round(rect.x + rect.w / 2);
    const cy = round(rect.y + rect.h / 2);
    return {
      id: id,
      name: name,
      x: cx,
      y: cy,
      rx: rect.x,
      ry: rect.y,
      rw: rect.w,
      rh: rect.h,
      lon: lon,
      lat: lat,
      acres: 1,
      kind: kind,
      spine: false,
      order: 0,
    };
  }

  function build() {
    const rand = rng(20260323);
    const parcels = [];
    const forestRects = [];
    let n = 0;

    function consider(id, label, lon, lat, rect, kind) {
      if (rect.w < 2 || rect.h < 2) return;
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (inChrome(cx, cy)) return;
      if (inWater(lon, lat) || inCity(lon, lat)) return;
      parcels.push(makeParcel(id, regionName(lon, lat) + " " + label, lon, lat, rect, kind));
    }

    for (let lon = -84.32, col = 0; lon < -80.45; lon += 0.145, col++) {
      let row = 0;
      for (let lat = 42.55; lat > 39.02; lat -= 0.095, row++) {
        if (inWater(lon + 0.05, lat - 0.04)) continue;
        if (lon > -80.7 && lat < 42.15 && lon > -80.55) continue;
        rand();
        const [x, y] = P(lon, lat);
        const [x2, y2] = P(lon + 0.135, lat - 0.085);
        const rect = {
          x: round(x + 0.3),
          y: round(y + 0.25),
          w: round(Math.abs(x2 - x) - 0.7),
          h: round(Math.abs(y2 - y) - 0.45),
        };
        const clon = lon + 0.0675;
        const clat = lat - 0.0425;
        consider("f" + col + "-" + row, col + "-" + row, clon, clat, rect, "field");
        n += 1;
      }
    }

    for (let lon = -82.95, col = 0; lon < -79.55; lon += 0.16, col++) {
      let row = 0;
      for (let lat = 43.9; lat > 42.62; lat -= 0.1, row++) {
        if (inWater(lon + 0.04, lat - 0.04)) continue;
        rand();
        const [x, y] = P(lon, lat);
        const [x2, y2] = P(lon + 0.15, lat - 0.09);
        const rect = {
          x: round(x + 0.3),
          y: round(y + 0.25),
          w: round(Math.abs(x2 - x) - 0.7),
          h: round(Math.abs(y2 - y) - 0.45),
        };
        consider("o" + col + "-" + row, col + "-" + row, lon + 0.075, lat - 0.045, rect, "field");
      }
    }

    for (let lon = -80.85, col = 0; lon < -74.7; lon += 0.18, col++) {
      let row = 0;
      for (let lat = 43.85; lat > 39.0; lat -= 0.14, row++) {
        if (inWater(lon, lat)) continue;
        if (lon > -75.15 && lat < 41.2) continue;
        if (lon < -79.7 && lat > 43.15) continue;
        rand();
        const jitter = (rand() - 0.5) * 4;
        const [px, py] = P(lon, lat);
        const [x2, y2] = P(lon + 0.2, lat - 0.15);
        const rect = {
          x: round(px + jitter),
          y: round(py),
          w: round(Math.abs(x2 - px) + 2),
          h: round(Math.abs(y2 - py) + 1),
        };
        forestRects.push(rect);
        consider("w" + col + "-" + row, col + "-" + row, lon + 0.1, lat - 0.075, rect, "woods");
      }
    }

    const kept = [];
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      if (p.kind === "field" && covered(p.x, p.y, forestRects)) continue;
      kept.push(p);
    }

    const existing = forestRects.slice();
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].kind === "field") {
        existing.push({ x: kept[i].rx, y: kept[i].ry, w: kept[i].rw, h: kept[i].rh });
      }
    }

    for (let lon = -75.35, col = 0; lon < -73.65; lon += 0.145, col++) {
      let row = 0;
      for (let lat = 41.32; lat > 39.05; lat -= 0.095, row++) {
        const clon = lon + 0.0675;
        const clat = lat - 0.0425;
        if (inWater(clon, clat) || inCity(clon, clat)) continue;
        const [x, y] = P(lon, lat);
        const [x2, y2] = P(lon + 0.135, lat - 0.085);
        const rect = {
          x: round(x + 0.3),
          y: round(y + 0.25),
          w: round(Math.abs(x2 - x) - 0.7),
          h: round(Math.abs(y2 - y) - 0.45),
        };
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        if (inChrome(cx, cy)) continue;
        if (covered(cx, cy, existing)) continue;
        if (rect.w < 2 || rect.h < 2) continue;
        const id = "n" + col + "-" + row;
        const parcel = makeParcel(id, regionName(clon, clat) + " " + col + "-" + row, clon, clat, rect, "field");
        kept.push(parcel);
        existing.push(rect);
      }
    }

    const anchors = (Zox.CORRIDOR && Zox.CORRIDOR.anchors) || [];
    const used = {};
    const spine = [];
    for (let a = 0; a < anchors.length; a++) {
      const anchor = anchors[a];
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < kept.length; i++) {
        const p = kept[i];
        if (used[p.id]) continue;
        const dx = p.x - anchor.x;
        const dy = p.y - anchor.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) continue;
      used[best.id] = true;
      best.id = anchor.id;
      best.name = anchor.name;
      best.mapLabel = anchor.mapLabel;
      best.lx = anchor.lx;
      best.ly = anchor.ly;
      best.labelAnchor = anchor.anchor;
      best.vdx = anchor.vdx;
      best.vdy = anchor.vdy;
      best.order = anchor.order;
      best.railX = anchor.x;
      best.railY = anchor.y;
      best.spine = true;
      best.snap = Math.round(Math.sqrt(bestD) * 10) / 10;
      spine.push(best);
    }
    spine.sort(function (a, b) {
      return a.order - b.order;
    });

    const byId = {};
    for (let i = 0; i < kept.length; i++) {
      const p = kept[i];
      p.seller = sellerFor(p.id);
      byId[p.id] = p;
    }

    Zox.CORRIDOR.parcels = kept;
    Zox.CORRIDOR.spine = spine;
    Zox.CORRIDOR.byId = byId;
    void n;
  }

  function deedOwner(parcel, farm) {
    if (farm) return (Zox.PLAYER && Zox.PLAYER.name) || "Jake Westbrook";
    if (parcel && parcel.seller) return parcel.seller;
    return "A local farmer";
  }

  if (Zox.CORRIDOR) build();

  Zox.Parcels = {
    build: build,
    deedOwner: deedOwner,
    inWater: inWater,
    inCity: inCity,
  };
})(typeof window !== "undefined" ? window : globalThis);
