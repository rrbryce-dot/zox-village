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
      if (s > Zox.GOAL.seasons) return "After four decades · year " + Zox.GOAL.seasons;
      return Zox.Sim.decadeInfo(s).short;
    }

    function renderDecadeTrack() {
      const box = el("decade-track");
      if (!box) return;
      const playing = Math.min(ui.state.season, Zox.GOAL.seasons);
      const info = Zox.Sim.decadeInfo(playing);
      const per = info.seasonsPerDecade;
      let html = "";
      for (let d = 1; d <= info.decades; d++) {
        let pips = "";
        for (let y = 1; y <= per; y++) {
          const abs = (d - 1) * per + y;
          let cls = "pip";
          if (abs < ui.state.season) cls += " is-done";
          else if (abs === ui.state.season) cls += " is-now";
          pips += `<i class="${cls}" title="Year ${abs} of ${info.yearsTotal}"></i>`;
        }
        const seg =
          d < info.decade ? " is-done" : d === info.decade ? " is-now" : "";
        html += `<span class="decade-seg${seg}"><b>D${d}</b>${pips}</span>`;
      }
      box.innerHTML = html;
      box.title = info.label + " — the rail is a four-decade build";
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
      const deed = Zox.Sim.acresPerDeed();
      const jar = Zox.Sim.nextDeed(ui.state);
      box.innerHTML =
        `<span class="kicker">This season</span>` +
        `<span><i>Crops</i> <b>$${inc.crops}</b></span>` +
        (inc.inputs ? `<span><i>Chem bill</i> <b>−$${inc.inputs}</b></span>` : `<span><i>Chem bill</i> <b>$0</b></span>`) +
        `<span><i>Crop rent</i> <b>$${inc.graze || 0}</b></span>` +
        `<span><i>LIC rent</i> <b>$${inc.apartments}</b></span>` +
        `<span><i>Carbon credits</i> <b>$${inc.credits}</b></span>` +
        `<span class="income-net"><i>Net</i> <b>${inc.net >= 0 ? "+" : ""}$${inc.net}</b></span>` +
        `<span class="income-deed">Deed $${deed.cost}. Traditional net $${deed.tradNet} buys one every ${deed.tradAcres} acres. Regen net $${deed.regenNet} buys one every ${deed.regenAcres}. ${jar.text}</span>`;
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
      const horizon = el("horizon");
      if (horizon) {
        const info = Zox.Sim.decadeInfo(Math.min(ui.state.season, Zox.GOAL.seasons));
        const rail = Zox.Sim.railProgress(ui.state);
        const villages = Zox.Sim.countVillages(ui.state);
        horizon.textContent =
          info.short +
          ". Carbon and health win a season. The rail is the long game: " +
          rail.pct +
          "% ready (" +
          rail.lit +
          "/" +
          rail.need +
          " segments" +
          (villages ? ", " + villages + " village station" + (villages === 1 ? "" : "s") : "") +
          ").";
      }
      el("next-season").disabled = ui.state.status !== "playing";
      const grazePay = (ui.state.farms || []).reduce((sum, f) => {
        const res = Zox.Sim.seasonResolution(f);
        return sum + (res.mature ? Zox.GRAZE_RENT.mature : Zox.GRAZE_RENT.converting);
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

    function cellValue(v, kind) {
      if (v == null || Number.isNaN(Number(v))) return "—";
      const n = Math.round(Number(v) * 10) / 10;
      if (kind === "cash") {
        if (!n) return "$0";
        return "−$" + n;
      }
      if (kind === "mult") return n + "×";
      if (kind === "good") return (n > 0 ? "+" : "") + n;
      return String(n);
    }

    function ledgerCompareHTML(columns) {
      const spec = Zox.LEDGER_SPEC || [];
      const head =
        `<thead><tr><th>Per acre</th>` +
        columns
          .map((col) => `<th class="${col.id}${col.you ? " is-you" : ""}">${col.name}</th>`)
          .join("") +
        `</tr></thead>`;
      let body = "";
      spec.forEach((group) => {
        body += `<tr class="grp"><td colspan="${columns.length + 1}">${group.group}</td></tr>`;
        group.rows.forEach((row) => {
          body += `<tr class="kind-${row.kind}"><th>${row.label}</th>`;
          columns.forEach((col) => {
            const v = col.ledger ? col.ledger[row.key] : null;
            const zero = row.kind === "cash" && !v;
            body += `<td class="${col.id}${col.you ? " is-you" : ""}${zero ? " is-zero" : ""}">${cellValue(v, row.kind)}</td>`;
          });
          body += `</tr>`;
        });
      });
      body += `<tr class="subtotal"><th>Chem bill</th>`;
      columns.forEach((col) => {
        body += `<td class="${col.id}${col.you ? " is-you" : ""}">${col.inputs ? "−$" + col.inputs : "$0"}</td>`;
      });
      body += `</tr><tr class="netline"><th>Net $/acre</th>`;
      columns.forEach((col) => {
        body += `<td class="${col.id}${col.you ? " is-you" : ""}">$${col.net}</td>`;
      });
      body += `</tr>`;
      return `<table class="ledger-compare">${head}<tbody>${body}</tbody></table>`;
    }

    function renderCompare(look) {
      const box = el("farm-sidebar");
      if (!box) return;
      const farm = currentFarm() || (look && look.farm);
      const books = farm ? Zox.Sim.farmBooks(farm) : null;
      const focusYear = books && books.model === "converting" ? books.year : 3;
      const rows = Zox.Sim.farmModelRows(focusYear);
      const youId = books ? books.model : "";
      const columns = rows.map((row) => {
        const live = youId === row.id && books ? books : row;
        return {
          id: row.id,
          name: live.label || live.name || row.name,
          ledger: live.ledger || row.ledger,
          inputs: live.inputs,
          net: live.net,
          you: youId === row.id,
        };
      });
      const deed = Zox.Sim.acresPerDeed();
      const jar = Zox.Sim.nextDeed(ui.state);
      const graduating = books && books.model === "converting" && books.year === 5;
      box.innerHTML =
        ledgerCompareHTML(columns) +
        `<p class="quiet compare-punch">Regen nets <b>$${deed.regenNet}/acre</b> with a $0 chem bill and 6× nutrition. Traditional nets <b>$${deed.tradNet}/acre</b> after the full chem bill. A deed is <b>$${deed.cost}</b> — regen buys one every ${deed.regenAcres} acre-seasons, traditional every ${deed.tradAcres}. ${jar.text}</p>` +
        (graduating
          ? `<p class="quiet compare-punch">Year 5 is the last chem line on ${farm.name}. Next season graduates it: $0 chem, 6× nutrition, mature carbon, and the rail can light.</p>`
          : "") +
        `<p class="ledger-note">Cash lines are dollars. Manure, soil, carbon, water, runoff, erosion, biodiversity, and labor are indexes — they show the mechanism, not a second bill. Animals graze the residue; manure stays and feeds soil organic matter.</p>`;
    }

    function cmpCell(cls, value, max, text) {
      const w = Math.max(6, Math.round((Math.abs(value) / max) * 100));
      return `<span class="cmp-cell ${cls}"><i style="width:${w}%"></i><b>${text}</b></span>`;
    }

    function cmpRow(label, trad, yours, regen, textFn) {
      const max = Math.max(Math.abs(trad), Math.abs(yours), Math.abs(regen), 0.001);
      return (
        `<div class="cmp-row">` +
        `<span class="cmp-label">${label}</span>` +
        cmpCell("trad", trad, max, textFn(trad)) +
        cmpCell("you", yours, max, textFn(yours)) +
        cmpCell("regen", regen, max, textFn(regen)) +
        `</div>`
      );
    }

    function seasonReportHTML(report) {
      const trad = report.trad || { ledger: report.ledgerTrad || {}, inputs: 10, net: report.netPerAcreTrad, gross: 18 };
      const regen = report.regen || { ledger: report.ledgerRegen || {}, inputs: 0, net: report.netPerAcreRegen, gross: 16 };
      const yours = report.yours;
      const yLedger = (yours && yours.ledger) || {};
      const yInputs = yours ? yours.inputs : 0;
      const yNet = yours ? yours.net : 0;
      const yNutr = yours ? yours.nutritionMult : 0;
      const yCarbon = yours ? yours.carbonEach : 0;
      const tidy = (n) => Math.round((Number(n) || 0) * 10) / 10;
      const money = (n) => {
        const v = tidy(n);
        return v ? "−$" + v : "$0";
      };
      const plain = (n) => String(tidy(n));
      const mult = (n) => tidy(n) + "×";
      const dollars = (n) => "$" + tidy(n);
      let cashRows = "";
      const cashGroup = (Zox.LEDGER_SPEC || [])[0];
      if (cashGroup) {
        cashGroup.rows.forEach((row) => {
          const a = (trad.ledger && trad.ledger[row.key]) || 0;
          const b = yLedger[row.key] || 0;
          const c = (regen.ledger && regen.ledger[row.key]) || 0;
          cashRows += `<tr><th>${row.label}</th><td class="trad">${money(a)}</td><td class="you">${money(b)}</td><td class="regen">${money(c)}</td></tr>`;
        });
      }
      const L = trad.ledger || {};
      const R = regen.ledger || {};
      const close = report.decadeClose
        ? `<p class="decade-close">Decade ${report.decade.decade} of ${report.decade.decades} closes. This decade locked <b>${report.decadeTotals.carbon}</b> carbon across ${report.decadeTotals.seasons} seasons. The rail to Jersey City is still a long build.</p>`
        : "";
      const grad = report.graduated
        ? `<p class="decade-close">${report.graduated} farm${report.graduated === 1 ? "" : "s"} graduated this season — chem bill $0 from here, manure stays, and the rail can light.</p>`
        : "";
      return (
        close +
        grad +
        `<div class="report-head"><span>Traditional</span><span>Your acres</span><span>Regenerative</span></div>` +
        `<p class="report-kicker">Per acre this season — why regen scores higher</p>` +
        cmpRow("Chem bill", trad.inputs, yInputs, regen.inputs, money) +
        cmpRow("Net income", trad.net, yNet, regen.net, dollars) +
        cmpRow("Carbon", L.carbonTons || 0, yCarbon, R.carbonTons || 10, plain) +
        cmpRow("Nutrition", L.nutritionMult || 1, yNutr, R.nutritionMult || 6, mult) +
        cmpRow("Manure back", L.manureReturn || 0, yLedger.manureReturn || 0, R.manureReturn || 0, plain) +
        cmpRow("Runoff + erosion", (L.runoff || 0) + (L.erosion || 0), (yLedger.runoff || 0) + (yLedger.erosion || 0), (R.runoff || 0) + (R.erosion || 0), plain) +
        `<table class="report-cash-table"><tbody>` +
        cashRows +
        `<tr class="netline"><th>Net $/acre</th><td>$${trad.net}</td><td>$${yNet}</td><td>$${regen.net}</td></tr>` +
        `</tbody></table>` +
        `<div class="report-totals">` +
        `<div><b>Cumulative carbon</b> ${report.carbonTotal}</div>` +
        `<div><b>Acres</b> ${report.acres} (${report.matureAcres} mature)</div>` +
        `<div><b>Eco-villages</b> ${report.villages}</div>` +
        `<div><b>Rail</b> ${report.railPct}% (${report.railLit}/${report.railNeed} lit${report.villagePct ? ", +" + report.villagePct + "% from villages" : ""})</div>` +
        `<div class="report-cash"><b>Jar</b> $${report.money} · season net ${report.incomeNet >= 0 ? "+" : ""}$${report.incomeNet} · graze $${report.graze || 0}</div>` +
        `</div>` +
        `<p class="report-link">${report.jar ? report.jar.text : ""} A deed is $${report.deed ? report.deed.cost : 48}. Regen net buys one every ${report.deed ? report.deed.regenAcres : 3} acre-seasons; traditional needs ${report.deed ? report.deed.tradAcres : 6}.</p>`
      );
    }

    function scoreHowHTML() {
      const C = Zox.CARBON;
      const N = Zox.NUTRITION;
      const G = Zox.GOAL;
      const deed = Zox.Sim.acresPerDeed();
      const modelRows = Zox.Sim.farmModelRows(3);
      const tradBill = modelRows[0].inputs;
      const tradGross = modelRows[0].gross;
      const regenGross = modelRows[2].gross;
      const ladder = (C.convertingLadder || []).join(", ");
      const nutr = (N.convertingLadder || []).join("×, ") + "×";
      return (
        "<p><b>Earth wins</b> are carbon locked this season. Mature or just-graduated regen farms sequester " +
        C.matureFarm +
        " each. Converting years pay " +
        ladder +
        ". Orchards add " +
        C.park +
        ", standing groves add " +
        C.grove +
        " (capped at " +
        C.groveCap +
        "). The gate is " +
        G.carbonMin +
        " in a single season. Cumulative carbon is the long-horizon tally — it does not replace the season gate. The two opening farms graduate at the close of decade 1 and still fall short of that gate; the win waits on a longer run of mature acres.</p>" +
        "<p><b>Population wins</b> are extra nutrition above a traditional 1× baseline. Each farm feeds " +
        N.farmPortions +
        " portions. Converting years are about " +
        nutr +
        ". Mature Zox food is " +
        N.regenerative +
        "×. Extra = portions × (quality − 1). Health (gate " +
        G.healthMin +
        ") climbs from that quality. Eco-villages on mature farms add " +
        (Zox.BUILDINGS.village.healthBoost || 0) +
        " health and " +
        (Zox.BUILDINGS.village.nutritionBoost || 0) +
        " nutrition, and they put stations on the rail.</p>" +
        "<p><b>The ledger</b> is why regen scores higher. Traditional pays fertilizer, synthetic nitrogen, insecticides, herbicides, fungicides, diesel, purchased seed, and irrigation chemicals. That chem bill is $" +
        tradBill +
        " on a $" +
        tradGross +
        " gross, so net is $" +
        deed.tradNet +
        "/acre. Regenerative pays $0 for every one of those lines (gross $" +
        regenGross +
        ", net $" +
        deed.regenNet +
        "). Animals graze the residue and manure stays, so manure nutrients and soil organic matter rise, runoff and erosion fall, and biodiversity climbs. Labor shifts off the chem crew and onto living-system care (an index, not a second invoice).</p>" +
        "<p><b>Net $/acre</b> is gross minus that chem bill: traditional $" +
        deed.tradNet +
        ", regenerative $" +
        deed.regenNet +
        ". A deed costs $" +
        deed.cost +
        ", so regen income buys the next farm every " +
        deed.regenAcres +
        " acre-seasons and traditional needs " +
        deed.tradAcres +
        ". That is the loop down the corridor.</p>" +
        "<p><b>Crop rent</b> is separate cash on Next Season — animals graze the residue and leave manure. <b>Decades:</b> " +
        G.decades +
        " decades × " +
        G.seasonsPerDecade +
        " seasons. The carbon and health gates can be met in a later decade; the rail to Jersey City is the long build either way. Carbon credits $ on the income strip are not the sequestration meter.</p>"
      );
    }

    function renderEnd() {
      const overlay = el("end-card");
      const seasonCard = el("season-win");
      if (ui.state.status === "playing" || (seasonCard && !seasonCard.hidden)) {
        overlay.hidden = true;
        return;
      }
      overlay.hidden = false;
      const won = ui.state.status === "won";
      el("end-title").textContent = won ? "The village holds." : "Not this corridor.";
      el("end-body").textContent = ui.state.endReason;
      const rail = Zox.Sim.railProgress(ui.state);
      const when = ui.state.wonOnSeason || Math.max(1, ui.state.season - 1);
      const info = Zox.Sim.decadeInfo(Math.min(when, Zox.GOAL.seasons));
      el("end-score").textContent =
        (won ? info.short + " · " : "") +
        "score " +
        ui.state.score +
        " · carbon this season " +
        (ui.state.carbonSeason || 0) +
        " · lifetime " +
        (ui.state.carbonTotal || 0) +
        " · health " +
        (ui.state.health || 0) +
        " · acres " +
        (ui.state.farms ? ui.state.farms.length : 0) +
        " · villages " +
        Zox.Sim.countVillages(ui.state) +
        " · rail " +
        rail.pct +
        "%";
    }

    function render() {
      root.dataset.status = ui.state.status;
      root.dataset.view = ui.view;
      renderChrome();
      renderDecadeTrack();
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
        title.textContent = report.decadeClose
          ? "Decade " + report.decade.decade + " of " + report.decade.decades + " closes — report card"
          : report.decade.short + " — report card";
      }

      const reportBox = el("season-report");
      if (reportBox && report) {
        reportBox.innerHTML = seasonReportHTML(report);
      }

      const how = el("score-how");
      if (how) how.open = false;
      const howBody = el("score-how-body");
      if (howBody) howBody.innerHTML = scoreHowHTML();
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
        const focusYear = books && books.model === "converting" ? books.year : 3;
        const rows = Zox.Sim.farmModelRows(focusYear);
        const youId = books ? books.model : "";
        box.innerHTML =
          ledgerCompareHTML(
            rows.map((row) => ({
              id: row.id,
              name: row.name,
              ledger: row.ledger,
              inputs: row.inputs,
              net: row.net,
              you: youId === row.id,
            }))
          ) +
          `<div class="model-notes">` +
          rows
            .map((row) => `<p><b>${row.name}.</b> ${row.note}</p>`)
            .join("") +
          `</div>`;
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
