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

  function farmMature(tile) {
    if (!tile || tile.building !== "farm") return false;
    return (tile.regenAge || 0) >= Zox.BUILDINGS.farm.convertYears;
  }

  function farmProgress(tile) {
    const need = Zox.BUILDINGS.farm.convertYears;
    const age = tile && tile.building === "farm" ? tile.regenAge || 0 : 0;
    const mature = age >= need;
    return {
      age,
      need,
      year: mature ? need : age + 1,
      mature,
      pct: Math.round((Math.min(age, need) / need) * 100),
    };
  }

  function farmBooks(tile) {
    const models = Zox.FARM_MODELS;
    if (!tile || tile.building !== "farm") {
      return null;
    }
    if (farmMature(tile)) {
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
    const prog = farmProgress(tile);
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

  function farmYield(tile) {
    const def = Zox.BUILDINGS.farm;
    const books = farmBooks(tile);
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

  function freshState(seed) {
    const s = seed == null ? (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0 : seed;
    return {
      seed: s,
      tiles: Zox.Map.generateMap(Zox.MAP.size, s),
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
          text: "LIC capital buys the next field. Crops pay it forward.",
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
    const homes = Zox.Map.tilesOf(state.tiles, "home");
    const yards = Zox.Map.tilesOf(state.tiles, "solar");
    state.population = homes.length * Zox.BUILDINGS.home.pop;
    state.energyDemand = homes.length * Zox.BUILDINGS.home.energyUse;
    state.energySupply = yards.length * Zox.BUILDINGS.solar.energy;
  }

  function canBuildOn(tile) {
    if (!tile) return { ok: false, why: "That is off the map." };
    if (tile.terrain === "water") return { ok: false, why: "Creek stays creek." };
    if (tile.building) return { ok: false, why: "Someone already claimed that lot." };
    return { ok: true, why: "" };
  }

  function canPlace(state, r, c, buildingId) {
    if (state.status !== "playing") return { ok: false, why: "This valley already found its ending." };
    if (buildingId === "apartment") {
      return { ok: false, why: "The LIC building is in Long Island City, not on this valley." };
    }
    const def = Zox.BUILDINGS[buildingId];
    if (!def) return { ok: false, why: "Unknown building." };
    const tile = Zox.Map.getTile(state.tiles, r, c);
    const land = canBuildOn(tile);
    if (!land.ok) return land;
    if (state.money < def.cost) {
      return { ok: false, why: "Need $" + def.cost + ". The jar has $" + state.money + "." };
    }
    return { ok: true, why: "" };
  }

  function place(state, r, c, buildingId) {
    const check = canPlace(state, r, c, buildingId);
    if (!check.ok) return check;
    const tile = state.tiles[r][c];
    const def = Zox.BUILDINGS[buildingId];
    state.money -= def.cost;
    if (tile.terrain === "grove") {
      state.nature = clamp(state.nature - 7, 0, 100);
      tile.terrain = "meadow";
      pushLog(state, "Cleared a grove for the " + def.short.toLowerCase() + ". The birds took it personally.");
    }
    tile.building = buildingId;
    if (buildingId === "farm") tile.regenAge = 0;
    else delete tile.regenAge;
    recountEnergyAndPeople(state);
    const notes = {
      home: "A house with a green roof. Four more names on the mailbox.",
      farm: "Field's yours. The chem bill shrinks for five years. Then graze and manure carry the lot.",
      solar: "The yard starts humming. Kettles will have an easier time.",
      compost: "The heap is working. It does not smell like a lecture.",
      rail: "Rail in the grass. Link another tile and the far lots join the talk.",
      park: "An orchard for Sunday. Someone will bring a pie.",
    };
    pushLog(state, notes[buildingId] || "Built.");
    return { ok: true, why: "" };
  }

  function canClear(state, r, c) {
    if (state.status !== "playing") return { ok: false, why: "This valley already found its ending." };
    const tile = Zox.Map.getTile(state.tiles, r, c);
    if (!tile || !tile.building) return { ok: false, why: "Nothing to pull up." };
    return { ok: true, why: "" };
  }

  function clearLot(state, r, c) {
    const check = canClear(state, r, c);
    if (!check.ok) return check;
    const tile = state.tiles[r][c];
    const def = Zox.BUILDINGS[tile.building];
    if (!def) {
      tile.building = null;
      delete tile.regenAge;
      recountEnergyAndPeople(state);
      return { ok: true, why: "" };
    }
    const refund = Math.floor(def.cost * 0.5);
    tile.building = null;
    delete tile.regenAge;
    state.money += refund;
    recountEnergyAndPeople(state);
    pushLog(state, "Cleared a " + def.short.toLowerCase() + ". $" + refund + " back in the jar.");
    return { ok: true, why: "" };
  }

  function inspect(state, r, c) {
    const tile = Zox.Map.getTile(state.tiles, r, c);
    if (!tile) return null;
    const connected = Zox.Map.connectedSet(state.tiles);
    const def = tile.building ? Zox.BUILDINGS[tile.building] : null;
    const nearCompost = Zox.Map.hasNeighborBuilding(state.tiles, r, c, "compost", 2);
    const nearPark = Zox.Map.hasNeighborBuilding(state.tiles, r, c, "park", 1);
    const onLine = Zox.Map.isConnected(connected, r, c);
    const bits = [Zox.Map.describeTerrain(tile.terrain)];
    let title = def ? def.name : "Open lot";
    if (def) bits.push(def.name);
    else bits.push("Open lot");
    if (tile.building === "farm") {
      const books = farmBooks(tile);
      if (books.mature) {
        title = "Zox regenerative";
        bits[1] = "Zox regenerative";
        bits.push("Model: Zox regenerative — no chem bill.");
        bits.push("Gross $" + books.gross + " − inputs $0 = net $" + books.net);
        bits.push("Animals graze the cover. Manure stays. Carbon credits on the side.");
      } else {
        title = "Farmland";
        bits.push("Model: " + books.label);
        bits.push("Gross $" + books.gross + " − chem $" + books.inputs + " = net $" + books.net);
        bits.push("Still buying some nitrogen. Full graze cycle waits on year five.");
      }
    }
    if (tile.terrain === "water") bits.push("Leave it. The valley drinks here.");
    if (tile.terrain === "grove" && !tile.building) bits.push("Standing grove. A little carbon credit each season.");
    if (nearCompost) bits.push("In compost range");
    if (nearPark) bits.push("Beside an orchard");
    if (onLine && def) bits.push("On the rail");
    if (tile.building === "farm" && Zox.Map.adjacentTerrain(state.tiles, r, c, "water")) {
      bits.push("Creek irrigation");
    }
    if (tile.building === "apartment") {
      bits.push("That's leftover city brick. LIC capital lives in Long Island City now — off this map.");
    }
    return {
      r,
      c,
      tile,
      def,
      title,
      lines: bits,
    };
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
    return Math.max(
      0,
      Math.round(
        state.population * 5 +
          state.nature * 2 +
          (100 - state.waste) * 2 +
          state.happiness +
          state.money * 0.15 +
          leftover * 10
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
    const tiles = state.tiles;
    const homes = Zox.Map.tilesOf(tiles, "home");
    const farms = Zox.Map.tilesOf(tiles, "farm");
    const yards = Zox.Map.tilesOf(tiles, "solar");
    const hubs = Zox.Map.tilesOf(tiles, "compost");
    const parks = Zox.Map.tilesOf(tiles, "park");
    const rails = Zox.Map.tilesOf(tiles, "rail");
    const groves = [];
    Zox.Map.forEachTile(tiles, (tile) => {
      if (tile.terrain === "grove" && !tile.building) groves.push(tile);
    });

    const justMatured = [];
    for (const farm of farms) {
      const was = farmMature(farm);
      farm.regenAge = (farm.regenAge || 0) + 1;
      if (!was && farmMature(farm)) justMatured.push(farm);
    }

    const connected = Zox.Map.connectedSet(tiles);
    const railLive = Zox.Map.railNetworks(tiles).some((n) => n.length >= 2);

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

    for (const farm of farms) {
      const y = farmYield(farm);
      let pay = y.income;
      if (Zox.Map.adjacentTerrain(tiles, farm.r, farm.c, "water")) pay += 3;
      if (Zox.Map.hasNeighborBuilding(tiles, farm.r, farm.c, "compost", 2)) {
        pay += 2;
        natureDelta += 1;
      }
      if (Zox.Map.isConnected(connected, farm.r, farm.c)) pay = Math.round(pay * 1.35);
      streams.cropGross += pay;
      streams.inputs += y.inputs;
      streams.crops += pay - y.inputs;
      streams.credits += y.credits;
      streams.upkeep += Zox.BUILDINGS.farm.upkeep;
      const factor = Zox.Map.hasNeighborBuilding(tiles, farm.r, farm.c, "compost", 2)
        ? Zox.BUILDINGS.compost.wasteFactor
        : 1;
      wasteIn += y.waste * factor;
      natureDelta += y.nature;
    }

    homes.forEach((home, i) => {
      const def = Zox.BUILDINGS.home;
      const powered = i < poweredHomes;
      const factor = Zox.Map.hasNeighborBuilding(tiles, home.r, home.c, "compost", 2)
        ? Zox.BUILDINGS.compost.wasteFactor
        : 1;
      wasteIn += def.waste * factor * (powered ? 1 : 1.15);
      streams.upkeep += def.upkeep;
      if (powered) streams.other += 2;
      if (Zox.Map.isConnected(connected, home.r, home.c)) happyDelta += 2;
      if (Zox.Map.hasNeighborBuilding(tiles, home.r, home.c, "park", 1)) happyDelta += 2;
      if (powered) happyDelta += 1;
      else happyDelta -= 4;
    });

    streams.apartments = Zox.LIC.income;

    for (const yard of yards) streams.upkeep += Zox.BUILDINGS.solar.upkeep;
    for (const hub of hubs) streams.upkeep += Zox.BUILDINGS.compost.upkeep;
    for (const rail of rails) streams.upkeep += Zox.BUILDINGS.rail.upkeep;

    natureDelta += parks.length * Zox.BUILDINGS.park.nature;
    happyDelta += parks.length * Zox.BUILDINGS.park.happy;
    streams.credits += parks.length * (Zox.BUILDINGS.park.credits || 0);
    streams.credits += Math.min(Zox.CARBON.groveCap, groves.length * Zox.CARBON.grove);

    if (people >= 8 && unpowered === 0) {
      streams.other += Math.floor(people / 4) * 2;
    }

    if (energySupply < energyDemand) streams.other -= 4;

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
          ? "Two lots dropped the chem bill. Graze and manure now. That crop check buys more soil."
          : "This lot dropped the chem bill. Graze and manure now. That crop check buys more soil."
      );
    }
    if (unpowered > 0) flavor.push("Lights flickered. Someone read by the window.");
    if (!flavor.length && farms.length && state.money >= Zox.BUILDINGS.farm.cost) {
      flavor.push("LIC rent is in the jar from Long Island City. That can cover another field.");
    }
    if (!flavor.length && farms.length === 0) {
      flavor.push("LIC rent landed from the city. Buy farmland — this map is the farm section.");
    }
    if (!flavor.length && streams.crops >= 12) {
      flavor.push("The crop check hit the jar and left a little for the next field.");
    }
    if (!flavor.length && streams.credits >= 4) {
      flavor.push("Carbon credits from the living lots. Not the main course, but they count.");
    }
    if (hubs.length && wasteIn - wasteOut < 1) flavor.push("The heap ate the week's scraps.");
    if (railLive && !flavor.length) flavor.push("The rail made the west lots feel like part of town.");
    if (state.nature >= 70 && state.waste <= 22 && !flavor.length) flavor.push("Creek's running clearer this week.");
    if (!flavor.length) flavor.push("Another season. Crops pay for the next field.");
    pushLog(state, flavor[0]);

    maybeEnd(state);
    return { ok: true, why: "" };
  }

  function goalProgress(state) {
    const flags = evaluateGoals(state);
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
    ];
  }

  Zox.Sim = {
    freshState,
    recountEnergyAndPeople,
    canPlace,
    place,
    canClear,
    clearLot,
    inspect,
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
  };
})(window);
