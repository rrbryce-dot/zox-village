/**
 * Kitchen-table help chat. Reads live sim state. No network.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  function snapshot(ui) {
    const state = ui.state;
    const farms = (state.farms || []).map((farm) => Zox.Sim.farmBooks(farm));
    const converting = farms.filter((f) => !f.mature);
    const mature = farms.filter((f) => f.mature);
    const homes = Zox.Sim.buildingsOf(state, "home").length;
    const solar = Zox.Sim.buildingsOf(state, "solar").length;
    const compost = Zox.Sim.buildingsOf(state, "compost").length;
    const parks = Zox.Sim.buildingsOf(state, "park").length;
    const rails = Zox.Sim.buildingsOf(state, "rail").length;
    const inc = state.lastIncome || {};
    const paid = !!(state.lastDelta || state.season > 1);
    const rail = Zox.Sim.railProgress(state);
    return {
      money: state.money,
      season: state.season,
      paid,
      farms: farms.length,
      converting,
      mature: mature.length,
      licRent: Zox.LIC.income,
      homes,
      solar,
      compost,
      parks,
      rails,
      pop: state.population,
      waste: state.waste,
      nature: state.nature,
      happiness: state.happiness,
      health: state.health || 0,
      carbonSeason: state.carbonSeason || 0,
      carbonTotal: state.carbonTotal || 0,
      energySupply: state.energySupply,
      energyDemand: state.energyDemand,
      inc,
      tool: ui.tool,
      view: ui.view,
      farmName: ui.view === "farm" && ui.farmId ? (Zox.Sim.getFarm(state, ui.farmId) || {}).name : "",
      farmCost: Zox.BUILDINGS.farm.cost,
      trad: Zox.FARM_MODELS.traditional,
      regen: Zox.FARM_MODELS.regenerative,
      goal: Zox.GOAL,
      railLit: rail.lit,
      villages: Zox.Sim.countVillages ? Zox.Sim.countVillages(state) : 0,
      railNeed: rail.need,
      railReady: rail.ready,
    };
  }

  function farmYearLine(s) {
    if (!s.converting.length) return "";
    return s.converting
      .map((f) => "year " + f.year + " of " + f.need + " (net " + Zox.dollars(f.net) + " after " + Zox.dollars(f.inputs) + " chem)")
      .join("; ");
  }

  function moneyReply(s) {
    if (!s.paid) {
      return (
        "LIC rent is already coming from Long Island City — off this map, " + Zox.dollars(s.licRent) +
        " every season. It lands when you hit Next Season, not as a tile you place. The jar is " + Zox.dollars(s.money) +
        " in seed money. Buy farmland (" + Zox.dollars(s.farmCost) +
        ") on the corridor map along the dashed green rail. You walk that farm next — compost and rail go on the farm board, not the corridor. Long-term: convert, buy the next farm along the line, light the Detroit–Jersey City rail."
      );
    }
    if (s.farms === 0) {
      return (
        "LIC rent " + Zox.dollars((s.inc.apartments || s.licRent)) +
        " landed from the city. Last season net was " + Zox.dollars((s.inc.net || 0)) +
        ". You do not drop an LIC building here. Buy farmland (" + Zox.dollars(s.farmCost) +
        ") on the corridor map, then walk that farm. That city capital is what the corridor farms are for."
      );
    }
    if (s.farms > 0 && s.mature === 0) {
      return (
        "You've got " +
        s.farms +
        " field" +
        (s.farms > 1 ? "s" : "") +
        " still converting: " +
        farmYearLine(s) +
        ". LIC rent " + Zox.dollars((s.inc.apartments || s.licRent)) +
        " still arrives from the city. The chem bill eats most of the crop check — last season crops " + Zox.dollars((s.inc.crops || 0)) +
        ", chem −" + Zox.dollars((s.inc.inputs || 0)) +
        ", net " + Zox.dollars((s.inc.net || 0)) +
        ". When a farm matures, buy the next deed along the rail. Rail lit " +
        s.railLit +
        "/" +
        s.railNeed +
        "."
      );
    }
    if (s.inc.inputs > 0 && s.inc.cropGross && s.inc.inputs >= s.inc.cropGross * 0.4) {
      return (
        "The crop check landed, then the chem bill took a bite. Last season: gross crops " + Zox.dollars((s.inc.cropGross || 0)) +
        ", chem −" + Zox.dollars(s.inc.inputs) +
        ", crop net " + Zox.dollars((s.inc.crops || 0)) +
        ", LIC rent " + Zox.dollars((s.inc.apartments || 0)) +
        ", credits " + Zox.dollars((s.inc.credits || 0)) +
        ", jar net " + Zox.dollars((s.inc.net || 0)) +
        ". Converting lots wean off fertilizer for five years. Then buy the next farm along the corridor."
      );
    }
    if ((s.inc.net || 0) <= 2 * (Zox.MONEY_SCALE || 1) && (s.inc.upkeep || 0) > (s.inc.crops || 0) + (s.inc.apartments || 0)) {
      return (
        "Money came in and went back out. Last season upkeep was " + Zox.dollars(s.inc.upkeep) +
        " against crops " + Zox.dollars((s.inc.crops || 0)) +
        ", LIC rent " + Zox.dollars((s.inc.apartments || 0)) +
        ", credits " + Zox.dollars((s.inc.credits || 0)) +
        ". Net " + Zox.dollars((s.inc.net || 0)) +
        ". The jar is " + Zox.dollars(s.money) +
        ". Wait the fields out — regen drops the chem bill. Then buy the next parcel along the rail."
      );
    }
    return (
      "You did earn. Last season: crops " + Zox.dollars((s.inc.crops || 0)) +
      ", LIC rent " + Zox.dollars((s.inc.apartments || 0)) +
      ", carbon credits " + Zox.dollars((s.inc.credits || 0)) +
      (s.inc.inputs ? ", chem " + Zox.dollars(-s.inc.inputs) : "") +
      ", net " + Zox.dollars((s.inc.net || 0)) +
      ". The jar is " + Zox.dollars(s.money) +
      " now. Farmland is " + Zox.dollars(s.farmCost) +
      ". City capital plus crops buy the next field along the corridor. Rail lit " +
      s.railLit +
      "/" +
      s.railNeed +
      "."
    );
  }

  function farmReply(s) {
    const extra = s.farms
      ? " On the corridor: " +
        s.mature +
        " regen, " +
        s.converting.length +
        " converting" +
        (s.converting.length ? " (" + farmYearLine(s) + ")" : "") +
        ". Rail segments lit " +
        s.railLit +
        "/" +
        s.railNeed +
        "."
      : " You haven't bought a field yet.";
    return (
      "Buy farmland for " + Zox.dollars(s.farmCost) +
      " an acre. Click a mosaic square and the title deed pops — owner, acres, and price. Move the card from Don't buy it yet into Purchase only when the jar can cover it (apartment rent from Long Island City helps). You then walk that farm — compost, power, rail, orchards, and homes go on its board. For five seasons the farm is converting. At maturity the chem bill hits zero and neighboring rail squares light the corridor solid." +
      extra +
      (s.view === "farm" && s.farmName ? " You're on " + s.farmName + " now." : "") +
      " Farm models (M) puts Traditional vs Zox side by side."
    );
  }

  function licReply(s) {
    return (
      "The LIC green building already stands in Long Island City — not on this corridor. You cannot place it. Rent and royalties, " + Zox.dollars(s.licRent) +
      " a season, arrive on the income strip as LIC rent." +
      (s.paid ? " Last season that line was " + Zox.dollars((s.inc.apartments || s.licRent)) + "." : " Hit Next Season to see the first check.") +
      " Loop: city capital → buy a farm along the corridor → walk it → five-year regen → crops buy the next farm along the rail."
    );
  }

  function railReply(s) {
    return (
      "The dashed green line is the future rail from Detroit to Jersey City. That is the long-term goal. Buy farms along the corridor, convert them over five seasons, then buy the next. When two neighboring farms are both mature, the rail segment between them lights solid. Progress: " +
      s.railLit +
      " of " +
      s.railNeed +
      " segments lit" +
      (s.railReady ? " — rail ready." : ".")
    );
  }

  function compareReply() {
    const rows = Zox.Sim.farmModelRows(3);
    const t = rows[0];
    const c = rows[1];
    const r = rows[2];
    const deed = Zox.Sim.acresPerDeed();
    return (
      "Traditional pays fertilizer, synthetic nitrogen, insecticides, herbicides, fungicides, diesel, purchased seed, and irrigation chemicals: " + Zox.dollars(t.gross) +
      " gross − " + Zox.dollars(t.inputs) +
      " chem = " + Zox.dollars(t.net) +
      "/acre, nutrition 1×, carbon 0. Converting (year " +
      (c.year || 3) +
      ") is down to a " + Zox.dollars(c.inputs) +
      " chem bill, net " + Zox.dollars(c.net) +
      ". Zox regen pays $0 on every one of those lines: " + Zox.dollars(r.gross) +
      " gross, net " + Zox.dollars(r.net) +
      "/acre, nutrition 6×, and animals graze the residue so manure and soil organic matter come back. A deed is " + Zox.dollars(deed.cost) +
      ". Regen net buys one every " +
      deed.regenAcres +
      " acre-seasons; traditional needs " +
      deed.tradAcres +
      ". That gap is why the five-season wait pays for the next farm. The ledger is always on the right. Farm models (M) opens the same books larger."
    );
  }

  function placeReply(s) {
    const tool = s.tool === "inspect" ? "Look" : s.tool;
    return (
      (s.view === "farm"
        ? "You're on a farm board. Place compost, power, rail, orchards, and homes here. Back to map (B) buys the next parcel along the corridor."
        : "Corridor map: when the jar hits the farm price, go Back to map and buy the next deed, then you walk that farm. Improvements are not placed on the corridor.") +
      " You do not place the LIC building. Look reads a parcel. Clear lot refunds about half. Selected tool: " +
      tool +
      "."
    );
  }

  function winReply(s) {
    return (
      "Win when one season sequesters carbon ≥ " +
      s.goal.carbonMin +
      " (now " +
      s.carbonSeason +
      ") AND population health ≥ " +
      s.goal.healthMin +
      " (now " +
      s.health +
      ") AND the jar stays above $0 (now " + Zox.dollars(s.money) +
      "). Health climbs because regenerative nutrition is " +
      (s.goal.nutritionFactor || 6) +
      "× traditional — converting years climb toward that (about 2×, 3×, 4×, 5×) before graduation hits 6×. Eco-villages on mature farms add health and rail stations. Soft loses: broke, waste disaster, or time out after four decades (" +
      s.goal.seasons +
      " seasons). The two opening farms graduate at the end of decade 1 and still miss the carbon gate; the win wants a longer run of mature acres. Win score is mostly that season's carbon plus health (plus rail and leftover years). Rail " +
      s.railLit +
      "/" +
      s.railNeed +
      " segments, " +
      (s.villages || 0) +
      " villages."
    );
  }

  function carbonReply(s) {
    const C = Zox.CARBON;
    return (
      "Two different carbons. Sequestration (the win meter) is physical soil lock this season: mature farm +" +
      C.matureFarm +
      ", converting +" +
      C.convertingFarm +
      ", orchard +" +
      C.park +
      ", grove +" +
      C.grove +
      " (capped). You need ≥ " +
      s.goal.carbonMin +
      " in a single season — now " +
      s.carbonSeason +
      " (lifetime " +
      s.carbonTotal +
      "). Carbon credits $ are a separate income line from living lots — last season " + Zox.dollars((s.inc.credits || 0)) +
      ". Credits buy the next deed; sequestration wins the game."
    );
  }

  function healthReply(s) {
    return (
      "Health is 0–100 from regenerative nutrition × people on the corridor. Traditional food = 1×. Converting years climb (about 2×, then 3×, 4×, 5×). Mature Zox regen = " +
      (s.goal.nutritionFactor || 6) +
      "×. Orchards add a little. Even with few people, you still need enough regen nutrition on the board for health to climb toward " +
      s.goal.healthMin +
      ". Right now health is " +
      s.health +
      " with " +
      s.pop +
      " people and " +
      s.mature +
      " mature farm" +
      (s.mature === 1 ? "" : "s") +
      "."
    );
  }

  function lookReply() {
    return "Look is free. Click a deed on the corridor or a lot on a farm. On a field you'll see the model — converting or Zox regenerative — plus gross, chem, and net.";
  }

  function clearReply() {
    return "Clear lot pulls a building and puts about half the timber back in the jar. Use it on a farm board if you dropped a piece wrong. The corridor map has no improvements to clear — only deeds.";
  }

  function creekReply() {
    return "On a farm board, blue tiles are the ditch. They are not building lots. The corridor map is aerial — buy deeds along the rail, not creek tiles.";
  }

  function fallback(s) {
    return (
      "Ask me about money, farms, the rail, LIC, carbon sequestration, health / 6× nutrition, Traditional vs Zox, or the win score. Right now: jar " + Zox.dollars(s.money) +
      ", season " +
      s.season +
      ", carbon this season " +
      s.carbonSeason +
      ", health " +
      s.health +
      ", " +
      s.farms +
      " field" +
      (s.farms === 1 ? "" : "s") +
      " (" +
      s.mature +
      " regen), rail lit " +
      s.railLit +
      "/" +
      s.railNeed +
      "."
    );
  }

  
  function villageReply(s) {
    const works = Zox.VILLAGE_WORKS || { lease: 6, sale: 84 };
    return (
      "Eco-villages come from the porch book and sit at the named rail stops. Buy that farm, finish the five-season convert, then fund the village from the corridor strip — or place it on the farm board (tool Village, key 7). Cost " + Zox.dollars(((Zox.BUILDINGS.village && Zox.BUILDINGS.village.cost) || 52)) +
      ". Construction runs site, then framing, then open, one stage a season. An open village leases " + Zox.dollars(works.lease) +
      " a season into the jar, or you can sell it for " + Zox.dollars(works.sale) +
      ". The station stays either way. They add people, boost Health by " +
      ((Zox.BUILDINGS.village && Zox.BUILDINGS.village.healthBoost) || 0) +
      " and nutrition by " +
      ((Zox.BUILDINGS.village && Zox.BUILDINGS.village.nutritionBoost) || 0) +
      ", on top of mature farms lighting the segments. The rail line itself is built later. You have " +
      (s.villages != null ? s.villages : "?") +
      " now."
    );
  }

  function decadeReply(s) {
    const d = Zox.Sim.decadeInfo ? Zox.Sim.decadeInfo(s.season) : null;
    return (
      "Play spans four decades — " +
      (Zox.GOAL.seasons || 20) +
      " years — toward lighting the green rail. Each decade is five seasons. Converting a farm takes one of those decades. The carbon win does not land in decade 1: the opening farms graduate then, and you still need more mature acres. " +
      (d ? "You are in " + d.short + " (year " + d.year + " of " + d.yearsTotal + "). " : "") +
      "A decade-close report sums that decade's carbon. The rail to Jersey City is the long horizon either way."
    );
  }

  function matchIntent(q) {
    const t = q.toLowerCase();
    if (/(money|broke|spend|jar|income|cash|earn|profit|next season|nextseason|no new|nothing|afford)/.test(t)) {
      return "money";
    }
    if (/(rail|corridor|detroit|jersey|toledo|cleveland|pittsburgh)/.test(t)) return "rail";
    if (/(traditional|vs|versus|chem|fertiliz|pesticid|nitrogen|farm model|why wait)/.test(t)) return "compare";
    if (/(farm|field|regen|convert|graze|manure|soil|crop)/.test(t)) return "farm";
    if (/(lic|long island|royalt|city|capital|apartment)/.test(t)) return "lic";
    if (/(carbon|credit|sink|sequester)/.test(t)) return "carbon";
    if (/(health|nutrition|6×|6x|healthier)/.test(t)) return "health";
    if (/(village|eco-village|ecovillage)/.test(t)) return "village";
    if (/(decade|decades|year 40|long.horizon|timeline)/.test(t)) return "decade";
    if (/(win|goal|score|people|waste|circle|table|season 18|four decades)/.test(t)) return "win";
    if (/(creek|water|blue)/.test(t)) return "creek";
    if (/(look|inspect)/.test(t)) return "look";
    if (/(clear|bulldoze|demolish|refund)/.test(t)) return "clear";
    if (/(place|build|click|tool|how do i|how to|walk)/.test(t)) return "place";
    return "fallback";
  }

  function replyFor(question, ui) {
    const s = snapshot(ui);
    const intent = matchIntent(question);
    if (intent === "money") return moneyReply(s);
    if (intent === "farm") return farmReply(s);
    if (intent === "lic") return licReply(s);
    if (intent === "rail") return railReply(s);
    if (intent === "compare") return compareReply();
    if (intent === "carbon") return carbonReply(s);
    if (intent === "health") return healthReply(s);
    if (intent === "village") return villageReply(s);
    if (intent === "decade") return decadeReply(s);
    if (intent === "win") return winReply(s);
    if (intent === "place") return placeReply(s);
    if (intent === "look") return lookReply();
    if (intent === "clear") return clearReply();
    if (intent === "creek") return creekReply();
    return fallback(s);
  }

  function bind(getUi) {
    const panel = document.getElementById("zox-chat");
    const log = document.getElementById("chat-log");
    const form = document.getElementById("chat-form");
    const input = document.getElementById("chat-input");
    const toggle = document.getElementById("chat-toggle");
    const close = document.getElementById("chat-close");
    if (!panel || !log || !form || !input || !toggle) return;

    function open() {
      panel.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      try {
        sessionStorage.setItem("zox-chat-open", "1");
      } catch (err) {
        /* ignore */
      }
      input.focus();
    }

    function shut() {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      try {
        sessionStorage.setItem("zox-chat-open", "0");
      } catch (err) {
        /* ignore */
      }
    }

    function addLine(who, text) {
      const row = document.createElement("div");
      row.className = "chat-line is-" + who;
      const label = document.createElement("b");
      label.textContent = who === "you" ? "You" : "ZOX";
      const body = document.createElement("p");
      body.textContent = text;
      row.appendChild(label);
      row.appendChild(body);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }

    function ask(question) {
      const q = String(question || "").trim();
      if (!q) return;
      addLine("you", q);
      addLine("bot", replyFor(q, getUi()));
    }

    if (!log.childElementCount) {
      addLine(
        "bot",
        "Kitchen table. Ask about the jar, carbon sequestration, health from 6× nutrition, the rail, or LIC rent. I read the live game — not a brochure."
      );
      addLine("you", "What's the long-term goal?");
      addLine("bot", replyFor("What's the rail?", getUi()));
      addLine("you", "What's LIC?");
      addLine("bot", replyFor("What's LIC?", getUi()));
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = input.value;
      input.value = "";
      ask(q);
    });

    panel.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-chip]");
      if (chip) ask(chip.getAttribute("data-chip"));
    });

    toggle.addEventListener("click", () => {
      if (panel.hidden) open();
      else shut();
    });
    if (close) close.addEventListener("click", shut);

    let preferOpen = false;
    try {
      preferOpen = sessionStorage.getItem("zox-chat-open") === "1";
    } catch (err) {
      preferOpen = false;
    }
    if (preferOpen) open();
    else shut();
  }

  Zox.Help = { bind, replyFor, snapshot };
})(window);
