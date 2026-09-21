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
    const list = Zox.CORRIDOR.parcels;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === parcelId) return list[i];
    }
    return null;
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

  function farmBooks(farm) {
    const models = Zox.FARM_MODELS;
    if (!farm) return null;
    if (farmMature(farm)) {
      const row = models.regenerative;
      return {
        model: "regenerative",
        label: "Zox regenerative",
        year: models.converting.years.length,
        need: models.converting.years.length,
        mature: true,
        gross: row.gross,
        inputs: row.inputs,
        net: row.gross - row.inputs,
        note: row.note,
      };
    }
    const prog = farmProgress(farm);
    const row = models.converting.years[prog.year - 1] || models.converting.years[0];
    return {
      model: "converting",
      label: "Converting (year " + prog.year + " of " + prog.need + ")",
      year: prog.year,
      need: prog.need,
      mature: false,
      gross: row.gross,
      inputs: row.inputs,
      net: row.gross - row.inputs,
      note: models.converting.note,
    };
  }

  function farmYield(farm) {
    const def = Zox.BUILDINGS.farm;
    const books = farmBooks(farm);
    const mature = !!(books && books.mature);
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

  function farmModelRows() {
    const models = Zox.FARM_MODELS;
    const mid = models.converting.years[2];
    return [
      {
        id: "traditional",
        name: models.traditional.name,
        gross: models.traditional.gross,
        inputs: models.traditional.inputs,
        net: models.traditional.gross - models.traditional.inputs,
        note: models.traditional.note,
      },
      {
        id: "converting",
        name: "Converting (year " + mid.year + " of 5)",
        gross: mid.gross,
        inputs: mid.inputs,
        net: mid.gross - mid.inputs,
        note: models.converting.note,
      },
      {
        id: "regenerative",
        name: models.regenerative.name,
        gross: models.regenerative.gross,
        inputs: models.regenerative.inputs,
        net: models.regenerative.gross - models.regenerative.inputs,
        note: models.regenerative.note,
      },
    ];
  }

  function emptyIncome() {
    return { crops: 0, cropGross: 0, inputs: 0, apartments: 0, credits: 0, other: 0, upkeep: 0, net: 0 };
  }

  /**
   * Rail progress: parcels ordered west→east.
   * A segment between parcel i and i+1 lights when both farms are owned and mature.
   */
  function railProgress(state) {
    const parcels = Zox.CORRIDOR.parcels.slice().sort((a, b) => a.order - b.order);
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
    return {
      parcels,
      segments,
      lit,
      need,
      pct: Math.round((lit / need) * 100),
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
      log: [
        {
          season: 1,
          text: "LIC capital buys the next field along the corridor. Walk the farm. Mature farms light the Detroit–Jersey City rail.",
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
      population: state.population,
      energySupply: state.energySupply,
      energyDemand: state.energyDemand,
    };
  }

  function recountEnergyAndPeople(state) {
    const homes = buildingsOf(state, "home");
    const yards = buildingsOf(state, "solar");
    state.population = homes.length * Zox.BUILDINGS.home.pop;
    state.energyDemand = homes.length * Zox.BUILDINGS.home.energyUse;
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
    if (getFarmByParcel(state, parcelId)) return { ok: false, why: "You already hold that deed. Click to walk the farm." };
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
        " is yours along the corridor. Walk the fields. " +
        rail.matureCount +
        "/" +
        rail.total +
        " farms mature toward the green rail."
    );
    return { ok: true, why: "", enter: farm.id };
  }

  function canPlace(state, r, c, buildingId, farmId) {
    if (state.status !== "playing") return { ok: false, why: "This corridor already found its ending." };
    if (buildingId === "apartment") {
      return { ok: false, why: "The LIC building is in Long Island City, not on this corridor." };
    }
    if (buildingId === "farm") {
      return { ok: false, why: "Buy a parcel marker on the corridor map — not a grid tile." };
    }
    if (!farmId) {
      return { ok: false, why: "Improvements go on a farm. Buy a parcel, then walk the fields." };
    }
    const farm = getFarm(state, farmId);
    if (!farm) return { ok: false, why: "That farm is not on the books." };
    const def = Zox.BUILDINGS[buildingId];
    if (!def) return { ok: false, why: "Unknown building." };
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
      return { ok: false, why: "Buy a parcel marker on the corridor map." };
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
    };
    pushLog(state, notes[buildingId] || "Built on " + farm.name + ".");
    return { ok: true, why: "" };
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
    tile.building = null;
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
    if (farm) {
      const books = farmBooks(farm);
      const bits = [
        "Deed along the Detroit → Jersey City corridor",
        books.mature ? "Zox regenerative — no chem bill." : books.label,
        "Gross $" + books.gross + " − chem $" + books.inputs + " = net $" + books.net,
        "Click to walk this farm. Improvements stay on its board.",
      ];
      return { parcelId, parcel, farm, title: farm.name, lines: bits, owned: true };
    }
    return {
      parcelId,
      parcel,
      farm: null,
      title: parcel.name,
      lines: [
        "Open deed along the future green rail",
        "Costs $" + cost + " — LIC capital buys farmland here",
        "Buy it, walk the farm, convert five seasons, then buy the next along the line",
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

  function evaluateGoals(state) {
    return {
      population: state.population >= Zox.GOAL.population,
      waste: state.waste <= Zox.GOAL.wasteMax,
      nature: state.nature >= Zox.GOAL.natureMin,
      happiness: state.happiness >= Zox.GOAL.happinessMin,
      solvent: state.money > 0,
    };
  }

  function goalsMet(flags) {
    return flags.population && flags.waste && flags.nature && flags.happiness && flags.solvent;
  }

  function computeScore(state) {
    const leftover = Math.max(0, Zox.GOAL.seasons - state.season + 1);
    const rail = railProgress(state);
    return Math.max(
      0,
      Math.round(
        state.population * 5 +
          state.nature * 2 +
          (100 - state.waste) * 2 +
          state.happiness +
          state.money * 0.15 +
          leftover * 10 +
          rail.lit * 8
      )
    );
  }

  function maybeEnd(state) {
    const flags = evaluateGoals(state);
    if (goalsMet(flags)) {
      state.status = "won";
      state.wonOnSeason = state.season;
      state.endReason = Zox.COPY.win;
      state.score = computeScore(state);
      pushLog(state, "The table is full. This is a village.");
      return;
    }
    if (state.money < 0) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseBroke;
      state.score = computeScore(state);
      return;
    }
    if (state.nature <= 6) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseNature;
      state.score = computeScore(state);
      return;
    }
    if (state.waste >= 96) {
      state.status = "lost";
      state.endReason = Zox.COPY.loseWaste;
      state.score = computeScore(state);
      return;
    }
    if (state.season > Zox.GOAL.seasons) {
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

    const justMatured = [];
    for (let i = 0; i < state.farms.length; i++) {
      const farm = state.farms[i];
      const was = farmMature(farm);
      farm.regenAge = (farm.regenAge || 0) + 1;
      if (!was && farmMature(farm)) justMatured.push(farm);
    }

    let railLive = false;
    const energySupply = yards.length * Zox.BUILDINGS.solar.energy;
    const energyDemand = homes.length * Zox.BUILDINGS.home.energyUse;
    let energyLeft = energySupply;
    let poweredHomes = 0;
    homes.forEach(() => {
      if (energyLeft >= Zox.BUILDINGS.home.energyUse) {
        poweredHomes += 1;
        energyLeft -= Zox.BUILDINGS.home.energyUse;
      }
    });
    const unpowered = homes.length - poweredHomes;
    const people = homes.length * Zox.BUILDINGS.home.pop;

    const streams = emptyIncome();
    let wasteIn = 0;
    let wasteOut = hubs.length * Zox.BUILDINGS.compost.wasteSink + parks.length * Zox.BUILDINGS.park.wasteSink;
    let natureDelta = groves.length * 0.35 + hubs.length * Zox.BUILDINGS.compost.nature;
    let happyDelta = 0;

    for (let i = 0; i < state.farms.length; i++) {
      const farm = state.farms[i];
      const y = farmYield(farm);
      const connected = Zox.Map.connectedSet(farm.tiles);
      const farmRail = Zox.Map.railNetworks(farm.tiles).some((n) => n.length >= 2);
      if (farmRail) railLive = true;
      const hasCompost = Zox.Map.tilesOf(farm.tiles, "compost").length > 0;
      const irrigated = Zox.Map.countTerrain(farm.tiles, "water") > 0;
      let pay = y.income;
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

    streams.apartments = Zox.LIC.income;

    for (let i = 0; i < yards.length; i++) streams.upkeep += Zox.BUILDINGS.solar.upkeep;
    for (let i = 0; i < hubs.length; i++) streams.upkeep += Zox.BUILDINGS.compost.upkeep;
    for (let i = 0; i < rails.length; i++) streams.upkeep += Zox.BUILDINGS.rail.upkeep;

    natureDelta += parks.length * Zox.BUILDINGS.park.nature;
    happyDelta += parks.length * Zox.BUILDINGS.park.happy;
    streams.credits += parks.length * (Zox.BUILDINGS.park.credits || 0);
    streams.credits += Math.min(Zox.CARBON.groveCap, groves.length * Zox.CARBON.grove);

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

    streams.net = Math.round(streams.crops + streams.apartments + streams.credits + streams.other - streams.upkeep);
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
    state.lastIncome = streams;
    state.season += 1;

    const after = snapshotMeters(state);
    state.lastDelta = {
      money: after.money - before.money,
      waste: after.waste - before.waste,
      nature: after.nature - before.nature,
      happiness: after.happiness - before.happiness,
      population: after.population - before.population,
    };

    const flavor = [];
    if (justMatured.length) {
      flavor.push(
        justMatured.length > 1
          ? "Farms dropped the chem bill. Graze and manure now — and the corridor rail lights farther east."
          : justMatured[0].name + " dropped the chem bill. Mature farms light the green rail."
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
    if (!flavor.length && streams.credits >= 4) {
      flavor.push("Carbon credits from the living lots. Not the main course, but they count.");
    }
    if (hubs.length && wasteIn - wasteOut < 1) flavor.push("The heap ate the week's scraps.");
    if (railLive && !flavor.length) flavor.push("The rail made the far lots feel like part of the farm.");
    if (state.nature >= 70 && state.waste <= 22 && !flavor.length) flavor.push("Creek's running clearer this week.");
    if (!flavor.length) flavor.push("Another season. Crops pay for the next field along the line.");
    pushLog(state, flavor[0]);

    maybeEnd(state);
    return { ok: true, why: "" };
  }

  function goalProgress(state) {
    const flags = evaluateGoals(state);
    const rail = railProgress(state);
    return [
      {
        key: "people",
        label: "People",
        have: state.population,
        need: Zox.GOAL.population,
        ok: flags.population,
        better: "higher",
      },
      {
        key: "waste",
        label: "Waste",
        have: state.waste,
        need: Zox.GOAL.wasteMax,
        ok: flags.waste,
        better: "lower",
      },
      {
        key: "nature",
        label: "Circle",
        have: state.nature,
        need: Zox.GOAL.natureMin,
        ok: flags.nature,
        better: "higher",
      },
      {
        key: "table",
        label: "Table",
        have: state.happiness,
        need: Zox.GOAL.happinessMin,
        ok: flags.happiness,
        better: "higher",
      },
      {
        key: "rail",
        label: "Rail lit",
        have: rail.lit,
        need: rail.need,
        ok: rail.ready,
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
    getFarm,
    getFarmByParcel,
    getParcel,
    resolveFarm,
    tilesForView,
    buildingsOf,
    railProgress,
  };
})(window);
