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
      tool: "farm",
      hover: null,
      selected: null,
      flash: "",
      boardKey: "",
    };

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
          `<span class="income-hint">LIC rent buys farmland. Crops pay for the next field. Advance a season to see the split.</span>`;
        return;
      }
      box.innerHTML =
        `<span class="kicker">This season</span>` +
        `<span><i>Crops</i> <b>$${inc.crops}</b></span>` +
        (inc.inputs
          ? `<span><i>Chem bill</i> <b>−$${inc.inputs}</b></span>`
          : "") +
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
      box.innerHTML = Zox.TOOLS.map((raw) => {
        const t = toolDef(raw);
        const on = ui.tool === t.id ? " is-on" : "";
        const cost = t.kind === "build" ? `<span class="cost">$${t.cost}</span>` : `<span class="cost mute">free</span>`;
        const broke = t.kind === "build" && ui.state.money < t.cost ? " is-broke" : "";
        return `<button type="button" class="tool${on}${broke}" data-tool="${t.id}" title="${t.hint}">
          <span class="glyph" aria-hidden="true">${ICONS[t.id]}</span>
          <span class="tool-copy"><b>${t.name}</b>${cost}</span>
        </button>`;
      }).join("");
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
      const key = Zox.Render.boardKey(ui.state.tiles);
      if (force || key !== ui.boardKey) {
        ui.boardKey = key;
        grid.innerHTML = Zox.Render.worldHTML(ui.state.tiles, ui);
        fitBoard();
        return;
      }
      Zox.Render.syncFlags(grid, ui);
    }

    function renderAside() {
      const tool = Zox.TOOLS.find((t) => t.id === ui.tool);
      const info = toolDef(tool);
      el("tool-name").textContent = info.name;
      el("tool-hint").textContent = info.hint;
      el("tool-cost").textContent = info.kind === "build" ? "Costs $" + info.cost : "No cost";

      const look = ui.selected ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c) : null;
      const inspectBox = el("inspect");
      if (!look) {
        inspectBox.innerHTML = `<p class="quiet">Click a tile to read it. The creek is not a building lot.</p>`;
      } else {
        inspectBox.innerHTML = `<h3>${look.title}</h3><ul>${look.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
      }
      if (ui.tool === "farm") {
        const rows = Zox.Sim.farmModelRows();
        const regen = rows[2];
        const trad = rows[0];
        inspectBox.innerHTML +=
          `<p class="quiet farm-nudge">Traditional nets $${trad.net} after the chem bill. Zox regen nets $${regen.net} with no inputs. <button type="button" class="linkish" data-open-models>See the books</button></p>`;
      }

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
      renderMeters();
      renderToolbar();
      renderGrid();
      renderAside();
      renderEnd();
      el("food-note").textContent =
        ui.state.population === 0
          ? "Settlement is empty."
          : ui.state.population + " people in the valley.";
    }

    function pickTool(id) {
      ui.tool = id;
      flash("");
      render();
    }

    function actOnTile(r, c) {
      ui.selected = { r, c };
      if (ui.tool === "inspect") {
        flash("");
        render();
        return;
      }
      if (ui.tool === "bulldoze") {
        const res = Zox.Sim.clearLot(ui.state, r, c);
        flash(res.ok ? "" : res.why);
        render();
        return;
      }
      const res = Zox.Sim.place(ui.state, r, c, ui.tool);
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
      ui.selected = null;
      ui.hover = null;
      ui.tool = "farm";
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
        const look = ui.selected ? Zox.Sim.inspect(ui.state, ui.selected.r, ui.selected.c) : null;
        const books = look && look.tile ? Zox.Sim.farmBooks(look.tile) : null;
        box.innerHTML = Zox.Sim.farmModelRows()
          .map((row) => {
            const on = books && books.model === row.id;
            return `<article class="farm-col ${row.id}${on ? " is-you" : ""}">
              <h3>${row.name}</h3>
              ${on ? `<p class="you-are">This lot</p>` : ""}
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
      });

      document.addEventListener("keydown", (e) => {
        if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
        if (e.key === "Escape" && !el("farm-card").hidden) {
          closeFarmModels();
          e.preventDefault();
          return;
        }
        if (!el("intro").hidden || !el("end-card").hidden || !el("farm-card").hidden) return;
        const keys = {
          1: "inspect",
          2: "farm",
          3: "home",
          4: "solar",
          5: "compost",
          6: "rail",
          7: "park",
          8: "bulldoze",
        };
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
