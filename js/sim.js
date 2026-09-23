/**
 * Season loop, placement, win/lose, and a short kitchen-table log.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function pushLog(state, text) {
    state.log.unshift({ season: state.season, text });
    if (state.log.length > 10) state.log.length = 10;
  }

  function getFarm(state, id) {
    if (!state || !id || !state.farms) return null;
    for (let i = 0; i < state.farms.length; i++) {
      if (state.farms[i].id === id) return state.farms[i];
    }
    return null;
  }

  function getFarmByParcel(state, parcelId) {
    if (!state || !parcelId || !state.farms) return null;
    for (let i = 0; i < state.farms.length; i++) {
      if (state.farms[i].parcelId === parcelId) return state.farms[i];
    }
    return null;
  }

  function getParcel(parcelId) {
    if (!parcelId) return null;
    const map = Zox.CORRIDOR && Zox.CORRIDOR.byId;
    if (map && map[parcelId]) return map[parcelId];
    const list = (Zox.CORRIDOR && Zox.CORRIDOR.parcels) || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === parcelId) return list[i];
    }
    return null;
  }

  function spineParcels() {
    if (Zox.CORRIDOR && Zox.CORRIDOR.spine && Zox.CORRIDOR.spine.length) {
      return Zox.CORRIDOR.spine;
    }
    const list = (Zox.CORRIDOR && Zox.CORRIDOR.parcels) || [];
    const spine = [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].spine) spine.push(list[i]);
    }
    spine.sort(function (a, b) {
      return a.order - b.order;
    });
    return spine;
  }

  function resolveFarm(state, target) {
    if (!target) return null;
    if (target.tiles && target.id) return target;
    if (state && target.farmId) return getFarm(state, target.farmId);
    if (target.regenAge != null && target.building === "farm" && !target.tiles) {
      return target;
    }
    return null;
  }

  function tilesForView(state, farmId) {
    if (!farmId) return state.tiles;
    const farm = getFarm(state, farmId);
    return farm ? farm.tiles : state.tiles;
  }

  function buildingsOf(state, id) {
    const found = [];
    for (let i = 0; i < state.farms.length; i++) {
      const farm = state.farms[i];
      const lots = Zox.Map.tilesOf(farm.tiles, id);
      for (let j = 0; j < lots.length; j++) {
        found.push({ tile: lots[j], farm: farm });
      }
    }
    return found;
  }

  function standingGroves(state) {
    const groves = [];
    for (let i = 0; i < state.farms.length; i++) {
      Zox.Map.forEachTile(state.farms[i].tiles, (tile) => {
        if (tile.terrain === "grove" && !tile.building) groves.push(tile);
      });
    }
    return groves;
  }

  function farmMature(farm) {
    if (!farm) return false;
    return (farm.regenAge || 0) >= Zox.BUILDINGS.farm.convertYears;
  }

  function farmProgress(farm) {
    const need = Zox.BUILDINGS.farm.convertYears;
    const age = farm ? farm.regenAge || 0 : 0;
    const mature = age >= need;
    return {
      age,
      need,
      year: mature ? need : age + 1,
      mature,
      pct: Math.round((Math.min(age, need) / need) * 100),
    };
  }

  function roundTenth(n) {
    return Math.round(n * 10) / 10;
  }

  function cashSum(ledger) {
    const keys = Zox.LEDGER_CASH || [];
    let sum = 0;
    for (let i = 0; i < keys.length; i++) sum += Number(ledger[keys[i]]) || 0;
    return roundTenth(sum);
  }

  function scaleCashTo(baseLedger, target) {
    const keys = Zox.LEDGER_CASH || [];
    const led = Object.assign({}, baseLedger);
    const base = cashSum(baseLedger) || 1;
    let acc = 0;
    for (let i = 0; i < keys.length; i++) {
      const v = roundTenth((Number(baseLedger[keys[i]]) || 0) * (target / base));
      led[keys[i]] = v;
      acc = roundTenth(acc + v);
    }
    const drift = roundTenth(target - acc);
    led.fertilizer = roundTenth((Number(led.fertilizer) || 0) + drift);
    return led;
  }

  function lerpIndex(a, b, t) {
    return roundTenth(a + (b - a) * t);
  }

  /**
   * Converting ledger for display years 1–5.
   * Cash lines are the traditional bill scaled so they sum to that year's inputs.
   * Soil, water, and labor indexes walk from traditional toward regenerative.
   * Seasons 1–4 pay this book. The click that finishes year 5 pays regenerative.
   */
  function convertingLedger(year) {
    const models = Zox.FARM_MODELS;
    const trad = models.traditional.ledger;
    const regen = models.regenerative.ledger;
    const years = models.converting.years;
    const row = years[(year || 1) - 1] || years[0];
    const tSteps = [0.18, 0.36, 0.54, 0.72, 0.88];
    const t = tSteps[(row.year || 1) - 1] || 0.5;
    const led = scaleCashTo(trad, row.inputs);
    const indexes = [
      "manureReturn",
      "soilOrganicMatter",
      "waterUse",
      "runoff",
      "erosion",
      "biodiversity",
      "laborChem",
      "laborLiving",
    ];
    for (let i = 0; i < indexes.length; i++) {
      const k = indexes[i];
      led[k] = lerpIndex(trad[k], regen[k], t);
    }
    const carbPreview = [2, 3, 5, 7, 8];
    const nutrPreview = (Zox.NUTRITION.convertingLadder || [2, 3, 4, 5]).concat([
      Zox.NUTRITION.yearFivePreview || 5,
    ]);
    led.carbonTons = carbPreview[(row.year || 1) - 1] || 3;
    led.nutritionMult = nutrPreview[(row.year || 1) - 1] || 2;
    return led;
  }

  function regenLedger() {
    return Object.assign({}, Zox.FARM_MODELS.regenerative.ledger);
  }

  function tradLedger() {
    return Object.assign({}, Zox.FARM_MODELS.traditional.ledger);
  }

  function farmLedgerFor(modelId, year) {
    if (modelId === "traditional") return tradLedger();
    if (modelId === "regenerative") return regenLedger();
    return convertingLedger(year || 3);
  }

  function booksFrom(model, ledger, extra) {
    const inputs = cashSum(ledger);
    const gross = model.gross;
    return Object.assign(
      {
        model: model.id,
        label: model.name,
        gross: gross,
        inputs: inputs,
        net: roundTenth(gross - inputs),
        note: model.note,
        ledger: ledger,
      },
      extra || {}
    );
  }

  function convertingBooks(year) {
    const models = Zox.FARM_MODELS;
    const row = models.converting.years[(year || 1) - 1] || models.converting.years[0];
    const ledger = convertingLedger(row.year);
    return booksFrom(
      {
        id: "converting",
        name: "Converting (year " + row.year + " of 5)",
        gross: row.gross,
        note: models.converting.note,
      },
      ledger,
      {
        year: row.year,
        need: models.converting.years.length,
        mature: false,
        label: "Converting (year " + row.year + " of 5)",
      }
    );
  }

  function regenerativeBooks() {
    const row = Zox.FARM_MODELS.regenerative;
    const need = Zox.FARM_MODELS.converting.years.length;
    return booksFrom(row, regenLedger(), {
      year: need,
      need: need,
      mature: true,
      label: "Zox regenerative",
    });
  }

  function traditionalBooks() {
    const row = Zox.FARM_MODELS.traditional;
    return booksFrom(row, tradLedger(), {
      year: 0,
      need: 5,
      mature: false,
      label: row.name,
    });
  }

  function farmBooks(farm) {
    if (!farm) return null;
    if (farmMature(farm)) return regenerativeBooks();
    const prog = farmProgress(farm);
    return convertingBooks(prog.year);
  }

  /**
   * Books the Next Season click actually pays.
   * Years 1–4 pay the converting book. The click that finishes year 5
   * graduates: chem $0, 6× nutrition, mature carbon, and the rail can light.
   */
  function seasonResolution(farm) {
    const need = Zox.BUILDINGS.farm.convertYears;
    const age = farm.regenAge || 0;
    if (age >= need) {
      return { phase: "regenerative", year: need, mature: true, books: regenerativeBooks() };
    }
    if (age === need - 1) {
      const books = regenerativeBooks();
      books.label = "Graduated to regenerative";
      return { phase: "graduate", year: need, mature: true, books: books };
    }
    const year = age + 1;
    return { phase: "converting", year: year, mature: false, books: convertingBooks(year) };
  }

  function carbonUnitsFor(res) {
    if (res.mature) return Zox.CARBON.matureFarm;
    const ladder = Zox.CARBON.convertingLadder || [2, 3, 5, 7];
    return ladder[res.year - 1] || Zox.CARBON.convertingFarm;
  }

  function nutritionFor(res) {
    if (res.mature) return Zox.NUTRITION.regenerative;
    const ladder = Zox.NUTRITION.convertingLadder || [2, 3, 4, 5];
    return ladder[res.year - 1] || Zox.NUTRITION.converting;
  }

  function resolveFarmSeason(farm) {
    const res = seasonResolution(farm);
    const def = Zox.BUILDINGS.farm;
    const books = res.books;
    const snap = {
      phase: res.phase,
      year: res.year,
      mature: res.mature,
      gross: books.gross,
      inputs: books.inputs,
      net: books.net,
      nutritionMult: nutritionFor(res),
      carbonUnits: carbonUnitsFor(res),
      nature: res.mature ? def.nature : def.youngNature,
      waste: res.mature ? def.waste : def.youngWaste,
      credits: res.mature ? def.credits : def.youngCredits,
      ledger: books.ledger,
      label: books.label,
    };
    const wasMature = farmMature(farm);
    farm.regenAge = (farm.regenAge || 0) + 1;
    farm.lastSnap = snap;
    snap.justMatured = !wasMature && farmMature(farm);
    return snap;
  }

  function farmYield(farm) {
    const books = farmBooks(farm);
    const mature = !!(books && books.mature);
    const def = Zox.BUILDINGS.farm;
    return {
      mature,
      income: books ? books.gross : 0,
      inputs: books ? books.inputs : 0,
      net: books ? books.net : 0,
      nature: mature ? def.nature : def.youngNature,
      waste: mature ? def.waste : def.youngWaste,
      credits: mature ? def.credits : def.youngCredits,
    };
  }

  function farmModelRows(focusYear) {
    const year = focusYear || 3;
    const conv = convertingBooks(year);
    const trad = traditionalBooks();
    const regen = regenerativeBooks();
    return [
      {
        id: "traditional",
        name: trad.label,
        gross: trad.gross,
        inputs: trad.inputs,
        net: trad.net,
        note: trad.note,
        ledger: trad.ledger,
        mature: false,
      },
      {
        id: "converting",
        name: conv.label,
        gross: conv.gross,
        inputs: conv.inputs,
        net: conv.net,
        note: conv.note,
        ledger: conv.ledger,
        year: conv.year,
        mature: false,
      },
      {
        id: "regenerative",
        name: regen.label,
        gross: regen.gross,
        inputs: regen.inputs,
        net: regen.net,
        note: regen.note,
        ledger: regen.ledger,
        mature: true,
      },
    ];
  }

  function acresPerDeed() {
    const cost = Zox.BUILDINGS.farm.cost;
    const rows = farmModelRows(3);
    return {
      cost: cost,
      tradNet: rows[0].net,
      regenNet: rows[2].net,
      tradAcres: Math.ceil(cost / rows[0].net),
      regenAcres: Math.ceil(cost / rows[2].net),
    };
  }

  function nextDeed(state) {
    const cost = Zox.BUILDINGS.farm.cost;
    const open = Math.max(0, Zox.CORRIDOR.parcels.length - (state.farms ? state.farms.length : 0));
    const money = state.money || 0;
    const afford = Math.floor(money / cost);
    const pace = state.lastIncome && state.lastIncome.net > 0 ? state.lastIncome.net : Zox.LIC.income;
    if (open <= 0) {
      return {
        open: 0,
        afford: 0,
        cost: cost,
        need: 0,
        text: "Every square on the corridor is yours. Mature them, add villages, and light the rest of the rail.",
      };
    }
    if (afford >= 1) {
      const n = Math.min(afford, open);
      return {
        open: open,
        afford: n,
        cost: cost,
        need: 0,
        text:
          "Jar $" +
          money +
          " buys " +
          n +
          " more square" +
          (n === 1 ? "" : "s") +
          " at $" +
          cost +
          ". Regen net buys the next farm sooner than the chem model.",
      };
    }
    const need = cost - money;
    const seasons = pace > 0 ? Math.max(1, Math.ceil(need / pace)) : null;
    return {
      open: open,
      afford: 0,
      cost: cost,
      need: need,
      seasons: seasons,
      text:
        "Need $" +
        need +
        " more for the next square ($" +
        cost +
        ")." +
        (seasons ? " About " + seasons + " season" + (seasons === 1 ? "" : "s") + " of income." : ""),
    };
  }

  function decadeInfo(season, state) {
    const per = Zox.GOAL.seasonsPerDecade || 5;
    const decades = (state && state.horizonDecades) || Zox.GOAL.decades || 4;
    const yearsTotal = (state && state.horizonSeasons) || Zox.GOAL.seasons;
    const s = Math.max(1, season || 1);
    const decade = Math.min(decades, Math.ceil(s / per));
    const seasonInDecade = ((s - 1) % per) + 1;
    const year = s;
    const closing = seasonInDecade === per;
    return {
      decade: decade,
      decades: decades,
      seasonInDecade: seasonInDecade,
      seasonsPerDecade: per,
      year: year,
      yearsTotal: yearsTotal,
      closing: closing,
      short: "Decade " + decade + " of " + decades + " · Year " + seasonInDecade + " of " + per,
      label:
        "Decade " +
        decade +
        " of " +
        decades +
        " · Year " +
        seasonInDecade +
        " of " +
        per +
        " · Year " +
        year +
        " of " +
        yearsTotal,
    };
  }

  function countVillages(state) {
    return buildingsOf(state, "village").length;
  }

  function averageSnaps(state) {
    const farms = state.farms || [];
    const snaps = [];
    for (let i = 0; i < farms.length; i++) {
      if (farms[i].lastSnap) snaps.push(farms[i].lastSnap);
    }
    if (!snaps.length) return null;
    const led = {};
    const spec = Zox.LEDGER_SPEC || [];
    for (let g = 0; g < spec.length; g++) {
      const rows = spec[g].rows;
      for (let r = 0; r < rows.length; r++) led[rows[r].key] = 0;
    }
    let gross = 0;
    let inputs = 0;
    let net = 0;
    let nutr = 0;
    let carbon = 0;
    let mature = 0;
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      gross += s.gross;
      inputs += s.inputs;
      net += s.net;
      nutr += s.nutritionMult;
      carbon += s.carbonUnits;
      if (s.mature) mature += 1;
      const keys = Object.keys(led);
      for (let k = 0; k < keys.length; k++) {
        led[keys[k]] += Number(s.ledger && s.ledger[keys[k]]) || 0;
      }
    }
    const n = snaps.length;
    const keys = Object.keys(led);
    for (let k = 0; k < keys.length; k++) led[keys[k]] = roundTenth(led[keys[k]] / n);
    led.nutritionMult = Math.round((nutr / n) * 10) / 10;
    return {
      acres: n,
      mature: mature,
      gross: roundTenth(gross / n),
      inputs: roundTenth(inputs / n),
      net: roundTenth(net / n),
      nutritionMult: led.nutritionMult,
      carbonEach: roundTenth(carbon / n),
      carbon: carbon,
      ledger: led,
      snaps: snaps,
    };
  }

  function decadeSlice(history, decade) {
    const per = Zox.GOAL.seasonsPerDecade || 5;
    const start = (decade - 1) * per + 1;
    const end = decade * per;
    let carbon = 0;
    let nutrition = 0;
    let net = 0;
    let seasons = 0;
    const rows = history || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].season >= start && rows[i].season <= end) {
        carbon += rows[i].carbon || 0;
        nutrition += rows[i].nutrition || 0;
        net += rows[i].net || 0;
        seasons += 1;
      }
    }
    return { decade: decade, carbon: carbon, nutrition: nutrition, net: net, seasons: seasons };
  }

  /**
   * Snapshot for the decade “Great Job” card. Null unless `beforeSeason`
   * just finished and that year closed a decade. Numbers come from the
   * existing carbon tally and nutrition-above-traditional books.
   */
  function decadeJustClosed(beforeSeason, state) {
    if (!state || state.season !== beforeSeason + 1) return null;
    const info = decadeInfo(beforeSeason, state);
    if (!info.closing) return null;
    const slice = decadeSlice(state.history, info.decade);
    let nutritionTotal = 0;
    const rows = state.history || [];
    for (let i = 0; i < rows.length; i++) nutritionTotal += rows[i].nutrition || 0;
    const yours = averageSnaps(state);
    return {
      decade: info.decade,
      decades: info.decades,
      year: info.year,
      nextYear: state.season,
      yearsTotal: info.yearsTotal,
      carbonDecade: slice.carbon,
      carbonTotal: state.carbonTotal || 0,
      nutritionDecade: slice.nutrition,
      nutritionTotal: nutritionTotal,
      yoursMult: yours ? yours.nutritionMult : 0,
      tradMult: (Zox.NUTRITION && Zox.NUTRITION.traditional) || 1,
      regenMult: (Zox.NUTRITION && Zox.NUTRITION.regenerative) || 6,
    };
  }

  function seasonReportCard(state) {
    const finished = Math.max(1, (state.season || 1) - 1);
    const decade = decadeInfo(finished, state);
    const rows = farmModelRows(3);
    const trad = rows[0];
    const regen = rows[2];
    const rail = railProgress(state);
    const villages = countVillages(state);
    const acres = state.farms ? state.farms.length : 0;
    let matureAcres = 0;
    let graduated = 0;
    for (let i = 0; i < (state.farms || []).length; i++) {
      if (farmMature(state.farms[i])) matureAcres += 1;
      if (state.farms[i].lastSnap && state.farms[i].lastSnap.phase === "graduate") graduated += 1;
    }
    const inc = state.lastIncome || {};
    const wins = state.lastSeasonWins || {};
    const yours = averageSnaps(state);
    const deed = acresPerDeed();
    const jar = nextDeed(state);
    const decadeTotals = decadeSlice(state.history, decade.decade);
    return {
      decade: decade,
      decadeClose: !!decade.closing,
      decadeTotals: decadeTotals,
      inputsSpent: inc.inputs || 0,
      carbon: wins.earth || state.carbonSeason || 0,
      carbonTotal: state.carbonTotal || 0,
      nutrition: wins.population || state.nutritionExtra || 0,
      netPerAcreTrad: trad.net,
      netPerAcreRegen: regen.net,
      acres: acres,
      matureAcres: matureAcres,
      graduated: graduated,
      villages: villages,
      railPct: rail.pct,
      railLit: rail.lit,
      railNeed: rail.need,
      villageBoost: rail.villageBoost || 0,
      villagePct: rail.villagePct || 0,
      money: state.money,
      health: state.health,
      incomeNet: inc.net || 0,
      graze: inc.graze || 0,
      villageLease: inc.villageLease || 0,
      ledgerTrad: trad.ledger,
      ledgerRegen: regen.ledger,
      ledgerYours: yours ? yours.ledger : null,
      yours: yours,
      deed: deed,
      jar: jar,
      trad: trad,
      regen: regen,
    };
  }

  function emptyIncome() {
    return {
      crops: 0,
      cropGross: 0,
      inputs: 0,
      graze: 0,
      apartments: 0,
      credits: 0,
      other: 0,
      upkeep: 0,
      villageLease: 0,
      net: 0,
    };
  }

  function worksSpec() {
    return Zox.VILLAGE_WORKS || { lease: 6, sale: 84, stages: ["site", "framing", "open"] };
  }

  function ensureVillageBooks(state) {
    if (!state.villageBooks) state.villageBooks = { sales: 0, saleCash: 0, lease: 0 };
    return state.villageBooks;
  }

  function openLot(farm) {
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

  function advanceVillageWorks(state) {
    const farms = state.farms || [];
    for (let i = 0; i < farms.length; i++) {
      const farm = farms[i];
      const n = Zox.Map.tilesOf(farm.tiles, "village").length;
      if (!n) {
        farm.villageWorks = null;
        continue;
      }
      if (!farm.villageWorks) {
        farm.villageWorks = { stage: "site", sold: false };
        continue;
      }
      const w = farm.villageWorks;
      if (w.stage === "site") w.stage = "framing";
      else if (w.stage === "framing") w.stage = "open";
    }
  }

  function villageLeaseDue(state) {
    const rate = worksSpec().lease;
    let total = 0;
    const farms = state.farms || [];
    for (let i = 0; i < farms.length; i++) {
      const farm = farms[i];
      const w = farm.villageWorks;
      if (!w || w.sold || w.stage !== "open") continue;
      if (!Zox.Map.tilesOf(farm.tiles, "village").length) continue;
      total += rate;
    }
    return total;
  }

  function corridorVillages(state) {
    const spine = spineParcels();
    const spec = worksSpec();
    const cost = Zox.BUILDINGS.village.cost;
    const out = [];
    for (let i = 0; i < spine.length; i++) {
      const parcel = spine[i];
      const farm = getFarmByParcel(state, parcel.id);
      const mature = farmMature(farm);
      const has = !!(farm && Zox.Map.tilesOf(farm.tiles, "village").length);
      const w = farm && farm.villageWorks;
      const stage = has ? (w && w.stage) || "site" : "";
      const sold = !!(w && w.sold);
      let action = "wait";
      if (!farm) action = "need-deed";
      else if (!mature) action = "converting";
      else if (!has) action = "fund";
      else if (stage !== "open") action = "building";
      else if (!sold) action = "sell";
      else action = "sold";
      const prog = farm ? farmProgress(farm) : null;
      out.push({
        parcelId: parcel.id,
        farmId: farm ? farm.id : "",
        name: parcel.mapLabel || parcel.name,
        fullName: parcel.name,
        stage: stage,
        sold: sold,
        action: action,
        year: prog ? prog.year : 0,
        mature: mature,
        cost: cost,
        lease: spec.lease,
        sale: spec.sale,
      });
    }
    return out;
  }

  /**
   * Rail progress: parcels ordered west→east.
   * A segment between parcel i and i+1 lights when both farms are owned and mature.
   */
  function railProgress(state) {
    const parcels = spineParcels().slice().sort((a, b) => a.order - b.order);
    const owned = [];
    const mature = [];
    for (let i = 0; i < parcels.length; i++) {
      const farm = getFarmByParcel(state, parcels[i].id);
      owned.push(!!farm);
      mature.push(!!(farm && farmMature(farm)));
    }
    const segments = [];
    let lit = 0;
    for (let i = 0; i < parcels.length - 1; i++) {
      const on = mature[i] && mature[i + 1];
      if (on) lit += 1;
      segments.push({
        from: parcels[i].id,
        to: parcels[i + 1].id,
        lit: on,
      });
    }
    const need = Math.max(1, parcels.length - 1);
    const matureCount = mature.filter(Boolean).length;
    const ownedCount = owned.filter(Boolean).length;
    const villages = buildingsOf(state, "village");
    const vBoost = villages.length * ((Zox.BUILDINGS.village && Zox.BUILDINGS.village.railBoost) || 0);
    const rawPct = Math.round((lit / need) * 100);
    const villagePct = Math.min(24, vBoost * 8);
    const pct = Math.min(100, rawPct + villagePct);
    return {
      parcels,
      segments,
      lit,
      need,
      pct: pct,
      rawPct: rawPct,
      villageBoost: vBoost,
      villagePct: villagePct,
      villages: villages.length,
      matureCount,
      ownedCount,
      total: parcels.length,
      ready: lit >= need,
    };
  }

  function freshState(seed) {
    const s = seed == null ? (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0 : seed;
    return {
      seed: s,
      tiles: [],
      farms: [],
      nextFarmId: 1,
      money: Zox.START.money,
      waste: Zox.START.waste,
      nature: Zox.START.nature,
      happiness: Zox.START.happiness,
      health: Zox.START.health,
      carbonSeason: Zox.START.carbonSeason || 0,
      carbonTotal: Zox.START.carbonTotal || 0,
      villageBooks: { sales: 0, saleCash: 0, lease: 0 },
      energySupply: 0,
      energyDemand: 0,
      population: 0,
      season: Zox.START.season,
      lastDelta: null,
      lastIncome: emptyIncome(),
      status: "playing",
      endReason: "",
      score: 0,
      wonOnSeason: null,
      history: [],
      log: [
        {
          season: 1,
          text: "Opening capital covers the first two squares. Pull a title deed off the mosaic, then move it to Purchase when the jar can cover it.",
        },
      ],
    };
  }

  function snapshotMeters(state) {
    return {
      money: state.money,
      waste: state.waste,
      nature: state.nature,
      happiness: state.happiness,
      health: state.health,
      carbonSeason: state.carbonSeason,
      population: state.population,
      energySupply: state.energySupply,
      energyDemand: state.energyDemand,
    };
  }

  function recountEnergyAndPeople(state) {
    const homes = buildingsOf(state, "home");
    const yards = buildingsOf(state, "solar");
    const villages = buildingsOf(state, "village");
    const vDef = Zox.BUILDINGS.village;
    state.population =
      homes.length * Zox.BUILDINGS.home.pop +
      villages.length * ((vDef && vDef.pop) || 0);
    state.energyDemand =
      homes.length * Zox.BUILDINGS.home.energyUse +
      villages.length * ((vDef && vDef.energyUse) || 0);
    state.energySupply = yards.length * Zox.BUILDINGS.solar.energy;
  }

  function canBuildOn(tile) {
    if (!tile) return { ok: false, why: "That is off the map." };
    if (tile.terrain === "water") return { ok: false, why: "Creek stays creek." };
    if (tile.landmark === "barn") return { ok: false, why: "That's the farmhouse. Place in the fields." };
    if (tile.building) return { ok: false, why: "Someone already claimed that lot." };
    return { ok: true, why: "" };
  }

  function canBuyParcel(state, parcelId) {
    if (state.status !== "playing") return { ok: false, why: "This corridor already found its ending." };
    const parcel = getParcel(parcelId);
    if (!parcel) return { ok: false, why: "That deed is not on the corridor." };
    if (getFarmByParcel(state, parcelId)) return { ok: false, why: "You already hold that deed. Open the card and walk the farm." };
    const def = Zox.BUILDINGS.farm;
    if (state.money < def.cost) {
      return { ok: false, why: "Need $" + def.cost + ". The jar has $" + state.money + "." };
    }
    return { ok: true, why: "", parcel: parcel };
  }

  function buyParcel(state, parcelId) {
    const check = canBuyParcel(state, parcelId);
    if (!check.ok) return check;
    const parcel = check.parcel;
    const def = Zox.BUILDINGS.farm;
    state.money -= def.cost;
    const farm = {
      id: "farm-" + state.nextFarmId,
      name: parcel.name,
      parcelId: parcel.id,
      wr: 0,
      wc: 0,
      regenAge: 0,
      tiles: Zox.Map.generateFarmMap(
        Zox.FARM_MAP.size,
        state.seed ^ (parcel.order * 97 + state.nextFarmId * 17 + parcel.x * 3)
      ),
    };
    state.nextFarmId += 1;
    state.farms.push(farm);
    recountEnergyAndPeople(state);
    const rail = railProgress(state);
    pushLog(
      state,
      farm.name +
        " is yours — 1 acre, $" +
        def.cost +
        " from the jar." +
        (parcel.spine ? " It sits on the green rail." : "") +
        " Walk the fields. Rail farms mature " +
        rail.matureCount +
        "/" +
        rail.total +
        "."
    );
    return { ok: true, why: "", enter: farm.id };
  }

  function canPlace(state, r, c, buildingId, farmId) {
    if (state.status !== "playing") return { ok: false, why: "This corridor already found its ending." };
    if (buildingId === "apartment") {
      return { ok: false, why: "The LIC building is in Long Island City, not on this corridor." };
    }
    if (buildingId === "farm") {
      return { ok: false, why: "Buy a square on the corridor map — pull its title deed first." };
    }
    if (!farmId) {
      return { ok: false, why: "Improvements go on a farm. Buy a square, then walk the fields." };
    }
    const farm = getFarm(state, farmId);
    if (!farm) return { ok: false, why: "That farm is not on the books." };
    const def = Zox.BUILDINGS[buildingId];
    if (!def) return { ok: false, why: "Unknown building." };
    if (def.requiresMature && !farmMature(farm)) {
      return { ok: false, why: "Eco-villages unlock beside a mature regen farm — finish the five-year convert first." };
    }
    const tile = Zox.Map.getTile(farm.tiles, r, c);
    const land = canBuildOn(tile);
    if (!land.ok) return land;
    if (state.money < def.cost) {
      return { ok: false, why: "Need $" + def.cost + ". The jar has $" + state.money + "." };
    }
    return { ok: true, why: "" };
  }

  function place(state, r, c, buildingId, farmId) {
    if (buildingId === "farm") {
      return { ok: false, why: "Buy a square on the corridor map." };
    }
    const check = canPlace(state, r, c, buildingId, farmId);
    if (!check.ok) return check;

    const farm = getFarm(state, farmId);
    const tile = farm.tiles[r][c];
    const def = Zox.BUILDINGS[buildingId];
    state.money -= def.cost;
    if (tile.terrain === "grove") {
      state.nature = clamp(state.nature - 7, 0, 100);
      tile.terrain = "meadow";
      pushLog(state, "Cleared a grove on " + farm.name + " for the " + def.short.toLowerCase() + ".");
    }
    tile.building = buildingId;
    recountEnergyAndPeople(state);
    const notes = {
      home: "A house on " + farm.name + ". Four more names on the mailbox.",
      solar: "The yard on " + farm.name + " starts humming.",
      compost: "The heap is working on " + farm.name + ". It does not smell like a lecture.",
      rail: "Rail in the grass on " + farm.name + ". Link another tile and the far lots join the talk.",
      park: "An orchard on " + farm.name + " for Sunday. Someone will bring a pie.",
      village:
        "Eco-village at " +
        farm.name +
        " — site work starts ($" +
        def.cost +
        "). Next seasons: framing, then open. Open villages lease $" +
        worksSpec().lease +
        " a season or sell for $" +
        worksSpec().sale +
        ". The station stays. The rail is not built yet.",
    };
    if (buildingId === "village" && !farm.villageWorks) {
      farm.villageWorks = { stage: "site", sold: false };
    }
    pushLog(state, notes[buildingId] || "Built on " + farm.name + ".");
    return { ok: true, why: "" };
  }

  function fundStopVillage(state, parcelId) {
    const parcel = getParcel(parcelId);
    if (!parcel || !parcel.spine) {
      return { ok: false, why: "Eco-villages on the corridor go at the named rail stops." };
    }
    const farm = getFarmByParcel(state, parcelId);
    if (!farm) return { ok: false, why: "Buy " + parcel.name + " first. The village waits on that future stop." };
    if (!farmMature(farm)) {
      const prog = farmProgress(farm);
      return {
        ok: false,
        why: farm.name + " is still converting (year " + prog.year + " of 5). The eco-village waits for regenerative ground.",
      };
    }
    if (Zox.Map.tilesOf(farm.tiles, "village").length) {
      return { ok: false, why: "A village is already underway at " + farm.name + "." };
    }
    const lot = openLot(farm);
    if (!lot) return { ok: false, why: "No open lot on " + farm.name + "." };
    return place(state, lot.r, lot.c, "village", farm.id);
  }

  function sellVillage(state, farmId) {
    const farm = getFarm(state, farmId);
    if (!farm) return { ok: false, why: "That farm is not on the books." };
    if (!Zox.Map.tilesOf(farm.tiles, "village").length) {
      return { ok: false, why: "No eco-village at " + farm.name + "." };
    }
    if (!farm.villageWorks) farm.villageWorks = { stage: "site", sold: false };
    const w = farm.villageWorks;
    if (w.stage !== "open") {
      const word = w.stage === "framing" ? "framing" : "site work";
      return { ok: false, why: farm.name + " is still in " + word + ". Sell it once the village is open." };
    }
    if (w.sold) return { ok: false, why: "Already sold. The station stays at " + farm.name + ". The lease does not." };
    const price = worksSpec().sale;
    w.sold = true;
    w.sale = price;
    state.money = Math.round(state.money + price);
    const books = ensureVillageBooks(state);
    books.sales += 1;
    books.saleCash += price;
    pushLog(
      state,
      "Sold the open eco-village at " +
        farm.name +
        " for $" +
        price +
        ". Build was $" +
        Zox.BUILDINGS.village.cost +
        ". The station stays on the line. Lease stops. Upkeep stays."
    );
    return { ok: true, why: "", price: price };
  }

  function canClear(state, r, c, farmId) {
    if (state.status !== "playing") return { ok: false, why: "This corridor already found its ending." };
    if (!farmId) {
      return { ok: false, why: "Nothing to pull on the corridor map. Walk a farm to clear improvements." };
    }
    const farm = getFarm(state, farmId);
    if (!farm) return { ok: false, why: "That farm is not on the books." };
    const tile = Zox.Map.getTile(farm.tiles, r, c);
    if (!tile || !tile.building) return { ok: false, why: "Nothing to pull up." };
    if (tile.landmark === "barn") return { ok: false, why: "The farmhouse stays." };
    return { ok: true, why: "" };
  }

  function clearLot(state, r, c, farmId) {
    const check = canClear(state, r, c, farmId);
    if (!check.ok) return check;
    const farm = getFarm(state, farmId);
    const tile = farm.tiles[r][c];
    const def = Zox.BUILDINGS[tile.building];
    if (!def) {
      tile.building = null;
      recountEnergyAndPeople(state);
      return { ok: true, why: "" };
    }
    const refund = Math.floor(def.cost * 0.5);
    const wasVillage = tile.building === "village";
    tile.building = null;
    if (wasVillage && !Zox.Map.tilesOf(farm.tiles, "village").length) farm.villageWorks = null;
    state.money += refund;
    recountEnergyAndPeople(state);
    pushLog(state, "Cleared a " + def.short.toLowerCase() + " on " + farm.name + ". $" + refund + " back in the jar.");
    return { ok: true, why: "" };
  }

  function inspectParcel(state, parcelId) {
    const parcel = getParcel(parcelId);
    if (!parcel) return null;
    const farm = getFarmByParcel(state, parcelId);
    const cost = Zox.BUILDINGS.farm.cost;
    const owner = Zox.Parcels && Zox.Parcels.deedOwner ? Zox.Parcels.deedOwner(parcel, farm) : "";
    const acres = parcel.acres || 1;
    if (farm) {
      const books = farmBooks(farm);
      const bits = [
        "Owner " + owner,
        acres + " acre" + (acres === 1 ? "" : "s"),
        books.mature ? "Zox regenerative — no chem bill." : books.label,
        "Gross $" + books.gross + " − chem $" + books.inputs + " = net $" + books.net,
        "Open the deed card and walk this farm. Click the card for a picture. Improvements stay on its board.",
      ];
      if (farm.villageWorks && Zox.Map.tilesOf(farm.tiles, "village").length) {
        const spec = worksSpec();
        const w = farm.villageWorks;
        if (w.sold) bits.push("Eco-village sold for $" + (w.sale || spec.sale) + ". Station stays. Lease stopped.");
        else if (w.stage === "open") bits.push("Eco-village open. Lease $" + spec.lease + " a season, or sell for $" + spec.sale + ".");
        else bits.push("Eco-village under construction: " + (w.stage === "framing" ? "framing" : "site") + ". Next it " + (w.stage === "framing" ? "opens" : "frames") + ".");
      } else if (parcel.spine && books.mature) {
        bits.push("Named stop. Fund an eco-village here — $" + Zox.BUILDINGS.village.cost + " — then site, framing, open.");
      }
      return { parcelId, parcel, farm, title: farm.name, lines: bits, owned: true };
    }
    return {
      parcelId,
      parcel,
      farm: null,
      title: parcel.name,
      lines: [
        "Owner " + owner + " — for sale",
        acres + " acre · $" + cost,
        parcel.spine
          ? "Named square on the green rail. Mature it and the line can light."
          : "Farmland square. Pull the title deed, then move the card to Purchase.",
        "Apartment rent from Long Island City helps the jar cover the next deed.",
      ],
      owned: false,
    };
  }

  function inspect(state, r, c, farmId) {
    if (farmId) {
      const farm = getFarm(state, farmId);
      if (!farm) return null;
      const tile = Zox.Map.getTile(farm.tiles, r, c);
      if (!tile) return null;
      const connected = Zox.Map.connectedSet(farm.tiles);
      const def = tile.building ? Zox.BUILDINGS[tile.building] : null;
      const nearCompost = Zox.Map.hasNeighborBuilding(farm.tiles, r, c, "compost", 2);
      const nearPark = Zox.Map.hasNeighborBuilding(farm.tiles, r, c, "park", 1);
      const onLine = Zox.Map.isConnected(connected, r, c);
      const bits = [Zox.Map.describeTerrain(tile.terrain)];
      let title = def ? def.name : tile.landmark === "barn" ? "Farmhouse" : "Working soil";
      if (def) bits.push(def.name);
      else if (tile.landmark === "barn") bits.push("Farmhouse on " + farm.name);
      else bits.push("Field on " + farm.name);
      const books = farmBooks(farm);
      bits.push(farm.name + " — " + books.label);
      bits.push("Gross $" + books.gross + " − chem $" + books.inputs + " = net $" + books.net);
      if (tile.terrain === "water") bits.push("Leave the ditch. The farm drinks here.");
      if (tile.terrain === "grove" && !tile.building) bits.push("Standing grove. A little carbon credit each season.");
      if (nearCompost) bits.push("In compost range");
      if (nearPark) bits.push("Beside an orchard");
      if (onLine && def) bits.push("On the rail");
      return { r, c, tile, def, farm, title, lines: bits };
    }
    return null;
  }


  /**
   * Extra nutrition above traditional baseline (=1) delivered this season.
   * Mature regen portions count at 6×, converting at 2× → additional = portions × (q − 1).
   */
  function nutritionMultOf(farm) {
    if (farm.lastSnap && farm.lastSnap.nutritionMult) return farm.lastSnap.nutritionMult;
    const books = farmBooks(farm);
    return books && books.ledger ? books.ledger.nutritionMult : Zox.NUTRITION.converting;
  }

  function nutritionExtraSeason(state, parks) {
    const N = Zox.NUTRITION;
    let extra = 0;
    for (let i = 0; i < state.farms.length; i++) {
      const q = nutritionMultOf(state.farms[i]);
      extra += N.farmPortions * Math.max(0, q - N.traditional);
    }
    if (parks && parks.length) {
      extra += parks.length * N.parkBonus * Math.max(0, (N.converting - N.traditional));
    }
    return Math.round(extra);
  }

  function carbonSeasonUnits(state, parks, groves) {
    const C = Zox.CARBON;
    let units = 0;
    for (let i = 0; i < state.farms.length; i++) {
      const snap = state.farms[i].lastSnap;
      if (snap && snap.carbonUnits != null) units += snap.carbonUnits;
      else units += farmMature(state.farms[i]) ? C.matureFarm : C.convertingFarm;
    }
    units += parks.length * C.park;
    units += Math.min(C.groveCap, groves.length * C.grove);
    return Math.round(units);
  }

  /**
   * Population health 0–100 from nutrition quality × coverage.
   * Mature regen = 6× traditional; converting ≈ 2×. Empty corridor still
   * needs enough regen nutrition on the board to climb.
   */
  function computeHealthTarget(state, parks) {
    const N = Zox.NUTRITION;
    const factor = Zox.GOAL.nutritionFactor || N.regenerative;
    let weighted = 0;
    let portions = 0;
    for (let i = 0; i < state.farms.length; i++) {
      const q = nutritionMultOf(state.farms[i]);
      weighted += q * N.farmPortions;
      portions += N.farmPortions;
    }
    weighted += parks.length * N.parkBonus;
    const people = state.population || 0;
    const meanQ = portions > 0 ? weighted / portions : 0;
    let adequacy;
    if (people <= 0) {
      const needEmpty = N.farmPortions * 2;
      adequacy = Math.min(1, portions / needEmpty);
    } else {
      adequacy = Math.min(1.15, portions / people);
    }
    const qualityRatio = meanQ / factor;
    return clamp(Math.round(qualityRatio * adequacy * 100), 0, 100);
  }

  function evaluateGoals(state) {
    return {
      carbon: state.carbonSeason >= Zox.GOAL.carbonMin,
      health: state.health >= Zox.GOAL.healthMin,
      solvent: state.money > 0,
    };
  }

  function goalsMet(flags) {
    return flags.carbon && flags.health && flags.solvent;
  }

  function computeScore(state) {
    const leftover = Math.max(0, Zox.GOAL.seasons - state.season + 1);
    const rail = railProgress(state);
    return Math.max(
      0,
      Math.round(
        state.carbonSeason * 5 +
          state.health * 3 +
          leftover * 8 +
          rail.lit * 6 +
          state.money * 0.1
      )
    );
  }

  function maybeEnd(state) {
    /* Autopilot keeps the clock running through its own horizon. Manual play is unchanged. */
    if (state && state.autopilotHold) return;
    const flags = evaluateGoals(state);
    if (goalsMet(flags)) {
      state.status = "won";
      state.wonOnSeason = Math.max(1, state.season - 1);
      const wonDecade = decadeInfo(state.wonOnSeason, state);
      state.endReason =
        Zox.COPY.win +
        " That happened in " +
        wonDecade.short +
        " (year " +
        wonDecade.year +
        " of " +
        wonDecade.yearsTotal +
        ").";
      state.score = computeScore(state);
      pushLog(state, "Carbon locked in the soil this season. People are healthier on 6× regen food. This is a village.");
      return;
    }
    if (state.money < 0) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseBroke;
      state.score = computeScore(state);
      return;
    }
    const natureFloor = Zox.GOAL.natureCollapse != null ? Zox.GOAL.natureCollapse : 6;
    const wasteCeil = Zox.GOAL.wasteDisaster != null ? Zox.GOAL.wasteDisaster : 96;
    if (state.nature <= natureFloor) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseNature;
      state.score = computeScore(state);
      return;
    }
    if (state.waste >= wasteCeil) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseWaste;
      state.score = computeScore(state);
      return;
    }
    const seasonCap = (state && state.horizonSeasons) || Zox.GOAL.seasons;
    if (state.season > seasonCap) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseTime;
      state.score = computeScore(state);
    }
  }

  function runSeason(state) {
    if (state.status !== "playing") return { ok: false, why: "The season already turned." };

    const before = snapshotMeters(state);
    const homes = buildingsOf(state, "home");
    const yards = buildingsOf(state, "solar");
    const hubs = buildingsOf(state, "compost");
    const parks = buildingsOf(state, "park");
    const rails = buildingsOf(state, "rail");
    const groves = standingGroves(state);

    advanceVillageWorks(state);

    const justMatured = [];
    const seasonSnaps = [];
    for (let i = 0; i < state.farms.length; i++) {
      const snap = resolveFarmSeason(state.farms[i]);
      seasonSnaps.push(snap);
      if (snap.justMatured) justMatured.push(state.farms[i]);
    }

    let railLive = false;
    const villageLots = buildingsOf(state, "village");
    const vDef = Zox.BUILDINGS.village;
    const energySupply = yards.length * Zox.BUILDINGS.solar.energy;
    const energyDemand =
      homes.length * Zox.BUILDINGS.home.energyUse +
      villageLots.length * ((vDef && vDef.energyUse) || 0);
    let energyLeft = energySupply;
    let poweredHomes = 0;
    homes.forEach(() => {
      if (energyLeft >= Zox.BUILDINGS.home.energyUse) {
        poweredHomes += 1;
        energyLeft -= Zox.BUILDINGS.home.energyUse;
      }
    });
    let poweredVillages = 0;
    villageLots.forEach(() => {
      const need = (vDef && vDef.energyUse) || 0;
      if (energyLeft >= need) {
        poweredVillages += 1;
        energyLeft -= need;
      }
    });
    const unpowered = homes.length - poweredHomes + (villageLots.length - poweredVillages);
    const people =
      homes.length * Zox.BUILDINGS.home.pop +
      villageLots.length * ((vDef && vDef.pop) || 0);

    const streams = emptyIncome();
    let wasteIn = 0;
    let wasteOut = hubs.length * Zox.BUILDINGS.compost.wasteSink + parks.length * Zox.BUILDINGS.park.wasteSink;
    let natureDelta = groves.length * 0.35 + hubs.length * Zox.BUILDINGS.compost.nature;
    let happyDelta = 0;

    for (let i = 0; i < state.farms.length; i++) {
      const farm = state.farms[i];
      const y = farm.lastSnap || seasonSnaps[i];
      const connected = Zox.Map.connectedSet(farm.tiles);
      const farmRail = Zox.Map.railNetworks(farm.tiles).some((n) => n.length >= 2);
      if (farmRail) railLive = true;
      const hasCompost = Zox.Map.tilesOf(farm.tiles, "compost").length > 0;
      const irrigated = Zox.Map.countTerrain(farm.tiles, "water") > 0;
      let pay = y.gross;
      if (irrigated) pay += 3;
      if (hasCompost) {
        pay += 2;
        natureDelta += 1;
      }
      if (farmRail) pay = Math.round(pay * 1.35);
      streams.cropGross += pay;
      streams.inputs += y.inputs;
      streams.crops += pay - y.inputs;
      streams.credits += y.credits;
      streams.upkeep += Zox.BUILDINGS.farm.upkeep;
      const factor = hasCompost ? Zox.BUILDINGS.compost.wasteFactor : 1;
      wasteIn += y.waste * factor;
      natureDelta += y.nature;
      void connected;
    }

    homes.forEach((home, i) => {
      const def = Zox.BUILDINGS.home;
      const board = home.farm.tiles;
      const powered = i < poweredHomes;
      const factor = Zox.Map.hasNeighborBuilding(board, home.tile.r, home.tile.c, "compost", 2)
        ? Zox.BUILDINGS.compost.wasteFactor
        : 1;
      wasteIn += def.waste * factor * (powered ? 1 : 1.15);
      streams.upkeep += def.upkeep;
      if (powered) streams.other += 2;
      if (Zox.Map.isConnected(Zox.Map.connectedSet(board), home.tile.r, home.tile.c)) happyDelta += 2;
      if (Zox.Map.hasNeighborBuilding(board, home.tile.r, home.tile.c, "park", 1)) happyDelta += 2;
      if (powered) happyDelta += 1;
      else happyDelta -= 4;
    });

    // End-of-season crop rent: animals graze residue, manure stays — revenue
    for (let i = 0; i < state.farms.length; i++) {
      const snap = state.farms[i].lastSnap;
      const rent = snap && snap.mature ? Zox.GRAZE_RENT.mature : Zox.GRAZE_RENT.converting;
      streams.graze += rent;
    }

    streams.apartments = Zox.LIC.income;

    for (let i = 0; i < yards.length; i++) streams.upkeep += Zox.BUILDINGS.solar.upkeep;
    for (let i = 0; i < hubs.length; i++) streams.upkeep += Zox.BUILDINGS.compost.upkeep;
    for (let i = 0; i < rails.length; i++) streams.upkeep += Zox.BUILDINGS.rail.upkeep;
    for (let i = 0; i < villageLots.length; i++) {
      streams.upkeep += Zox.BUILDINGS.village.upkeep;
      wasteIn += (vDef && vDef.waste) || 0;
    }

    natureDelta += parks.length * Zox.BUILDINGS.park.nature;
    happyDelta += parks.length * Zox.BUILDINGS.park.happy;
    streams.credits += parks.length * (Zox.BUILDINGS.park.credits || Zox.CARBON.creditPark || 0);
    const groveCredit = Zox.CARBON.creditGrove != null ? Zox.CARBON.creditGrove : Zox.CARBON.grove;
    const groveCreditCap = Zox.CARBON.creditGroveCap != null ? Zox.CARBON.creditGroveCap : Zox.CARBON.groveCap;
    streams.credits += Math.min(groveCreditCap, groves.length * groveCredit);

    if (people >= 8 && unpowered === 0) {
      streams.other += Math.floor(people / 4) * 2;
    }

    if (energySupply < energyDemand) streams.other -= 4;

    const corridorRail = railProgress(state);
    if (corridorRail.lit > 0) happyDelta += corridorRail.lit;
    if (corridorRail.ready) {
      streams.other += 6;
      happyDelta += 3;
    }
    const villageCount = buildingsOf(state, "village").length;
    if (villageCount > 0) {
      streams.other += villageCount * 2;
      happyDelta += villageCount;
      /* Eco-villages near regen farms hasten the corridor story */
      streams.credits += villageCount;
    }

    const lease = villageLeaseDue(state);
    streams.villageLease = lease;
    if (lease) ensureVillageBooks(state).lease += lease;

    streams.net = Math.round(
      streams.crops + streams.graze + streams.apartments + streams.credits + streams.other + lease - streams.upkeep
    );
    state.money = Math.round(state.money + streams.net);
    state.waste = clamp(Math.round(state.waste + wasteIn - wasteOut), 0, 100);

    if (state.waste > 24) natureDelta -= (state.waste - 24) * 0.16;
    if (state.waste > 52) natureDelta *= 0.4;
    if (state.waste > 55) happyDelta -= 4;
    if (state.waste > 75) happyDelta -= 5;
    if (state.nature > 62) happyDelta += 2;
    if (state.nature < 32) happyDelta -= 3;
    if (railLive) happyDelta += 2;
    if (people === 0) happyDelta += 0;
    else if (energySupply >= energyDemand) happyDelta += 2;

    state.nature = clamp(Math.round(state.nature + natureDelta), 0, 100);
    state.happiness = clamp(Math.round(state.happiness + happyDelta * 0.65 + (50 - state.happiness) * 0.08), 0, 100);

    state.energySupply = energySupply;
    state.energyDemand = energyDemand;
    state.population = people;

    const sequestered = carbonSeasonUnits(state, parks, groves);
    state.carbonSeason = sequestered;
    state.carbonTotal = (state.carbonTotal || 0) + sequestered;

    const nutritionExtra = nutritionExtraSeason(state, parks);
    state.nutritionExtra = nutritionExtra;
    state.lastSeasonWins = {
      earth: sequestered,
      population: nutritionExtra,
      season: state.season,
    };

    const villages = buildingsOf(state, "village");
    let villageHealth = 0;
    let villageNutrition = 0;
    for (let vi = 0; vi < villages.length; vi++) {
      const vdef = Zox.BUILDINGS.village;
      villageHealth += vdef.healthBoost || 0;
      villageNutrition += vdef.nutritionBoost || 0;
    }
    const healthTarget = clamp(computeHealthTarget(state, parks) + villageHealth, 0, 100);
    state.health = clamp(
      Math.round(state.health * 0.35 + healthTarget * 0.65),
      0,
      100
    );
    if (villageNutrition) {
      state.nutritionExtra = (state.nutritionExtra || 0) + villageNutrition;
    }

    state.lastIncome = streams;
    if (state.lastSeasonWins) {
      state.lastSeasonWins.population = state.nutritionExtra || state.lastSeasonWins.population;
      state.lastSeasonWins.villages = buildingsOf(state, "village").length;
    }
    const finishedSeason = state.season;
    state.history = state.history || [];
    state.history.push({
      season: finishedSeason,
      carbon: state.carbonSeason || 0,
      nutrition: state.nutritionExtra || 0,
      net: streams.net || 0,
      inputs: streams.inputs || 0,
      acres: state.farms.length,
      villages: buildingsOf(state, "village").length,
      health: state.health,
    });
    state.season += 1;
    state.lastReport = seasonReportCard(state);

    const after = snapshotMeters(state);
    state.lastDelta = {
      money: after.money - before.money,
      waste: after.waste - before.waste,
      nature: after.nature - before.nature,
      happiness: after.happiness - before.happiness,
      health: after.health - before.health,
      carbon: after.carbonSeason - (before.carbonSeason || 0),
      population: after.population - before.population,
    };

    const flavor = [];
    if (justMatured.length) {
      flavor.push(
        justMatured.length > 1
          ? "Graduation season. Those farms dropped the chem bill — manure stays, nutrition is 6×, and the rail can light."
          : justMatured[0].name + " graduated. Chem bill $0, graze and manure stay, and this acre can light the rail."
      );
    }
    if (corridorRail.ready && !flavor.length) {
      flavor.push("The green rail from Detroit to Jersey City is lit solid. That was the long game.");
    }
    if (unpowered > 0) flavor.push("Lights flickered. Someone read by the window.");
    if (!flavor.length && state.farms.length && state.money >= Zox.BUILDINGS.farm.cost) {
      flavor.push("LIC rent is in the jar from Long Island City. Buy the next farm along the corridor.");
    }
    if (!flavor.length && state.farms.length === 0) {
      flavor.push("LIC rent landed from the city. Buy a deed on the corridor — then walk that farm.");
    }
    if (!flavor.length && streams.crops >= 12) {
      flavor.push("The crop check hit the jar and left a little for the next field along the rail.");
    }
    if (!flavor.length && sequestered >= Zox.GOAL.carbonMin) {
      flavor.push("Soil locked " + sequestered + " carbon this season — enough to clear the win mark.");
    }
    if (!flavor.length && state.health >= Zox.GOAL.healthMin && sequestered >= 12) {
      flavor.push("People are healthier on regen food. Carbon this season: " + sequestered + ".");
    }
    if (streams.graze > 0 && !flavor.length) {
      flavor.push("Crop rent from the animals — they ate the stubble and left manure. +$" + streams.graze + ".");
    }
    if (!flavor.length && streams.credits >= 4) {
      flavor.push("Carbon credits $ from the living lots — separate from sequestration. Soil locked " + sequestered + " this season.");
    }
    if (hubs.length && wasteIn - wasteOut < 1) flavor.push("The heap ate the week's scraps.");
    if (railLive && !flavor.length) flavor.push("The rail made the far lots feel like part of the farm.");
    if (state.health >= 70 && sequestered >= 16 && !flavor.length) {
      flavor.push("Health " + state.health + ", carbon sequestered " + sequestered + " this season.");
    }
    if (state.nature >= 70 && state.waste <= 22 && !flavor.length) flavor.push("Creek's running clearer this week.");
    if (!flavor.length) flavor.push("Another season. Crops pay for the next field along the line. Carbon " + sequestered + " sequestered.");
    const closed = decadeInfo(finishedSeason, state);
    if (closed.closing) {
      const tally = decadeSlice(state.history, closed.decade);
      pushLog(
        state,
        "Decade " +
          closed.decade +
          " of " +
          closed.decades +
          " closes. This decade locked " +
          tally.carbon +
          " carbon. The rail to Jersey City is still a long build."
      );
    }
    pushLog(state, flavor[0]);

    maybeEnd(state);
    return { ok: true, why: "" };
  }

  function goalProgress(state) {
    const flags = evaluateGoals(state);
    return [
      {
        key: "carbon",
        label: "Carbon",
        have: state.carbonSeason || 0,
        need: Zox.GOAL.carbonMin,
        ok: flags.carbon,
        better: "higher",
      },
      {
        key: "health",
        label: "Health",
        have: state.health || 0,
        need: Zox.GOAL.healthMin,
        ok: flags.health,
        better: "higher",
      },
      {
        key: "solvent",
        label: "Solvent",
        have: state.money,
        need: 1,
        ok: flags.solvent,
        better: "higher",
      },
    ];
  }

  Zox.Sim = {
    freshState,
    recountEnergyAndPeople,
    canPlace,
    place,
    canBuyParcel,
    buyParcel,
    canClear,
    clearLot,
    inspect,
    inspectParcel,
    runSeason,
    evaluateGoals,
    goalsMet,
    goalProgress,
    computeScore,
    farmMature,
    farmProgress,
    farmYield,
    farmBooks,
    farmModelRows,
    farmLedgerFor,
    cashSum,
    acresPerDeed,
    nextDeed,
    seasonResolution,
    resolveFarmSeason,
    decadeInfo,
    decadeJustClosed,
    seasonReportCard,
    countVillages,
    corridorVillages,
    fundStopVillage,
    sellVillage,
    getFarm,
    getFarmByParcel,
    getParcel,
    resolveFarm,
    tilesForView,
    buildingsOf,
    railProgress,
    carbonSeasonUnits,
    nutritionExtraSeason,
    computeHealthTarget,
  };
})(window);
