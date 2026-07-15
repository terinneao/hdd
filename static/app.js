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

function render(r) {
  const pull = r.pullback, ci = r.collapse_install, sv = r.service, b = r.buoyancy;

  $("results").innerHTML = `
  <div class="verdict ${r.overall_ok ? "pass" : "fail"}">
    ${r.overall_ok ? "✓ DESIGN OK — all checks passed"
                   : "✗ DESIGN NOT OK — one or more checks failed"}
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
      ${row("Tension reduction f_R (r = " + fmt(ci.r, 2) + ")", fmt(ci.fR, 2))}
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
}

async function calculate() {
  const res = await fetch("/api/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs()),
  });
  const data = await res.json();
  if (!res.ok) {
    $("results").innerHTML = `<div class="error">${data.error || "Calculation failed"}</div>`;
    return;
  }
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
