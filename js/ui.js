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

    function renderMeters() {
      const s = ui.state;
      const items = [
        { id: "money", label: "Profit", value: "$" + s.money, raw: s.money, good: s.money >= 40, warn: s.money < 20 },
        { id: "waste", label: "Waste", value: String(s.waste), raw: s.waste, invert: true, max: 100 },
        { id: "nature", label: "Circle", value: String(s.nature), raw: s.nature, max: 100 },
        {
          id: "energy",
          label: "Energy",
          value: s.energySupply + " / " + s.energyDemand,
          raw: s.energyDemand === 0 ? 100 : Math.round((s.energySupply / Math.max(1, s.energyDemand)) * 100),
          max: 100,
        },
        { id: "people", label: "People", value: String(s.population), raw: s.population, max: 24 },
        { id: "happy", label: "Table", value: String(s.happiness), raw: s.happiness, max: 100 },
      ];

      const box = el("meters");
      box.innerHTML = items
        .map((m) => {
          let pct = m.max ? clampPct(m.raw, m.max) : 50;
          if (m.invert) pct = 100 - pct;
          let tone = "ok";
          if (m.id === "waste") tone = s.waste <= 22 ? "good" : s.waste < 55 ? "ok" : "bad";
          else if (m.id === "nature") tone = s.nature >= 70 ? "good" : s.nature < 32 ? "bad" : "ok";
          else if (m.id === "energy") tone = s.energySupply >= s.energyDemand ? "good" : s.energyDemand ? "bad" : "ok";
          else if (m.id === "happy") tone = s.happiness >= 56 ? "good" : s.happiness < 30 ? "bad" : "ok";
          else if (m.id === "people") tone = s.population >= 16 ? "good" : "ok";
          else if (m.id === "money") tone = s.money < 0 ? "bad" : s.money < 20 ? "warn" : "ok";

          const delta = s.lastDelta && m.id in mapDelta(s.lastDelta) ? s.lastDelta[mapDeltaKey(m.id)] : null;
          const dHtml =
            delta && delta !== 0
              ? `<span class="delta ${delta > 0 ? "up" : "down"}">${signed(delta)}</span>`
              : "";

          return `<div class="meter tone-${tone}" data-meter="${m.id}">
            <div class="meter-top"><span>${m.label}</span><strong>${m.value}</strong>${dHtml}</div>
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
          `<span class="income-hint">LIC rent buys farmland. Purchase a parcel, then walk that farm. Advance a season to see the split.</span>`;
        return;
      }
      box.innerHTML =
        `<span class="kicker">This season</span>` +
        `<span><i>Crops</i> <b>$${inc.crops}</b></span>` +
        (inc.inputs ? `<span><i>Chem bill</i> <b>−$${inc.inputs}</b></span>` : "") +
        `<span><i>LIC rent</i> <b>$${inc.apartments}</b></span>` +
        `<span><i>Carbon credits</i> <b>$${inc.credits}</b></span>` +
        `<span class="income-net"><i>Net</i> <b>${inc.net >= 0 ? "+" : ""}$${inc.net}</b></span>`;
    }

    function mapDelta(d) {
      return { money: d.money, waste: d.waste, nature: d.nature, happy: d.happiness, people: d.population };
    }
    function mapDeltaKey(id) {
      return { money: "money", waste: "waste", nature: "nature", happy: "happiness", people: "population" }[id];
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
      if (board) board.classList.toggle("is-farm", ui.view === "farm");
      if (farm) {
        const prog = Zox.Sim.farmProgress(farm);
        title.textContent = farm.name;
        sub.textContent = prog.mature
          ? "Zox regenerative — no chem bill. Improvements stay on this farm."
          : "Year " + prog.year + " of " + prog.need + ". Compost, power, rail, orchards, and homes go here.";
        back.hidden = false;
        if (place) place.textContent = "Improvements on this farm";
        if (keys) keys.textContent = "Keys 1–7 pick tools. B back to map. Enter turns the season.";
        if (meadow) meadow.textContent = "Field";
      } else {
        title.textContent = "Valley map";
        sub.textContent = "Buy farmland with LIC capital. Click a deed you already own to walk that farm.";
        back.hidden = true;
        if (place) place.textContent = "What to place";
        if (keys) keys.textContent = "Keys 1–2 pick tools. Click a farm to walk it. Enter turns the season.";
        if (meadow) meadow.textContent = "Meadow";
      }
    }

    function fitBoard() {
      const grid = el("grid");
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
        grid.setAttribute("aria-label", ui.view === "farm" ? "Farm board" : "Valley map");
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

      const farmId = ui.view === "farm" ? ui.farmId : null;
      const look = ui.selected ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c, farmId) : null;
      const inspectBox = el("inspect");
      if (!look) {
        inspectBox.innerHTML =
          ui.view === "farm"
            ? `<p class="quiet">Click a lot on this farm. The ditch is not a building lot.</p>`
            : `<p class="quiet">Click a meadow to buy a farm, or a deed you already own to walk it.</p>`;
      } else {
        inspectBox.innerHTML = `<h3>${look.title}</h3><ul>${look.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
        if (ui.view === "world" && look.farm) {
          inspectBox.innerHTML +=
            `<p><button type="button" class="linkish" data-enter-farm="${look.farm.id}">Walk this farm</button></p>`;
        }
      }
      renderCompare(look);

      const goals = el("goals");
      goals.innerHTML = Zox.Sim.goalProgress(ui.state)
        .map((g) => {
          const need = g.better === "lower" ? "≤ " + g.need : "≥ " + g.need;
          return `<li class="${g.ok ? "is-met" : ""}"><span>${g.label}</span> <b>${g.have}</b> <em>${need}</em></li>`;
        })
        .join("");

      el("season").textContent = seasonLabel();
      el("next-season").disabled = ui.state.status !== "playing";

      const log = el("log");
      log.innerHTML = ui.state.log
        .map((row) => `<li><span class="when">S${Math.min(row.season, Zox.GOAL.seasons)}</span> ${row.text}</li>`)
        .join("");
    }

    function renderCompare(look) {
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
            ? { name: books.label, gross: books.gross, inputs: books.inputs, net: books.net }
            : row;
        return `<article class="farm-col ${row.id}${on ? " is-you" : ""}${extra || ""}">
          <h3>${live.name}</h3>
          ${on ? `<p class="you-are">${farm && farm.name ? farm.name : "This farm"}</p>` : ""}
          <dl>
            <div><dt>Gross</dt><dd>$${live.gross}</dd></div>
            <div><dt>Chem / inputs</dt><dd>${live.inputs ? "−$" + live.inputs : "$0"}</dd></div>
            <div class="net"><dt>Net</dt><dd>$${live.net}</dd></div>
          </dl>
          ${row.id !== "converting" ? `<p class="net-hero">$${live.net}</p>` : ""}
        </article>`;
      }

      box.innerHTML =
        col(trad) +
        col(conv, " is-slim") +
        col(regen, " is-win") +
        `<p class="quiet compare-punch">Regen nets $${regen.net}. Traditional nets $${trad.net} after the chem bill. That is why the wait pays.</p>`;
    }

    function renderEnd() {
      const overlay = el("end-card");
      if (ui.state.status === "playing") {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      el("end-title").textContent = ui.state.status === "won" ? "The village holds." : "Not this valley.";
      el("end-body").textContent = ui.state.endReason;
      el("end-score").textContent = "Score " + ui.state.score;
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
      } else if (ui.state.population === 0) {
        el("food-note").textContent =
          ui.state.farms.length === 0 ? "Valley map. Buy a farm to walk the fields." : ui.state.farms.length + " farm" + (ui.state.farms.length === 1 ? "" : "s") + " on the map.";
      } else {
        el("food-note").textContent = ui.state.population + " people on the farms.";
      }
    }

    function pickTool(id) {
      const allowed = toolList(ui.view).some((t) => t.id === id);
      if (!allowed) return;
      ui.tool = id;
      flash("");
      render();
    }

    function actOnTile(r, c) {
      ui.selected = { r, c };
      if (ui.view === "world") {
        const tile = Zox.Map.getTile(ui.state.tiles, r, c);
        if (tile && tile.building === "farm" && tile.farmId) {
          if (ui.tool === "inspect") {
            flash("");
            render();
            return;
          }
          enterFarm(tile.farmId, false);
          return;
        }
        if (ui.tool === "inspect") {
          flash("");
          render();
          return;
        }
        if (ui.tool === "farm") {
          const res = Zox.Sim.place(ui.state, r, c, "farm", null);
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
        return;
      }

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

    function nextSeason() {
      const res = Zox.Sim.runSeason(ui.state);
      flash(res.ok ? "" : res.why);
      render();
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
      el("intro").hidden = true;
      render();
    }

    function bind() {
      el("tools").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tool]");
        if (btn) pickTool(btn.dataset.tool);
      });

      el("grid").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-r]");
        if (!btn) return;
        actOnTile(Number(btn.dataset.r), Number(btn.dataset.c));
      });

      el("grid").addEventListener("pointerover", (e) => {
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
      el("restart").addEventListener("click", restart);
      el("end-restart").addEventListener("click", restart);
      el("back-map").addEventListener("click", leaveFarm);
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
        const look = ui.selected
          ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c, ui.view === "farm" ? ui.farmId : null)
          : null;
        const books = farm ? Zox.Sim.farmBooks(farm) : look && look.farm ? Zox.Sim.farmBooks(look.farm) : null;
        box.innerHTML = Zox.Sim.farmModelRows()
          .map((row) => {
            const on = books && books.model === row.id;
            return `<article class="farm-col ${row.id}${on ? " is-you" : ""}">
              <h3>${row.name}</h3>
              ${on ? `<p class="you-are">${farm && farm.name ? farm.name : "This farm"}</p>` : ""}
              <dl>
                <div><dt>Gross crop</dt><dd>$${row.gross}</dd></div>
                <div><dt>Input costs</dt><dd>${row.inputs ? "−$" + row.inputs : "$0"}</dd></div>
                <div class="net"><dt>Net</dt><dd>$${row.net}</dd></div>
              </dl>
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
        if (!el("intro").hidden || !el("end-card").hidden || !el("farm-card").hidden) return;
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
          7: "bulldoze",
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
