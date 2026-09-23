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
      waste: 0,
      upkeep: 1,
      credits: 4,
      youngIncome: 6,
      youngNature: 0,
      youngWaste: 1,
      youngCredits: 1,
      hint: "Click a mosaic square. Its title deed pops on the table. Move the card to Purchase when the jar can cover it — $48 an acre. Soil takes five years to drop the chem bill.",
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
    village: {
      id: "village",
      name: "Eco-village",
      short: "Village",
      cost: 52,
      pop: 6,
      energyUse: 2,
      waste: 1,
      upkeep: 2,
    healthBoost: 8,
    nutritionBoost: 4,
    railBoost: 1,
    requiresMature: true,
    hint: "On a mature regen farm — the porch-book village. Adds health and nutrition, and a station on the green rail. Villages plus farms carry Detroit to Jersey City.",
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
    { id: "village", kind: "build" },
    { id: "bulldoze", name: "Clear lot", kind: "tool", hint: "Pull an improvement. You get about half the timber back. The farm deed stays on the map." },
  ];

  const WORLD_TOOLS = [
    { id: "inspect", name: "Look", kind: "tool", hint: "Read a square. A deed card shows the owner, the acres, and the price. Walk a farm you already bought from its card." },
    { id: "farm", kind: "build" },
  ];

  const FARM_TOOLS = [
    { id: "inspect", name: "Look", kind: "tool", hint: "Read a lot on this farm. No cost." },
    { id: "home", kind: "build" },
    { id: "solar", kind: "build" },
    { id: "compost", kind: "build" },
    { id: "rail", kind: "build" },
    { id: "park", kind: "build" },
    { id: "village", kind: "build" },
    { id: "bulldoze", name: "Clear lot", kind: "tool", hint: "Pull an improvement on this farm. About half the timber comes back." },
  ];

  const GOAL = {
    seasons: 20,
    decades: 4,
    seasonsPerDecade: 5,
    /* Two opening farms graduate at the end of decade 1 (~20 carbon).
       The gate needs a run of mature acres, so a win lands in a later decade. */
    carbonMin: 48,
    healthMin: 75,
    nutritionFactor: 6,
    wasteMax: 24,
    /* Soft / secondary lose thresholds (not hard win gates) */
    wasteDisaster: 96,
    natureCollapse: 6,
  };

  const START = {
    /* Two deeds ($48 × 2) plus a little walking-around money. Income buys the rest. */
    money: 120,
    waste: 15,
    nature: 54,
    happiness: 52,
    health: 36,
    carbonSeason: 0,
    carbonTotal: 0,
    season: 1,
  };

  /**
   * Physical sequestration units per season (win meter) — not $ carbon credits.
   * Roughly: 2–3 mature farms + orchards/groves clears carbonMin in a season.
   */
  /**
   * End-of-season crop rent: animals graze leftover crop, manure stays.
   * Mature regen fields rent higher — that is cash and soil.
   */
  const GRAZE_RENT = {
    mature: 9,
    converting: 4,
    hint: "Rent the crop to the animals. They eat. They poop. You get paid and the soil gets manure.",
  };

  const CARBON = {
    matureFarm: 10,
    convertingFarm: 3,
    /* Payout for converting years 1–4. Year 5 graduates onto matureFarm. */
    convertingLadder: [2, 3, 5, 7],
    park: 2,
    grove: 1,
    groveCap: 4,
    /* Money credits (income strip) — separate from sequestration meter */
    creditMature: 4,
    creditYoung: 1,
    creditPark: 3,
    creditGrove: 1,
    creditGroveCap: 3,
  };

  /**
   * Nutrition quality vs traditional baseline (=1).
   * Mature Zox regen feeds at nutritionFactor (6×); converting ~2×.
   * Each farm contributes farmPortions "people-fed" slots at that quality.
   */
  const NUTRITION = {
    traditional: 1,
    converting: 2,
    regenerative: 6,
    /* Payout for converting years 1–4. Graduation season pays regenerative. */
    convertingLadder: [2, 3, 4, 5],
    yearFivePreview: 5,
    farmPortions: 4,
    parkBonus: 1,
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
   * Cash input keys. Traditional pays every line. Regenerative pays $0.
   * The sum IS the chem bill (FARM_MODELS.*.inputs). Net $/acre = gross − that sum.
   * Labor, water, runoff, erosion, biodiversity, manure, and soil are indexes —
   * they explain the mechanism and are not a second invoice.
   */
  const LEDGER_CASH = [
    "fertilizer",
    "syntheticNitrogen",
    "insecticides",
    "herbicides",
    "fungicides",
    "fossilFuel",
    "purchasedSeed",
    "irrigationChemicals",
  ];

  const LEDGER_SPEC = [
    {
      group: "Cash inputs — traditional pays, regen $0",
      rows: [
        { key: "fertilizer", label: "Fertilizer", kind: "cash" },
        { key: "syntheticNitrogen", label: "Synthetic nitrogen", kind: "cash" },
        { key: "insecticides", label: "Insecticides", kind: "cash" },
        { key: "herbicides", label: "Herbicides", kind: "cash" },
        { key: "fungicides", label: "Fungicides", kind: "cash" },
        { key: "fossilFuel", label: "Fossil fuel / diesel", kind: "cash" },
        { key: "purchasedSeed", label: "Purchased seed", kind: "cash" },
        { key: "irrigationChemicals", label: "Irrigation chemicals", kind: "cash" },
      ],
    },
    {
      group: "Graze, manure, carbon, nutrition",
      rows: [
        { key: "manureReturn", label: "Manure nutrients (graze)", kind: "good" },
        { key: "soilOrganicMatter", label: "Soil organic matter", kind: "good" },
        { key: "carbonTons", label: "Carbon sequestered", kind: "carbon" },
        { key: "nutritionMult", label: "Nutrition", kind: "mult" },
      ],
    },
    {
      group: "Water, runoff, erosion, life",
      rows: [
        { key: "waterUse", label: "Water use", kind: "bad" },
        { key: "runoff", label: "Runoff", kind: "bad" },
        { key: "erosion", label: "Erosion", kind: "bad" },
        { key: "biodiversity", label: "Biodiversity", kind: "good" },
      ],
    },
    {
      group: "Labor — chem crew vs living soil",
      rows: [
        { key: "laborChem", label: "Labor on the chem bill", kind: "labor" },
        { key: "laborLiving", label: "Living-system care", kind: "labor" },
      ],
    },
  ];

  /**
   * Per-season crop books, before water/rail bonuses.
   * Traditional is the comparison baseline (not a placeable tile).
   * Cash lines on traditional sum to inputs (10). Regen cash lines are all $0.
   * Net $8 vs $16 is why regen income buys the next deed sooner (6 acre-seasons vs 3).
   */
  const FARM_MODELS = {
    traditional: {
      id: "traditional",
      name: "Traditional",
      gross: 18,
      inputs: 10,
      note: "Pays the full chem bill every season — fertilizer through diesel. Net $8/acre. It takes six of those acres to buy the next deed.",
      ledger: {
        fertilizer: 2.4,
        syntheticNitrogen: 2.2,
        insecticides: 1.2,
        herbicides: 1.2,
        fungicides: 0.8,
        fossilFuel: 1.4,
        purchasedSeed: 0.5,
        irrigationChemicals: 0.3,
        laborChem: 8,
        laborLiving: 2,
        waterUse: 10,
        runoff: 8,
        erosion: 7,
        biodiversity: 2,
        manureReturn: 0,
        soilOrganicMatter: -1,
        carbonTons: 0,
        nutritionMult: 1,
      },
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
      note: "The bag shrinks each year of the five-season convert. Year 5 is the last look at a chem line — the next season is regenerative.",
      ledger: null,
    },
    regenerative: {
      id: "regenerative",
      name: "Zox regenerative",
      gross: 16,
      inputs: 0,
      note: "Chem bill $0. Animals graze the residue and manure stays, so nutrients and soil organic matter come back. Nutrition is 6×. Net $16/acre — three acre-seasons buy the next deed.",
      ledger: {
        fertilizer: 0,
        syntheticNitrogen: 0,
        insecticides: 0,
        herbicides: 0,
        fungicides: 0,
        fossilFuel: 0,
        purchasedSeed: 0,
        irrigationChemicals: 0,
        laborChem: 0,
        laborLiving: 7,
        waterUse: 4,
        runoff: 1,
        erosion: 1,
        biodiversity: 9,
        manureReturn: 5,
        soilOrganicMatter: 4,
        carbonTons: 10,
        nutritionMult: 6,
      },
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
   * Coordinates match assets/corridor-basemap.svg (view 960×620).
   * lx/ly/anchor place the on-map name so it does not sit on another label.
   * vdx/vdy offset the eco-village pin from the deed.
   */
  const CORRIDOR = {
    view: { w: 960, h: 620 },
    cities: [
      { id: "detroit", name: "Detroit", x: 115.6, y: 204, lx: 104, ly: 186, anchor: "end" },
      { id: "toledo", name: "Toledo", x: 72, y: 287.1, lx: 56, ly: 278, anchor: "end" },
      { id: "cleveland", name: "Cleveland", x: 236.4, y: 306.9, lx: 214, ly: 278, anchor: "middle" },
      { id: "pittsburgh", name: "Pittsburgh", x: 386.7, y: 438.3, lx: 370, ly: 428, anchor: "end" },
      { id: "jersey", name: "Jersey City", x: 912.9, y: 402.3, lx: 898, ly: 380, anchor: "end" },
    ],
    /* Detroit, then each deed in order, then Jersey City — lit segments follow the deeds. */
    railPath: [
      { x: 115.6, y: 204 },
      { x: 84.4, y: 254.8 },
      { x: 72, y: 287.1 },
      { x: 145.8, y: 313.1 },
      { x: 278.2, y: 297 },
      { x: 316.4, y: 261 },
      { x: 328.9, y: 356.5 },
      { x: 529.8, y: 428.4 },
      { x: 664, y: 460.6 },
      { x: 861.3, y: 449.4 },
      { x: 912.9, y: 402.3 },
    ],
    /* Named rail squares. parcels.js snaps each one onto the mosaic cell underneath. */
    anchors: [
      { id: "monroe", name: "Monroe Flat", mapLabel: "Monroe", x: 84.4, y: 254.8, order: 0, lx: 108, ly: 244, anchor: "start", vdx: -16, vdy: -14 },
      { id: "sandusky", name: "Sandusky Acre", mapLabel: "Sandusky", x: 145.8, y: 313.1, order: 1, lx: 146, ly: 338, anchor: "middle", vdx: 14, vdy: -14 },
      { id: "erie", name: "Erie Field", mapLabel: "Erie", x: 278.2, y: 297, order: 2, lx: 298, ly: 314, anchor: "start", vdx: -16, vdy: -12 },
      { id: "ashtabula", name: "Ashtabula Parcel", mapLabel: "Ashtabula", x: 316.4, y: 261, order: 3, lx: 330, ly: 232, anchor: "middle", vdx: 14, vdy: 12 },
      { id: "youngstown", name: "Youngstown Meadow", mapLabel: "Youngstown", x: 328.9, y: 356.5, order: 4, lx: 354, ly: 378, anchor: "start", vdx: 14, vdy: -14 },
      { id: "altoona", name: "Altoona Bench", mapLabel: "Altoona", x: 529.8, y: 428.4, order: 5, lx: 530, ly: 406, anchor: "middle", vdx: -16, vdy: -8 },
      { id: "harrisburg", name: "Harrisburg Lot", mapLabel: "Harrisburg", x: 664, y: 460.6, order: 6, lx: 700, ly: 448, anchor: "start", vdx: -16, vdy: 4 },
      { id: "princeton", name: "Princeton Acre", mapLabel: "Princeton", x: 861.3, y: 449.4, order: 7, lx: 812, ly: 428, anchor: "middle", vdx: 14, vdy: -10 },
    ],
    places: [
      { text: "LAKE ERIE", x: 228, y: 196, anchor: "middle", kind: "water" },
      { text: "OHIO", x: 188, y: 430, anchor: "middle", kind: "state" },
      { text: "PENNSYLVANIA", x: 575, y: 188, anchor: "middle", kind: "state" },
      { text: "NEW JERSEY", x: 800, y: 300, anchor: "middle", kind: "state" },
      { text: "MICH.", x: 14, y: 118, anchor: "start", kind: "state" },
      { text: "W. VA.", x: 470, y: 552, anchor: "middle", kind: "state" },
      { text: "Buffalo", x: 500, y: 128, anchor: "start", kind: "minor" },
      { text: "Erie", x: 406, y: 216, anchor: "start", kind: "minor" },
      { text: "Akron", x: 236, y: 382, anchor: "middle", kind: "minor" },
      { text: "NYC", x: 954, y: 356, anchor: "end", kind: "minor" },
    ],
    goalCopy:
      "Long-term goal: build the green rail from Detroit to Jersey City across four decades. Every farmland square can be bought — pull its title deed, then move the card to Purchase when the jar can cover it. Five seasons convert a farm; mature farms on the named rail squares light the line solid.",
  };

  const COPY = {
    title: "ZOX Village",
    tag: "Sequester carbon. Feed people 6× better. Light the rail.",
    introTitle: "LIC rent. Corridor farms. Carbon + health win.",
    intro: [
      "Song royalties already bought a green building in Long Island City. That city rent lands every season — you do not place it on this map.",
      "This board is the aerial corridor from Detroit down toward Toledo and east across to Jersey City. Every farmland square on the mosaic is for sale. The dashed green line is the future rail.",
      "Loop: click a square → its title deed pops → move the card to Purchase when apartment rent and crop net can cover it → walk the farm → five-season regen. Mature farms sequester carbon. Named squares along the rail light solid. Eco-villages boost health and put stations on the line.",
      "Win by sequestering enough carbon in a single season and raising population health on 6× regenerative nutrition. The corridor is four decades (20 seasons). Decade 1 converts soil; the carbon gate needs a run of mature acres after that. Stay in the black.",
    ],
    win: "The soil locked enough carbon this season, and regenerative food made people healthier — 6× the nutrition of the chem model. The rail is a longer story, but this corridor is a village.",
    loseTime: "Four decades and the corridor never hit the carbon and health marks. The books tell the story.",
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
  Zox.GRAZE_RENT = GRAZE_RENT;
  Zox.CARBON = CARBON;
  Zox.NUTRITION = NUTRITION;
  Zox.BOOK = BOOK;
  Zox.LIC = LIC;
  Zox.FARM_MODELS = FARM_MODELS;
  Zox.LEDGER_CASH = LEDGER_CASH;
  Zox.LEDGER_SPEC = LEDGER_SPEC;
  Zox.MAP = MAP;
  Zox.FARM_MAP = FARM_MAP;
  const PLAYER = { name: "Jake Westbrook" };

  /* Sellers on for-sale deeds. Stable per square, not a second economy. */
  const FARMERS = [
    "Helen Marsh",
    "Otto Briggs",
    "Clara Dunbar",
    "Frank Kowalski",
    "Ida Pell",
    "Samuel Hart",
    "Ruth Nowak",
    "Ed Yoder",
    "Mae Brennan",
    "Louis Ferris",
    "Ada Kruk",
    "Will Schumacher",
    "Nora Bennett",
    "Carl Vogel",
    "Esther Pike",
    "Joe Mancini",
    "Lila Trent",
    "Hank Doyle",
    "Pearl Olson",
    "Mike Szabo",
    "Cora Walsh",
    "Ben Holtz",
    "Iris Penner",
    "Tom Gallagher",
    "Nellie Frost",
    "Ray Delgado",
    "Hattie Bloom",
    "Sid Kramer",
    "Vera Lang",
    "Paul Reznik",
    "Dottie Shaw",
    "Gene Pavlov",
    "Mina Cho",
    "Archie Quinn",
    "Bess Harlow",
    "Ned Okonkwo",
    "Faye Lind",
    "Gus Moretti",
    "Willa Pratt",
    "Hugh Daley",
  ];

  Zox.FARM_NAMES = FARM_NAMES;
  Zox.CORRIDOR = CORRIDOR;
  Zox.COPY = COPY;
  Zox.PLAYER = PLAYER;
  Zox.FARMERS = FARMERS;
})(window);
