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
      hint: "Four chairs on this farm. Needs a power yard on this same board. Tidier beside a compost heap.",
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
      hint: "Buy a parcel on the corridor map with LIC capital. You walk that farm next. Soil takes five years to drop the chem bill.",
    },
    solar: {
      id: "solar",
      name: "Sun & wind yard",
      short: "Power",
      cost: 56,
      energy: 6,
      upkeep: 1,
      hint: "Quiet kilowatts on this farm. Homes here stop arguing about the fuse box.",
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
      hint: "On this farm. Scraps become soil. Homes and the crop in a 2-tile walk stay neat.",
    },
    rail: {
      id: "rail",
      name: "Green rail",
      short: "Rail",
      cost: 48,
      upkeep: 1,
      hint: "On this farm. Lay two or more adjoining tiles. Nearby lots earn more and feel closer.",
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
      hint: "On this farm. Sunday walking. Birds come back. A little carbon credit on the side.",
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
    { id: "bulldoze", name: "Clear lot", kind: "tool", hint: "Pull an improvement. You get about half the timber back. The farm deed stays on the map." },
  ];

  const WORLD_TOOLS = [
    { id: "inspect", name: "Look", kind: "tool", hint: "Read a parcel. Click a farm you already bought to walk the fields." },
    { id: "farm", kind: "build" },
  ];

  const FARM_TOOLS = [
    { id: "inspect", name: "Look", kind: "tool", hint: "Read a lot on this farm. No cost." },
    { id: "home", kind: "build" },
    { id: "solar", kind: "build" },
    { id: "compost", kind: "build" },
    { id: "rail", kind: "build" },
    { id: "park", kind: "build" },
    { id: "bulldoze", name: "Clear lot", kind: "tool", hint: "Pull an improvement on this farm. About half the timber comes back." },
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

  const BOOK = {
    title: "The Luckiest Dog on the Porch",
    author: "Jacob Westbrook",
    amazon: "https://www.amazon.com/Luckiest-Dog-Porch-Jacob-Westbrook/dp/B0F36LGDKG",
  };

  const LIC = {
    name: "LIC green building",
    income: 11,
    hint: "Already standing in Long Island City — not on this corridor map. Rent and royalties arrive each season and buy farmland along the rail.",
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

  const FARM_MAP = {
    size: 7,
    groveCount: 2,
  };

  const FARM_NAMES = [
    "Monroe Flat",
    "Sandusky Acre",
    "Erie Field",
    "Ashtabula Parcel",
    "Youngstown Meadow",
    "Altoona Bench",
    "Harrisburg Lot",
    "Princeton Acre",
  ];

  /**
   * Aerial corridor: Detroit → Toledo → Cleveland → Pittsburgh → Jersey City.
   * Coordinates are percent of the map panel (0–100).
   */
  const CORRIDOR = {
    cities: [
      { id: "detroit", name: "Detroit", x: 6, y: 22, short: "DET" },
      { id: "toledo", name: "Toledo", x: 18, y: 40, short: "TOL" },
      { id: "cleveland", name: "Cleveland", x: 36, y: 38, short: "CLE" },
      { id: "pittsburgh", name: "Pittsburgh", x: 58, y: 36, short: "PIT" },
      { id: "jersey", name: "Jersey City", x: 92, y: 32, short: "JC" },
    ],
    /* Detroit→Toledo, then one straight run Toledo→Jersey City */
    railPath: [
      { x: 6, y: 22 },
      { x: 18, y: 40 },
      { x: 92, y: 32 },
    ],
    parcels: [
      { id: "monroe", name: "Monroe Flat", x: 12, y: 31, order: 0 },
      { id: "sandusky", name: "Sandusky Acre", x: 26, y: 39, order: 1 },
      { id: "erie", name: "Erie Field", x: 36, y: 38, order: 2 },
      { id: "ashtabula", name: "Ashtabula Parcel", x: 46, y: 37, order: 3 },
      { id: "youngstown", name: "Youngstown Meadow", x: 54, y: 36, order: 4 },
      { id: "altoona", name: "Altoona Bench", x: 66, y: 35, order: 5 },
      { id: "harrisburg", name: "Harrisburg Lot", x: 76, y: 34, order: 6 },
      { id: "princeton", name: "Princeton Acre", x: 86, y: 33, order: 7 },
    ],
    goalCopy:
      "Long-term goal: build the green rail from Detroit to Jersey City. Use LIC rent to buy farmland along the corridor, convert it over five seasons, then buy the next farm along the line. Mature farms light the rail solid.",
  };

  const COPY = {
    title: "ZOX Village",
    tag: "Detroit to Jersey City — build the green rail",
    introTitle: "LIC rent. Corridor farms. One future rail.",
    intro: [
      "Song royalties already bought a green building in Long Island City. That city rent lands every season — you do not place it on this map.",
      "This board is the aerial corridor from Detroit down toward Toledo and east across to Jersey City. The dashed green line is the future rail. The long-term goal is to build that rail.",
      "Loop: LIC capital buys a farm along the corridor → walk the farm → five-season regen → crops and rent buy the next parcel along the line. Mature farms light rail segments solid.",
      "Grow the settlement, keep waste low, the circle healthy, and the books in the black — before 18 seasons are up.",
    ],
    win: "LIC rent paid the corridor, the rail woke up, the circle held, and the books stayed in the black. That is a village.",
    loseTime: "Eighteen seasons and the corridor is still waiting on you. The books tell the story.",
    loseBroke: "The jar is empty. A town that cannot pay for seed does not last the winter.",
    loseNature: "The circle broke. Dust where the grass should be.",
    loseWaste: "Waste piled past the fence line. Nobody wants to sit down here.",
  };

  Zox.BUILDINGS = BUILDINGS;
  Zox.TOOLS = TOOLS;
  Zox.WORLD_TOOLS = WORLD_TOOLS;
  Zox.FARM_TOOLS = FARM_TOOLS;
  Zox.GOAL = GOAL;
  Zox.START = START;
  Zox.CARBON = CARBON;
  Zox.BOOK = BOOK;
  Zox.LIC = LIC;
  Zox.FARM_MODELS = FARM_MODELS;
  Zox.MAP = MAP;
  Zox.FARM_MAP = FARM_MAP;
  Zox.FARM_NAMES = FARM_NAMES;
  Zox.CORRIDOR = CORRIDOR;
  Zox.COPY = COPY;
})(window);
