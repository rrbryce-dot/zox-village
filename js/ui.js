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
      deeds: [],
      ownedFocus: null,
      freshDeed: "",
      shakeDeed: "",
      deedAlert: "",
      dragId: "",
      apOn: false,
      ap: null,
      apTimer: 0,
      apBeat: "",
      apShown: "",
      apStartedAt: 0,
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

    function seasonCap() {
      return ui.state.horizonSeasons || Zox.GOAL.seasons;
    }

    function autopilotClock() {
      const ap = ui.state && ui.state.autopilot;
      return !!(ui.apOn || (ap && (ap.on || ap.complete)));
    }

    function seasonLabel() {
      const s = ui.state.season;
      const cap = seasonCap();
      const info = Zox.Sim.decadeInfo(Math.min(Math.max(1, s), cap), ui.state);
      if (autopilotClock()) {
        if (s > cap) return "After year " + cap + " of " + info.yearsTotal;
        return "Year " + info.year + " of " + info.yearsTotal;
      }
      if (s > cap) {
        const decades = ui.state.horizonDecades || Zox.GOAL.decades;
        return "After " + decades + " decades · year " + cap;
      }
      return info.short;
    }

    function renderDecadeTrack() {
      const box = el("decade-track");
      if (!box) return;
      const playing = Math.min(ui.state.season, seasonCap());
      const info = Zox.Sim.decadeInfo(playing, ui.state);
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
          ". Click farmland squares to pull title deeds ($" +
          cost +
          " an acre), then move cards into Purchase. " +
          left +
          " square" +
          (left === 1 ? "" : "s") +
          " still for sale."
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
        (inc.villageLease ? `<span><i>Village lease</i> <b>$${inc.villageLease}</b></span>` : "") +
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
          ? "Zox regenerative — no chem bill. Improvements stay on this farm."
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
              "Choose a square ($" + Zox.BUILDINGS.farm.cost + ")";
          }
        }
        if (place) place.textContent = "Improvements on this farm";
        if (keys) keys.textContent = "Keys 1–8 pick tools (7 = eco-village). B back to map. Enter turns the season.";
        if (meadow) meadow.textContent = "Field";
        if (legend) legend.hidden = false;
      } else {
        const rail = Zox.Sim.railProgress(ui.state);
        title.textContent = "Corridor map";
        if (ui.state.builtRail != null) {
          const laid = ui.state.builtRail || 0;
          const need = Math.max(1, (Zox.CORRIDOR.railPath || []).length - 1);
          sub.textContent =
            laid >= need
              ? "Autopilot laid the green rail from Detroit to Jersey City."
              : "The line stays dashed until autopilot builds it. " + laid + "/" + need + " segments laid.";
        } else {
          sub.textContent = rail.ready
            ? "Green rail lit solid Detroit → Jersey City. Keep the settlement and the circle healthy."
            : "Click a square for its title deed. Move the card to Purchase when the jar can cover it. " +
              rail.lit +
              "/" +
              rail.need +
              " rail segments lit.";
        }
        back.hidden = true;
        back.classList.remove("is-hot");
        back.textContent = "Back to map";
        const buyBtnW = el("buy-next-farm");
        if (buyBtnW) {
          const affordW = canAffordNextFarm();
          buyBtnW.hidden = !affordW;
          if (affordW) {
            buyBtnW.textContent =
              "Choose a square ($" + Zox.BUILDINGS.farm.cost + ")";
          }
        }
        if (place) place.textContent = "What to place";
        if (keys) keys.textContent = "Click a square to pull its deed. Cards sit side by side — click one for a picture of the farm. Enter turns the season.";
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
          inspectBox.innerHTML = `<p class="quiet">Click a mosaic square. The title deed names the farmer, the acres, and the price. Water and city cores are not for sale. Move a card to Purchase only when the jar can cover it.</p>`;
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

      const seasonEl = el("season");
      if (seasonEl) {
        const label = seasonLabel();
        const changed = seasonEl.textContent !== label;
        seasonEl.textContent = label;
        if (ui.apOn && changed) {
          seasonEl.classList.remove("is-year-tick");
          void seasonEl.offsetWidth;
          seasonEl.classList.add("is-year-tick");
        } else if (!ui.apOn) {
          seasonEl.classList.remove("is-year-tick");
        }
      }
      const horizon = el("horizon");
      if (horizon) {
        const info = Zox.Sim.decadeInfo(Math.min(ui.state.season, seasonCap()), ui.state);
        const rail = Zox.Sim.railProgress(ui.state);
        const villages = Zox.Sim.countVillages(ui.state);
        const clock = autopilotClock()
          ? "Year " + info.year + " of " + info.yearsTotal + " · Decade " + info.decade + " of " + info.decades
          : info.short;
        horizon.textContent =
          clock +
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
      el("next-season").disabled = ui.state.status !== "playing" || !!ui.apOn;
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
        `<div class="report-cash"><b>Jar</b> $${report.money} · season net ${report.incomeNet >= 0 ? "+" : ""}$${report.incomeNet} · graze $${report.graze || 0}${report.villageLease ? " · village lease $" + report.villageLease : ""}</div>` +
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
      const info = Zox.Sim.decadeInfo(Math.min(when, seasonCap()), ui.state);
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
      renderDeeds();
      renderVillageLine();
      renderAside();
      renderAutopilot();
      renderEnd();
      if (ui.view !== "world") hideParcelTip();
      const farm = currentFarm();
      if (farm) {
        const prog = Zox.Sim.farmProgress(farm);
        el("food-note").textContent = farm.name + (prog.mature ? " — regen." : " — year " + prog.year + " of 5.");
      } else {
        const rail = Zox.Sim.railProgress(ui.state);
        if (ui.state.farms.length === 0) {
          el("food-note").textContent = "Click a square. Its title deed pops on the table.";
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

    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/"/g, "&quot;");
    }

    function deedCost() {
      return Zox.BUILDINGS.farm.cost;
    }

    function stagedSum(exceptId) {
      let sum = 0;
      const cost = deedCost();
      const list = ui.deeds || [];
      for (let i = 0; i < list.length; i++) {
        if (list[i].col === "buy" && list[i].id !== exceptId) sum += cost;
      }
      return sum;
    }

    function affordCheck(parcelId) {
      const cost = deedCost();
      const staged = stagedSum(parcelId);
      const have = ui.state.money;
      const need = staged + cost;
      return {
        ok: have >= need,
        cost: cost,
        staged: staged,
        have: have,
        need: need,
        short: Math.max(0, need - have),
        alone: have >= cost,
      };
    }

    function rentHint(short) {
      const rent = Zox.LIC.income;
      const seasons = Math.max(1, Math.ceil(short / Math.max(1, rent)));
      return (
        "Apartment rent from the Long Island City building is $" +
        rent +
        " a season — about " +
        seasons +
        " season" +
        (seasons === 1 ? "" : "s") +
        " of that cash flow before the jar can cover this. Turn the season and let the rent land."
      );
    }

    function shortfallText(check) {
      if (check.staged > 0 && check.alone) {
        return (
          "This deed is $" +
          check.cost +
          ", and you could afford it by itself. Purchase already holds $" +
          check.staged +
          ", so together that is $" +
          check.need +
          ". The jar has $" +
          check.have +
          " — short $" +
          check.short +
          ". " +
          rentHint(check.short)
        );
      }
      return (
        "Not enough cash for this deed. It costs $" +
        check.cost +
        " and the jar has $" +
        check.have +
        " — short $" +
        check.short +
        ". " +
        rentHint(check.short)
      );
    }

    function hideParcelTip() {
      const tip = el("parcel-tip");
      if (tip) tip.hidden = true;
    }

    function showParcelTip(id, x, y) {
      const tip = el("parcel-tip");
      if (!tip) return;
      const parcel = Zox.Sim.getParcel(id);
      if (!parcel) {
        tip.hidden = true;
        return;
      }
      const farm = Zox.Sim.getFarmByParcel(ui.state, id);
      const owner = Zox.Parcels.deedOwner(parcel, farm);
      const acres = parcel.acres || 1;
      let text;
      if (farm) {
        const prog = Zox.Sim.farmProgress(farm);
        text =
          farm.name +
          " · owner " +
          owner +
          " · " +
          acres +
          " acre · " +
          (prog.mature ? "regenerative" : "converting year " + prog.year + " of 5");
      } else {
        text = parcel.name + " · $" + deedCost() + " · " + acres + " acre · owner " + owner + " · click for the deed";
      }
      tip.textContent = text;
      tip.hidden = false;
      let left = x + 14;
      let top = y + 18;
      if (left > window.innerWidth - 280) left = Math.max(8, x - 250);
      if (top > window.innerHeight - 40) top = Math.max(8, y - 36);
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    }

    function deedCardHTML(parcelId, col) {
      const parcel = Zox.Sim.getParcel(parcelId);
      if (!parcel) return "";
      if (Zox.Sim.getFarmByParcel(ui.state, parcelId)) return "";
      const owner = Zox.Parcels.deedOwner(parcel, null);
      const cost = deedCost();
      const check = affordCheck(parcelId);
      let note;
      if (col === "buy") {
        note = "Ready to buy with the other cards in Purchase. Confirm to spend the cash.";
      } else if (check.ok) {
        note = check.staged
          ? "The jar can cover this along with the $" + check.staged + " already in Purchase."
          : "The jar can cover this deed.";
      } else if (check.alone) {
        note =
          "Affordable alone ($" +
          cost +
          "). Purchase already holds $" +
          check.staged +
          " — together you are short $" +
          check.short +
          ".";
      } else {
        note =
          "Short $" +
          check.short +
          ". Wait for apartment rent ($" +
          Zox.LIC.income +
          " a season) before this deed will clear.";
      }
      const pop = ui.freshDeed === parcelId ? " is-pop" : "";
      const shake = ui.shakeDeed === parcelId ? " is-shake" : "";
      const rail = parcel.spine ? `<em class="m-rail">On the rail</em>` : "";
      const actions =
        col === "buy"
          ? `<button type="button" data-move="hold">Don't buy it yet</button>`
          : `<button type="button" data-move="buy">Move to Purchase</button>`;
      return (
        `<article class="m-deed${pop}${shake}${parcel.spine ? " is-rail" : ""}" draggable="true" data-deed="${esc(parcel.id)}" title="Click for a picture of the farm">` +
        `<header class="m-band"><span>Title deed</span><strong>${esc(parcel.name)}</strong>${rail}</header>` +
        `<div class="m-body">` +
        `<p class="m-row"><span>Owner</span><b>${esc(owner)}</b></p>` +
        `<p class="m-row m-acres"><span>Acres</span><b>${parcel.acres || 1}</b></p>` +
        `<p class="m-row m-price"><span>Cost</span><b>$${cost}</b></p>` +
        `<p class="m-note">${esc(note)}</p>` +
        `<p class="m-look">Click the card to see the farm</p>` +
        `</div>` +
        `<footer class="m-actions">${actions}</footer>` +
        `</article>`
      );
    }

    function ownedCardHTML() {
      const id = ui.ownedFocus;
      if (!id) return "";
      const parcel = Zox.Sim.getParcel(id);
      const farm = parcel && Zox.Sim.getFarmByParcel(ui.state, id);
      if (!parcel || !farm) return "";
      const prog = Zox.Sim.farmProgress(farm);
      const owner = Zox.Parcels.deedOwner(parcel, farm);
      const status = prog.mature ? "Regenerative — chem bill $0" : "Converting, year " + prog.year + " of 5";
      return (
        `<article class="m-deed is-yours" data-deed="${esc(parcel.id)}" title="Click for a picture of the farm">` +
        `<header class="m-band"><span>Title deed</span><strong>${esc(farm.name)}</strong></header>` +
        `<div class="m-body">` +
        `<p class="m-row"><span>Owner</span><b>${esc(owner)}</b></p>` +
        `<p class="m-row m-acres"><span>Acres</span><b>${parcel.acres || 1}</b></p>` +
        `<p class="m-row"><span>Status</span><b>${esc(status)}</b></p>` +
        `<p class="m-look">Click the card to see the farm</p>` +
        `</div>` +
        `<footer class="m-actions"><button type="button" data-walk="${esc(farm.id)}">Walk this farm</button></footer>` +
        `</article>`
      );
    }

    function renderSpotlight() {
      const box = el("deed-spotlight");
      const board = el("deed-board");
      if (board) board.classList.toggle("is-auto", !!ui.apOn || !!(ui.state.autopilot && ui.state.autopilot.complete));
      if (!box) return;
      const card = ui.state.autopilot && ui.state.autopilot.card;
      const show = !!ui.apOn && card;
      box.hidden = !show;
      if (!show) {
        box.innerHTML = "";
        return;
      }
      const beat =
        ui.apBeat === "stage"
          ? "Moved to Purchase"
          : ui.apBeat === "wait" || card.affordable === false
            ? "Waiting on apartment rent"
            : "On the table";
      box.innerHTML =
        `<article class="m-deed is-spotlight${card.affordable === false ? " is-wait" : ""}" data-deed="${esc(card.id)}" title="Click for a picture of the farm">` +
        `<header class="m-band" style="background:${esc(card.band)};color:${esc(card.ink)}">` +
        `<span>Title deed</span><strong>${esc(card.name)}</strong>` +
        `<em class="m-rail">${esc(card.region)} group</em>` +
        `</header>` +
        `<div class="m-body">` +
        `<p class="m-row"><span>Owner</span><b>${esc(card.owner)}</b></p>` +
        `<p class="m-row m-acres"><span>Acres</span><b>${esc(card.acres)}</b></p>` +
        `<p class="m-row m-price"><span>Cost</span><b>$${esc(card.cost)}</b></p>` +
        `<p class="m-why"><span>Why buy</span> ${esc(card.reason)}</p>` +
        `<p class="m-beat">${esc(beat)}</p>` +
        `</div>` +
        `</article>`;
    }

    function renderAutopilot() {
      const btn = el("autopilot");
      const bar = el("autopilot-bar");
      const running = !!ui.apOn;
      const ap = ui.state.autopilot;
      const done = !!(ap && ap.complete);
      if (btn) {
        btn.textContent = running ? "Stop Autopilot" : done ? "Autopilot done" : "Start Autopilot";
        btn.disabled = done && !running;
        btn.setAttribute("aria-pressed", running ? "true" : "false");
      }
      if (bar) {
        const show = running || done;
        bar.hidden = !show;
        if (show && ap) {
          const phase = el("autopilot-phase");
          const progress = el("autopilot-progress");
          const note = el("autopilot-note");
          if (phase) phase.textContent = ap.label || "";
          if (progress) progress.textContent = ap.progress || "";
          if (note) note.textContent = ap.note || "";
        }
      }
      const phaseName = ap && ap.phase ? ap.phase : "";
      document.documentElement.dataset.apPhase = running || done ? phaseName : "";
      document.documentElement.dataset.apRunning = running ? "1" : "0";
      if (running) {
        const s = ui.state.season || 1;
        document.documentElement.dataset.yearTint = String(((s - 1) % 4) + 1);
      } else {
        delete document.documentElement.dataset.yearTint;
      }
      if (cardId()) document.documentElement.dataset.apCard = cardId();
      else delete document.documentElement.dataset.apCard;
      renderSpotlight();
    }

    function cardId() {
      const card = ui.state.autopilot && ui.state.autopilot.card;
      return card && card.id ? card.id : "";
    }

    function stopAutopilot(finished) {
      ui.apOn = false;
      if (ui.apTimer) {
        clearTimeout(ui.apTimer);
        ui.apTimer = 0;
      }
      ui.apBeat = "";
      if (!finished && ui.state.autopilot) {
        ui.state.autopilot.on = false;
        ui.state.autopilotHold = false;
        ui.state.autopilot.note = "Autopilot stopped. The board is yours again.";
      }
      const btn = el("next-season");
      if (btn) btn.disabled = ui.state.status !== "playing";
    }

    function autopilotPace(kind) {
      const P = (Zox.Autopilot && Zox.Autopilot.PACE) || {};
      if (kind === "announce") return P.announce || 1600;
      if (kind === "village") return P.village || 1400;
      if (kind === "sell") return P.sell || 1400;
      if (kind === "rail") return P.rail || 900;
      if (kind === "compost") return P.compost || 250;
      return P.season || 400;
    }

    function narrateYear(text) {
      if (ui.state.autopilot) ui.state.autopilot.note = text;
    }

    function yearOpenLine() {
      const info = Zox.Sim.decadeInfo(ui.state.season, ui.state);
      const inc = ui.state.lastIncome || {};
      const net = inc.net || 0;
      const books = ui.state.villageBooks || {};
      const villages = Zox.Sim.countVillages(ui.state);
      return (
        "Year " +
        info.year +
        " of " +
        info.yearsTotal +
        " · Decade " +
        info.decade +
        " of " +
        info.decades +
        ". Last year net " +
        (net >= 0 ? "+" : "") +
        "$" +
        net +
        ". Jar $" +
        ui.state.money +
        ". Villages " +
        villages +
        (books.lease ? ", lease $" + books.lease : "") +
        ". Rail " +
        (ui.state.builtRail || 0) +
        "."
      );
    }

    function finishAutopilot() {
      stopAutopilot(true);
      ui.view = "world";
      ui.farmId = null;
      ui.boardKey = "";
      render();
      if (ui.ap && ui.ap.summary && ui.apStartedAt) {
        const sum = ui.ap.summary();
        sum.realMs = Math.round(performance.now() - ui.apStartedAt);
        ui.apSummary = sum;
        try {
          window.__zoxAutopilotSummary = sum;
        } catch (err) {
          /* ignore */
        }
      }
    }

    function kickAutopilot() {
      if (!ui.apOn || !ui.ap) return;
      const d = ui.ap.peek();
      if (!d || d.kind === "done") {
        if (d && ui.ap) ui.ap.commit();
        finishAutopilot();
        return;
      }
      const P = (Zox.Autopilot && Zox.Autopilot.PACE) || {};
      const turnsYear = Zox.Autopilot.decisionTurnsYear ? Zox.Autopilot.decisionTurnsYear(d) : d.kind === "season";
      if ((d.kind === "buy" || d.kind === "row") && d.affordable && ui.apBeat !== "year-close") {
        if (ui.apBeat !== "show" && ui.apBeat !== "stage") {
          ui.apBeat = "show";
          ui.apShown = d.parcelId;
          ui.view = "world";
          ui.farmId = null;
          ui.selected = { parcelId: d.parcelId };
          ui.boardKey = "";
          render();
          ui.apTimer = window.setTimeout(kickAutopilot, P.card || 1100);
          return;
        }
        if (ui.apBeat === "show") {
          ui.apBeat = "stage";
          render();
          ui.apTimer = window.setTimeout(kickAutopilot, P.stage || 700);
          return;
        }
        const before = ui.state.season;
        ui.ap.commit();
        ui.apBeat = "";
        ui.selected = { parcelId: d.parcelId };
        ui.boardKey = "";
        if (ui.state.season !== before) narrateYear(yearOpenLine());
        render();
        ui.apTimer = window.setTimeout(kickAutopilot, ui.state.season !== before ? P.yearOpen || 3800 : P.buy || 600);
        return;
      }
      if (turnsYear && ui.apBeat !== "year-close") {
        const info = Zox.Sim.decadeInfo(ui.state.season, ui.state);
        ui.apBeat = "year-close";
        if (d.kind === "buy" || d.kind === "row") {
          ui.apShown = d.parcelId;
          ui.selected = { parcelId: d.parcelId };
        }
        ui.view = "world";
        ui.farmId = null;
        ui.boardKey = "";
        narrateYear("Closing year " + info.year + " of " + info.yearsTotal + ". " + (d.note || "Rent and soil keep working."));
        render();
        ui.apTimer = window.setTimeout(kickAutopilot, P.yearClose || 2400);
        return;
      }
      if (ui.apBeat === "year-close") {
        ui.ap.commit();
        ui.apBeat = "";
        ui.view = "world";
        ui.farmId = null;
        ui.boardKey = "";
        narrateYear(yearOpenLine());
        render();
        ui.apTimer = window.setTimeout(kickAutopilot, P.yearOpen || 3800);
        return;
      }
      if (d.kind === "buy" || d.kind === "row") {
        ui.apShown = d.parcelId;
        ui.selected = { parcelId: d.parcelId };
      }
      ui.apBeat = "";
      ui.view = "world";
      ui.farmId = null;
      ui.boardKey = "";
      render();
      const wait = autopilotPace(d.kind);
      const before = ui.state.season;
      ui.apTimer = window.setTimeout(function () {
        if (!ui.apOn || !ui.ap) return;
        ui.ap.commit();
        ui.apBeat = "";
        ui.boardKey = "";
        if (ui.state.season !== before) narrateYear(yearOpenLine());
        render();
        if (ui.state.season !== before) {
          ui.apTimer = window.setTimeout(kickAutopilot, P.yearOpen || 3800);
          return;
        }
        kickAutopilot();
      }, wait);
    }

    function startAutopilot() {
      if (ui.apOn) {
        stopAutopilot(false);
        render();
        return;
      }
      if (ui.state.autopilot && ui.state.autopilot.complete) return;
      if (ui.state.status !== "playing") return;
      const intro = el("intro");
      if (intro) intro.hidden = true;
      hideSeasonWins();
      if (ui.winTimer) {
        clearTimeout(ui.winTimer);
        ui.winTimer = 0;
      }
      ui.view = "world";
      ui.farmId = null;
      ui.tool = "farm";
      ui.deeds = [];
      ui.ownedFocus = null;
      ui.freshDeed = "";
      ui.boardKey = "";
      ui.ap = Zox.Autopilot.create(ui.state);
      ui.apOn = true;
      ui.apBeat = "";
      ui.apShown = "";
      ui.apStartedAt = performance.now();
      try {
        window.__zoxAutopilot = ui.ap;
      } catch (err) {
        /* ignore */
      }
      flash("");
      render();
      kickAutopilot();
    }

    function stageWord(stage) {
      if (stage === "framing") return "Framing";
      if (stage === "open") return "Open";
      if (stage === "site") return "Site";
      return "Not started";
    }

    function renderVillageLine() {
      const box = el("village-cards");
      const econ = el("village-econ");
      const line = el("village-line");
      if (!box || !Zox.Sim.corridorVillages) return;
      const world = ui.view === "world";
      if (line) line.hidden = !world;
      if (!world) return;
      const spec = Zox.VILLAGE_WORKS || { lease: 6, sale: 84 };
      const cost = Zox.BUILDINGS.village.cost;
      const books = ui.state.villageBooks || { sales: 0, saleCash: 0, lease: 0 };
      const stops = Zox.Sim.corridorVillages(ui.state);
      if (econ) {
        econ.textContent =
          "Build $" +
          cost +
          " · lease $" +
          spec.lease +
          "/season once open · sell $" +
          spec.sale +
          ". Collected lease $" +
          (books.lease || 0) +
          " · sales $" +
          (books.saleCash || 0) +
          " (" +
          (books.sales || 0) +
          ").";
      }
      const focus = ui.state.autopilot && ui.state.autopilot.focusId;
      let html = "";
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        const hot = focus && focus === stop.parcelId ? " is-focus" : "";
        const stageCls = stop.sold ? " is-sold" : stop.stage ? " is-" + stop.stage : "";
        let detail;
        let button;
        if (stop.action === "need-deed") {
          detail = "Buy this stop's deed first. The village book runs beside the rail.";
          button = `<button type="button" disabled>Need the deed</button>`;
        } else if (stop.action === "converting") {
          detail = "Converting, year " + stop.year + " of 5. Fund it when the soil is regenerative.";
          button = `<button type="button" disabled>Year ${stop.year}/5</button>`;
        } else if (stop.action === "fund") {
          detail = "Regenerative stop. Fund the build. Site, then framing, then open.";
          const broke = ui.state.money < stop.cost || ui.state.status !== "playing" || ui.apOn;
          button =
            `<button type="button" data-fund-village="${esc(stop.parcelId)}"${broke ? " disabled" : ""}>` +
            (ui.apOn ? "Autopilot" : "Fund · $" + stop.cost) +
            `</button>`;
        } else if (stop.action === "building") {
          detail = stageWord(stop.stage) + " this season. It opens on the corridor before the rail is laid.";
          button = `<button type="button" disabled>${stageWord(stop.stage)}</button>`;
        } else if (stop.action === "sell") {
          detail = "Open. Lease $" + stop.lease + " each season, or sell for $" + stop.sale + ". Station stays.";
          button =
            `<button type="button" data-sell-village="${esc(stop.farmId)}"${ui.apOn || ui.state.status !== "playing" ? " disabled" : ""}>` +
            (ui.apOn ? "Open · lease $" + stop.lease : "Sell · $" + stop.sale) +
            `</button>`;
        } else {
          detail = "Sold. Lease stopped. The station stays on the line.";
          button = `<button type="button" disabled>Sold</button>`;
        }
        const art = Zox.Render.villageStageSVG ? Zox.Render.villageStageSVG(stop.stage, stop.sold) : "";
        html +=
          `<article class="v-card${stageCls}${hot}">` +
          `<header><span>Stop</span><strong>${esc(stop.name)}</strong></header>` +
          art +
          `<p class="v-stage-label">${esc(stageWord(stop.stage))}</p>` +
          `<p class="v-econ">Build $${stop.cost} · Lease $${stop.lease} · Sale $${stop.sale}</p>` +
          `<p class="v-detail">${esc(detail)}</p>` +
          button +
          `</article>`;
      }
      box.innerHTML = html;
    }

    function openFarmPhoto(parcelId) {
      const parcel = Zox.Sim.getParcel(parcelId);
      const veil = el("farm-photo");
      if (!parcel || !veil) return;
      const farm = Zox.Sim.getFarmByParcel(ui.state, parcelId);
      const owner = Zox.Parcels.deedOwner(parcel, farm);
      const prog = farm ? Zox.Sim.farmProgress(farm) : null;
      let stageKey = "wild";
      let stageLabel = "For sale — not converting yet";
      if (prog && prog.mature) {
        stageKey = "regen";
        stageLabel = "Regenerative";
      } else if (prog) {
        stageKey = "y" + prog.year;
        stageLabel = "Converting, year " + prog.year + " of 5";
      }
      const region = Zox.regionLook ? Zox.regionLook(parcel.name) : { id: "Corridor" };
      const art = el("farm-photo-art");
      if (art && Zox.Render.farmPortrait) {
        art.innerHTML = Zox.Render.farmPortrait({
          id: parcel.id,
          name: parcel.name,
          owner: owner,
          stage: stageKey,
          spine: !!parcel.spine,
        });
      }
      const title = el("farm-photo-title");
      if (title) title.textContent = parcel.name;
      const cap = el("farm-photo-caption");
      if (cap) {
        cap.textContent =
          owner +
          " · " +
          (parcel.acres || 1) +
          " acre · " +
          (region.id || "Corridor") +
          " · " +
          stageLabel;
      }
      veil.hidden = false;
    }

    function closeFarmPhoto() {
      const veil = el("farm-photo");
      if (veil) veil.hidden = true;
    }

    function renderDeeds() {
      const board = el("deed-board");
      if (!board) return;
      const world = ui.view === "world";
      board.hidden = !world;
      if (!world) return;
      const live = [];
      for (let i = 0; i < ui.deeds.length; i++) {
        if (!Zox.Sim.getFarmByParcel(ui.state, ui.deeds[i].id)) live.push(ui.deeds[i]);
      }
      ui.deeds = live;
      const hold = el("deed-hold");
      const buy = el("deed-buy");
      let holdHtml = "";
      let buyHtml = "";
      let buyCount = 0;
      for (let i = 0; i < ui.deeds.length; i++) {
        const card = ui.deeds[i];
        const html = deedCardHTML(card.id, card.col);
        if (card.col === "buy") {
          buyHtml += html;
          buyCount += 1;
        } else holdHtml += html;
      }
      if (hold) {
        hold.innerHTML =
          holdHtml || `<p class="deed-empty">Click a square on the map. The deed waits here until you mean to buy it.</p>`;
      }
      if (buy) {
        buy.innerHTML =
          buyHtml || `<p class="deed-empty">Drag a card here, or use Move to Purchase, when you intend to buy it.</p>`;
      }
      const owned = el("deed-owned");
      if (owned) {
        const html = ownedCardHTML();
        owned.hidden = !html;
        owned.innerHTML = html;
      }
      const jar = el("deed-jar");
      if (jar) {
        jar.textContent =
          "Jar $" +
          ui.state.money +
          " · apartment rent $" +
          Zox.LIC.income +
          " each season · $" +
          deedCost() +
          " an acre";
      }
      const btn = el("deed-confirm");
      if (btn) {
        const total = buyCount * deedCost();
        btn.disabled = buyCount === 0 || ui.state.money < total || ui.state.status !== "playing";
        btn.textContent = buyCount ? "Purchase " + buyCount + " · $" + total : "Purchase";
      }
      const alert = el("deed-alert");
      if (alert) {
        alert.hidden = !ui.deedAlert;
        alert.textContent = ui.deedAlert || "";
      }
    }

    function addDeed(parcelId) {
      const parcel = Zox.Sim.getParcel(parcelId);
      if (!parcel) return;
      const farm = Zox.Sim.getFarmByParcel(ui.state, parcelId);
      ui.selected = { parcelId: parcelId };
      ui.shakeDeed = "";
      if (farm) {
        ui.ownedFocus = parcelId;
        ui.freshDeed = "";
        ui.deedAlert = "";
        render();
        return;
      }
      ui.ownedFocus = null;
      let found = false;
      for (let i = 0; i < ui.deeds.length; i++) {
        if (ui.deeds[i].id === parcelId) found = true;
      }
      if (!found) ui.deeds.push({ id: parcelId, col: "hold" });
      ui.freshDeed = parcelId;
      ui.deedAlert = "";
      flash("");
      render();
      const node = document.querySelector('.m-deed[data-deed="' + parcelId + '"]');
      if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
    }

    function tryMoveDeed(parcelId, col) {
      let found = null;
      for (let i = 0; i < ui.deeds.length; i++) {
        if (ui.deeds[i].id === parcelId) found = ui.deeds[i];
      }
      if (!found) return;
      if (Zox.Sim.getFarmByParcel(ui.state, parcelId)) return;
      ui.freshDeed = "";
      if (col === "buy") {
        const check = affordCheck(parcelId);
        if (!check.ok) {
          ui.shakeDeed = parcelId;
          ui.deedAlert = shortfallText(check);
          flash(ui.deedAlert);
          render();
          return;
        }
        found.col = "buy";
        ui.shakeDeed = "";
        ui.deedAlert = "";
        flash("");
      } else {
        found.col = "hold";
        ui.shakeDeed = "";
        ui.deedAlert = "";
      }
      render();
    }

    function confirmDeeds() {
      const ids = [];
      for (let i = 0; i < ui.deeds.length; i++) {
        if (ui.deeds[i].col === "buy") ids.push(ui.deeds[i].id);
      }
      if (!ids.length) {
        ui.deedAlert = "Move a deed into Purchase first. Nothing is bought until you confirm.";
        flash(ui.deedAlert);
        render();
        return;
      }
      const cost = deedCost();
      const total = ids.length * cost;
      if (ui.state.money < total) {
        ui.deedAlert = shortfallText({
          cost: cost,
          staged: Math.max(0, total - cost),
          have: ui.state.money,
          need: total,
          short: total - ui.state.money,
          alone: ui.state.money >= cost,
        });
        flash(ui.deedAlert);
        render();
        return;
      }
      const names = [];
      const done = {};
      for (let i = 0; i < ids.length; i++) {
        const res = Zox.Sim.buyParcel(ui.state, ids[i]);
        if (!res.ok) {
          ui.deedAlert = res.why || "That deed did not clear.";
          flash(ui.deedAlert);
          break;
        }
        done[ids[i]] = true;
        const parcel = Zox.Sim.getParcel(ids[i]);
        names.push(parcel ? parcel.name : ids[i]);
      }
      const next = [];
      for (let i = 0; i < ui.deeds.length; i++) {
        if (!done[ui.deeds[i].id]) next.push(ui.deeds[i]);
      }
      ui.deeds = next;
      ui.freshDeed = "";
      ui.shakeDeed = "";
      if (names.length) {
        for (let i = 0; i < ids.length; i++) {
          if (done[ids[i]]) {
            ui.ownedFocus = ids[i];
            break;
          }
        }
        ui.deedAlert = "";
        flash(
          "Purchased " +
            names.join(", ") +
            ". Those squares are yours — copper while they convert, bright green once regenerative."
        );
      }
      ui.boardKey = "";
      render();
    }

    function actOnParcel(parcelId) {
      if (ui.apOn) {
        flash("Autopilot is buying the deeds. The corridor does not need a click.");
        return;
      }
      hideParcelTip();
      addDeed(parcelId);
    }

    function actOnTile(r, c) {
      if (ui.apOn) {
        flash("Autopilot is placing the villages and the rail.");
        return;
      }
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
            "Pull the next deed ($" +
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
      if (ui.apOn) return;
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
        ui.winTimer = window.setTimeout(function () {
          ui.winTimer = 0;
          if (ui.apOn) return;
          showSeasonWins();
        }, 1600);
      } else {
        render();
      }
    }

    function restart() {
      stopAutopilot(false);
      ui.ap = null;
      ui.apSummary = null;
      ui.state = Zox.Sim.freshState();
      ui.view = "world";
      ui.farmId = null;
      ui.selected = null;
      ui.hover = null;
      ui.tool = "farm";
      ui.boardKey = "";
      ui.deeds = [];
      ui.ownedFocus = null;
      ui.freshDeed = "";
      ui.shakeDeed = "";
      ui.deedAlert = "";
      flash("");
      hideSeasonWins();
      el("intro").hidden = true;
      render();
    }

    function bind() {
      const autoBtn = el("autopilot");
      if (autoBtn) autoBtn.addEventListener("click", startAutopilot);
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
          showParcelTip(parcel.getAttribute("data-parcel"), e.clientX, e.clientY);
          return;
        }
        hideParcelTip();
        const btn = e.target.closest("[data-r]");
        if (!btn) return;
        const r = Number(btn.dataset.r);
        const c = Number(btn.dataset.c);
        if (ui.hover && ui.hover.r === r && ui.hover.c === c) return;
        ui.hover = { r, c };
        renderGrid();
      });

      el("grid").addEventListener("pointermove", (e) => {
        const parcel = e.target.closest("[data-parcel]");
        if (!parcel) return;
        showParcelTip(parcel.getAttribute("data-parcel"), e.clientX, e.clientY);
      });

      el("grid").addEventListener("pointerleave", () => {
        hideParcelTip();
        if (ui.view !== "world") {
          ui.hover = null;
          renderGrid();
        }
      });

      const deedBoard = el("deed-board");
      let suppressDrag = false;
      if (deedBoard) {
        deedBoard.addEventListener("mousedown", (e) => {
          suppressDrag = !!e.target.closest("button");
        });
        deedBoard.addEventListener("dragstart", (e) => {
          const card = e.target.closest(".m-deed");
          if (!card || suppressDrag || !card.getAttribute("data-deed")) {
            e.preventDefault();
            return;
          }
          ui.suppressPhoto = true;
          ui.dragId = card.getAttribute("data-deed");
          e.dataTransfer.setData("text/plain", ui.dragId);
          e.dataTransfer.effectAllowed = "move";
          card.classList.add("is-dragging");
        });
        deedBoard.addEventListener("dragend", () => {
          ui.dragId = "";
          ui.suppressPhoto = false;
          const marked = deedBoard.querySelectorAll(".is-dragging, .is-over");
          for (let i = 0; i < marked.length; i++) marked[i].classList.remove("is-dragging", "is-over");
        });
        deedBoard.addEventListener("dragover", (e) => {
          const col = e.target.closest("[data-col]");
          if (!col) return;
          e.preventDefault();
          const cols = deedBoard.querySelectorAll(".deed-col");
          for (let i = 0; i < cols.length; i++) cols[i].classList.toggle("is-over", cols[i] === col || cols[i].contains(col));
        });
        deedBoard.addEventListener("drop", (e) => {
          const col = e.target.closest("[data-col]");
          if (!col) return;
          e.preventDefault();
          const id = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || ui.dragId;
          const which = col.getAttribute("data-col");
          if (id && which) tryMoveDeed(id, which);
          ui.justDragged = true;
        });
        deedBoard.addEventListener("click", (e) => {
          const move = e.target.closest("[data-move]");
          if (move) {
            const card = move.closest("[data-deed]");
            if (card) tryMoveDeed(card.getAttribute("data-deed"), move.getAttribute("data-move"));
            return;
          }
          const walk = e.target.closest("[data-walk]");
          if (walk) {
            enterFarm(walk.getAttribute("data-walk"), false);
            return;
          }
          if (e.target.closest("button")) return;
          const card = e.target.closest(".m-deed");
          if (!card) return;
          if (ui.justDragged) {
            ui.justDragged = false;
            return;
          }
          const id = card.getAttribute("data-deed");
          if (id) openFarmPhoto(id);
        });
      }
      const villageLine = el("village-line");
      if (villageLine) {
        villageLine.addEventListener("click", (e) => {
          const fund = e.target.closest("[data-fund-village]");
          if (fund) {
            if (ui.apOn) {
              flash("Autopilot is funding the villages.");
              return;
            }
            const res = Zox.Sim.fundStopVillage(ui.state, fund.getAttribute("data-fund-village"));
            ui.boardKey = "";
            flash(res.ok ? "Site work started. Next season the village frames, then it opens." : res.why);
            render();
            return;
          }
          const sell = e.target.closest("[data-sell-village]");
          if (sell) {
            if (ui.apOn) {
              flash("Autopilot handles the village sale.");
              return;
            }
            const res = Zox.Sim.sellVillage(ui.state, sell.getAttribute("data-sell-village"));
            ui.boardKey = "";
            flash(res.ok ? "Sold for $" + res.price + ". The station stays. Lease stops." : res.why);
            render();
          }
        });
      }
      const deedConfirm = el("deed-confirm");
      if (deedConfirm) deedConfirm.addEventListener("click", confirmDeeds);

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
      const farmPhoto = el("farm-photo");
      if (farmPhoto) {
        farmPhoto.addEventListener("click", (e) => {
          if (e.target.id === "farm-photo") closeFarmPhoto();
        });
      }
      const farmPhotoClose = el("farm-photo-close");
      if (farmPhotoClose) farmPhotoClose.addEventListener("click", closeFarmPhoto);
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
        if (e.key === "Escape" && el("farm-photo") && !el("farm-photo").hidden) {
          closeFarmPhoto();
          e.preventDefault();
          return;
        }
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
        if (!el("intro").hidden || !el("end-card").hidden || !el("farm-card").hidden || (el("farm-photo") && !el("farm-photo").hidden) || (el("season-win") && !el("season-win").hidden)) return;
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
          if (!ui.apOn) nextSeason();
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
    try {
      if (window.location.search.indexOf("autopilot=1") !== -1) {
        const intro = el("intro");
        if (intro) intro.hidden = true;
        startAutopilot();
      }
    } catch (err) {
      /* ignore */
    }
    if (Zox.Help) Zox.Help.bind(function () { return ui; });
    return ui;
  }

  Zox.createUI = createUI;
})(window);
