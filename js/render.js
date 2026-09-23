/**
 * Board rendering: aerial corridor (world) + isometric farm zoom.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const TW = 54;
  const TH = 27;
  const HEAD = 58;

  function pos(r, c, size, tw, th, head) {
    const tileW = tw || TW;
    const tileH = th || TH;
    const top = head == null ? HEAD : head;
    const x = (c - r) * (tileW / 2);
    const y = (c + r) * (tileH / 2);
    const originX = ((size - 1) * tileW) / 2;
    return { x: originX + x, y: top + y, z: r + c };
  }

  function boardTiles(ui) {
    return Zox.Sim.tilesForView(ui.state, ui.view === "farm" ? ui.farmId : null);
  }

  function boardKey(tiles, ui) {
    if (ui && ui.view === "world") {
      let key = "corridor:";
      const rail = Zox.Sim.railProgress(ui.state);
      key += rail.lit + ":" + rail.ownedCount + ":" + rail.matureCount + ":";
      const farms = ui.state.farms || [];
      for (let i = 0; i < farms.length; i++) {
        const w = farms[i].villageWorks;
        key += farms[i].parcelId + "A" + (farms[i].regenAge || 0);
        if (w) key += w.stage + (w.sold ? "S" : "");
        key += ";";
      }
      const deeds = (ui && ui.deeds) || [];
      for (let d = 0; d < deeds.length; d++) key += deeds[d].id + deeds[d].col + ";";
      if (ui.ownedFocus) key += "O" + ui.ownedFocus;
      if (ui.grazing) key += "G1";
      key += "V" + Zox.Sim.countVillages(ui.state);
      key += "T" + (ui.tool || "");
      key += "B" + (ui.state.builtRail == null ? "-" : ui.state.builtRail);
      if (ui.state.autopilot && ui.state.autopilot.focusId) key += "F" + ui.state.autopilot.focusId;
      if (ui.state.futureStopIds) key += "P" + ui.state.futureStopIds.length;
      return key;
    }
    let key = (ui && ui.view ? ui.view : "world") + ":" + (ui && ui.farmId ? ui.farmId : "") + ":" + tiles.length;
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        const t = tiles[r][c];
        key += (t.terrain[0] || "?") + (t.building ? t.building[0] : ".") + (t.landmark ? t.landmark[0] : "");
      }
    }
    if (ui && ui.view === "farm") {
      const farm = Zox.Sim.getFarm(ui.state, ui.farmId);
      if (farm) key += "A" + farm.regenAge;
    }
    return key;
  }

  function shade(r, c) {
    return (r * 7 + c * 13) % 5;
  }

  function tileFlags(ui, tile) {
    const board = boardTiles(ui);
    const parts = ["iso-tile", "is-" + tile.terrain];
    if (tile.building) parts.push("has-" + tile.building);
    if (tile.landmark === "barn") parts.push("has-barn");
    if (ui.view === "farm" && !tile.building && tile.terrain === "meadow") {
      parts.push("is-field");
      const farm = Zox.Sim.getFarm(ui.state, ui.farmId);
      if (farm) {
        if (Zox.Sim.farmMature(farm)) {
          parts.push("is-regen-field");
          parts.push("show-manure");
        } else {
          parts.push("is-converting-field");
          const age = farm.regenAge || 0;
          if (age <= 1) parts.push("is-young-convert");
          else if (age >= 4) parts.push("is-almost-regen");
          if (age >= 2) parts.push("show-manure");
        }
      }
    }
    if (tile.building === "village") parts.push("has-village");
    if (ui.hover && ui.hover.r === tile.r && ui.hover.c === tile.c) parts.push("is-hover");
    if (ui.selected && ui.selected.r === tile.r && ui.selected.c === tile.c) parts.push("is-picked");
    if (ui.tool === "compost" || tile.building === "compost") {
      const hubs = tile.building === "compost" ? [tile] : Zox.Map.tilesOf(board, "compost");
      const ghost = ui.tool === "compost" && ui.hover ? [ui.hover] : [];
      const near = hubs.concat(ghost).some((h) => Zox.Map.chebyshev(tile.r, tile.c, h.r, h.c) <= 2);
      if (near) parts.push("in-loop");
    }
    if (ui.hover && ui.hover.r === tile.r && ui.hover.c === tile.c) {
      if (ui.tool !== "inspect" && ui.tool !== "bulldoze") {
        const farmId = ui.view === "farm" ? ui.farmId : null;
        const check = Zox.Sim.canPlace(ui.state, tile.r, tile.c, ui.tool, farmId);
        parts.push(check.ok ? "can-drop" : "no-drop");
      }
    }
    if (tile.terrain === "water") parts.push("is-water");
    parts.push("shade-" + shade(tile.r, tile.c));
    return parts.join(" ");
  }

  function bankBits(tiles, r, c) {
    if (tiles[r][c].terrain !== "water") return "";
    const bits = [];
    const n = Zox.Map.getTile(tiles, r - 1, c);
    const s = Zox.Map.getTile(tiles, r + 1, c);
    const w = Zox.Map.getTile(tiles, r, c - 1);
    const e = Zox.Map.getTile(tiles, r, c + 1);
    if (n && n.terrain !== "water") bits.push("bank-n");
    if (s && s.terrain !== "water") bits.push("bank-s");
    if (w && w.terrain !== "water") bits.push("bank-w");
    if (e && e.terrain !== "water") bits.push("bank-e");
    return bits.join(" ");
  }

  function groveTrees(seed) {
    const a = 10 + (seed % 5);
    const b = 22 + ((seed * 3) % 6);
    return (
      `<svg class="piece grove-trees" viewBox="0 0 48 56" aria-hidden="true">` +
      `<ellipse cx="24" cy="52" rx="14" ry="4" fill="rgba(40,30,10,.28)"/>` +
      `<rect x="21" y="34" width="4" height="16" rx="1" fill="#5a3d24"/>` +
      `<ellipse cx="18" cy="28" rx="10" ry="12" fill="#2f6a32"/>` +
      `<ellipse cx="30" cy="26" rx="11" ry="13" fill="#3d7a38"/>` +
      `<ellipse cx="24" cy="20" rx="9" ry="10" fill="#4d8c42"/>` +
      `<ellipse cx="${a}" cy="36" rx="7" ry="8" fill="#2a5c2c"/>` +
      `<rect x="${a - 1}" y="40" width="3" height="10" fill="#4a341c"/>` +
      `<ellipse cx="${b + 8}" cy="38" rx="6" ry="7" fill="#356834"/>` +
      `</svg>`
    );
  }

  function pieceSVG(id, seed) {
    if (id === "home") {
      return (
        `<svg class="piece piece-home" viewBox="0 0 48 56" aria-hidden="true">` +
        `<ellipse cx="24" cy="50" rx="13" ry="3.5" fill="rgba(40,30,10,.25)"/>` +
        `<path d="M10 28 L24 34 L24 48 L10 42 Z" fill="#d7c49a"/>` +
        `<path d="M24 34 L38 28 L38 42 L24 48 Z" fill="#efe3b8"/>` +
        `<path d="M10 28 L24 18 L38 28 L24 34 Z" fill="#3f6d32"/>` +
        `<path d="M24 18 L38 28 L24 34 Z" fill="#4f8640"/>` +
        `<path d="M16 38 L21 40 L21 46 L16 44 Z" fill="#6b4a28"/>` +
        `<path d="M28 36 L33 34 L33 40 L28 42 Z" fill="#7ec8d4"/>` +
        `</svg>`
      );
    }
    if (id === "farm") {
      return (
        `<svg class="piece piece-farm" viewBox="0 0 48 52" aria-hidden="true">` +
        `<ellipse cx="24" cy="48" rx="14" ry="3.2" fill="rgba(40,30,10,.2)"/>` +
        `<path d="M8 30 L18 34 L18 44 L8 40 Z" fill="#c9a24a"/>` +
        `<path d="M18 34 L28 30 L28 40 L18 44 Z" fill="#e0bc62"/>` +
        `<path d="M8 30 L18 24 L28 30 L18 34 Z" fill="#8a3d2a"/>` +
        `<path class="farm-crop" d="M30 32 q2-10 4-10 q2 0 3 10" fill="#5d8a38"/>` +
        `<path class="farm-crop" d="M36 34 q2-9 4-9 q2 0 2 9" fill="#6d9a40"/>` +
        `<path class="farm-crop" d="M12 36 q2-8 3-8 q2 0 3 8" fill="#4f7a30"/>` +
        `</svg>`
      );
    }
    if (id === "solar") {
      return (
        `<svg class="piece piece-solar" viewBox="0 0 48 58" aria-hidden="true">` +
        `<ellipse cx="24" cy="52" rx="13" ry="3" fill="rgba(40,30,10,.22)"/>` +
        `<path d="M8 36 L22 30 L26 36 L12 42 Z" fill="#2c4d72"/>` +
        `<path d="M10 34 L22 29 L24 33 L12 38 Z" fill="#5aa0c8"/>` +
        `<path d="M20 40 L34 34 L38 40 L24 46 Z" fill="#243e5c"/>` +
        `<path d="M22 38 L34 33 L36 37 L24 42 Z" fill="#6bb3d4"/>` +
        `<rect x="31" y="14" width="2.2" height="28" fill="#6d6a62"/>` +
        `<path d="M32 16 l10 3 -10 2 -10-2 z" fill="#d8d2c4"/>` +
        `<circle cx="32" cy="16" r="2" fill="#c4a35a"/>` +
        `</svg>`
      );
    }
    if (id === "compost") {
      return (
        `<svg class="piece piece-compost" viewBox="0 0 48 46" aria-hidden="true">` +
        `<ellipse cx="24" cy="42" rx="14" ry="3.2" fill="rgba(40,30,10,.22)"/>` +
        `<ellipse cx="24" cy="36" rx="14" ry="7" fill="#6b4a28"/>` +
        `<ellipse cx="22" cy="32" rx="11" ry="6" fill="#8b6234"/>` +
        `<ellipse cx="25" cy="28" rx="8" ry="5" fill="#4a6b32"/>` +
        `<path d="M20 22 q2-8 4-2" stroke="#c9c2a8" fill="none" stroke-width="1.2"/>` +
        `<path d="M26 20 q2-7 4-1" stroke="#d5d0bc" fill="none" stroke-width="1"/>` +
        `</svg>`
      );
    }
    if (id === "rail") {
      return (
        `<svg class="piece piece-rail" viewBox="0 0 48 40" aria-hidden="true">` +
        `<path d="M6 28 L24 18 L42 28 L24 36 Z" fill="#6d6a5a"/>` +
        `<path d="M10 27 L24 20 L38 27" stroke="#c4b48a" stroke-width="1.4" fill="none"/>` +
        `<path d="M12 30 L24 24 L36 30" stroke="#c4b48a" stroke-width="1.4" fill="none"/>` +
        `<path d="M14 26 L16 31 M20 23 L22 29 M28 23 L26 29 M34 26 L32 31" stroke="#5a4030" stroke-width="1.3"/>` +
        `<path d="M8 26 L24 17 L40 26" stroke="#3d4a38" stroke-width="1.6" fill="none"/>` +
        `</svg>`
      );
    }
    
    if (id === "village") {
      return (
        `<svg class="piece piece-village" viewBox="0 0 48 56" aria-hidden="true">` +
        `<ellipse cx="24" cy="52" rx="14" ry="3" fill="rgba(40,30,10,.22)"/>` +
        `<path d="M8 34 L18 38 L18 48 L8 44 Z" fill="#d4b896"/>` +
        `<path d="M18 38 L28 34 L28 44 L18 48 Z" fill="#e8d2a8"/>` +
        `<path d="M8 34 L18 26 L28 34 L18 38 Z" fill="#3f7a48"/>` +
        `<path d="M22 30 L34 24 L42 30 L30 36 Z" fill="#c9a878"/>` +
        `<path d="M22 30 L34 18 L42 30 L30 36 Z" fill="#5a9a50"/>` +
        `<circle class="village-glow" cx="24" cy="22" r="6" fill="#c9e86a" opacity="0.55"/>` +
        `<path d="M14 42 q2-8 4-2" stroke="#f4ead3" fill="none" stroke-width="1"/>` +
        `</svg>`
      );
    }

    if (id === "park") {
      return (
        `<svg class="piece piece-park" viewBox="0 0 48 52" aria-hidden="true">` +
        `<ellipse cx="24" cy="48" rx="14" ry="3" fill="rgba(40,30,10,.2)"/>` +
        `<rect x="14" y="32" width="3" height="12" fill="#6a4528"/>` +
        `<rect x="28" y="34" width="3" height="10" fill="#6a4528"/>` +
        `<ellipse cx="15" cy="28" rx="8" ry="9" fill="#4f8a3c"/>` +
        `<ellipse cx="30" cy="30" rx="7" ry="8" fill="#5c9a44"/>` +
        `<circle cx="12" cy="26" r="2" fill="#d67a8a"/>` +
        `<circle cx="18" cy="24" r="1.8" fill="#e08a6a"/>` +
        `<circle cx="28" cy="28" r="1.7" fill="#e0c45a"/>` +
        `<circle cx="33" cy="26" r="1.6" fill="#d67a8a"/>` +
        `</svg>`
      );
    }
    return groveTrees(seed);
  }

  function grazeAnimal(seed) {
    const kind = seed % 3;
    if (kind === 0) {
      return (
        `<svg class="piece piece-graze" viewBox="0 0 64 56" aria-hidden="true">` +
        `<ellipse cx="28" cy="34" rx="18" ry="12" fill="#f0d090" stroke="#5a4018" stroke-width="1.2"/>` +
        `<circle cx="46" cy="24" r="10" fill="#e8c070" stroke="#5a4018" stroke-width="1.2"/>` +
        `<circle cx="50" cy="21" r="2" fill="#1a1208"/>` +
        `<path d="M14 40 v12 M24 42 v11 M34 42 v11 M42 40 v12" stroke="#5a4018" stroke-width="3.5" stroke-linecap="round"/>` +
        `<ellipse cx="18" cy="50" rx="5" ry="2.5" fill="#4a2a10"/>` +
        `<ellipse cx="36" cy="50" rx="4.5" ry="2.2" fill="#4a2a10"/>` +
        `</svg>`
      );
    }
    if (kind === 1) {
      return (
        `<svg class="piece piece-graze" viewBox="0 0 64 56" aria-hidden="true">` +
        `<ellipse cx="28" cy="36" rx="16" ry="11" fill="#fff8ee" stroke="#6a5a40" stroke-width="1.2"/>` +
        `<circle cx="44" cy="28" r="9" fill="#ffffff" stroke="#6a5a40" stroke-width="1.2"/>` +
        `<circle cx="47" cy="25" r="1.8" fill="#1a1208"/>` +
        `<path d="M16 42 v10 M24 44 v9 M32 44 v9 M40 42 v10" stroke="#8a7a60" stroke-width="3.2" stroke-linecap="round"/>` +
        `<ellipse cx="20" cy="50" rx="4.5" ry="2.2" fill="#4a2a10"/>` +
        `</svg>`
      );
    }
    return (
      `<svg class="piece piece-graze" viewBox="0 0 64 56" aria-hidden="true">` +
      `<ellipse cx="30" cy="34" rx="17" ry="11" fill="#5a4030" stroke="#2a1810" stroke-width="1.2"/>` +
      `<circle cx="46" cy="24" r="9.5" fill="#4a3020" stroke="#2a1810" stroke-width="1.2"/>` +
      `<circle cx="49" cy="21" r="1.9" fill="#f0e8d0"/>` +
      `<path d="M16 40 v12 M25 42 v11 M35 42 v11 M43 40 v12" stroke="#2a1810" stroke-width="3.5" stroke-linecap="round"/>` +
      `<ellipse cx="22" cy="50" rx="5" ry="2.4" fill="#3a2010"/>` +
      `</svg>`
    );
  }

  function regenMeter(tile, ui) {
    if (tile.building !== "farm") return "";
    const farm = ui ? Zox.Sim.getFarm(ui.state, tile.farmId) : tile;
    if (!farm) return "";
    const prog = Zox.Sim.farmProgress(farm);
    if (prog.mature) {
      return `<span class="regen-badge" aria-hidden="true">regen</span>`;
    }
    const c = 87.96;
    const offset = (c * (100 - prog.pct)) / 100;
    return (
      `<span class="regen-hud" aria-hidden="true">` +
      `<svg class="regen-ring" viewBox="0 0 36 36">` +
      `<circle class="track" cx="18" cy="18" r="14"></circle>` +
      `<circle class="prog" cx="18" cy="18" r="14" stroke-dasharray="${c}" stroke-dashoffset="${offset}"></circle>` +
      `</svg>` +
      `<b>${prog.year}/${prog.need}</b>` +
      `</span>`
    );
  }

  function capDecor(tile, farmView) {
    if (tile.building === "farm" || (farmView && tile.terrain === "meadow" && !tile.building)) {
      return `<span class="furrows" aria-hidden="true"></span><span class="manure-dots" aria-hidden="true"></span>`;
    }
    if (tile.terrain === "meadow" && !tile.building) {
      return `<span class="tufts" aria-hidden="true"></span>`;
    }
    if (tile.terrain === "water") return `<span class="ripples" aria-hidden="true"></span>`;
    return "";
  }

  function tileHTML(tiles, tile, ui, tw, th, head) {
    const size = tiles.length;
    const p = pos(tile.r, tile.c, size, tw, th, head);
    const farmView = ui.view === "farm";
    let label = tile.building ? Zox.BUILDINGS[tile.building].name : Zox.Map.describeTerrain(tile.terrain);
    if (tile.landmark === "barn") label = "Farmhouse";
    const banks = bankBits(tiles, tile.r, tile.c);
    const seed = tile.r * 12 + tile.c;
    let volume = "";
    if (tile.building) volume = pieceSVG(tile.building, seed);
    else if (tile.landmark === "barn") volume = pieceSVG("farm", seed);
    else if (tile.terrain === "grove") volume = groveTrees(seed);

    // Animals graze field tiles on the farm board (crop rent / manure cycle)
    let graze = "";
    const herdSlot = seed % 4 === 0 || (ui.grazing && seed % 2 === 0);
    const showGraze =
      farmView &&
      herdSlot &&
      !tile.building &&
      tile.landmark !== "barn" &&
      tile.terrain === "meadow" &&
      ui.state &&
      ui.state.farms &&
      ui.state.farms.length > 0;
    if (showGraze) {
      graze = grazeAnimal(seed + (tile.r * 3 + tile.c));
    }

    return (
      `<button type="button" class="${tileFlags(ui, tile)} ${banks}${graze ? " is-grazing" : ""}" data-r="${tile.r}" data-c="${tile.c}" ` +
      `style="--x:${p.x}px;--y:${p.y}px;--z:${p.z}" aria-label="${label} at ${tile.r + 1}, ${tile.c + 1}">` +
      `<span class="iso-shadow"></span>` +
      `<span class="iso-stack">` +
      `<span class="iso-ring"></span>` +
      `<span class="iso-left"></span>` +
      `<span class="iso-right"></span>` +
      `<span class="iso-cap">${capDecor(tile, farmView)}</span>` +
      volume +
      (tile.building === "village" ? `<span class="village-halo" aria-hidden="true"></span>` : "") +
      graze +
      regenMeter(tile, ui) +
      `</span>` +
      `</button>`
    );
  }

  function stageSize(size, tw, th, head) {
    const tileW = tw || TW;
    const tileH = th || TH;
    const top = head == null ? HEAD : head;
    return {
      w: size * tileW,
      h: top + size * tileH + 22,
    };
  }

  function farmHTML(tiles, ui) {
    const size = tiles.length;
    const tw = 70;
    const th = 35;
    const head = 44;
    const dim = stageSize(size, tw, th, head);
    const cells = [];
    const order = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) order.push(tiles[r][c]);
    }
    order.sort((a, b) => a.r + a.c - (b.r + b.c) || a.r - b.r);
    for (const tile of order) cells.push(tileHTML(tiles, tile, ui, tw, th, head));

    const farm = Zox.Sim.getFarm(ui.state, ui.farmId);
    let bannerText = "Grazing herd on this farm — Next Season rents the crop to the animals";
    if (farm) {
      const books = Zox.Sim.farmBooks(farm);
      const prog = Zox.Sim.farmProgress(farm);
      if (prog.mature) {
        bannerText = "Mature regen · chem $0 · graze the residue · manure stays · nutrition 6×";
      } else if (prog.year >= 5) {
        bannerText =
          "Year 5 of 5 · chem " +
          (Zox.dollars ? Zox.dollars(-books.inputs) : "−$" + books.inputs) +
          " · next season graduates to $0 chem, 6× nutrition, and can light the rail";
      } else {
        bannerText =
          "Converting year " +
          prog.year +
          " of 5 · chem " +
          (Zox.dollars ? Zox.dollars(-books.inputs) : "−$" + books.inputs) +
          " · net " +
          (Zox.dollars ? Zox.dollars(books.net) : "$" + books.net) +
          "/acre · manure is starting to stay";
      }
    }
    if (ui.grazing) bannerText = "Animals grazing the residue · manure stays · " + bannerText;
    const banner = `<div class="graze-banner${ui.grazing ? "" : " is-idle"}" aria-live="polite"><b>${bannerText}</b></div>`;

    return (
      `<div class="farm-wrap">` +
      banner +
      `<div class="iso-stage" style="width:${dim.w}px;height:${dim.h}px;--tw:${tw}px;--th:${th}px;--cols:${size};--head:${head}px">` +
      `<div class="iso-earth" aria-hidden="true"></div>` +
      cells.join("") +
      `</div>` +
      `</div>`
    );
  }

  function pathD(points) {
    if (!points.length) return "";
    let d = "M " + points[0].x + " " + points[0].y;
    for (let i = 1; i < points.length; i++) {
      d += " L " + points[i].x + " " + points[i].y;
    }
    return d;
  }

  function hashStr(s) {
    let h = 2166136261;
    const text = String(s || "");
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function villagePinInner(stage, sold) {
    if (stage === "site") {
      return (
        `<rect x="-8" y="1" width="16" height="5" rx="0.6" fill="#8a6232" stroke="#3a2410" stroke-width="0.6"/>` +
        `<path d="M-6 1 V-5 M-2 1 V-7 M2 1 V-6 M6 1 V-4" stroke="#f4ead3" stroke-width="0.9" stroke-linecap="round"/>` +
        `<text x="0" y="12" text-anchor="middle" font-size="5.2" font-weight="700" fill="#f6f1e4">site</text>`
      );
    }
    if (stage === "framing") {
      return (
        `<path d="M-8 5 V-1 L0 -8 L8 -1 V5" fill="none" stroke="#f6e7c2" stroke-width="1.1"/>` +
        `<path d="M-8 -1 L0 -8 L8 -1" fill="none" stroke="#6b4420" stroke-width="1.15"/>` +
        `<path d="M0 -8 V5 M-8 2 H8" stroke="#f6e7c2" stroke-width="0.8"/>` +
        `<text x="0" y="12" text-anchor="middle" font-size="5" font-weight="700" fill="#f6f1e4">frame</text>`
      );
    }
    return (
      `<path d="M-8 2 L0 -6 L8 2 V8 H-8 Z" fill="#e7f6c4" stroke="#1d4a22" stroke-width="0.7"/>` +
      `<path d="M-8 2 L0 -6 L8 2" fill="#3f8a3a"/>` +
      `<rect x="-2.2" y="3.2" width="4.4" height="4.8" fill="#6b4420"/>` +
      (sold
        ? `<text x="0" y="14" text-anchor="middle" font-size="5" font-weight="700" fill="#f6e7c2">sold</text>`
        : `<text x="0" y="14" text-anchor="middle" font-size="5" font-weight="700" fill="#e7f6c4">open</text>`)
    );
  }

  function villageStageSVG(stage, sold) {
    const sky = stage === "open" ? "#c9dff0" : stage === "framing" ? "#e7d7b4" : "#d7c4a2";
    const ground = stage === "open" ? "#6b8a49" : "#8a7048";
    let body;
    if (!stage) {
      body =
        `<rect x="8" y="28" width="72" height="10" fill="#c4b48a"/>` +
        `<path d="M14 28 V18 M28 28 V16 M44 28 V20 M60 28 V17" stroke="#8a6232" stroke-width="2"/>`;
    } else if (stage === "site") {
      body =
        `<rect x="10" y="30" width="68" height="8" fill="#6b4a28"/>` +
        `<path d="M18 30 V14 M32 30 V10 M48 30 V16 M64 30 V12" stroke="#f4ead3" stroke-width="2.2" stroke-linecap="round"/>` +
        `<rect x="22" y="22" width="18" height="8" fill="#a67c45" stroke="#3a2410"/>`;
    } else if (stage === "framing") {
      body =
        `<path d="M12 32 V16 L44 6 L76 16 V32" fill="none" stroke="#5a3a18" stroke-width="2.4"/>` +
        `<path d="M12 16 L44 6 L76 16" fill="none" stroke="#8a3d2a" stroke-width="2"/>` +
        `<path d="M44 6 V32 M12 24 H76 M28 16 V32 M60 16 V32" stroke="#c4a15a" stroke-width="1.4"/>`;
    } else {
      body =
        `<path d="M10 32 V18 L44 6 L78 18 V32 Z" fill="#f4ead3" stroke="#1d4a22" stroke-width="1.4"/>` +
        `<path d="M10 18 L44 6 L78 18" fill="#3f8a3a" stroke="#1d4a22"/>` +
        `<rect x="38" y="22" width="12" height="10" fill="#6b4420"/>` +
        `<rect x="20" y="20" width="8" height="7" fill="#7ec8d4"/>` +
        `<rect x="60" y="20" width="8" height="7" fill="#7ec8d4"/>` +
        (sold ? `<text x="44" y="46" text-anchor="middle" font-size="9" font-weight="700" fill="#3a2410">SOLD</text>` : `<circle cx="70" cy="12" r="4" fill="#f2d31b"/>`);
    }
    return (
      `<svg class="v-stage" viewBox="0 0 88 48" aria-hidden="true">` +
      `<rect width="88" height="48" fill="${sky}"/>` +
      `<rect y="32" width="88" height="16" fill="${ground}"/>` +
      body +
      `</svg>`
    );
  }

  function fieldColor(stageKey) {
    if (stageKey === "regen") return "#3e7a34";
    if (stageKey === "y5") return "#5c8a3c";
    if (stageKey === "y4") return "#6e9440";
    if (stageKey === "y3") return "#8ea24a";
    if (stageKey === "y2") return "#b59a48";
    if (stageKey === "y1") return "#a67c45";
    return "#c6b07a";
  }

  function farmPortrait(spec) {
    const region = (Zox.regionLook && Zox.regionLook(spec.name)) || { id: "Erie", sky: "#f8c48a", hill: "#6b8440", barn: "#e07a1f" };
    const h = hashStr((spec.id || "") + "|" + (spec.owner || "") + "|" + region.id);
    const stageKey = spec.stage || "wild";
    const field = fieldColor(stageKey);
    const year = stageKey === "regen" ? 6 : stageKey === "wild" ? 0 : Number(String(stageKey).replace("y", "")) || 0;
    const barnX = 28 + (h % 48);
    const treeN = 2 + (h % 4);
    const sunX = 40 + ((h >> 4) % 200);
    let trees = "";
    for (let i = 0; i < treeN; i++) {
      const tx = 16 + ((h >> (i + 2)) % 280);
      const th = 16 + ((h >> (i + 5)) % 14);
      const leaf = year >= 4 ? "#2f6a32" : year >= 2 ? "#4f7a38" : "#5a6a32";
      trees += `<rect x="${tx}" y="${92 - th}" width="4" height="${th}" fill="#6b4420"/>`;
      trees += `<circle cx="${tx + 2}" cy="${90 - th}" r="${7 + (i % 3)}" fill="${leaf}"/>`;
    }
    let rows = "";
    const furrow = year <= 1 ? "#6b4a28" : year <= 3 ? "#5a6a30" : "#2f5a28";
    if (year < 6) {
      for (let i = 0; i < 7; i++) {
        rows += `<path d="M0 ${118 + i * 7} H320" stroke="${furrow}" stroke-width="${year <= 1 ? 2 : 1}" opacity="${year >= 5 ? 0.25 : 0.55}"/>`;
      }
    }
    let animals = "";
    if (year >= 4) {
      const ax = 180 + (h % 60);
      animals += `<ellipse cx="${ax}" cy="132" rx="16" ry="8" fill="#c4a06a"/>`;
      animals += `<circle cx="${ax + 14}" cy="126" r="5" fill="#b89058"/>`;
      if (year >= 6) {
        animals += `<ellipse cx="${ax - 28}" cy="138" rx="12" ry="6" fill="#e8e0d0"/>`;
        animals += `<circle cx="${ax + 8}" cy="146" r="2.2" fill="#4a2a14"/>`;
        animals += `<circle cx="${ax + 18}" cy="144" r="1.6" fill="#4a2a14"/>`;
      }
    }
    const rail = spec.spine
      ? `<path d="M0 104 H320" stroke="#d7e6c8" stroke-width="2" stroke-dasharray="6 4"/><path d="M0 108 H320" stroke="#6b8a49" stroke-width="1" stroke-dasharray="6 4"/>`
      : "";
    const shoots = year >= 2 && year < 6 ? `<path d="M40 128 q6-16 12 0 M70 136 q5-14 10 0 M210 130 q6-18 12 0 M250 140 q5-12 11 0" fill="none" stroke="#2f6a32" stroke-width="1.6"/>` : "";
    const label = spec.name || "Farm";
    return (
      `<svg class="farm-portrait" viewBox="0 0 320 180" role="img" aria-label="${label}">` +
      `<rect width="320" height="180" fill="${region.sky}"/>` +
      `<circle cx="${sunX}" cy="32" r="14" fill="#fff4c8"/>` +
      `<path d="M0 86 Q70 62 150 80 T320 70 V112 H0 Z" fill="${region.hill}"/>` +
      trees +
      rail +
      `<rect y="108" width="320" height="72" fill="${field}"/>` +
      rows +
      shoots +
      `<rect x="${barnX}" y="96" width="46" height="36" fill="${region.barn}" stroke="#2a1c10" stroke-width="1.2"/>` +
      `<path d="M${barnX - 4} 96 L${barnX + 23} 76 L${barnX + 50} 96" fill="#8a3d2a" stroke="#2a1c10"/>` +
      `<rect x="${barnX + 18}" y="112" width="12" height="20" fill="#3a2410"/>` +
      `<rect x="${barnX + 6}" y="104" width="8" height="7" fill="#f4ead3"/>` +
      animals +
      `<rect y="164" width="320" height="16" fill="rgba(20,16,8,0.18)"/>` +
      `</svg>`
    );
  }

  function corridorHTML(ui) {
    const C = Zox.CORRIDOR;
    const rail = Zox.Sim.railProgress(ui.state);
    const cost = Zox.BUILDINGS.farm.cost;
    const pathPts = C.railPath;
    const fullPath = pathD(pathPts);

    /* Autopilot draws only the segments it has built. Manual play still lights mature spine farms. */
    const guided = ui.state.builtRail != null;
    const litPaths = [];
    if (guided) {
      const n = ui.state.builtRail || 0;
      for (let i = 0; i < n && i < pathPts.length - 1; i++) {
        litPaths.push(
          "M " + pathPts[i].x + " " + pathPts[i].y + " L " + pathPts[i + 1].x + " " + pathPts[i + 1].y
        );
      }
    } else {
      for (let i = 0; i < rail.segments.length; i++) {
        if (!rail.segments[i].lit) continue;
        const a = (C.spine || C.parcels || []).find((p) => p.id === rail.segments[i].from);
        const b = (C.spine || C.parcels || []).find((p) => p.id === rail.segments[i].to);
        if (a && b) {
          const ax = a.railX != null ? a.railX : a.x;
          const ay = a.railY != null ? a.railY : a.y;
          const bx = b.railX != null ? b.railX : b.x;
          const by = b.railY != null ? b.railY : b.y;
          litPaths.push("M " + ax + " " + ay + " L " + bx + " " + by);
        }
      }
    }

    const vw = (C.view && C.view.w) || 960;
    const vh = (C.view && C.view.h) || 440;

    const places = (C.places || [])
      .map(
        (p) =>
          `<text class="map-label place-label place-${p.kind || "minor"}" x="${p.x}" y="${p.y}" text-anchor="${p.anchor || "middle"}">${p.text}</text>`
      )
      .join("");

    const cities = C.cities
      .map(
        (city) =>
          `<g class="corridor-city">` +
          `<circle cx="${city.x}" cy="${city.y}" r="4.2" fill="#fff" stroke="#222" stroke-width="1.1"/>` +
          `<circle cx="${city.x}" cy="${city.y}" r="1.7" fill="#222"/>` +
          `<text class="map-label city-label" x="${city.lx}" y="${city.ly}" text-anchor="${city.anchor || "middle"}">${city.name}</text>` +
          `</g>`
      )
      .join("");

    const futureStops = {};
    const stopIds = ui.state.futureStopIds || [];
    for (let s = 0; s < stopIds.length; s++) futureStops[stopIds[s]] = true;
    const focusId = ui.state.autopilot && ui.state.autopilot.focusId;

    const held = {};
    const staged = {};
    const deeds = ui.deeds || [];
    for (let d = 0; d < deeds.length; d++) {
      if (deeds[d].col === "buy") staged[deeds[d].id] = true;
      else held[deeds[d].id] = true;
    }

    const parcelList = C.parcels || [];
    const lotParts = [];
    const labelParts = [];
    const pinParts = [];
    for (let i = 0; i < parcelList.length; i++) {
      const parcel = parcelList[i];
      const farm = Zox.Sim.getFarmByParcel(ui.state, parcel.id);
      const owned = !!farm;
      const mature = owned && Zox.Sim.farmMature(farm);
      const hasVillage = owned && farm.tiles && Zox.Map.tilesOf(farm.tiles, "village").length > 0;
      const works = hasVillage ? farm.villageWorks : null;
      const vStage = hasVillage ? (works && works.stage) || "site" : "";
      const vSold = !!(works && works.sold);
      const prog = owned ? Zox.Sim.farmProgress(farm) : null;
      const sel = ui.selected && ui.selected.parcelId === parcel.id;
      let cls = "corridor-parcel parcel-lot";
      if (owned) cls += mature ? " is-owned is-mature" : " is-owned is-y" + prog.year;
      else cls += " is-open";
      if (hasVillage) cls += " has-village is-v-" + vStage + (vSold ? " is-v-sold" : "");
      if (parcel.spine) cls += " is-spine";
      if (futureStops[parcel.id] && !hasVillage) cls += " is-future-stop";
      if (focusId && focusId === parcel.id) cls += " is-focus";
      if (sel) cls += " is-picked";
      if (!owned && held[parcel.id]) cls += " is-held";
      if (!owned && staged[parcel.id]) cls += " is-staged";
      const seller = Zox.Parcels && Zox.Parcels.deedOwner ? Zox.Parcels.deedOwner(parcel, farm) : "";
      const label = owned
        ? farm.name + (mature ? " · regenerative · " : " · converting " + prog.year + "/5 · ") + seller
        : parcel.name + " · " + (Zox.dollars ? Zox.dollars(cost) : "$" + cost) + " · " + (parcel.acres || 1) + " acre · " + seller;
      const rx = parcel.rx != null ? parcel.rx : parcel.x - 6;
      const ry = parcel.ry != null ? parcel.ry : parcel.y - 6;
      const rw = parcel.rw != null ? parcel.rw : 12;
      const rh = parcel.rh != null ? parcel.rh : 12;
      lotParts.push(
        `<rect class="${cls}" data-parcel="${parcel.id}" x="${rx}" y="${ry}" width="${rw}" height="${rh}" role="button" tabindex="-1" aria-label="${label}"><title>${label}</title></rect>`
      );
      if (parcel.spine && parcel.mapLabel) {
        labelParts.push(
          `<text class="map-label parcel-name" x="${parcel.lx}" y="${parcel.ly}" text-anchor="${parcel.labelAnchor || parcel.anchor || "middle"}">${parcel.mapLabel}</text>`
        );
      }
      if (futureStops[parcel.id]) {
        const rr = Math.max(rw, rh) * 0.72 + 2;
        pinParts.push(
          `<circle class="stop-ring${hasVillage ? " is-built" : ""}" cx="${parcel.x}" cy="${parcel.y}" r="${rr.toFixed(1)}"/>`
        );
      }
      if (hasVillage) {
        const vx = rx + rw * 0.5;
        const vy = ry + rh * 0.55;
        pinParts.push(
          `<g class="village-pin is-${vStage}${vSold ? " is-sold" : ""}" transform="translate(${vx} ${vy})" aria-hidden="true">` +
            villagePinInner(vStage, vSold) +
            `</g>`
        );
      }
    }
    const parcels = lotParts.join("");
    const parcelLabels = labelParts.join("");
    const parcelPins = pinParts.join("");

    const seasonCap = (ui.state && ui.state.horizonSeasons) || Zox.GOAL.seasons;
    const decade = Zox.Sim.decadeInfo(Math.min(ui.state.season, seasonCap), ui.state);
    const villageBit = rail.villages
      ? " · " + rail.villages + " village" + (rail.villages === 1 ? "" : "s")
      : "";
    const builtN = guided ? ui.state.builtRail || 0 : 0;
    const builtNeed = Math.max(1, pathPts.length - 1);
    const meterPct = guided ? Math.round((builtN / builtNeed) * 100) : rail.pct;
    const meterLabel = guided
      ? builtN >= builtNeed
        ? "Rail built Detroit to Jersey City · " + decade.short
        : decade.short + " · rail laid " + builtN + "/" + builtNeed + villageBit
      : rail.ready
        ? "Rail lit Detroit to Jersey City · " + decade.short
        : decade.short + " · " + rail.lit + "/" + rail.need + " lit · " + rail.matureCount + " mature" + villageBit;
    const buying = ui.tool === "farm" && ui.state.money >= cost;
    const broke = ui.tool === "farm" && ui.state.money < cost;
    const mapCls = "corridor-map" + (buying ? " is-buying" : "") + (broke ? " is-broke" : "");

    return (
      `<div class="corridor-stage">` +
      `<div class="corridor-banner">` +
      `<strong>Detroit → Jersey City</strong>` +
      `<span>${meterLabel}</span>` +
      `<span class="lot-key"><i class="sw-own"></i> Converting</span>` +
      `<span class="lot-key"><i class="sw-regen"></i> Regenerative</span>` +
      `<div class="rail-meter" role="progressbar" aria-valuenow="${meterPct}" aria-valuemin="0" aria-valuemax="100" aria-label="${meterLabel}">` +
      `<i style="width:${meterPct}%"></i>` +
      `</div>` +
      `</div>` +
      `<svg class="${mapCls}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" aria-label="Detroit to Jersey City corridor" xmlns:xlink="http://www.w3.org/1999/xlink">` +
      `<rect width="${vw}" height="${vh}" fill="#6d8244"/>` +
      `<image href="assets/corridor-basemap.svg" xlink:href="assets/corridor-basemap.svg" x="0" y="0" width="${vw}" height="${vh}" preserveAspectRatio="none"/>` +
      parcels +
      `<path class="rail-case" d="${fullPath}" fill="none"/>` +
      `<path class="rail-future" d="${fullPath}" fill="none"/>` +
      litPaths
        .map((d) => `<path class="${guided ? "rail-built" : "rail-lit"}" d="${d}" fill="none"/>`)
        .join("") +
      places +
      cities +
      parcelPins +
      parcelLabels +
      `</svg>` +
      `</div>`
    );
  }

  function worldHTML(tiles, ui) {
    if (ui.view === "world") return corridorHTML(ui);
    return farmHTML(tiles, ui);
  }

  function syncFlags(grid, ui) {
    if (ui.view === "world") {
      const map = grid.querySelector(".corridor-map");
      if (map) {
        const cost = Zox.BUILDINGS.farm.cost;
        map.classList.toggle("is-buying", ui.tool === "farm" && ui.state.money >= cost);
        map.classList.toggle("is-broke", ui.tool === "farm" && ui.state.money < cost);
      }
      const picked = ui.selected && ui.selected.parcelId;
      const prev = grid.querySelector(".corridor-parcel.is-picked");
      if (prev && prev.getAttribute("data-parcel") !== picked) prev.classList.remove("is-picked");
      if (picked) {
        const node = grid.querySelector('[data-parcel="' + picked + '"]');
        if (node) node.classList.add("is-picked");
      }
      return;
    }
    const board = boardTiles(ui);
    const buttons = grid.querySelectorAll("[data-r]");
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const r = Number(btn.dataset.r);
      const c = Number(btn.dataset.c);
      const tile = board[r][c];
      const banks = bankBits(board, r, c);
      btn.className = tileFlags(ui, tile) + (banks ? " " + banks : "");
    }
  }

  Zox.Render = {
    TW,
    TH,
    boardKey,
    tileFlags,
    worldHTML,
    corridorHTML,
    syncFlags,
    stageSize,
    farmPortrait,
    villageStageSVG,
  };
})(window);
