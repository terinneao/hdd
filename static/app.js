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

// ---------- bore path profile (SVG) ----------
// Draws the ASTM F1962 bore geometry: pipe string on surface (L1), entry
// slope (L2), horizontal run at depth H (L3) and exit slope to the rig (L4).
// Horizontal and vertical scales differ; the vertical is exaggerated.
// If `res` is given, pull forces at A–D are labelled on the drawing.
function borePathSvg(inp, res, W = 680) {
  const H = 270;
  const ml = 16, mr = 70, y0 = 78, depthPx = 110;
  const L1 = Math.max(inp.L1, 0), L2 = Math.max(inp.L2, 0);
  const L3 = Math.max(inp.L3, 0), L4 = Math.max(inp.L4, 0);
  const total = L1 + L2 + L3 + L4 || 1;
  const depth = Math.max(inp.depth, 0);
  const sx = (W - ml - mr) / total;
  const x = (s) => ml + s * sx;
  const yH = y0 + (depth > 0 ? depthPx : 0);
  const yDim = yH + 34;
  const n = (v) => fmt(v, 0);

  const A = [x(L1), y0], B = [x(L1 + L2), yH];
  const C = [x(L1 + L2 + L3), yH], D = [x(total), y0];

  // rounded corners at B and C so the drawn bore looks like a drilled path
  const toward = (p, q, d) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [p[0] + (q[0] - p[0]) * d / len, p[1] + (q[1] - p[1]) * d / len];
  };
  const r = Math.min(28, (C[0] - B[0]) / 2.2, (B[0] - A[0]) / 2.2, (D[0] - C[0]) / 2.2);
  const b1 = toward(B, A, r), b2 = toward(B, C, r);
  const c1 = toward(C, B, r), c2 = toward(C, D, r);
  const pt = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const bore = `M${pt(A)} L${pt(b1)} Q${pt(B)} ${pt(b2)} L${pt(c1)} Q${pt(C)} ${pt(c2)} L${pt(D)}`;

  // groundwater table (gw_height is measured above the pipe)
  let gw = "";
  if (inp.gw_height > 0 && depth > 0) {
    const gy = y0 + depthPx * Math.max(depth - inp.gw_height, 0) / depth;
    gw = `<line class="bp-gw" x1="${ml}" y1="${gy}" x2="${W - mr + 50}" y2="${gy}"/>
      <text class="bp-small bp-gwt" x="${W - mr + 48}" y="${gy - 4}" text-anchor="end">▽ GWT</text>`;
  }

  // dimension line with end ticks and a centred label
  const dim = (s0, s1, label) => {
    if (s1 - s0 <= 0) return "";
    const xa = x(s0), xb = x(s1);
    return `<line class="bp-dim" x1="${xa}" y1="${yDim}" x2="${xb}" y2="${yDim}"/>
      <line class="bp-dim" x1="${xa}" y1="${yDim - 5}" x2="${xa}" y2="${yDim + 5}"/>
      <line class="bp-dim" x1="${xb}" y1="${yDim - 5}" x2="${xb}" y2="${yDim + 5}"/>
      <text class="bp-small" x="${(xa + xb) / 2}" y="${yDim + 17}" text-anchor="middle">${label}</text>`;
  };

  const marker = (p, name, dx, dy, anchor, force) => `
    <circle class="bp-pt" cx="${p[0]}" cy="${p[1]}" r="5"/>
    <text class="bp-label" x="${p[0] + dx}" y="${p[1] + dy}" text-anchor="${anchor}">${name}${
      force != null ? `<tspan class="bp-force"> ${n(force)} kgf</tspan>` : ""}</text>`;

  const pull = res && res.pullback;
  const hx = (B[0] + C[0]) / 2;
  const exag = depth > 0 ? (depthPx / depth) / sx : 0;

  // drill rig just past exit point D, mast inclined at the exit angle
  const beta = (inp.exit_angle || 0) * Math.PI / 180;
  const mastLen = 46;
  const mast = [D[0] + 10 + mastLen * Math.cos(beta), y0 - 10 - mastLen * Math.sin(beta)];

  return `<svg class="bore-svg" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Bore path profile: L1 ${L1} m, L2 ${L2} m, L3 ${L3} m, L4 ${L4} m, depth ${depth} m">
    <rect class="bp-soil" x="0" y="${y0}" width="${W}" height="${H - y0}"/>
    ${gw}
    <line class="bp-ground" x1="0" y1="${y0}" x2="${W}" y2="${y0}"/>

    <path class="bp-hole" d="${bore}"/>
    <path class="bp-pipe" d="${bore}"/>
    <line class="bp-pipe" x1="${x(0)}" y1="${y0 - 5}" x2="${A[0] - 4}" y2="${y0 - 5}"/>
    ${L1 > 0 ? `<text class="bp-small" x="${x(0)}" y="${y0 - 34}">pipe string ➜</text>` : ""}

    <g class="bp-rig">
      <rect x="${D[0] + 8}" y="${y0 - 12}" width="54" height="12" rx="2"/>
      <line x1="${D[0] + 4}" y1="${y0 - 6}" x2="${mast[0]}" y2="${mast[1]}"/>
    </g>
    <text class="bp-small" x="${mast[0]}" y="${mast[1] - 8}" text-anchor="end">rig</text>
    <text class="bp-arrow" x="${(A[0] + D[0]) / 2}" y="${y0 - 40}" text-anchor="middle">pullback direction ➜</text>

    <text class="bp-small" x="${A[0] + 30}" y="${y0 + 16}">α ${inp.entry_angle}°</text>
    <text class="bp-small" x="${D[0] - 30}" y="${y0 + 16}" text-anchor="end">β ${inp.exit_angle}°</text>

    ${depth > 0 ? `
    <line class="bp-dim" x1="${hx}" y1="${y0}" x2="${hx}" y2="${yH}"/>
    <line class="bp-dim" x1="${hx - 5}" y1="${y0}" x2="${hx + 5}" y2="${y0}"/>
    <line class="bp-dim" x1="${hx - 5}" y1="${yH}" x2="${hx + 5}" y2="${yH}"/>
    <text class="bp-small" x="${hx + 7}" y="${yH - 8}">H = ${depth} m</text>` : ""}

    ${marker(A, "A", 0, -14, "middle", pull && pull.TA_kgf)}
    ${marker(B, "B", 8, -10, "start", pull && pull.TB_kgf)}
    ${marker(C, "C", -8, -10, "end", pull && pull.TC_kgf)}
    ${marker(D, "D", -4, -14, "end", pull && pull.TD_kgf)}

    ${dim(0, L1, `L₁ ${L1} m`)}
    ${dim(L1, L1 + L2, `L₂ ${L2} m`)}
    ${dim(L1 + L2, L1 + L2 + L3, `L₃ ${L3} m`)}
    ${dim(L1 + L2 + L3, total, `L₄ ${L4} m`)}

    ${exag > 1.05 ? `<text class="bp-note" x="${W - 6}" y="${H - 6}" text-anchor="end">vertical scale ×${fmt(exag, 0)}</text>` : ""}
  </svg>`;
}

function drawBorePreview() {
  $("bore-preview").innerHTML = borePathSvg(inputs(), null, 520);
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
    <h2>Bore Path Profile — pull force at A–D</h2>
    <div class="bore-wrap">${borePathSvg(LAST_INPUTS, r)}</div>
  </section>

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

  <div class="ps-bore">${borePathSvg(inp, r)}</div>

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
for (const id of ["L1", "L2", "L3", "L4", "depth", "entry_angle", "exit_angle", "gw_height"])
  $(id).addEventListener("input", drawBorePreview);

drawBorePreview();
loadPipes();
