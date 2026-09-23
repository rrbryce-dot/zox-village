/**
 * Headless autopilot run. Prints phase timing for the playtest note.
 * Usage: node tools/autopilot-headless.mjs
 */
import fs from "fs";
import vm from "vm";

const window = {};
const context = { window, console, performance: { now: () => Date.now() } };
context.globalThis = context;
vm.createContext(context);
for (const file of ["js/config.js", "js/parcels.js", "js/map.js", "js/sim.js", "js/autopilot.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}
const Z = context.window.Zox;
const state = Z.Sim.freshState(7);
const ap = Z.Autopilot.create(state);
const t0 = Date.now();
let guard = 0;
while (guard++ < 800) {
  const d = ap.peek();
  if (!d || d.kind === "done") {
    if (d) ap.commit();
    break;
  }
  ap.commit();
  if (state.season > 40 && d.kind === "season") break;
}
const sum = ap.summary();
sum.headlessMs = Date.now() - t0;
sum.guard = guard;
const phases = sum.phases.map((p) => p.phase);
const regenDone = sum.regenDoneSeason;
const firstV = sum.firstVillageSeason;
const errors = [];
if (phases[0] !== "farms") errors.push("phase order start " + phases.join(">"));
const order = ["farms", "villages", "row", "rail", "done"];
let cursor = -1;
for (const name of phases) {
  const at = order.indexOf(name);
  if (at < cursor) errors.push("phase went backwards " + phases.join(">"));
  cursor = at;
}
for (const need of order) {
  if (phases.indexOf(need) < 0) errors.push("missing phase " + need);
}
if (!(firstV != null && regenDone != null && firstV < regenDone)) {
  errors.push("villages did not start before farmland finished: village " + firstV + " regen " + regenDone);
}
if (sum.villages !== sum.villageTarget) errors.push("villages " + sum.villages + "/" + sum.villageTarget);
if (sum.farms !== sum.farmTarget) errors.push("farms " + sum.farms + "/" + sum.farmTarget);
if (sum.row !== sum.rowTarget) errors.push("row " + sum.row + "/" + sum.rowTarget);
if (sum.rail !== sum.railTarget) errors.push("rail " + sum.rail + "/" + sum.railTarget);
if (sum.builtRail !== sum.railTarget) errors.push("builtRail " + sum.builtRail);
if (sum.cashWaits < 1) errors.push("expected a cash wait");
if (sum.season < 16 || sum.season > 30) errors.push("season " + sum.season + " outside 4–6 decade band");
if (sum.decade < 4) errors.push("decade " + sum.decade);
const years = sum.years || [];
if (years.length < 10) errors.push("too few years " + years.length);
if (years[0] !== 2) errors.push("first recorded year " + years[0]);
if (years[years.length - 1] !== sum.season) errors.push("last year " + years[years.length - 1] + " != season " + sum.season);
const per = 5;
const expectedJobs = years.filter((y) => y > 1 && (y - 1) % per === 0).length;
if (sum.greatJobs !== expectedJobs) errors.push("greatJobs " + sum.greatJobs + " != " + expectedJobs);
if ((sum.greatJobs || 0) < 3) errors.push("expected a Great Job card after each closed decade, got " + sum.greatJobs);
for (let i = 1; i < years.length; i++) {
  if (years[i] !== years[i - 1] + 1) errors.push("year skip " + years[i - 1] + " -> " + years[i]);
}
if ((sum.estimatedWatchSec || 0) < 120) errors.push("estimated watch " + sum.estimatedWatchSec + "s is still a short skim");
if (state.autopilotHold) errors.push("hold still set");
if (sum.status !== "playing") errors.push("status " + sum.status);
if (sum.money < 0) errors.push("broke");
if ((sum.villageSales || 0) < 1) errors.push("expected a village sale, got " + sum.villageSales);
if ((sum.villageLease || 0) < 1) errors.push("expected village lease income, got " + sum.villageLease);
if ((sum.villageSaleCash || 0) < 84) errors.push("sale cash " + sum.villageSaleCash);
if (sum.waste >= 96) errors.push("waste " + sum.waste);
if (sum.nature <= 6) errors.push("nature " + sum.nature);
const railPhase = sum.phases.find((p) => p.phase === "rail");
const rowPhase = sum.phases.find((p) => p.phase === "row");
const villagePhase = sum.phases.find((p) => p.phase === "villages");
if (railPhase && rowPhase && railPhase.season < rowPhase.season) errors.push("rail before row");
if (villagePhase && villagePhase.farms >= villagePhase.farmTarget) {
  errors.push("village phase began after all farms were bought");
}
console.log(JSON.stringify(sum, null, 2));
if (errors.length) {
  console.error("FAIL");
  errors.forEach((e) => console.error(" - " + e));
  process.exit(1);
}
console.log("OK");
