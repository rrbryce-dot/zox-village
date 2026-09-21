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
        ") on the valley map. You walk that farm next — compost and rail go on the farm board, not the valley."
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
        ") on the valley map, then walk that farm. That city capital is what the fields are for."
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
        ". Farm models (M) shows why waiting out regen pays."
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
        ". Converting lots wean off fertilizer for five years. Farm models shows Traditional $8 net vs Zox regen $16 with no chem bill."
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
        ". Wait the fields out — regen drops the chem bill. LIC rent keeps arriving from the city."
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
      " now — if it feels tight, that cash already bought lots. Farmland is $" +
      s.farmCost +
      ". City capital plus crops buy the next field."
    );
  }

  function farmReply(s) {
    const extra = s.farms
      ? " On the map: " +
        s.mature +
        " regen, " +
        s.converting.length +
        " converting" +
        (s.converting.length ? " (" + farmYearLine(s) + ")" : "") +
        "."
      : " You haven't bought a field yet.";
    return (
      "Buy farmland for $" +
      s.farmCost +
      " on the valley map. You then walk that farm — compost, power, rail, orchards, and homes go on its board. For five seasons the farm is converting: thin crop check, shrinking chem bill. At maturity the chem bill hits zero — animals graze the cover, manure stays, net $16. Harvest is cash, not supper." +
      extra +
      (s.view === "farm" && s.farmName ? " You're on " + s.farmName + " now." : "") +
      " Farm models (M) puts Traditional vs Zox side by side."
    );
  }

  function licReply(s) {
    return (
      "The LIC green building already stands in Long Island City — not on this valley. You cannot place it. Rent and royalties, $" +
      s.licRent +
      " a season, arrive on the income strip as LIC rent." +
      (s.paid ? " Last season that line was $" + (s.inc.apartments || s.licRent) + "." : " Hit Next Season to see the first check.") +
      " Loop: city capital → buy a farm here → walk it → five-year regen → crops buy more land."
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
      " net. Zox regen: $" +
      r.gross +
      " gross, $0 chem, graze and manure, $" +
      (r.gross - r.inputs) +
      " net. Conversion weans the bag over five years. Open Farm models for the three columns."
    );
  }

  function placeReply(s) {
    const tool = s.tool === "inspect" ? "Look" : s.tool;
    return (
      (s.view === "farm"
        ? "You're on a farm board. Place compost, power, rail, orchards, and homes here. Back to map (B) buys the next parcel."
        : "Valley map: buy farmland, then you walk that farm. Improvements are not placed on the valley.") +
      " Creek stays creek. You do not place the LIC building. Look reads a tile. Clear lot refunds about half. Selected tool: " +
      tool +
      "."
    );
  }

  function winReply(s) {
    return (
      "By season " +
      s.goal.seasons +
      " you want people ≥ " +
      s.goal.population +
      " (now " +
      s.pop +
      "), waste ≤ " +
      s.goal.wasteMax +
      " (now " +
      s.waste +
      "), circle ≥ " +
      s.goal.natureMin +
      " (now " +
      s.nature +
      "), table ≥ " +
      s.goal.happinessMin +
      " (now " +
      s.happiness +
      "), and the jar above $0 (now $" +
      s.money +
      "). Settlement and ecology and cash. Farms do not feed anyone."
    );
  }

  function carbonReply(s) {
    return (
      "Carbon credits are a separate cash stream from living lots: converting farms $1, mature regen $4, orchards $3, standing groves a little (capped). Last season credits were $" +
      (s.inc.credits || 0) +
      ". They matter. They should not out-earn a mature field."
    );
  }

  function lookReply() {
    return "Look is free. Click a tile and the right panel reads it. On a field you'll see the model — converting or Zox regenerative — plus gross, chem, and net. Creek tiles say leave it.";
  }

  function clearReply() {
    return "Clear lot pulls a building and puts about half the timber back in the jar. Use it if you dropped a piece on the wrong meadow. Creek never had a building to pull.";
  }

  function creekReply() {
    return "Blue tiles are the creek. They are not building lots — you'll get “Creek stays creek.” Build on meadow or grove. Clearing a grove hurts the circle.";
  }

  function fallback(s) {
    return (
      "Ask me about money, Next Season, farms, LIC, Traditional vs Zox, carbon credits, placing, or the win. Right now: jar $" +
      s.money +
      ", season " +
      s.season +
      ", LIC rent $" +
      s.licRent +
      " from the city, " +
      s.farms +
      " field" +
      (s.farms === 1 ? "" : "s") +
      " (" +
      s.mature +
      " regen)."
    );
  }

  function matchIntent(q) {
    const t = q.toLowerCase();
    if (/(money|broke|spend|jar|income|cash|earn|profit|next season|nextseason|no new|nothing|afford)/.test(t)) {
      return "money";
    }
    if (/(traditional|vs|versus|chem|fertiliz|pesticid|nitrogen|farm model|why wait)/.test(t)) return "compare";
    if (/(farm|field|regen|convert|graze|manure|soil|crop)/.test(t)) return "farm";
    if (/(lic|long island|royalt|city|capital|apartment)/.test(t)) return "lic";
    if (/(carbon|credit|sink)/.test(t)) return "carbon";
    if (/(win|goal|people|waste|circle|table|season 18)/.test(t)) return "win";
    if (/(creek|water|blue)/.test(t)) return "creek";
    if (/(look|inspect)/.test(t)) return "look";
    if (/(clear|bulldoze|demolish|refund)/.test(t)) return "clear";
    if (/(place|build|click|tool|how do i|how to)/.test(t)) return "place";
    return "fallback";
  }

  function replyFor(question, ui) {
    const s = snapshot(ui);
    const intent = matchIntent(question);
    if (intent === "money") return moneyReply(s);
    if (intent === "farm") return farmReply(s);
    if (intent === "lic") return licReply(s);
    if (intent === "compare") return compareReply();
    if (intent === "carbon") return carbonReply(s);
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
        "Kitchen table. Ask about the jar, Next Season, farms, or LIC rent from the city. I read the live valley — not a brochure."
      );
      addLine("you", "What's LIC?");
      addLine("bot", replyFor("What's LIC?", getUi()));
      addLine("you", "I hit Next Season and don't see new money.");
      addLine("bot", replyFor("I hit Next Season and don't see new money.", getUi()));
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
