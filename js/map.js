/**
 * Map generation and neighborhood queries.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function inBounds(size, r, c) {
    return r >= 0 && c >= 0 && r < size && c < size;
  }

  function neighbors4(r, c) {
    return [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ];
  }

  function chebyshev(r1, c1, r2, c2) {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2));
  }

  function createRng(seed) {
    let s = seed >>> 0;
    return function rng() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function makeEmpty(size) {
    const tiles = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        row.push({
          r,
          c,
          terrain: "meadow",
          building: null,
        });
      }
      tiles.push(row);
    }
    return tiles;
  }

  function carveCreek(tiles, size, rng) {
    let c = 2 + Math.floor(rng() * (size - 4));
    for (let r = 0; r < size; r++) {
      tiles[r][c].terrain = "water";
      if (rng() < 0.42 && c > 1) tiles[r][c - 1].terrain = "water";
      if (rng() < 0.18 && c < size - 2) tiles[r][c + 1].terrain = "water";
      const step = rng() < 0.28 ? -1 : rng() < 0.56 ? 1 : 0;
      c = clamp(c + step, 1, size - 2);
    }
  }

  function plantGroves(tiles, size, rng, count) {
    let planted = 0;
    let guard = 0;
    while (planted < count && guard < 400) {
      guard += 1;
      const r = Math.floor(rng() * size);
      const c = Math.floor(rng() * size);
      const tile = tiles[r][c];
      if (tile.terrain !== "meadow") continue;
      const nearWater = neighbors4(r, c).some(([nr, nc]) => {
        return inBounds(size, nr, nc) && tiles[nr][nc].terrain === "water";
      });
      if (nearWater && rng() < 0.55) continue;
      tile.terrain = "grove";
      planted += 1;
      if (rng() < 0.55) {
        const [nr, nc] = neighbors4(r, c)[Math.floor(rng() * 4)];
        if (inBounds(size, nr, nc) && tiles[nr][nc].terrain === "meadow") {
          tiles[nr][nc].terrain = "grove";
          planted += 1;
        }
      }
    }
  }

  function generateMap(size, seed) {
    const rng = createRng(seed);
    const tiles = makeEmpty(size);
    carveCreek(tiles, size, rng);
    plantGroves(tiles, size, rng, Zox.MAP.groveCount);
    return tiles;
  }

  function getTile(tiles, r, c) {
    if (!inBounds(tiles.length, r, c)) return null;
    return tiles[r][c];
  }

  function forEachTile(tiles, fn) {
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        fn(tiles[r][c], r, c);
      }
    }
  }

  function tilesOf(tiles, buildingId) {
    const found = [];
    forEachTile(tiles, (tile) => {
      if (tile.building === buildingId) found.push(tile);
    });
    return found;
  }

  function countTerrain(tiles, terrain) {
    let n = 0;
    forEachTile(tiles, (tile) => {
      if (tile.terrain === terrain && !tile.building) n += 1;
    });
    return n;
  }

  function hasNeighborBuilding(tiles, r, c, id, radius) {
    const size = tiles.length;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr === 0 && dc === 0) continue;
        const tile = getTile(tiles, r + dr, c + dc);
        if (!tile) continue;
        if (chebyshev(r, c, r + dr, c + dc) > radius) continue;
        if (tile.building === id) return true;
      }
    }
    return Boolean(getTile(tiles, r, c) && tiles[r][c].building === id);
  }

  function adjacentTerrain(tiles, r, c, terrain) {
    return neighbors4(r, c).some(([nr, nc]) => {
      const tile = getTile(tiles, nr, nc);
      return tile && tile.terrain === terrain;
    });
  }

  function railNetworks(tiles) {
    const size = tiles.length;
    const seen = new Set();
    const nets = [];

    function key(r, c) {
      return r + "," + c;
    }

    forEachTile(tiles, (tile, r, c) => {
      if (tile.building !== "rail" || seen.has(key(r, c))) return;
      const stack = [[r, c]];
      const members = [];
      seen.add(key(r, c));
      while (stack.length) {
        const [cr, cc] = stack.pop();
        members.push(tiles[cr][cc]);
        for (const [nr, nc] of neighbors4(cr, cc)) {
          if (!inBounds(size, nr, nc) || seen.has(key(nr, nc))) continue;
          if (tiles[nr][nc].building !== "rail") continue;
          seen.add(key(nr, nc));
          stack.push([nr, nc]);
        }
      }
      nets.push(members);
    });
    return nets;
  }

  function connectedSet(tiles) {
    const live = new Set();
    const nets = railNetworks(tiles).filter((n) => n.length >= 2);
    for (const net of nets) {
      for (const stop of net) {
        forEachTile(tiles, (tile, r, c) => {
          if (chebyshev(r, c, stop.r, stop.c) <= 2) {
            live.add(r + "," + c);
          }
        });
      }
    }
    return live;
  }

  function isConnected(connected, r, c) {
    return connected.has(r + "," + c);
  }

  function describeTerrain(terrain) {
    if (terrain === "water") return "Creek";
    if (terrain === "grove") return "Grove";
    return "Meadow";
  }

  Zox.Map = {
    clamp,
    inBounds,
    neighbors4,
    chebyshev,
    createRng,
    generateMap,
    getTile,
    forEachTile,
    tilesOf,
    countTerrain,
    hasNeighborBuilding,
    adjacentTerrain,
    railNetworks,
    connectedSet,
    isConnected,
    describeTerrain,
  };
})(window);
