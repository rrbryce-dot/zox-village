/**
 * ZOX Village — rules, buildings, and kitchen-table copy.
 * Classic script (no modules) so file:// and a static server both work.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const BUILDINGS = {
    home: {
      id: "home",
      name: "Green home",
      short: "Home",
      cost: 44,
      pop: 4,
      energyUse: 2,
      waste: 2,
      upkeep: 2,
      hint: "Four chairs at the table. Needs power. Tidier beside a compost heap.",
    },
    farm: {
      id: "farm",
      name: "Farmland",
      short: "Farm",
      cost: 48,
      convertYears: 5,
      income: 16,
      nature: 2,
      waste: 2,
      upkeep: 1,
      credits: 4,
      youngIncome: 6,
      youngNature: 0,
      youngWaste: 3,
      youngCredits: 1,
      hint: "Buy the field. Crops pay for the next one. Soil takes five years to drop the chem bill and run on graze and manure.",
    },
    solar: {
      id: "solar",
      name: "Sun & wind yard",
      short: "Power",
      cost: 56,
      energy: 6,
      upkeep: 1,
      hint: "Quiet kilowatts. Homes stop arguing about the fuse box.",
    },
    compost: {
      id: "compost",
      name: "Compost hub",
      short: "Compost",
      cost: 46,
      wasteSink: 6,
      radius: 2,
      wasteFactor: 0.4,
      nature: 1,
      upkeep: 1,
      hint: "Scraps become soil. Homes and farms in a 2-tile walk stay neat.",
    },
    rail: {
      id: "rail",
      name: "Green rail",
      short: "Rail",
      cost: 48,
      upkeep: 1,
      hint: "Lay two or more adjoining tiles. Nearby lots earn more and feel closer.",
    },
    park: {
      id: "park",
      name: "Orchard park",
      short: "Orchard",
      cost: 34,
      nature: 3,
      happy: 3,
      wasteSink: 1,
      upkeep: 0,
      credits: 3,
      hint: "Sunday walking. Birds come back. A little carbon credit on the side.",
    },
  };

  const TOOLS = [
    { id: "inspect", name: "Look", kind: "tool", hint: "Read a tile. No cost." },
    { id: "farm", kind: "build" },
    { id: "home", kind: "build" },
    { id: "solar", kind: "build" },
    { id: "compost", kind: "build" },
    { id: "rail", kind: "build" },
    { id: "park", kind: "build" },
    { id: "bulldoze", name: "Clear lot", kind: "tool", hint: "Pull a building. You get about half the timber back." },
  ];

  const GOAL = {
    seasons: 18,
    population: 16,
    wasteMax: 24,
    natureMin: 70,
    happinessMin: 56,
  };

  const START = {
    money: 280,
    waste: 15,
    nature: 54,
    happiness: 52,
    season: 1,
  };

  const CARBON = {
    grove: 1,
    groveCap: 3,
  };

  const LIC = {
    name: "LIC green building",
    income: 11,
    hint: "Already standing in Long Island City — not on this valley map. Rent and royalties arrive each season and buy farmland here.",
  };

  /**
   * Per-season crop books, before water/rail bonuses.
   * Traditional is the comparison baseline (not a separate placeable).
   * Player farmland converts year-by-year, then sits on the regen row.
   */
  const FARM_MODELS = {
    traditional: {
      id: "traditional",
      name: "Traditional",
      gross: 18,
      inputs: 10,
      note: "Buys fertilizer, pesticides, and nitrogen every season. The chem bill eats the crop check.",
    },
    converting: {
      id: "converting",
      name: "Converting",
      years: [
        { year: 1, gross: 10, inputs: 6 },
        { year: 2, gross: 11, inputs: 4 },
        { year: 3, gross: 12, inputs: 3 },
        { year: 4, gross: 13, inputs: 2 },
        { year: 5, gross: 14, inputs: 1 },
      ],
      note: "Still weaning off the bag. Inputs shrink each year. Full graze cycle waits on year five.",
    },
    regenerative: {
      id: "regenerative",
      name: "Zox regenerative",
      gross: 16,
      inputs: 0,
      note: "No chem bill. Animals graze the cover; manure stays on the lot. That is why the wait pays.",
    },
  };

  const MAP = {
    size: 12,
    groveCount: 11,
  };

  const COPY = {
    title: "ZOX Village",
    tag: "A valley that pays its own way",
    introTitle: "The mill is quiet. The creek is not.",
    intro: [
      "You have a tired meadow, a decent creek, and enough seed money to try a town that does not ship its mess downhill.",
      "Song royalties already bought a green building in Long Island City. That city rent lands here every season — you do not place it on this map. This board is the farm section.",
      "Traditional lots keep buying fertilizer and nitrogen. A Zox field waits five years, then the chem bill hits zero: graze and manure, crops buy more land. Carbon credits from living lots help the jar.",
      "Grow the settlement, keep waste low, the circle healthy, and the books in the black — before 18 seasons are up.",
    ],
    win: "LIC rent paid the fields, the circle held, and the books stayed in the black. That is a village.",
    loseTime: "Eighteen seasons and the valley is still waiting on you. The books tell the story.",
    loseBroke: "The jar is empty. A town that cannot pay for seed does not last the winter.",
    loseNature: "The circle broke. Dust where the grass should be.",
    loseWaste: "Waste piled past the fence line. Nobody wants to sit down here.",
  };

  Zox.BUILDINGS = BUILDINGS;
  Zox.TOOLS = TOOLS;
  Zox.GOAL = GOAL;
  Zox.START = START;
  Zox.CARBON = CARBON;
  Zox.LIC = LIC;
  Zox.FARM_MODELS = FARM_MODELS;
  Zox.MAP = MAP;
  Zox.COPY = COPY;
})(window);
