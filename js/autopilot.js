/**
 * Unattended Detroit → Jersey City strategy.
 * The campaign is five decades. On screen, Autopilot holds every year
 * (Zox.Autopilot.PACE) so the board, jar, farms, villages, and rail
 * can be watched. Headless runs skip those delays.
 * Manual play never starts this controller.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const LABELS = {
    farms: "Phase 1 · Regenerative farms",
    villages: "Phase 2 · Eco-villages at future stops",
    row: "Phase 3 · Railway right-of-way",
    rail: "Phase 4 · Build the rail",
    done: "Autopilot complete",
  };

  const ANNOUNCE = {
    farms:
      "Phase 1 is starting. Buying regenerative farmland one title deed at a time, Detroit toward Jersey City. No checkpoints.",
    villages:
      "Phase 2 is starting. Eco-villages are going in at the future rail stops now — site, then framing, then open. An open village leases into the jar or sells. Farm deeds are still being bought. The rail is not built yet.",
    row:
      "Phase 3 is starting. Farms and villages are underway. Buying the remaining right-of-way the railway will cross.",
    rail: "Phase 4 is starting. Building the rail line from Detroit to Jersey City.",
    done: "Autopilot finished. The green rail runs from Detroit to Jersey City. Nobody had to click.",
  };

  const GROUPS = {
    Monroe: ["#8b5a2b", "#fff8ee"],
    Toledo: ["#7ec8e3", "#102028"],
    Sandusky: ["#d946a6", "#fff5fb"],
    Erie: ["#f08a24", "#2a1400"],
    Youngstown: ["#d0232a", "#fff5f4"],
    Pittsburgh: ["#f2d31b", "#241e00"],
    Altoona: ["#1f9d55", "#f3fff6"],
    Harrisburg: ["#1d6fbf", "#f4f9ff"],
    Easton: ["#7d4ea3", "#fbf7ff"],
    Princeton: ["#2b2b2b", "#f6f1e4"],
    Ontario: ["#d9d4cc", "#221e18"],
  };

  const PATH_NAMES = [
    "Detroit",
    "Monroe",
    "Toledo",
    "Sandusky",
    "Erie",
    "Ashtabula",
    "Youngstown",
    "Altoona",
    "Harrisburg",
    "Princeton",
    "Jersey City",
  ];

  /* Live beats. Each year is held (close, then the new year). A full run takes several minutes. */
  const PACE = {
    announce: 1600,
    card: 1100,
    stage: 700,
    buy: 600,
    village: 1400,
    sell: 1400,
    rail: 900,
    season: 400,
    yearClose: 2400,
    yearOpen: 3800,
    greatJob: 6500,
    compost: 250,
  };

  function decisionTurnsYear(d) {
    if (!d) return false;
    if (d.kind === "season") return true;
    if (d.kind === "buy" || d.kind === "row" || d.kind === "village" || d.kind === "rail") return d.affordable === false;
    return false;
  }

  /* Wall-clock the live UI spends on one committed decision. Headless does not sleep. */
  function watchMs(d, state) {
    if (!d || d.kind === "done") return 0;
    if (d.kind === "announce") return PACE.announce;
    if ((d.kind === "buy" || d.kind === "row") && d.affordable) return PACE.card + PACE.stage + PACE.buy;
    if (decisionTurnsYear(d)) {
      let ms = PACE.yearClose + PACE.yearOpen;
      if (state && Zox.Sim && Zox.Sim.decadeInfo(state.season, state).closing) ms += PACE.greatJob;
      return ms;
    }
    if (d.kind === "village") return PACE.village;
    if (d.kind === "sell") return PACE.sell;
    if (d.kind === "rail") return PACE.rail;
    if (d.kind === "compost") return PACE.compost;
    return PACE.season;
  }

  function regionOf(name) {
    const keys = Object.keys(GROUPS).sort(function (a, b) {
      return b.length - a.length;
    });
    const n = String(name || "");
    for (let i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) === 0) return keys[i];
    }
    return "Erie";
  }

  function pathGeometry() {
    const path = (Zox.CORRIDOR && Zox.CORRIDOR.railPath) || [];
    const seg = [];
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const len = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
      seg.push({ i: i, start: acc, len: len });
      acc += len;
    }
    return { path: path, seg: seg, length: acc };
  }

  function project(p, geo) {
    let best = 1e9;
    let at = 0;
    let segIndex = 0;
    const path = geo.path;
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const ax = path[i].x;
      const ay = path[i].y;
      const bx = path[i + 1].x;
      const by = path[i + 1].y;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((p.x - ax) * dx + (p.y - ay) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
      const seglen = Math.sqrt(l2);
      if (d < best) {
        best = d;
        at = acc + t * seglen;
        segIndex = i;
      }
      acc += seglen;
    }
    return { d: best, at: at, segIndex: segIndex };
  }

  function betweenNames(segIndex) {
    const a = PATH_NAMES[segIndex] || "the line";
    const b = PATH_NAMES[segIndex + 1] || "the line";
    return [a, b];
  }

  function buildPlan() {
    const geo = pathGeometry();
    const parcels = (Zox.CORRIDOR && Zox.CORRIDOR.parcels) || [];
    const stops = (Zox.CORRIDOR && Zox.CORRIDOR.spine ? Zox.CORRIDOR.spine.slice() : []).sort(function (a, b) {
      return a.order - b.order;
    });
    const used = {};
    for (let i = 0; i < stops.length; i++) used[stops[i].id] = true;

    const regen = [];
    for (let s = 0; s < stops.length; s++) {
      const stop = stops[s];
      regen.push({
        id: stop.id,
        role: "stop",
        stopName: stop.mapLabel || stop.name,
        between: null,
      });
      let best = null;
      let bestD = 1e9;
      for (let i = 0; i < parcels.length; i++) {
        const p = parcels[i];
        if (used[p.id]) continue;
        const d = Math.hypot(p.x - stop.x, p.y - stop.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) {
        used[best.id] = true;
        regen.push({
          id: best.id,
          role: "cluster",
          stopName: stop.mapLabel || stop.name,
          between: null,
        });
      }
    }

    const row = [];
    const step = 80;
    for (let target = 20; target < geo.length - 20; target += step) {
      let best = null;
      let bestAlong = 1e9;
      let bestProj = null;
      for (let i = 0; i < parcels.length; i++) {
        const p = parcels[i];
        if (used[p.id]) continue;
        const info = project(p, geo);
        if (info.d > 18) continue;
        const along = Math.abs(info.at - target);
        if (along < bestAlong) {
          bestAlong = along;
          best = p;
          bestProj = info;
        }
      }
      if (!best) continue;
      let crowded = false;
      for (let r = 0; r < row.length; r++) {
        const parcel = Zox.Sim.getParcel(row[r].id);
        if (parcel && Math.hypot(parcel.x - best.x, parcel.y - best.y) < 32) crowded = true;
      }
      if (crowded) continue;
      used[best.id] = true;
      const names = betweenNames(bestProj.segIndex);
      row.push({
        id: best.id,
        role: "row",
        stopName: "",
        between: names,
      });
    }

    return {
      regen: regen,
      row: row,
      stops: stops,
      segments: Math.max(0, geo.path.length - 1),
    };
  }

  function ownerName(parcel) {
    if (Zox.Parcels && Zox.Parcels.deedOwner) return Zox.Parcels.deedOwner(parcel, null);
    return (parcel && parcel.seller) || "A local farmer";
  }

  function cardFor(entry, affordable, state) {
    const parcel = Zox.Sim.getParcel(entry.id);
    if (!parcel) return null;
    const cost = Zox.BUILDINGS.farm.cost;
    const acres = parcel.acres || 1;
    const owner = ownerName(parcel);
    const region = regionOf(parcel.name);
    const colors = GROUPS[region] || GROUPS.Erie;
    const money = state.money;
    const short = Math.max(0, cost - money);
    let reason;
    if (entry.role === "stop") {
      reason =
        parcel.name +
        " is a future stop on the Detroit → Jersey City line. Buy this " +
        acres +
        "-acre deed from " +
        owner +
        " for $" +
        cost +
        " now, so the five-season regen can finish and an eco-village can stand here before any rail is laid.";
    } else if (entry.role === "cluster") {
      reason =
        parcel.name +
        " sits beside the " +
        entry.stopName +
        " stop. The eco-village needs regenerative land around that future station, and " +
        owner +
        " still holds this " +
        acres +
        "-acre square at $" +
        cost +
        ". The rail stays a dashed line until the villages and the right-of-way are in.";
    } else {
      const a = entry.between ? entry.between[0] : "the corridor";
      const b = entry.between ? entry.between[1] : "the corridor";
      reason =
        "Right-of-way between " +
        a +
        " and " +
        b +
        ". Farms and eco-villages are already underway. This " +
        acres +
        "-acre square from " +
        owner +
        " ($" +
        cost +
        ") is land the trains will cross — not a station. The line itself comes last.";
    }
    if (!affordable) {
      reason +=
        " The jar has $" +
        money +
        ", short $" +
        short +
        ". Apartment rent from Long Island City is $" +
        Zox.LIC.income +
        " a season, and crop rent lands when the season turns. Hold the card. No approval needed.";
    } else {
      reason += " The jar can cover $" + cost + " this season, so buy it and move on.";
    }
    return {
      id: parcel.id,
      name: parcel.name,
      owner: owner,
      acres: acres,
      cost: cost,
      reason: reason,
      region: region,
      band: colors[0],
      ink: colors[1],
      role: entry.role,
      affordable: affordable,
      short: short,
    };
  }

  function findOpenLot(farm) {
    const tiles = farm.tiles;
    let grove = null;
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        const t = tiles[r][c];
        if (t.building || t.landmark === "barn" || t.terrain === "water") continue;
        if (t.terrain === "meadow") return { r: r, c: c };
        if (!grove) grove = { r: r, c: c };
      }
    }
    return grove;
  }

  function create(state) {
    const plan = buildPlan();
    const mem = {
      phase: "farms",
      announced: {},
      pendingAnnounce: "farms",
      regenI: 0,
      rowI: 0,
      railI: 0,
      landThisSeason: 0,
      railThisSeason: 0,
      compostThisSeason: 0,
      countedSeason: state.season,
      done: false,
      stats: {
        phases: [],
        cashWaits: 0,
        firstVillageSeason: null,
        soldOne: false,
        regenDoneSeason: null,
        rowDoneSeason: null,
        railDoneSeason: null,
        commits: 0,
        years: [],
        watchMs: 0,
        greatJobs: 0,
      },
    };

    state.builtRail = 0;
    state.horizonDecades = 5;
    state.horizonSeasons = 25;
    state.autopilotHold = true;
    state.futureStopIds = plan.stops.map(function (s) {
      return s.id;
    });
    state.autopilot = {
      on: true,
      complete: false,
      phase: "farms",
      label: LABELS.farms,
      note: ANNOUNCE.farms,
      progress: "",
      focusId: "",
      card: null,
    };

    while (mem.regenI < plan.regen.length && Zox.Sim.getFarmByParcel(state, plan.regen[mem.regenI].id)) {
      mem.regenI += 1;
    }

    function syncSeason() {
      if (state.season !== mem.countedSeason) {
        mem.countedSeason = state.season;
        mem.landThisSeason = 0;
        mem.railThisSeason = 0;
        mem.compostThisSeason = 0;
      }
    }

    function villageCount() {
      return Zox.Sim.countVillages(state);
    }

    function stopFarm(stop) {
      return Zox.Sim.getFarmByParcel(state, stop.id);
    }

    function hasVillage(farm) {
      return !!(farm && Zox.Map.tilesOf(farm.tiles, "village").length);
    }

    function readyVillage() {
      for (let i = 0; i < plan.stops.length; i++) {
        const farm = stopFarm(plan.stops[i]);
        if (!farm || !Zox.Sim.farmMature(farm) || hasVillage(farm)) continue;
        const lot = findOpenLot(farm);
        if (!lot) continue;
        return { farm: farm, lot: lot, stop: plan.stops[i] };
      }
      return null;
    }

    function openUnsold() {
      for (let i = 0; i < plan.stops.length; i++) {
        const farm = stopFarm(plan.stops[i]);
        if (!farm || !hasVillage(farm) || !farm.villageWorks) continue;
        if (farm.villageWorks.stage === "open" && !farm.villageWorks.sold) {
          return { farm: farm, stop: plan.stops[i] };
        }
      }
      return null;
    }

    function sellDecision() {
      if (mem.soldOne || mem.stats.soldOne) return null;
      const sale = openUnsold();
      if (!sale) return null;
      const spec = Zox.VILLAGE_WORKS || { lease: 6, sale: 84 };
      const cost = Zox.BUILDINGS.village.cost;
      const stopName = sale.stop.mapLabel || sale.stop.name;
      return {
        kind: "sell",
        affordable: true,
        parcelId: sale.farm.parcelId,
        farmId: sale.farm.id,
        note:
          "Selling the open eco-village at " +
          stopName +
          " for $" +
          spec.sale +
          ". It cost $" +
          cost +
          " to build and leased $" +
          spec.lease +
          " a season while open. The station stays on the line. The rail is still a later phase.",
      };
    }

    function allVillages() {
      for (let i = 0; i < plan.stops.length; i++) {
        const farm = stopFarm(plan.stops[i]);
        if (!hasVillage(farm)) return false;
      }
      return plan.stops.length > 0;
    }

    function desiredPhase() {
      if (mem.railI >= plan.segments && allVillages()) return "done";
      const regenDone = mem.regenI >= plan.regen.length;
      const rowDone = mem.rowI >= plan.row.length;
      const v = villageCount();
      if (regenDone && rowDone && allVillages()) return "rail";
      const well = mem.regenI >= Math.ceil(plan.regen.length * 0.75) && v >= 3;
      if ((well || regenDone) && v >= 2 && !rowDone) return "row";
      if (v > 0 || readyVillage()) return "villages";
      return "farms";
    }

    function notePhase() {
      if (mem.done) return;
      let want = desiredPhase();
      if ((want === "row" || want === "rail" || want === "done") && !mem.announced.villages && (villageCount() > 0 || readyVillage())) {
        want = "villages";
      }
      if ((want === "rail" || want === "done") && !mem.announced.row && mem.rowI < plan.row.length) {
        want = "row";
      }
      if (want !== mem.phase) {
        mem.phase = want;
        if (!mem.announced[want]) mem.pendingAnnounce = want;
      }
    }

    function yearStamp() {
      const info = Zox.Sim.decadeInfo(state.season, state);
      return "Year " + info.year + " of " + info.yearsTotal;
    }

    function progressText() {
      const info = Zox.Sim.decadeInfo(state.season, state);
      return (
        "Year " +
        info.year +
        " of " +
        info.yearsTotal +
        " · Decade " +
        info.decade +
        " of " +
        info.decades +
        " · Farms " +
        mem.regenI +
        "/" +
        plan.regen.length +
        " · Villages " +
        villageCount() +
        "/" +
        plan.stops.length +
        " · Right-of-way " +
        mem.rowI +
        "/" +
        plan.row.length +
        " · Rail " +
        mem.railI +
        "/" +
        plan.segments
      );
    }

    function paint(decision) {
      const phase = mem.phase;
      state.autopilot.phase = phase;
      state.autopilot.label = LABELS[phase] || phase;
      state.autopilot.progress = progressText();
      state.autopilot.focusId = (decision && decision.parcelId) || "";
      state.autopilot.card = (decision && decision.card) || null;
      if (decision && decision.kind === "announce") state.autopilot.note = decision.text;
      else if (
        decision &&
        decision.note &&
        (decision.kind === "sell" || decision.kind === "village" || decision.kind === "season" || decision.kind === "rail" || decision.affordable === false)
      ) {
        state.autopilot.note = decision.note;
      }
    }

    function nextRegen() {
      if (mem.regenI >= plan.regen.length) return null;
      const entry = plan.regen[mem.regenI];
      const unlock = 1 + Math.floor((mem.regenI * 10) / plan.regen.length);
      return { entry: entry, unlock: unlock };
    }

    function nextRow() {
      if (mem.phase !== "row") return null;
      if (mem.rowI >= plan.row.length) return null;
      return { entry: plan.row[mem.rowI], unlock: 1 };
    }

    function buyDecision(pack, affordable) {
      const card = cardFor(pack.entry, affordable, state);
      return {
        kind: pack.entry.role === "row" ? "row" : "buy",
        role: pack.entry.role,
        affordable: affordable,
        parcelId: pack.entry.id,
        entry: pack.entry,
        card: card,
        note: card ? card.reason : "",
      };
    }

    function shouldCompost() {
      if (mem.compostThisSeason >= 1) return false;
      if (state.waste < 28) return false;
      if (Zox.Sim.buildingsOf(state, "compost").length >= 3) return false;
      const cost = Zox.BUILDINGS.compost.cost;
      if (state.money < cost) return false;
      const tight = state.money - cost < Zox.BUILDINGS.farm.cost;
      if (tight && state.waste < 45) return false;
      return true;
    }

    function compostTarget() {
      const farms = state.farms || [];
      for (let i = 0; i < farms.length; i++) {
        if (Zox.Map.tilesOf(farms[i].tiles, "compost").length) continue;
        const lot = findOpenLot(farms[i]);
        if (lot) return { farm: farms[i], lot: lot };
      }
      return null;
    }

    function peek() {
      syncSeason();
      if (mem.done) {
        const d = { kind: "done", note: ANNOUNCE.done };
        paint(d);
        return d;
      }
      notePhase();
      if (mem.pendingAnnounce && !mem.announced[mem.pendingAnnounce]) {
        const phase = mem.pendingAnnounce;
        const d = { kind: "announce", phase: phase, text: ANNOUNCE[phase] || phase, note: ANNOUNCE[phase] };
        paint(d);
        return d;
      }

      const farmCost = Zox.BUILDINGS.farm.cost;
      const canLand = mem.landThisSeason < 2;
      const regen = nextRegen();
      const row = nextRow();
      const regenReady = regen && state.season >= regen.unlock;
      const rv = readyVillage();
      const preferFarm = !!(regenReady && canLand && state.money >= farmCost && mem.landThisSeason === 0 && mem.phase !== "rail");

      if (shouldCompost()) {
        const host = compostTarget();
        if (host) {
          const d = {
            kind: "compost",
            farmId: host.farm.id,
            parcelId: host.farm.parcelId,
            lot: host.lot,
            note: "Compost on " + host.farm.name + " so the villages do not bury the corridor in waste.",
          };
          paint(d);
          return d;
        }
      }

      if (rv && !preferFarm) {
        if (state.money < Zox.BUILDINGS.village.cost) {
          const shortSale = sellDecision();
          if (shortSale) {
            paint(shortSale);
            return shortSale;
          }
          if (regenReady && canLand && state.money >= farmCost) {
            const d = buyDecision(regen, true);
            paint(d);
            return d;
          }
          if (row && canLand && state.money >= farmCost) {
            const d = buyDecision(row, true);
            paint(d);
            return d;
          }
          const d = {
            kind: "village",
            affordable: false,
            parcelId: rv.farm.parcelId,
            farmId: rv.farm.id,
            lot: rv.lot,
            note:
              yearStamp() +
              ". Eco-village at " +
              rv.farm.name +
              " is ready, but the jar is short. Apartment rent is $" +
              Zox.LIC.income +
              " a year. Closing the year.",
          };
          paint(d);
          return d;
        }
        const spec = Zox.VILLAGE_WORKS || { lease: 6, sale: 84 };
        const d = {
          kind: "village",
          affordable: true,
          parcelId: rv.farm.parcelId,
          farmId: rv.farm.id,
          lot: rv.lot,
          note:
            "Funding the eco-village at the future " +
            (rv.stop.mapLabel || rv.stop.name) +
            " stop. Build $" +
            Zox.BUILDINGS.village.cost +
            ". Site, then framing, then open. Once open it leases $" +
            spec.lease +
            " a season or sells for $" +
            spec.sale +
            ". The rail is still not built.",
        };
        paint(d);
        return d;
      }

      if (!preferFarm && !(rv && state.money >= Zox.BUILDINGS.village.cost)) {
        const sale = sellDecision();
        if (sale) {
          paint(sale);
          return sale;
        }
      }

      if (regen && canLand && mem.phase !== "rail") {
        if (!regenReady) {
          const d = {
            kind: "season",
            reason: "pace",
            note: yearStamp() + ". Rent and soil keep working before the next deed.",
          };
          paint(d);
          return d;
        }
        const d = buyDecision(regen, state.money >= farmCost);
        paint(d);
        return d;
      }

      if (row && canLand) {
        const d = buyDecision(row, state.money >= farmCost);
        paint(d);
        return d;
      }

      if (mem.phase === "rail" && !allVillages()) {
        const d = {
          kind: "season",
          reason: "maturity",
          note: yearStamp() + ". Waiting on regen so the last eco-village can open before the rail.",
        };
        paint(d);
        return d;
      }

      if (mem.phase === "rail" && mem.railI < plan.segments) {
        if (mem.railThisSeason >= 2) {
          const d = { kind: "season", reason: "pace", note: yearStamp() + ". The rail crew pauses, then lays the next stretch." };
          paint(d);
          return d;
        }
        if (state.money < Zox.BUILDINGS.rail.cost) {
          const d = {
            kind: "rail",
            affordable: false,
            index: mem.railI,
            note:
              "Next rail segment needs $" +
              Zox.BUILDINGS.rail.cost +
              ". The jar has $" +
              state.money +
              ". Waiting on apartment rent. " +
              yearStamp() +
              ".",
          };
          paint(d);
          return d;
        }
        const from = PATH_NAMES[mem.railI] || "the line";
        const to = PATH_NAMES[mem.railI + 1] || "the line";
        const d = {
          kind: "rail",
          affordable: true,
          index: mem.railI,
          note: "Laying rail from " + from + " to " + to + ".",
        };
        paint(d);
        return d;
      }

      if (desiredPhase() === "done" || (mem.railI >= plan.segments && allVillages())) {
        mem.phase = "done";
        if (!mem.announced.done) {
          const d = { kind: "announce", phase: "done", text: ANNOUNCE.done, note: ANNOUNCE.done };
          paint(d);
          return d;
        }
        mem.done = true;
        const d = { kind: "done", note: ANNOUNCE.done };
        paint(d);
        return d;
      }

      const d = { kind: "season", reason: "pace", note: yearStamp() + ". Rent and regen keep the plan moving." };
      paint(d);
      return d;
    }

    function runSeason() {
      if (state.status !== "playing") state.status = "playing";
      const before = state.season;
      const res = Zox.Sim.runSeason(state);
      if (state.status !== "playing") state.status = "playing";
      if (state.season === before + 1) {
        mem.stats.years.push(state.season);
        if (Zox.Sim.decadeInfo(before, state).closing) mem.stats.greatJobs += 1;
      }
      return res;
    }

    function rememberPhase(phase) {
      const info = Zox.Sim.decadeInfo(state.season, state);
      mem.stats.phases.push({
        phase: phase,
        season: state.season,
        decade: info.decade,
        decades: info.decades,
        label: info.short,
        farms: mem.regenI,
        farmTarget: plan.regen.length,
        villages: villageCount(),
        villageTarget: plan.stops.length,
        row: mem.rowI,
        rowTarget: plan.row.length,
        rail: mem.railI,
        railTarget: plan.segments,
        money: state.money,
      });
      Zox.Sim &&
        state.log &&
        state.log.unshift({
          season: state.season,
          text: ANNOUNCE[phase] || phase,
        });
      if (state.log && state.log.length > 10) state.log.length = 10;
    }

    function commit() {
      const d = peek();
      mem.stats.commits += 1;
      mem.stats.watchMs += watchMs(d, state);
      if (d.kind === "announce") {
        mem.announced[d.phase] = true;
        mem.pendingAnnounce = null;
        rememberPhase(d.phase);
        if (d.phase === "done") {
          mem.done = true;
          state.autopilot.complete = true;
          state.autopilot.on = false;
          state.autopilotHold = false;
          mem.stats.railDoneSeason = state.season;
        }
        return d;
      }
      if (d.kind === "done") {
        mem.done = true;
        state.autopilot.complete = true;
        state.autopilot.on = false;
        state.autopilotHold = false;
        if (mem.stats.railDoneSeason == null) mem.stats.railDoneSeason = state.season;
        return d;
      }
      if (d.kind === "buy" || d.kind === "row") {
        if (!d.affordable) {
          mem.stats.cashWaits += 1;
          runSeason();
          return d;
        }
        const res = Zox.Sim.buyParcel(state, d.parcelId);
        if (!res.ok) {
          mem.stats.cashWaits += 1;
          runSeason();
          return d;
        }
        if (d.role === "row") mem.rowI += 1;
        else mem.regenI += 1;
        mem.landThisSeason += 1;
        if (mem.regenI >= plan.regen.length && mem.stats.regenDoneSeason == null) {
          mem.stats.regenDoneSeason = state.season;
        }
        if (mem.rowI >= plan.row.length && mem.stats.rowDoneSeason == null) {
          mem.stats.rowDoneSeason = state.season;
        }
        return d;
      }
      if (d.kind === "village") {
        if (!d.affordable) {
          mem.stats.cashWaits += 1;
          runSeason();
          return d;
        }
        const res = Zox.Sim.place(state, d.lot.r, d.lot.c, "village", d.farmId);
        if (!res.ok) {
          runSeason();
          return d;
        }
        if (mem.stats.firstVillageSeason == null) mem.stats.firstVillageSeason = state.season;
        return d;
      }
      if (d.kind === "sell") {
        const res = Zox.Sim.sellVillage(state, d.farmId);
        mem.soldOne = true;
        mem.stats.soldOne = true;
        if (!res.ok && state.log) {
          state.log.unshift({ season: state.season, text: res.why || "Village sale did not clear." });
          if (state.log.length > 10) state.log.length = 10;
        }
        return d;
      }
      if (d.kind === "compost") {
        Zox.Sim.place(state, d.lot.r, d.lot.c, "compost", d.farmId);
        mem.compostThisSeason += 1;
        return d;
      }
      if (d.kind === "rail") {
        if (!d.affordable) {
          mem.stats.cashWaits += 1;
          runSeason();
          return d;
        }
        state.money -= Zox.BUILDINGS.rail.cost;
        mem.railI += 1;
        state.builtRail = mem.railI;
        mem.railThisSeason += 1;
        if (state.log) {
          state.log.unshift({ season: state.season, text: d.note });
          if (state.log.length > 10) state.log.length = 10;
        }
        return d;
      }
      runSeason();
      return d;
    }

    function summary() {
      const info = Zox.Sim.decadeInfo(Math.max(1, state.season), state);
      return {
        season: state.season,
        decade: info.decade,
        decades: info.decades,
        label: "Year " + info.year + " of " + info.yearsTotal + " · Decade " + info.decade + " of " + info.decades,
        seasonsPlayed: Math.max(0, state.season - 1),
        phases: mem.stats.phases,
        cashWaits: mem.stats.cashWaits,
        firstVillageSeason: mem.stats.firstVillageSeason,
        regenDoneSeason: mem.stats.regenDoneSeason,
        rowDoneSeason: mem.stats.rowDoneSeason,
        railDoneSeason: mem.stats.railDoneSeason,
        farms: mem.regenI,
        farmTarget: plan.regen.length,
        villages: villageCount(),
        villageTarget: plan.stops.length,
        row: mem.rowI,
        rowTarget: plan.row.length,
        rail: mem.railI,
        railTarget: plan.segments,
        money: state.money,
        waste: state.waste,
        nature: state.nature,
        health: state.health,
        status: state.status,
        commits: mem.stats.commits,
        years: mem.stats.years.slice(),
        greatJobs: mem.stats.greatJobs,
        estimatedWatchMs: mem.stats.watchMs,
        estimatedWatchSec: Math.round(mem.stats.watchMs / 1000),
        builtRail: state.builtRail,
        villageSales: (state.villageBooks && state.villageBooks.sales) || 0,
        villageSaleCash: (state.villageBooks && state.villageBooks.saleCash) || 0,
        villageLease: (state.villageBooks && state.villageBooks.lease) || 0,
      };
    }

    return {
      peek: peek,
      commit: commit,
      summary: summary,
      plan: plan,
    };
  }

  Zox.Autopilot = {
    PACE: PACE,
    LABELS: LABELS,
    buildPlan: buildPlan,
    create: create,
    decisionTurnsYear: decisionTurnsYear,
    watchMs: watchMs,
  };
})(typeof window !== "undefined" ? window : globalThis);
