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
      railNeed: rail.need,
      railReady: rail.ready,
    };
  }

  function farmYearLine(s) {
    if (!s.converting.length) return "";
    return s.converting
      .map((f) => "year " + f.year + " of " + f.need + " (net $" + f.net + " after $" + f.inputs + " chem)")
      .join("; ");
  }

  function moneyReply(s) {
    if (!s.paid) {
      return (
        "LIC rent is already coming from Long Island City — off this map, $" +
        s.licRent +
        " every season. It lands when you hit Next Season, not as a tile you place. The jar is $" +
        s.money +
        " in seed money. Buy farmland ($" +
        s.farmCost +
        ") on the corridor map along the dashed green rail. You walk that farm next — compost and rail go on the farm board, not the corridor. Long-term: convert, buy the next farm along the line, light the Detroit–Jersey City rail."
      );
    }
    if (s.farms === 0) {
      return (
        "LIC rent $" +
        (s.inc.apartments || s.licRent) +
        " landed from the city. Last season net was $" +
        (s.inc.net || 0) +
        ". You do not drop an LIC building here. Buy farmland ($" +
        s.farmCost +
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
        ". LIC rent $" +
        (s.inc.apartments || s.licRent) +
        " still arrives from the city. The chem bill eats most of the crop check — last season crops $" +
        (s.inc.crops || 0) +
        ", chem −$" +
        (s.inc.inputs || 0) +
        ", net $" +
        (s.inc.net || 0) +
        ". When a farm matures, buy the next deed along the rail. Rail lit " +
        s.railLit +
        "/" +
        s.railNeed +
        "."
      );
    }
    if (s.inc.inputs > 0 && s.inc.cropGross && s.inc.inputs >= s.inc.cropGross * 0.4) {
      return (
        "The crop check landed, then the chem bill took a bite. Last season: gross crops $" +
        (s.inc.cropGross || 0) +
        ", chem −$" +
        s.inc.inputs +
        ", crop net $" +
        (s.inc.crops || 0) +
        ", LIC rent $" +
        (s.inc.apartments || 0) +
        ", credits $" +
        (s.inc.credits || 0) +
        ", jar net $" +
        (s.inc.net || 0) +
        ". Converting lots wean off fertilizer for five years. Then buy the next farm along the corridor."
      );
    }
    if ((s.inc.net || 0) <= 2 && (s.inc.upkeep || 0) > (s.inc.crops || 0) + (s.inc.apartments || 0)) {
      return (
        "Money came in and went back out. Last season upkeep was $" +
        s.inc.upkeep +
        " against crops $" +
        (s.inc.crops || 0) +
        ", LIC rent $" +
        (s.inc.apartments || 0) +
        ", credits $" +
        (s.inc.credits || 0) +
        ". Net $" +
        (s.inc.net || 0) +
        ". The jar is $" +
        s.money +
        ". Wait the fields out — regen drops the chem bill. Then buy the next parcel along the rail."
      );
    }
    return (
      "You did earn. Last season: crops $" +
      (s.inc.crops || 0) +
      ", LIC rent $" +
      (s.inc.apartments || 0) +
      ", carbon credits $" +
      (s.inc.credits || 0) +
      (s.inc.inputs ? ", chem −$" + s.inc.inputs : "") +
      ", net $" +
      (s.inc.net || 0) +
      ". The jar is $" +
      s.money +
      " now. Farmland is $" +
      s.farmCost +
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
      "Buy farmland for $" +
      s.farmCost +
      " on the corridor map (deed markers along the dashed green rail). You then walk that farm — compost, power, rail, orchards, and homes go on its board. For five seasons the farm is converting. At maturity the chem bill hits zero and adjacent mature farms light the corridor rail solid. Loop: convert → buy the next farm along the line → light Detroit to Jersey City." +
      extra +
      (s.view === "farm" && s.farmName ? " You're on " + s.farmName + " now." : "") +
      " Farm models (M) puts Traditional vs Zox side by side."
    );
  }

  function licReply(s) {
    return (
      "The LIC green building already stands in Long Island City — not on this corridor. You cannot place it. Rent and royalties, $" +
      s.licRent +
      " a season, arrive on the income strip as LIC rent." +
      (s.paid ? " Last season that line was $" + (s.inc.apartments || s.licRent) + "." : " Hit Next Season to see the first check.") +
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
    const t = Zox.FARM_MODELS.traditional;
    const r = Zox.FARM_MODELS.regenerative;
    return (
      "Traditional: $" +
      t.gross +
      " gross minus $" +
      t.inputs +
      " fertilizer, pesticides, and nitrogen = $" +
      (t.gross - t.inputs) +
      " net, nutrition 1×. Zox regen: $" +
      r.gross +
      " gross, $0 chem, graze and manure, $" +
      (r.gross - r.inputs) +
      " net, nutrition 6× traditional — that feeds the Health win meter. Conversion weans the bag over five years (~2× nutrition). Open Farm models for the three columns."
    );
  }

  function placeReply(s) {
    const tool = s.tool === "inspect" ? "Look" : s.tool;
    return (
      (s.view === "farm"
        ? "You're on a farm board. Place compost, power, rail, orchards, and homes here. Back to map (B) buys the next parcel along the corridor."
        : "Corridor map: buy farmland on a deed marker, then you walk that farm. Improvements are not placed on the corridor.") +
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
      ") AND the jar stays above $0 (now $" +
      s.money +
      "). Health climbs because regenerative nutrition is " +
      (s.goal.nutritionFactor || 6) +
      "× better than traditional — converting farms are about 2×. Soft loses: broke, waste disaster, or time out at season " +
      s.goal.seasons +
      ". Win score is mostly that season's carbon plus health (plus a bit for rail progress and leftover seasons). Rail lit " +
      s.railLit +
      "/" +
      s.railNeed +
      "."
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
      "). Carbon credits $ are a separate income line from living lots — last season $" +
      (s.inc.credits || 0) +
      ". Credits buy the next deed; sequestration wins the game."
    );
  }

  function healthReply(s) {
    return (
      "Health is 0–100 from regenerative nutrition × people on the corridor. Traditional food = 1×. Converting ≈ 2×. Mature Zox regen = " +
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
      "Ask me about money, farms, the rail, LIC, carbon sequestration, health / 6× nutrition, Traditional vs Zox, or the win score. Right now: jar $" +
      s.money +
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
    if (/(win|goal|score|people|waste|circle|table|season 18)/.test(t)) return "win";
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
