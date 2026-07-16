let PIPES = [];

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) =>
  Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

// Typical material defaults per grade (editable by the user):
// apparent modulus for the ~12 h pull, 50-year modulus, safe pull
// stress and allowable long-term compressive stress (MPa).
const GRADE_DEFAULTS = {
  PE100: { e_pullback: 350, e_longterm: 200, safe_pull_mpa: 8.0, comp_allow_mpa: 7.9 },
  PE80:  { e_pullback: 300, e_longterm: 150, safe_pull_mpa: 6.5, comp_allow_mpa: 6.3 },
};

async function loadPipes() {
  PIPES = await (await fetch("/api/pipes")).json();
  applyGradeDefaults();
  refreshDn();
  $("dn").value = 315;
  refreshSdr();
}

function gradePipes() {
  return PIPES.filter((p) => p.grade === $("grade").value);
}

function applyGradeDefaults() {
  const d = GRADE_DEFAULTS[$("grade").value];
  for (const k in d) $(k).value = d[k];
  $("grade-tag").textContent = `(${$("grade").value})`;
}

function refreshDn() {
  const prev = $("dn").value;
  const dns = [...new Set(gradePipes().map((p) => p.dn_mm))];
  $("dn").innerHTML = dns.map((d) => `<option value="${d}">${d}</option>`).join("");
  if (dns.includes(+prev)) $("dn").value = prev;
}

function refreshSdr() {
  const dn = +$("dn").value;
  const prev = $("sdr").value;
  const sdrs = gradePipes().filter((p) => p.dn_mm === dn)
    .map((p) => p.sdr).sort((a, b) => a - b);
  $("sdr").innerHTML = sdrs.map((s) => `<option value="${s}">SDR ${s}</option>`).join("");
  if (sdrs.includes(+prev)) $("sdr").value = prev;
  else if (sdrs.includes(11)) $("sdr").value = 11;
  showPipeInfo();
}

function currentPipe() {
  return gradePipes().find((p) => p.dn_mm === +$("dn").value && p.sdr === +$("sdr").value);
}

function showPipeInfo() {
  const p = currentPipe();
  if (!p) return;
  $("pipe-info").innerHTML =
    `<b>${p.grade}</b> &nbsp;DN <b>${p.dn_mm} mm</b> · SDR <b>${p.sdr}</b> · PN <b>${p.pn_bar} bar</b><br>` +
    `Wall <b>${p.wall_mm} mm</b> · ID <b>${p.id_mm} mm</b> · Weight <b>${fmt(p.weight_kg_m, 2)} kg/m</b>`;
}

function inputs() {
  const num = (id) => parseFloat($(id).value) || 0;
  return {
    grade: $("grade").value,
    dn_mm: +$("dn").value,
    sdr: +$("sdr").value,
    L1: num("L1"), L2: num("L2"), L3: num("L3"), L4: num("L4"),
    depth: num("depth"),
    entry_angle: num("entry_angle"),
    exit_angle: num("exit_angle"),
    bend_radius: num("bend_radius"),
    hole_mult: num("hole_mult"),
    mud_density: num("mud_density"),
    soil_density: num("soil_density"),
    gw_height: num("gw_height"),
    e_soil_mpa: num("e_soil_mpa"),
    hydrokinetic_kpa: num("hydrokinetic_kpa"),
    mu_ground: num("mu_ground"),
    mu_bore: num("mu_bore"),
    ballast_fill: +$("ballast_fill").value,
    e_pullback: num("e_pullback"),
    e_longterm: num("e_longterm"),
    poisson: num("poisson"),
    safe_pull_mpa: num("safe_pull_mpa"),
    comp_allow_mpa: num("comp_allow_mpa"),
    sf_collapse: num("sf_collapse"),
    install_ovality_pct: num("install_ovality_pct"),
    op_pressure_bar: num("op_pressure_bar"),
    vacuum_kpa: num("vacuum_kpa"),
  };
}

const badge = (ok) => `<span class="badge ${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"}</span>`;
const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

let LAST_RESULT = null;
let LAST_INPUTS = null;

function render(r) {
  const pull = r.pullback, ci = r.collapse_install, sv = r.service, b = r.buoyancy;

  $("results").innerHTML = `
  <div class="results-toolbar">
    <div class="verdict ${r.overall_ok ? "pass" : "fail"}">
      ${r.overall_ok ? "✓ DESIGN OK — all checks passed"
                     : "✗ DESIGN NOT OK — one or more checks failed"}
    </div>
    <button id="print-btn" title="Print calculation sheet / save as PDF">🖨 Print PDF</button>
  </div>

  <section class="card rescard">
    <h2>Pipe &amp; Buoyancy</h2>
    <table>
      ${row("Pipe", `${r.pipe.grade} · DN ${r.pipe.dn_mm} mm · SDR ${r.pipe.sdr} · PN ${r.pipe.pn_bar} bar`)}
      ${row("Wall / ID", `${r.pipe.wall_mm} mm / ${r.pipe.id_mm} mm`)}
      ${row("Wall area", `${fmt(r.pipe.area_mm2, 0)} mm²`)}
      ${row("Pipe weight", `${fmt(b.pipe_weight_kg_m, 2)} kg/m`)}
      ${row("Ballast water", `${fmt(b.ballast_kg_m, 2)} kg/m`)}
      ${row("Displaced mud", `${fmt(b.displaced_mud_kg_m, 2)} kg/m`)}
      ${row("Net buoyant force (up +)", `${fmt(b.net_buoyant_kg_m, 2)} kg/m`)}
    </table>
  </section>

  <section class="card rescard">
    <h2>Pullback Force — ASTM F1962 ${badge(pull.ok)}</h2>
    <table>
      ${row("T at A (pipe entering)", `${fmt(pull.TA_kgf, 0)} kgf`)}
      ${row("T at B (bottom of entry slope)", `${fmt(pull.TB_kgf, 0)} kgf`)}
      ${row("T at C (end of horizontal run)", `${fmt(pull.TC_kgf, 0)} kgf`)}
      ${row("T at D (pipe exiting)", `${fmt(pull.TD_kgf, 0)} kgf`)}
      ${row("Hydrokinetic drag", `${fmt(pull.hydrokinetic_kgf, 0)} kgf`)}
      ${row("<b>Max pull force</b>", `<b>${fmt(pull.T_max_kgf, 0)} kgf</b>`)}
      ${row("Safe pull force", `${fmt(pull.F_safe_kgf, 0)} kgf`)}
      ${row("Utilisation", `${fmt(pull.utilization_pct, 1)} %`)}
      ${row("Axial + bending stress", `${fmt(pull.sig_total_mpa, 2)} MPa (bend ${fmt(pull.sig_bend_mpa, 2)})`)}
      ${row("Safe pull stress", `${fmt(pull.sig_allow_mpa, 2)} MPa`)}
    </table>
  </section>

  <section class="card rescard">
    <h2>Collapse During Pullback ${badge(ci.ok)}</h2>
    <table>
      ${row("Net external pressure (mud + hydrokinetic)", `${fmt(ci.p_net_kpa, 1)} kPa`)}
      ${row("Ovality factor f₀", fmt(ci.fo, 2))}
      ${row("Tension reduction f<sub>R</sub> (r = " + fmt(ci.r, 2) + ")", fmt(ci.fR, 2))}
      ${row("Critical collapse pressure", `${fmt(ci.pcr_kpa, 1)} kPa`)}
      ${row("Safety factor", `${fmt(ci.sf, 2)} (required ${fmt(ci.sf_required, 1)})`)}
    </table>
  </section>

  <section class="card rescard">
    <h2>Post-Installation (Long Term)</h2>
    <table>
      ${row("Earth pressure (prism)", `${fmt(sv.p_earth_kpa, 1)} kPa`)}
      ${row("Groundwater pressure", `${fmt(sv.p_gw_kpa, 1)} kPa`)}
      ${row("Total external pressure", `${fmt(sv.p_total_kpa, 1)} kPa`)}
      ${row(`Ring deflection ${badge(sv.deflection_ok)}`,
            `${fmt(sv.deflection_pct, 2)} % (limit ${sv.deflection_limit_pct} %)`)}
      ${row(`Buckling SF ${badge(sv.buckling_ok)}`,
            `${fmt(sv.sf_buckling, 2)} (Pcr ${fmt(sv.pcr_kpa, 1)} kPa, required ${fmt(sv.sf_required, 1)})`)}
      ${row(`Ring compressive stress ${badge(sv.comp_ok)}`,
            `${fmt(sv.sig_comp_mpa, 2)} MPa (allow ${fmt(sv.sig_comp_allow_mpa, 1)} MPa)`)}
      ${row(`Pressure rating ${badge(sv.pressure_ok)}`,
            `${fmt(sv.op_pressure_bar, 1)} bar ≤ PN ${sv.pn_bar} bar`)}
    </table>
  </section>`;

  $("print-btn").addEventListener("click", printSheet);
}

function printSheet() {
  if (!LAST_RESULT) return;
  buildPrintSheet(LAST_RESULT, LAST_INPUTS);
  window.print();
}

function buildPrintSheet(r, inp) {
  const pull = r.pullback, ci = r.collapse_install, sv = r.service, b = r.buoyancy;
  const pf = (ok) => `<span class="ps-badge ${ok ? "ps-pass" : "ps-fail"}">${ok ? "PASS" : "FAIL"}</span>`;
  const tr = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const today = new Date().toLocaleDateString("en-GB",
    { day: "2-digit", month: "short", year: "numeric" });
  const proj = $("project_name").value || "—";
  const by = $("calc_by").value || "—";
  const fill = inp.ballast_fill > 0 ? "Water-ballasted (full)" : "Empty (air)";

  $("print-sheet").innerHTML = `
  <div class="ps-header">
    <h1>HDD Calculation Sheet — HDPE Pipe</h1>
    <div class="ps-sub">Horizontal Directional Drilling design per PPI Handbook of
    Polyethylene Pipe (Ch. 12) and ASTM F1962 · Pipe data per TIS 982</div>
    <table class="ps-meta">
      <tr><td><b>Project:</b> ${proj}</td><td><b>Calculated by:</b> ${by}</td><td><b>Date:</b> ${today}</td></tr>
    </table>
  </div>

  <div class="ps-verdict ${r.overall_ok ? "ps-pass" : "ps-fail"}">
    ${r.overall_ok ? "DESIGN OK — all checks passed" : "DESIGN NOT OK — one or more checks failed"}
  </div>

  <div class="ps-cols">
    <div>
      <h3>1. Pipe Data (TIS 982)</h3>
      <table>
        ${tr("Material grade", r.pipe.grade)}
        ${tr("Nominal diameter DN", `${r.pipe.dn_mm} mm`)}
        ${tr("SDR / PN", `${r.pipe.sdr} / ${r.pipe.pn_bar} bar`)}
        ${tr("Wall thickness", `${r.pipe.wall_mm} mm`)}
        ${tr("Inside diameter", `${r.pipe.id_mm} mm`)}
        ${tr("Wall area", `${fmt(r.pipe.area_mm2, 0)} mm²`)}
        ${tr("Weight", `${fmt(r.pipe.weight_kg_m, 2)} kg/m`)}
      </table>

      <h3>2. Bore Path</h3>
      <table>
        ${tr("L₁ (surface) / L₂ (entry)", `${inp.L1} / ${inp.L2} m`)}
        ${tr("L₃ (horizontal) / L₄ (exit)", `${inp.L3} / ${inp.L4} m`)}
        ${tr("Max depth H", `${inp.depth} m`)}
        ${tr("Entry / exit angle", `${inp.entry_angle}° / ${inp.exit_angle}°`)}
        ${tr("Bend radius R", `${inp.bend_radius} m`)}
        ${tr("Reamed hole / pipe OD", `${inp.hole_mult}`)}
      </table>

      <h3>3. Soil, Fluid &amp; Friction</h3>
      <table>
        ${tr("Mud density", `${inp.mud_density} kg/m³`)}
        ${tr("Soil density", `${inp.soil_density} kg/m³`)}
        ${tr("Groundwater above pipe", `${inp.gw_height} m`)}
        ${tr("Soil reaction modulus E′", `${inp.e_soil_mpa} MPa`)}
        ${tr("Hydrokinetic pressure", `${inp.hydrokinetic_kpa} kPa`)}
        ${tr("Friction μₐ (surface) / μᵦ (bore)", `${inp.mu_ground} / ${inp.mu_bore}`)}
        ${tr("Pipe during pullback", fill)}
      </table>

      <h3>4. Material &amp; Design Factors</h3>
      <table>
        ${tr("Apparent modulus (pull / 50-yr)", `${inp.e_pullback} / ${inp.e_longterm} MPa`)}
        ${tr("Poisson ratio", `${inp.poisson}`)}
        ${tr("Safe pull stress", `${inp.safe_pull_mpa} MPa`)}
        ${tr("Allowable compressive stress", `${inp.comp_allow_mpa} MPa`)}
        ${tr("Required SF vs collapse", `${inp.sf_collapse}`)}
        ${tr("Assumed ovality during pull", `${inp.install_ovality_pct} %`)}
        ${tr("Working pressure / vacuum", `${inp.op_pressure_bar} bar / ${inp.vacuum_kpa} kPa`)}
      </table>
    </div>

    <div>
      <h3>5. Buoyancy</h3>
      <table>
        ${tr("Pipe weight", `${fmt(b.pipe_weight_kg_m, 2)} kg/m`)}
        ${tr("Ballast water", `${fmt(b.ballast_kg_m, 2)} kg/m`)}
        ${tr("Displaced mud", `${fmt(b.displaced_mud_kg_m, 2)} kg/m`)}
        ${tr("Net buoyant force (up +)", `${fmt(b.net_buoyant_kg_m, 2)} kg/m`)}
      </table>

      <h3>6. Pullback Force — ASTM F1962 &nbsp;${pf(pull.ok)}</h3>
      <table>
        ${tr("T at A / B", `${fmt(pull.TA_kgf, 0)} / ${fmt(pull.TB_kgf, 0)} kgf`)}
        ${tr("T at C / D", `${fmt(pull.TC_kgf, 0)} / ${fmt(pull.TD_kgf, 0)} kgf`)}
        ${tr("Hydrokinetic drag", `${fmt(pull.hydrokinetic_kgf, 0)} kgf`)}
        ${tr("<b>Max pull force</b>", `<b>${fmt(pull.T_max_kgf, 0)} kgf</b>`)}
        ${tr("Safe pull force", `${fmt(pull.F_safe_kgf, 0)} kgf`)}
        ${tr("Utilisation", `${fmt(pull.utilization_pct, 1)} %`)}
        ${tr("Axial + bending stress", `${fmt(pull.sig_total_mpa, 2)} MPa (bend ${fmt(pull.sig_bend_mpa, 2)})`)}
        ${tr("Safe pull stress", `${fmt(pull.sig_allow_mpa, 2)} MPa`)}
      </table>

      <h3>7. Collapse During Pullback &nbsp;${pf(ci.ok)}</h3>
      <table>
        ${tr("Net external pressure", `${fmt(ci.p_net_kpa, 1)} kPa`)}
        ${tr("Ovality factor f₀", fmt(ci.fo, 2))}
        ${tr(`Tension reduction f<sub>R</sub> (r = ${fmt(ci.r, 2)})`, fmt(ci.fR, 2))}
        ${tr("Critical collapse pressure", `${fmt(ci.pcr_kpa, 1)} kPa`)}
        ${tr("Safety factor", `${fmt(ci.sf, 2)} (required ${fmt(ci.sf_required, 1)})`)}
      </table>

      <h3>8. Post-Installation (Long Term)</h3>
      <table>
        ${tr("Earth / groundwater pressure", `${fmt(sv.p_earth_kpa, 1)} / ${fmt(sv.p_gw_kpa, 1)} kPa`)}
        ${tr("Total external pressure", `${fmt(sv.p_total_kpa, 1)} kPa`)}
        ${tr(`Ring deflection ${pf(sv.deflection_ok)}`,
             `${fmt(sv.deflection_pct, 2)} % (limit ${sv.deflection_limit_pct} %)`)}
        ${tr(`Buckling SF ${pf(sv.buckling_ok)}`,
             `${fmt(sv.sf_buckling, 2)} (Pcr ${fmt(sv.pcr_kpa, 1)} kPa, req. ${fmt(sv.sf_required, 1)})`)}
        ${tr(`Ring compressive stress ${pf(sv.comp_ok)}`,
             `${fmt(sv.sig_comp_mpa, 2)} MPa (allow ${fmt(sv.sig_comp_allow_mpa, 1)} MPa)`)}
        ${tr(`Pressure rating ${pf(sv.pressure_ok)}`,
             `${fmt(sv.op_pressure_bar, 1)} bar ≤ PN ${sv.pn_bar} bar`)}
      </table>
    </div>
  </div>

  <div class="ps-footer">
    Method: PPI Handbook of Polyethylene Pipe, 2nd ed., Chapter 12 (HDD); ASTM F1962 pull-force
    model; Levy unconstrained buckling with ovality (f₀) and tension (f_R) reduction factors.
    Results are preliminary estimates — final design must be verified by a qualified engineer.
    <div class="ps-signs">
      <span>Calculated: ______________________</span>
      <span>Checked: ______________________</span>
      <span>Approved: ______________________</span>
    </div>
  </div>`;
}

async function calculate() {
  const inp = inputs();
  const res = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inp),
  });
  const data = await res.json();
  if (!res.ok) {
    $("results").innerHTML = `<div class="error">${data.error || "Calculation failed"}</div>`;
    return;
  }
  LAST_RESULT = data;
  LAST_INPUTS = inp;
  render(data);
}

$("grade").addEventListener("change", () => {
  applyGradeDefaults();
  refreshDn();
  refreshSdr();
});
$("dn").addEventListener("change", refreshSdr);
$("sdr").addEventListener("change", showPipeInfo);
$("calc-btn").addEventListener("click", calculate);

loadPipes();
