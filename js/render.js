/**
 * Isometric valley board. Visual only — no rules.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const TW = 54;
  const TH = 27;
  const HEAD = 58;

  function pos(r, c, size) {
    const x = (c - r) * (TW / 2);
    const y = (c + r) * (TH / 2);
    const originX = ((size - 1) * TW) / 2;
    return { x: originX + x, y: HEAD + y, z: r + c };
  }

  function boardKey(tiles) {
    let key = String(tiles.length);
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        const t = tiles[r][c];
        key += (t.terrain[0] || "?") + (t.building ? t.building[0] : ".");
        if (t.building === "farm") key += String(t.regenAge || 0);
      }
    }
    return key;
  }

  function shade(r, c) {
    return (r * 7 + c * 13) % 5;
  }

  function tileFlags(ui, tile) {
    const parts = ["iso-tile", "is-" + tile.terrain];
    if (tile.building) parts.push("has-" + tile.building);
    if (tile.building === "farm") parts.push(Zox.Sim.farmMature(tile) ? "is-mature" : "is-young");
    if (ui.hover && ui.hover.r === tile.r && ui.hover.c === tile.c) parts.push("is-hover");
    if (ui.selected && ui.selected.r === tile.r && ui.selected.c === tile.c) parts.push("is-picked");
    if (ui.tool === "compost" || tile.building === "compost") {
      const hubs = tile.building === "compost" ? [tile] : Zox.Map.tilesOf(ui.state.tiles, "compost");
      const ghost = ui.tool === "compost" && ui.hover ? [ui.hover] : [];
      const near = hubs.concat(ghost).some((h) => Zox.Map.chebyshev(tile.r, tile.c, h.r, h.c) <= 2);
      if (near) parts.push("in-loop");
    }
    if (ui.tool !== "inspect" && ui.tool !== "bulldoze" && ui.hover && ui.hover.r === tile.r && ui.hover.c === tile.c) {
      const check = Zox.Sim.canPlace(ui.state, tile.r, tile.c, ui.tool);
      parts.push(check.ok ? "can-drop" : "no-drop");
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
    if (id === "apartment") {
      return (
        `<svg class="piece piece-apt" viewBox="0 0 48 68" aria-hidden="true">` +
        `<ellipse cx="24" cy="62" rx="14" ry="3.4" fill="rgba(40,30,10,.25)"/>` +
        `<path d="M10 22 L24 28 L24 58 L10 52 Z" fill="#c4b48a"/>` +
        `<path d="M24 28 L38 22 L38 52 L24 58 Z" fill="#e4d4b0"/>` +
        `<path d="M10 22 L24 12 L38 22 L24 28 Z" fill="#3f6d32"/>` +
        `<path d="M24 12 L38 22 L24 28 Z" fill="#4f8640"/>` +
        `<path d="M16 14 L20 16 L20 20 L16 18 Z" fill="#6d9a40"/>` +
        `<path d="M14 34 L18 36 L18 40 L14 38 Z" fill="#7ec8d4"/>` +
        `<path d="M14 42 L18 44 L18 48 L14 46 Z" fill="#7ec8d4"/>` +
        `<path d="M28 32 L32 30 L32 34 L28 36 Z" fill="#6bb8c4"/>` +
        `<path d="M28 40 L32 38 L32 42 L28 44 Z" fill="#6bb8c4"/>` +
        `<text x="24" y="55" text-anchor="middle" fill="#3f5c34" font-size="6" font-weight="700">LIC</text>` +
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

  function regenMeter(tile) {
    if (tile.building !== "farm") return "";
    const prog = Zox.Sim.farmProgress(tile);
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

  function capDecor(tile) {
    if (tile.building === "farm") return `<span class="furrows" aria-hidden="true"></span>`;
    if (tile.terrain === "meadow" && !tile.building) {
      return `<span class="tufts" aria-hidden="true"></span>`;
    }
    if (tile.terrain === "water") return `<span class="ripples" aria-hidden="true"></span>`;
    return "";
  }

  function tileHTML(tiles, tile, ui) {
    const size = tiles.length;
    const p = pos(tile.r, tile.c, size);
    let label = tile.building ? Zox.BUILDINGS[tile.building].name : Zox.Map.describeTerrain(tile.terrain);
    if (tile.building === "farm") {
      label = Zox.Sim.farmMature(tile) ? "Regen farm" : "Farmland, year " + Zox.Sim.farmProgress(tile).year + " of 5";
    }
    const banks = bankBits(tiles, tile.r, tile.c);
    const seed = tile.r * 12 + tile.c;
    let volume = "";
    if (tile.building) volume = pieceSVG(tile.building, seed);
    else if (tile.terrain === "grove") volume = groveTrees(seed);

    return (
      `<button type="button" class="${tileFlags(ui, tile)} ${banks}" data-r="${tile.r}" data-c="${tile.c}" ` +
      `style="--x:${p.x}px;--y:${p.y}px;--z:${p.z}" aria-label="${label} at ${tile.r + 1}, ${tile.c + 1}">` +
      `<span class="iso-shadow"></span>` +
      `<span class="iso-stack">` +
      `<span class="iso-ring"></span>` +
      `<span class="iso-left"></span>` +
      `<span class="iso-right"></span>` +
      `<span class="iso-cap">${capDecor(tile)}</span>` +
      volume +
      regenMeter(tile) +
      `</span>` +
      `</button>`
    );
  }

  function stageSize(size) {
    return {
      w: size * TW,
      h: HEAD + size * TH + 22,
    };
  }

  function worldHTML(tiles, ui) {
    const size = tiles.length;
    const dim = stageSize(size);
    const cells = [];
    const order = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) order.push(tiles[r][c]);
    }
    order.sort((a, b) => a.r + a.c - (b.r + b.c) || a.r - b.r);
    for (const tile of order) cells.push(tileHTML(tiles, tile, ui));

    return (
      `<div class="iso-stage" style="width:${dim.w}px;height:${dim.h}px">` +
      `<div class="iso-earth" aria-hidden="true"></div>` +
      cells.join("") +
      `</div>`
    );
  }

  function syncFlags(grid, ui) {
    const tiles = ui.state.tiles;
    const buttons = grid.querySelectorAll("[data-r]");
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const r = Number(btn.dataset.r);
      const c = Number(btn.dataset.c);
      const tile = tiles[r][c];
      const banks = bankBits(tiles, r, c);
      btn.className = tileFlags(ui, tile) + (banks ? " " + banks : "");
    }
  }

  Zox.Render = {
    TW,
    TH,
    boardKey,
    tileFlags,
    worldHTML,
    syncFlags,
    stageSize,
  };
})(window);
