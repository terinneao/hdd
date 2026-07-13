"""
HDD design calculations for HDPE (PE100) pipe.

Method follows Chapter 12 "Horizontal Directional Drilling" of the
PPI Handbook of Polyethylene Pipe (2nd ed.), including:

  - Net buoyant weight of pipe in drilling fluid
  - Pullback force estimate per ASTM F1962 (points A, B, C, D)
  - Hydrokinetic drag
  - Safe pull force / tensile stress check (axial + bending)
  - Ring collapse during pullback (Levy unconstrained buckling with
    ovality factor fo and tension reduction factor fR)
  - Post-installation checks: earth + groundwater pressure, ring
    deflection, long-term unconstrained buckling, ring compressive
    stress, and pressure-rating check.

All internal computation is SI; results are reported in kgf, kg/m,
m, kPa and MPa (metric units as requested).
"""

import math

G = 9.80665           # m/s2
RHO_WATER = 1000.0    # kg/m3
KGF = G               # N per kgf

# Ovality compensation factor fo vs ring deflection (%),
# PPI Handbook Figure (Levy equation correction).
FO_TABLE = [
    (0.0, 1.00), (1.0, 0.91), (2.0, 0.84), (3.0, 0.76), (4.0, 0.70),
    (5.0, 0.64), (6.0, 0.59), (7.0, 0.55), (8.0, 0.52), (10.0, 0.45),
]

# Long-term design deflection limits (%) for pressurised PE pipe,
# PPI Handbook Chapter 6 Table 2-1 (values for non-listed DR use 7.5).
DEFLECTION_LIMITS = {9: 4.0, 11: 5.0, 13.6: 6.0, 17: 6.0, 21: 7.5,
                     26: 7.5, 33: 7.5, 41: 7.5}


def interp_fo(defl_pct):
    d = max(0.0, min(defl_pct, FO_TABLE[-1][0]))
    for (x0, y0), (x1, y1) in zip(FO_TABLE, FO_TABLE[1:]):
        if d <= x1:
            return y0 + (y1 - y0) * (d - x0) / (x1 - x0)
    return FO_TABLE[-1][1]


def calculate(pipe, p):
    """
    pipe: dict with dn_mm, sdr, pn_bar, wall_mm, id_mm, weight_kg_m
    p:    dict of design inputs (all metric, see frontend)
    """
    # ---- pipe geometry (SI) ----
    D = pipe["dn_mm"] / 1000.0                 # outside diameter, m
    t = pipe["wall_mm"] / 1000.0               # wall, m
    Di = D - 2 * t                             # inside diameter, m
    DR = D / t                                 # actual dimension ratio
    A = math.pi * t * (D - t)                  # wall cross-section area, m2
    wp = pipe["weight_kg_m"]                   # pipe weight, kg/m

    # ---- inputs ----
    L1 = p["L1"]; L2 = p["L2"]; L3 = p["L3"]; L4 = p["L4"]   # m
    H = p["depth"]                                            # m
    alpha = math.radians(p["entry_angle"])
    beta = math.radians(p["exit_angle"])
    nu_a = p["mu_ground"]          # friction, pipe on ground/rollers
    nu_b = p["mu_bore"]            # friction, pipe in borehole
    rho_mud = p["mud_density"]     # kg/m3
    rho_soil = p["soil_density"]   # kg/m3
    Hw = p["gw_height"]            # groundwater height above pipe, m
    p_hk = p["hydrokinetic_kpa"] * 1000.0      # Pa
    D_hole = p["hole_mult"] * D                # reamed hole diameter, m
    R_bend = p["bend_radius"]                  # m (0 = ignore bending)
    fill = p["ballast_fill"]                   # 0..1 water fill fraction

    E_pb = p["e_pullback"] * 1e6   # Pa, apparent modulus for pull duration
    E_lt = p["e_longterm"] * 1e6   # Pa, 50-year apparent modulus
    mu_poisson = p["poisson"]
    sig_allow = p["safe_pull_mpa"] * 1e6       # Pa, safe pull stress
    E_soil = p["e_soil_mpa"] * 1e6             # Pa, soil reaction modulus E'
    N_collapse = p["sf_collapse"]              # required SF against collapse
    defl_install = p["install_ovality_pct"]    # assumed ovality during pull
    P_op = p["op_pressure_bar"]                # working pressure, bar
    P_vac = p["vacuum_kpa"] * 1000.0           # Pa, vacuum / transient

    # ---- weights (N/m) ----
    w_pipe = wp * G
    w_ballast = fill * (math.pi / 4) * Di**2 * RHO_WATER * G
    w_displaced = (math.pi / 4) * D**2 * rho_mud * G
    wb = w_displaced - w_pipe - w_ballast      # net buoyant force, N/m (+up)
    wb_abs = abs(wb)
    w_a = w_pipe                               # weight in air during pull

    # ---- ASTM F1962 pullback force ----
    ea = math.exp(nu_a * alpha)
    eb = math.exp(nu_b * alpha)
    ebb = math.exp(nu_b * beta)

    TA = ea * nu_a * w_a * (L1 + L2 + L3 + L4)
    TB = eb * (TA + nu_b * wb_abs * L2 + wb * H - nu_a * w_a * L2 * ea)
    TB = max(TB, TA)
    TC = TB + nu_b * wb_abs * L3 - eb * (nu_a * w_a * L3 * ea)
    TC = max(TC, TB)
    TD = ebb * (TC + nu_b * wb_abs * L4 - wb * H - ebb * (nu_a * w_a * L4 * ea))
    TD = max(TD, TC)

    # hydrokinetic drag
    dT_hk = p_hk * (math.pi / 8) * (D_hole**2 - D**2)
    T_max = max(TA, TB, TC, TD) + dT_hk

    # ---- safe pull force & tensile stress ----
    F_safe = sig_allow * A                     # N
    sig_axial = T_max / A                      # Pa
    sig_bend = (E_pb * D / (2 * R_bend)) if R_bend > 0 else 0.0
    sig_total = sig_axial + sig_bend
    pull_ok = T_max <= F_safe and sig_total <= sig_allow

    # ---- collapse during pullback (Levy + fo + fR) ----
    # external mud pressure at max depth; ballast water offsets it
    P_mud = rho_mud * G * H
    P_int = fill * RHO_WATER * G * H
    P_net_install = max(P_mud - P_int, 0.0) + p_hk

    fo_i = interp_fo(defl_install)
    r = min(sig_total / sig_allow, 1.0)
    fR = max(math.sqrt(max(5.57 - (r + 1.09) ** 2, 0.0)) - 1.09, 0.0)
    Pcr_install = (2 * E_pb / (1 - mu_poisson**2)) * (1.0 / (DR - 1)) ** 3 \
        * fo_i * fR
    sf_install = Pcr_install / P_net_install if P_net_install > 0 else float("inf")
    collapse_install_ok = sf_install >= N_collapse

    # ---- post-installation (long term) ----
    # earth prism load + groundwater (buoyant soil below water table)
    Hd = max(H - Hw, 0.0)                      # dry cover
    P_earth = (rho_soil * G * Hd
               + max(rho_soil - RHO_WATER, 0.0) * G * min(Hw, H))
    P_gw = RHO_WATER * G * Hw
    P_service = P_earth + P_gw + P_vac

    # ring deflection (PPI HDD chapter, Spangler-derived)
    stiff = E_lt / (12 * (DR - 1) ** 3) + 0.061 * E_soil
    defl_pct = 100.0 * 0.0125 * P_earth / stiff if stiff > 0 else float("inf")
    defl_limit = DEFLECTION_LIMITS.get(pipe["sdr"], 7.5)
    defl_ok = defl_pct <= defl_limit

    # long-term unconstrained buckling with computed ovality
    fo_s = interp_fo(defl_pct)
    Pcr_service = (2 * E_lt / (1 - mu_poisson**2)) * (1.0 / (DR - 1)) ** 3 * fo_s
    sf_service = Pcr_service / P_service if P_service > 0 else float("inf")
    buckling_ok = sf_service >= N_collapse

    # ring compressive stress
    sig_comp = P_service * D / (2 * t)
    sig_comp_allow = p["comp_allow_mpa"] * 1e6
    comp_ok = sig_comp <= sig_comp_allow

    # pressure rating
    pressure_ok = P_op <= pipe["pn_bar"]

    n = lambda x: (x / KGF)   # N -> kgf

    return {
        "pipe": {
            "dn_mm": pipe["dn_mm"], "sdr": pipe["sdr"], "pn_bar": pipe["pn_bar"],
            "wall_mm": pipe["wall_mm"], "id_mm": pipe["id_mm"],
            "weight_kg_m": wp, "area_mm2": A * 1e6, "dr_actual": round(DR, 2),
        },
        "buoyancy": {
            "pipe_weight_kg_m": wp,
            "ballast_kg_m": w_ballast / G,
            "displaced_mud_kg_m": w_displaced / G,
            "net_buoyant_kg_m": wb / G,
        },
        "pullback": {
            "TA_kgf": n(TA), "TB_kgf": n(TB), "TC_kgf": n(TC), "TD_kgf": n(TD),
            "hydrokinetic_kgf": n(dT_hk),
            "T_max_kgf": n(T_max),
            "F_safe_kgf": n(F_safe),
            "sig_axial_mpa": sig_axial / 1e6,
            "sig_bend_mpa": sig_bend / 1e6,
            "sig_total_mpa": sig_total / 1e6,
            "sig_allow_mpa": sig_allow / 1e6,
            "utilization_pct": 100 * T_max / F_safe,
            "ok": pull_ok,
        },
        "collapse_install": {
            "p_net_kpa": P_net_install / 1000,
            "fo": fo_i, "fR": fR, "r": r,
            "pcr_kpa": Pcr_install / 1000,
            "sf": sf_install, "sf_required": N_collapse,
            "ok": collapse_install_ok,
        },
        "service": {
            "p_earth_kpa": P_earth / 1000,
            "p_gw_kpa": P_gw / 1000,
            "p_total_kpa": P_service / 1000,
            "deflection_pct": defl_pct,
            "deflection_limit_pct": defl_limit,
            "deflection_ok": defl_ok,
            "fo": fo_s,
            "pcr_kpa": Pcr_service / 1000,
            "sf_buckling": sf_service, "sf_required": N_collapse,
            "buckling_ok": buckling_ok,
            "sig_comp_mpa": sig_comp / 1e6,
            "sig_comp_allow_mpa": sig_comp_allow / 1e6,
            "comp_ok": comp_ok,
            "op_pressure_bar": P_op, "pn_bar": pipe["pn_bar"],
            "pressure_ok": pressure_ok,
        },
        "overall_ok": all([pull_ok, collapse_install_ok, defl_ok,
                           buckling_ok, comp_ok, pressure_ok]),
    }
