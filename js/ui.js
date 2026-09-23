/**
 * DOM: toolbar, grid, meters, intro, and end card.
 */
(function (global) {
  const Zox = (global.Zox = global.Zox || {});

  const ICONS = {
    inspect: "◉",
    home: "⌂",
    farm: "☘",
    apartment: "▦",
    solar: "☼",
    compost: "♻",
    rail: "☰",
    park: "❀",
    village: "🏘",
    bulldoze: "✗",
  };

  function el(id) {
    return document.getElementById(id);
  }

  function signed(n) {
    if (n > 0) return "+" + n;
    return String(n);
  }

  function toolList(view) {
    return view === "farm" ? Zox.FARM_TOOLS : Zox.WORLD_TOOLS;
  }

  function toolDef(tool) {
    if (tool.kind === "build") {
      const b = Zox.BUILDINGS[tool.id];
      return {
        id: tool.id,
        name: b.name,
        cost: b.cost,
        hint: b.hint,
        kind: "build",
      };
    }
    return { id: tool.id, name: tool.name, cost: 0, hint: tool.hint, kind: "tool" };
  }

  function createUI(root) {
    const ui = {
      state: Zox.Sim.freshState(),
      view: "world",
      farmId: null,
      tool: "farm",
      hover: null,
      selected: null,
      flash: "",
      boardKey: "",
      grazing: false,
    };

    function currentFarm() {
      return ui.view === "farm" ? Zox.Sim.getFarm(ui.state, ui.farmId) : null;
    }

    function boardTiles() {
      return Zox.Sim.tilesForView(ui.state, ui.view === "farm" ? ui.farmId : null);
    }

    function flash(msg) {
      ui.flash = msg;
      const bar = el("flash");
      bar.textContent = msg;
      bar.hidden = !msg;
    }

    function seasonLabel() {
      const s = ui.state.season;
      if (Zox.Sim.decadeInfo) {
        if (s > Zox.GOAL.seasons) {
          return "After Decade " + (Zox.GOAL.decades || 4) + " · Year " + Zox.GOAL.seasons;
        }
        return Zox.Sim.decadeInfo(s).label;
      }
      if (s > Zox.GOAL.seasons) return "After season " + Zox.GOAL.seasons;
      return "Season " + s + " of " + Zox.GOAL.seasons;
    }

    function enterFarm(id, bought) {
      const farm = Zox.Sim.getFarm(ui.state, id);
      if (!farm) return;
      ui.view = "farm";
      ui.farmId = id;
      ui.selected = null;
      ui.hover = null;
      ui.tool = "inspect";
      ui.boardKey = "";
      flash(
        bought
          ? farm.name + " is yours. Place compost, power, rail, orchards, and homes on this farm."
          : "Walking " + farm.name + "."
      );
      render();
    }

    function leaveFarm() {
      ui.view = "world";
      ui.farmId = null;
      ui.selected = null;
      ui.hover = null;
      ui.tool = "farm";
      ui.boardKey = "";
      flash("");
      render();
    }

    function openParcelsLeft() {
      const list = Zox.CORRIDOR.parcels || [];
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        if (!Zox.Sim.getFarmByParcel(ui.state, list[i].id)) n += 1;
      }
      return n;
    }

    function canAffordNextFarm() {
      if (ui.state.status !== "playing") return false;
      if (openParcelsLeft() <= 0) return false;
      return ui.state.money >= Zox.BUILDINGS.farm.cost;
    }

    function goBuyNextFarm() {
      hideSeasonWins();
      ui.grazing = false;
      ui.view = "world";
      ui.farmId = null;
      ui.selected = null;
      ui.hover = null;
      ui.tool = "farm";
      ui.boardKey = "";
      const cost = Zox.BUILDINGS.farm.cost;
      const left = openParcelsLeft();
      flash(
        "Jar has $" +
          ui.state.money +
          ". Farmland tool is ready — click the next deed along the rail ($" +
          cost +
          "). " +
          left +
          " open parcel" +
          (left === 1 ? "" : "s") +
          " left."
      );
      render();
    }

    function renderMeters() {
      const s = ui.state;
      const carbonScale = Math.max(40, Zox.GOAL.carbonMin + 8);
      const items = [
        { id: "money", label: "Profit", value: "$" + s.money, raw: s.money, good: s.money >= 40, warn: s.money < 20 },
        {
          id: "carbon",
          label: "Carbon",
          value: String(s.carbonSeason || 0),
          raw: s.carbonSeason || 0,
          max: carbonScale,
          sub: "sequestered",
        },
        { id: "health", label: "Health", value: String(s.health || 0), raw: s.health || 0, max: 100 },
        { id: "waste", label: "Waste", value: String(s.waste), raw: s.waste, invert: true, max: 100 },
        {
          id: "energy",
          label: "Energy",
          value: s.energySupply + " / " + s.energyDemand,
          raw: s.energyDemand === 0 ? 100 : Math.round((s.energySupply / Math.max(1, s.energyDemand)) * 100),
          max: 100,
        },
        { id: "people", label: "People", value: String(s.population), raw: s.population, max: 24 },
      ];

      const box = el("meters");
      box.innerHTML = items
        .map((m) => {
          let pct = m.max ? clampPct(m.raw, m.max) : 50;
          if (m.invert) pct = 100 - pct;
          let tone = "ok";
          if (m.id === "waste") tone = s.waste <= 22 ? "good" : s.waste < 55 ? "ok" : "bad";
          else if (m.id === "carbon")
            tone = (s.carbonSeason || 0) >= Zox.GOAL.carbonMin ? "good" : (s.carbonSeason || 0) < 10 ? "ok" : "ok";
          else if (m.id === "health")
            tone = (s.health || 0) >= Zox.GOAL.healthMin ? "good" : (s.health || 0) < 35 ? "bad" : "ok";
          else if (m.id === "energy") tone = s.energySupply >= s.energyDemand ? "good" : s.energyDemand ? "bad" : "ok";
          else if (m.id === "people") tone = s.population >= 8 ? "good" : "ok";
          else if (m.id === "money") tone = s.money < 0 ? "bad" : s.money < 20 ? "warn" : "ok";

          const delta = s.lastDelta && mapDeltaKey(m.id) ? s.lastDelta[mapDeltaKey(m.id)] : null;
          const dHtml =
            delta && delta !== 0
              ? `<span class="delta ${delta > 0 ? "up" : "down"}">${signed(delta)}</span>`
              : "";
          const label =
            m.id === "carbon"
              ? `${m.label} <em class="meter-sub">sequestered</em>`
              : m.label;

          return `<div class="meter tone-${tone}" data-meter="${m.id}">
            <div class="meter-top"><span>${label}</span><strong>${m.value}</strong>${dHtml}</div>
            <div class="meter-bar" role="presentation"><i style="width:${pct}%"></i></div>
          </div>`;
        })
        .join("");
      renderIncome();
    }

    function renderIncome() {
      const box = el("income");
      if (!box) return;
      const inc = ui.state.lastIncome || { crops: 0, apartments: 0, credits: 0, net: 0 };
      const started = ui.state.season > 1 || (ui.state.lastDelta && ui.state.lastDelta.money !== 0);
      if (!started && ui.state.season === 1 && !ui.state.lastDelta) {
        box.innerHTML =
          `<span class="kicker">This season</span>` +
          `<span class="income-hint">LIC rent buys farmland along the corridor. Purchase a deed, walk that farm, convert, buy the next along the rail.</span>`;
        return;
      }
      box.innerHTML =
        `<span class="kicker">This season</span>` +
        `<span><i>Crops</i> <b>$${inc.crops}</b></span>` +
        (inc.inputs ? `<span><i>Chem bill</i> <b>−$${inc.inputs}</b></span>` : "") +
        `<span><i>Crop rent</i> <b>$${inc.graze || 0}</b></span>` +
        `<span><i>LIC rent</i> <b>$${inc.apartments}</b></span>` +
        `<span><i>Carbon credits</i> <b>$${inc.credits}</b></span>` +
        `<span class="income-net"><i>Net</i> <b>${inc.net >= 0 ? "+" : ""}$${inc.net}</b></span>`;
    }

    function mapDelta(d) {
      return {
        money: d.money,
        waste: d.waste,
        carbon: d.carbon,
        health: d.health,
        people: d.population,
      };
    }
    function mapDeltaKey(id) {
      return {
        money: "money",
        waste: "waste",
        carbon: "carbon",
        health: "health",
        people: "population",
      }[id];
    }
    function clampPct(n, max) {
      return Math.max(0, Math.min(100, Math.round((n / max) * 100)));
    }

    function renderToolbar() {
      const box = el("tools");
      box.innerHTML = toolList(ui.view)
        .map((raw) => {
          const t = toolDef(raw);
          const on = ui.tool === t.id ? " is-on" : "";
          const cost = t.kind === "build" ? `<span class="cost">$${t.cost}</span>` : `<span class="cost mute">free</span>`;
          const broke = t.kind === "build" && ui.state.money < t.cost ? " is-broke" : "";
          return `<button type="button" class="tool${on}${broke}" data-tool="${t.id}" title="${t.hint}">
          <span class="glyph" aria-hidden="true">${ICONS[t.id]}</span>
          <span class="tool-copy"><b>${t.name}</b>${cost}</span>
        </button>`;
        })
        .join("");
    }

    function renderChrome() {
      const farm = currentFarm();
      const title = el("view-title");
      const sub = el("view-sub");
      const back = el("back-map");
      const board = document.querySelector(".board");
      const place = el("place-head");
      const keys = el("keys-line");
      const meadow = el("legend-meadow");
      const legend = document.querySelector(".legend");
      if (board) {
        board.classList.toggle("is-farm", ui.view === "farm");
        board.classList.toggle("is-grazing-board", !!ui.grazing && ui.view === "farm");
      }
      if (board) board.classList.toggle("is-corridor", ui.view === "world");
      if (farm) {
        const prog = Zox.Sim.farmProgress(farm);
        title.textContent = farm.name;
        sub.textContent = prog.mature
          ? "Zox regenerative — no chem bill. Improvements stay on this farm. Back to map for the next deed along the rail."
          : "Year " + prog.year + " of " + prog.need + ". Compost, power, rail, orchards, and homes go here.";
        back.hidden = false;
        const afford = canAffordNextFarm();
        back.classList.toggle("is-hot", afford);
        back.textContent = afford ? "Back to map — buy next farm" : "Back to map";
        const buyBtn = el("buy-next-farm");
        if (buyBtn) {
          buyBtn.hidden = !afford;
          if (afford) {
            buyBtn.textContent =
              "Buy farm #" +
              (ui.state.farms.length + 1) +
              " on the map ($" +
              Zox.BUILDINGS.farm.cost +
              ")";
          }
        }
        if (place) place.textContent = "Improvements on this farm";
        if (keys) keys.textContent = "Keys 1–8 pick tools (7 = eco-village). B back to map. Enter turns the season.";
        if (meadow) meadow.textContent = "Field";
        if (legend) legend.hidden = false;
      } else {
        const rail = Zox.Sim.railProgress(ui.state);
        title.textContent = "Corridor map";
        sub.textContent = rail.ready
          ? "Green rail lit solid Detroit → Jersey City. Keep the settlement and the circle healthy."
          : "Long-term goal: build the green rail. Buy farms along the line, convert (5 seasons), buy the next. " +
            rail.lit +
            "/" +
            rail.need +
            " rail segments lit.";
        back.hidden = true;
        back.classList.remove("is-hot");
        back.textContent = "Back to map";
        const buyBtnW = el("buy-next-farm");
        if (buyBtnW) {
          const affordW = canAffordNextFarm();
          buyBtnW.hidden = !affordW;
          if (affordW) {
            buyBtnW.textContent =
              "Buy farm #" +
              (ui.state.farms.length + 1) +
              " — click a deed ($" +
              Zox.BUILDINGS.farm.cost +
              ")";
          }
        }
        if (place) place.textContent = "What to place";
        if (keys) keys.textContent = "Keys 1–2 pick tools. Click a deed to buy or walk it. Enter turns the season.";
        if (meadow) meadow.textContent = "Meadow";
        if (legend) legend.hidden = true;
      }
    }

    function fitBoard() {
      const grid = el("grid");
      if (ui.view === "world") {
        grid.style.height = "";
        const stage = grid.querySelector(".corridor-stage");
        if (stage) stage.style.transform = "";
        return;
      }
      const stage = grid.querySelector(".iso-stage");
      if (!stage) return;
      const scale = Math.min(1, grid.clientWidth / stage.offsetWidth);
      stage.style.transform = "scale(" + scale + ")";
      grid.style.height = Math.ceil(stage.offsetHeight * scale) + "px";
    }

    function renderGrid(force) {
      const grid = el("grid");
      const tiles = boardTiles();
      const key = Zox.Render.boardKey(tiles, ui);
      if (force || key !== ui.boardKey) {
        ui.boardKey = key;
        grid.innerHTML = Zox.Render.worldHTML(tiles, ui);
        grid.setAttribute("aria-label", ui.view === "farm" ? "Farm board" : "Detroit to Jersey City corridor");
        grid.classList.toggle("iso-world", ui.view === "farm");
        grid.classList.toggle("corridor-world", ui.view === "world");
        fitBoard();
        return;
      }
      Zox.Render.syncFlags(grid, ui);
    }

    function renderAside() {
      const tools = toolList(ui.view);
      const tool = tools.find((t) => t.id === ui.tool) || tools[0];
      if (tool && ui.tool !== tool.id) ui.tool = tool.id;
      const info = toolDef(tool);
      el("tool-name").textContent = info.name;
      el("tool-hint").textContent = info.hint;
      el("tool-cost").textContent = info.kind === "build" ? "Costs $" + info.cost : "No cost";

      const inspectBox = el("inspect");
      if (ui.view === "world") {
        const look =
          ui.selected && ui.selected.parcelId
            ? Zox.Sim.inspectParcel(ui.state, ui.selected.parcelId)
            : null;
        if (!look) {
          inspectBox.innerHTML = `<p class="quiet">Click a deed along the dashed green rail to buy a farm, or a deed you already own to walk it. Long-term goal: light the rail Detroit → Jersey City.</p>`;
        } else {
          inspectBox.innerHTML = `<h3>${look.title}</h3><ul>${look.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
          if (look.farm) {
            inspectBox.innerHTML +=
              `<p><button type="button" class="linkish" data-enter-farm="${look.farm.id}">Walk this farm</button></p>`;
          }
        }
        renderCompare(look);
      } else {
        const farmId = ui.farmId;
        const look = ui.selected ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c, farmId) : null;
        if (!look) {
          inspectBox.innerHTML = `<p class="quiet">Click a lot on this farm. The ditch is not a building lot.</p>`;
        } else {
          inspectBox.innerHTML = `<h3>${look.title}</h3><ul>${look.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
        }
        renderCompare(look);
      }

      const goals = el("goals");
      goals.innerHTML = Zox.Sim.goalProgress(ui.state)
        .map((g) => {
          const need =
            g.key === "solvent"
              ? "> $0"
              : g.better === "lower"
                ? "≤ " + g.need
                : "≥ " + g.need;
          const have = g.key === "solvent" ? "$" + g.have : g.have;
          return `<li class="${g.ok ? "is-met" : ""}"><span>${g.label}</span> <b>${have}</b> <em>${need}</em></li>`;
        })
        .join("");

      el("season").textContent = seasonLabel();
      el("next-season").disabled = ui.state.status !== "playing";
      const grazePay = (ui.state.farms || []).reduce((sum, f) => {
        return sum + (Zox.Sim.farmMature(f) ? Zox.GRAZE_RENT.mature : Zox.GRAZE_RENT.converting);
      }, 0);
      const nextBtn = el("next-season");
      const payEl = el("graze-pay-hint");
      if (payEl) {
        payEl.textContent =
          grazePay > 0
            ? "Animals graze · manure stays · about +$" + grazePay + " crop rent"
            : "Buy a farm first — then rent the crop to the animals";
      }
      if (nextBtn) nextBtn.setAttribute("aria-label", "End season: rent crop to animals, collect graze rent, turn the season");

      const log = el("log");
      log.innerHTML = ui.state.log
        .map((row) => `<li><span class="when">S${Math.min(row.season, Zox.GOAL.seasons)}</span> ${row.text}</li>`)
        .join("");
    }

        function renderCompare(look) {

      const LEDGER_LINES = [
        { key: "fertilizer", label: "Fertilizer", money: true },
        { key: "syntheticNitrogen", label: "Synthetic nitrogen", money: true },
        { key: "insecticides", label: "Insecticides", money: true },
        { key: "herbicides", label: "Herbicides", money: true },
        { key: "fungicides", label: "Fungicides", money: true },
        { key: "fossilFuel", label: "Fossil fuel / diesel", money: true },
        { key: "purchasedSeed", label: "Purchased seed", money: true },
        { key: "irrigationChemicals", label: "Irrigation chemicals", money: true },
        { key: "manureReturn", label: "Manure nutrients returned", money: false, good: true },
        { key: "soilOrganicMatter", label: "Soil organic matter", money: false, good: true },
        { key: "carbonTons", label: "Carbon sequestered", money: false, good: true, unit: "t" },
        { key: "nutritionMult", label: "Nutrition multiplier", money: false, good: true, unit: "×" },
        { key: "waterUse", label: "Water use", money: false, invert: true },
        { key: "runoff", label: "Runoff", money: false, invert: true },
        { key: "erosion", label: "Erosion", money: false, invert: true },
        { key: "biodiversity", label: "Biodiversity", money: false, good: true },
        { key: "laborChem", label: "Labor on chem bill", money: true },
        { key: "laborLiving", label: "Living-system care", money: true, soft: true },
      ];

      function fmtLedger(v, line) {
        if (v == null) return "—";
        if (line.unit === "×") return v + "×";
        if (line.unit === "t") return v + " t";
        if (line.money) {
          if (v === 0) return "$0";
          return (v > 0 && !line.soft ? "−$" : "$") + Math.abs(v);
        }
        if (line.good && v > 0) return "+" + v;
        return String(v);
      }

      function ledgerTable(led) {
        if (!led) return "";
        return `<table class="ledger-table"><tbody>` +
          LEDGER_LINES.map(function (line) {
            const v = led[line.key];
            const zero = line.money && v === 0;
            return `<tr class="${zero ? "is-zero" : ""} ${line.good ? "is-good" : ""} ${line.invert ? "is-bad" : ""}"><th>${line.label}</th><td>${fmtLedger(v, line)}</td></tr>`;
          }).join("") +
          `</tbody></table>`;
      }

      const box = el("farm-sidebar");
      if (!box) return;
      const farm = currentFarm() || (look && look.farm);
      const books = farm ? Zox.Sim.farmBooks(farm) : null;
      const rows = Zox.Sim.farmModelRows();
      const trad = rows[0];
      const conv = rows[1];
      const regen = rows[2];

      function col(row, extra) {
        const on = !!(books && books.model === row.id);
        const live =
          on && books.model === "converting"
            ? { name: books.label, gross: books.gross, inputs: books.inputs, net: books.net, ledger: books.ledger }
            : row;
        const led = live.ledger || row.ledger;
        return `<article class="farm-col ${row.id}${on ? " is-you" : ""}${extra || ""}">
          <h3>${live.name || row.name}</h3>
          ${on ? `<p class="you-are">${farm && farm.name ? farm.name : "This farm"}</p>` : ""}
          <dl class="farm-summary">
            <div><dt>Gross / acre</dt><dd>$${live.gross}</dd></div>
            <div><dt>Chem / inputs</dt><dd>${live.inputs ? "−$" + live.inputs : "$0"}</dd></div>
            <div class="net"><dt>Net income / acre</dt><dd>$${live.net}</dd></div>
            <div><dt>Nutrition</dt><dd>${row.id === "regenerative" ? "6×" : row.id === "converting" ? "~2×" : "1×"}</dd></div>
          </dl>
          <p class="ledger-kicker">Input ledger ($/acre · season)</p>
          ${ledgerTable(led)}
          ${row.id !== "converting" ? `<p class="net-hero">$${live.net}<span class="net-sub">net / acre</span></p>` : ""}
        </article>`;
      }

      box.innerHTML =
        col(trad) +
        col(conv, " is-slim") +
        col(regen, " is-win") +
        `<p class="quiet compare-punch">Regen nets <b>$${regen.net}/acre</b> with a $0 chem bill and 6× nutrition. Traditional nets <b>$${trad.net}/acre</b> after fertilizer, nitrogen, pesticides, and diesel. That cash buys the next farm along the rail — that is why the wait pays.</p>`;
    }

    function renderEnd() {
      const overlay = el("end-card");
      if (ui.state.status === "playing") {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      el("end-title").textContent = ui.state.status === "won" ? "The village holds." : "Not this corridor.";
      el("end-body").textContent = ui.state.endReason;
      el("end-score").textContent =
        "Win score " +
        ui.state.score +
        " · carbon " +
        (ui.state.carbonSeason || 0) +
        " · health " +
        (ui.state.health || 0);
    }

    function render() {
      root.dataset.status = ui.state.status;
      root.dataset.view = ui.view;
      renderChrome();
      renderMeters();
      renderToolbar();
      renderGrid();
      renderAside();
      renderEnd();
      const farm = currentFarm();
      if (farm) {
        const prog = Zox.Sim.farmProgress(farm);
        el("food-note").textContent = farm.name + (prog.mature ? " — regen." : " — year " + prog.year + " of 5.");
      } else {
        const rail = Zox.Sim.railProgress(ui.state);
        if (ui.state.farms.length === 0) {
          el("food-note").textContent = "Corridor map. Buy a farm along the rail.";
        } else if (ui.state.population === 0) {
          el("food-note").textContent =
            ui.state.farms.length +
            " farm" +
            (ui.state.farms.length === 1 ? "" : "s") +
            " · rail " +
            rail.lit +
            "/" +
            rail.need;
        } else {
          el("food-note").textContent =
            ui.state.population + " people · rail " + rail.lit + "/" + rail.need;
        }
      }
    }

    function pickTool(id) {
      const allowed = toolList(ui.view).some((t) => t.id === id);
      if (!allowed) return;
      ui.tool = id;
      flash("");
      render();
    }

    function actOnParcel(parcelId) {
      ui.selected = { parcelId: parcelId };
      const farm = Zox.Sim.getFarmByParcel(ui.state, parcelId);
      if (farm) {
        if (ui.tool === "inspect") {
          flash("");
          render();
          return;
        }
        enterFarm(farm.id, false);
        return;
      }
      if (ui.tool === "inspect") {
        flash("");
        render();
        return;
      }
      if (ui.tool === "farm") {
        const res = Zox.Sim.buyParcel(ui.state, parcelId);
        flash(res.ok ? "" : res.why);
        if (res.ok && res.enter) {
          enterFarm(res.enter, true);
          return;
        }
        render();
        return;
      }
      flash("Improvements go on a farm. Buy a parcel first.");
      render();
    }

    function actOnTile(r, c) {
      ui.selected = { r, c };
      const farmId = ui.farmId;
      if (ui.tool === "inspect") {
        flash("");
        render();
        return;
      }
      if (ui.tool === "bulldoze") {
        const res = Zox.Sim.clearLot(ui.state, r, c, farmId);
        flash(res.ok ? "" : res.why);
        render();
        return;
      }
      const res = Zox.Sim.place(ui.state, r, c, ui.tool, farmId);
      flash(res.ok ? "" : res.why);
      render();
    }

        function showSeasonWins() {
      const card = el("season-win");
      if (!card) return;
      const wins = ui.state.lastSeasonWins || {
        earth: ui.state.carbonSeason || 0,
        population: ui.state.nutritionExtra || 0,
      };
      const report = ui.state.lastReport || (Zox.Sim.seasonReportCard ? Zox.Sim.seasonReportCard(ui.state) : null);
      const earth = el("earth-win-num");
      const pop = el("pop-win-num");
      if (earth) earth.textContent = String(wins.earth || 0);
      if (pop) pop.textContent = String(wins.population || 0);
      const grazeEl = el("graze-win-num");
      const graze = (ui.state.lastIncome && ui.state.lastIncome.graze) || 0;
      if (grazeEl) grazeEl.textContent = "$" + graze;

      const title = el("season-win-title");
      if (title && report && report.decade) {
        title.textContent = report.decade.label + " — report card";
      }

      const reportBox = el("season-report");
      if (reportBox && report) {
        const L = report.ledgerTrad || {};
        const R = report.ledgerRegen || {};
        function bar(label, a, b, unit) {
          const max = Math.max(Math.abs(a), Math.abs(b), 1);
          const wa = Math.round((Math.abs(a) / max) * 100);
          const wb = Math.round((Math.abs(b) / max) * 100);
          return `<div class="report-row"><span class="report-label">${label}</span>
            <div class="report-bars">
              <div class="bar trad" style="width:${wa}%"><i>${a}${unit || ""}</i></div>
              <div class="bar regen" style="width:${wb}%"><i>${b}${unit || ""}</i></div>
            </div></div>`;
        }
        reportBox.innerHTML =
          `<div class="report-head"><span>Traditional</span><span>Regenerative</span></div>` +
          bar("Inputs spent $/acre", (Number(L.fertilizer)||0)+(Number(L.syntheticNitrogen)||0)+(Number(L.insecticides)||0)+(Number(L.herbicides)||0)+(Number(L.fungicides)||0)+(Number(L.fossilFuel)||0)+(Number(L.purchasedSeed)||0)+(Number(L.irrigationChemicals)||0) || 10, 0, "") +
          bar("Net income $/acre", report.netPerAcreTrad, report.netPerAcreRegen, "") +
          bar("Carbon (game units)", 0, report.carbon, "") +
          bar("Nutrition mult", L.nutritionMult || 1, R.nutritionMult || 6, "×") +
          bar("Biodiversity", L.biodiversity || 2, R.biodiversity || 9, "") +
          bar("Runoff / erosion", (L.runoff || 0) + (L.erosion || 0), (R.runoff || 0) + (R.erosion || 0), "") +
          `<div class="report-totals">
            <div><b>Cumulative carbon</b> ${report.carbonTotal}</div>
            <div><b>Acres</b> ${report.acres} (${report.matureAcres} mature)</div>
            <div><b>Eco-villages</b> ${report.villages}</div>
            <div><b>Rail</b> ${report.railPct}% (${report.railLit}/${report.railNeed})</div>
            <div class="report-cash"><b>Jar</b> $${report.money} · season net ${report.incomeNet >= 0 ? "+" : ""}$${report.incomeNet}</div>
          </div>
          <p class="report-link">Net $/acre from regen is what buys the next farmland along Detroit → Jersey City.</p>`;
      }

      const how = el("score-how");
      if (how) how.open = false;
      const howBody = el("score-how-body");
      if (howBody) {
        howBody.innerHTML =
          "<p><b>Earth wins</b> count carbon locked in soil this season: mature regen farms sequester the most, converting farms less, orchards and standing groves add a little. Eco-villages near mature farms boost Health and rail readiness.</p>" +
          "<p><b>Population wins</b> count additional nutrition above a traditional baseline. Mature Zox food is 6× traditional nutrition; converting farms are about 2×. Villages add a little more.</p>" +
          "<p><b>Input ledger</b> shows why regen wins: fertilizer, synthetic nitrogen, insecticides, herbicides, fungicides, diesel, purchased seed, and irrigation chemicals cost Traditional ~$10/acre and Regenerative $0 — animals and living soil replace them. Manure returns nutrients; soil organic matter rises.</p>" +
          "<p><b>Net income per acre</b> (Traditional ~$8 vs Regenerative $16) is the cash that buys the next farm along the rail. Play spans four decades toward lighting Detroit → Jersey City.</p>" +
          "<p><b>Crop rent</b> (on Next Season) is separate cash — animals graze the stubble and leave manure.</p>";
      }
      const buyNext = el("season-buy-next");
      if (buyNext) {
        const afford = canAffordNextFarm();
        buyNext.hidden = !afford;
        if (afford) {
          buyNext.textContent =
            "Buy farm #" +
            (ui.state.farms.length + 1) +
            " on the map ($" +
            Zox.BUILDINGS.farm.cost +
            ")";
        }
      }
      card.hidden = false;
    }

    function hideSeasonWins() {
      const card = el("season-win");
      if (card) card.hidden = true;
      ui.grazing = false;
      ui.boardKey = "";
    }

    function nextSeason() {
      const res = Zox.Sim.runSeason(ui.state);
      flash(res.ok ? "" : res.why);
      if (res.ok) {
        ui.grazing = true;
        if (ui.state.farms && ui.state.farms.length) {
          const last = ui.state.farms[ui.state.farms.length - 1];
          ui.view = "farm";
          ui.farmId = last.id;
          ui.tool = "inspect";
        }
        ui.boardKey = "";
        hideSeasonWins();
        render();
        // Let the herd show on the farm before the score card
        window.setTimeout(function () {
          showSeasonWins();
        }, 1600);
      } else {
        render();
      }
    }

    function restart() {
      ui.state = Zox.Sim.freshState();
      ui.view = "world";
      ui.farmId = null;
      ui.selected = null;
      ui.hover = null;
      ui.tool = "farm";
      ui.boardKey = "";
      flash("");
      hideSeasonWins();
      el("intro").hidden = true;
      render();
    }

    function bind() {
      el("tools").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tool]");
        if (btn) pickTool(btn.dataset.tool);
      });

      el("grid").addEventListener("click", (e) => {
        const parcel = e.target.closest("[data-parcel]");
        if (parcel) {
          actOnParcel(parcel.getAttribute("data-parcel"));
          return;
        }
        const btn = e.target.closest("[data-r]");
        if (!btn) return;
        actOnTile(Number(btn.dataset.r), Number(btn.dataset.c));
      });

      el("grid").addEventListener("pointerover", (e) => {
        const parcel = e.target.closest("[data-parcel]");
        if (parcel) {
          const id = parcel.getAttribute("data-parcel");
          if (ui.hover && ui.hover.parcelId === id) return;
          ui.hover = { parcelId: id };
          renderGrid();
          return;
        }
        const btn = e.target.closest("[data-r]");
        if (!btn) return;
        const r = Number(btn.dataset.r);
        const c = Number(btn.dataset.c);
        if (ui.hover && ui.hover.r === r && ui.hover.c === c) return;
        ui.hover = { r, c };
        renderGrid();
      });

      el("grid").addEventListener("pointerleave", () => {
        ui.hover = null;
        renderGrid();
      });

      el("next-season").addEventListener("click", nextSeason);
      const seasonOk = el("season-win-ok");
      if (seasonOk) {
        seasonOk.addEventListener("click", () => {
          hideSeasonWins();
          render();
        });
      }
      /* score-how uses native <details>/<summary> — no JS click needed */
      el("restart").addEventListener("click", restart);
      el("end-restart").addEventListener("click", restart);
      el("back-map").addEventListener("click", () => {
        if (canAffordNextFarm()) goBuyNextFarm();
        else leaveFarm();
      });
      const buyNextFarmBtn = el("buy-next-farm");
      if (buyNextFarmBtn) buyNextFarmBtn.addEventListener("click", goBuyNextFarm);
      const seasonBuy = el("season-buy-next");
      if (seasonBuy) seasonBuy.addEventListener("click", goBuyNextFarm);
      el("play-now").addEventListener("click", () => {
        el("intro").hidden = true;
        try {
          sessionStorage.setItem("zox-intro-seen", "1");
        } catch (err) {
          /* ignore */
        }
      });

      window.addEventListener("resize", fitBoard);

          function openFarmModels() {
        const box = el("farm-compare");
        const farm = currentFarm();
        const look =
          ui.view === "farm" && ui.selected
            ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c, ui.farmId)
            : ui.selected && ui.selected.parcelId
              ? Zox.Sim.inspectParcel(ui.state, ui.selected.parcelId)
              : null;
        const books = farm ? Zox.Sim.farmBooks(farm) : look && look.farm ? Zox.Sim.farmBooks(look.farm) : null;
        const LEDGER_LINES = [
          { key: "fertilizer", label: "Fertilizer" },
          { key: "syntheticNitrogen", label: "Synthetic N" },
          { key: "insecticides", label: "Insecticides" },
          { key: "herbicides", label: "Herbicides" },
          { key: "fungicides", label: "Fungicides" },
          { key: "fossilFuel", label: "Diesel / fuel" },
          { key: "purchasedSeed", label: "Purchased seed" },
          { key: "irrigationChemicals", label: "Irrigation chems" },
          { key: "manureReturn", label: "Manure returned" },
          { key: "soilOrganicMatter", label: "Soil OM gain" },
          { key: "carbonTons", label: "Carbon (t)" },
          { key: "nutritionMult", label: "Nutrition" },
          { key: "waterUse", label: "Water use" },
          { key: "runoff", label: "Runoff" },
          { key: "erosion", label: "Erosion" },
          { key: "biodiversity", label: "Biodiversity" },
          { key: "laborChem", label: "Chem labor" },
          { key: "laborLiving", label: "Living-system care" },
        ];
        box.innerHTML = Zox.Sim.farmModelRows()
          .map((row) => {
            const on = books && books.model === row.id;
            const led = row.ledger || {};
            const lines = LEDGER_LINES.map(function (line) {
              let v = led[line.key];
              let shown = v;
              if (line.key === "nutritionMult") shown = v + "×";
              else if (["fertilizer","syntheticNitrogen","insecticides","herbicides","fungicides","fossilFuel","purchasedSeed","irrigationChemicals","laborChem"].indexOf(line.key) >= 0) {
                shown = v === 0 ? "$0" : "−$" + v;
              } else if (typeof v === "number" && v > 0 && ["manureReturn","soilOrganicMatter","biodiversity","carbonTons"].indexOf(line.key) >= 0) {
                shown = "+" + v;
              }
              return `<div><dt>${line.label}</dt><dd>${shown}</dd></div>`;
            }).join("");
            return `<article class="farm-col ${row.id}${on ? " is-you" : ""}">
              <h3>${row.name}</h3>
              ${on ? `<p class="you-are">${farm && farm.name ? farm.name : "This farm"}</p>` : ""}
              <dl>
                <div><dt>Gross crop / acre</dt><dd>$${row.gross}</dd></div>
                <div><dt>Input costs / acre</dt><dd>${row.inputs ? "−$" + row.inputs : "$0"}</dd></div>
                <div class="net"><dt>Net income / acre</dt><dd>$${row.net}</dd></div>
                ${lines}
              </dl>
              <p class="net-hero">$${row.net}<span class="net-sub">buys farmland</span></p>
              <p>${row.note}</p>
            </article>`;
          })
          .join("");
        el("farm-card").hidden = false;
      }

      function closeFarmModels() {
        el("farm-card").hidden = true;
      }

      el("farm-models").addEventListener("click", openFarmModels);
      el("farm-card-close").addEventListener("click", closeFarmModels);
      el("farm-card").addEventListener("click", (e) => {
        if (e.target.id === "farm-card") closeFarmModels();
      });
      document.addEventListener("click", (e) => {
        if (e.target.closest("[data-open-models]")) {
          openFarmModels();
        }
        const walk = e.target.closest("[data-enter-farm]");
        if (walk) {
          enterFarm(walk.getAttribute("data-enter-farm"), false);
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
        if (e.key === "Escape" && !el("farm-card").hidden) {
          closeFarmModels();
          e.preventDefault();
          return;
        }
        if (e.key === "Escape" && ui.view === "farm") {
          leaveFarm();
          e.preventDefault();
          return;
        }
        if (!el("intro").hidden || !el("end-card").hidden || !el("farm-card").hidden || (el("season-win") && !el("season-win").hidden)) return;
        if (e.key === "b" || e.key === "B") {
          if (ui.view === "farm") {
            leaveFarm();
            e.preventDefault();
          }
          return;
        }
        const worldKeys = { 1: "inspect", 2: "farm" };
        const farmKeys = {
          1: "inspect",
          2: "home",
          3: "solar",
          4: "compost",
          5: "rail",
          6: "park",
          7: "village",
          8: "bulldoze",
        };
        const keys = ui.view === "farm" ? farmKeys : worldKeys;
        if (e.key === "m" || e.key === "M") {
          openFarmModels();
          e.preventDefault();
          return;
        }
        if (keys[e.key]) {
          pickTool(keys[e.key]);
          e.preventDefault();
        }
        if (e.key === "Enter" && !e.repeat) {
          nextSeason();
          e.preventDefault();
        }
      });
    }

    function showIntroIfNeeded() {
      let seen = false;
      try {
        seen = sessionStorage.getItem("zox-intro-seen") === "1";
      } catch (err) {
        seen = false;
      }
      el("intro").hidden = seen;
    }

    bind();
    showIntroIfNeeded();
    render();
    if (Zox.Help) Zox.Help.bind(function () { return ui; });
    return ui;
  }

  Zox.createUI = createUI;
})(window);
