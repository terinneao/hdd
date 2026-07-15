"""Quick end-to-end test of the /api/calculate endpoint."""
import json
import urllib.request

payload = {
    "grade": "PE100", "dn_mm": 315, "sdr": 11,
    "L1": 30, "L2": 60, "L3": 150, "L4": 60, "depth": 8,
    "entry_angle": 12, "exit_angle": 10,
    "mu_ground": 0.1, "mu_bore": 0.3,
    "mud_density": 1150, "soil_density": 1900, "gw_height": 4,
    "e_soil_mpa": 0.5, "hydrokinetic_kpa": 70, "hole_mult": 1.5,
    "bend_radius": 50, "ballast_fill": 0,
    "e_pullback": 350, "e_longterm": 200, "poisson": 0.45,
    "safe_pull_mpa": 8, "comp_allow_mpa": 7.9, "sf_collapse": 2,
    "install_ovality_pct": 3, "op_pressure_bar": 6, "vacuum_kpa": 0,
}

for grade, safe_pull, e_pb, e_lt in (
        ("PE100", 8.0, 350, 200), ("PE80", 6.5, 300, 150)):
    p = dict(payload, grade=grade, safe_pull_mpa=safe_pull,
             e_pullback=e_pb, e_longterm=e_lt)
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/calculate",
        data=json.dumps(p).encode(),
        headers={"Content-Type": "application/json"},
    )
    d = json.load(urllib.request.urlopen(req))
    print("%s (PN %s bar): overall_ok=%s | T_max %.0f kgf | F_safe %.0f kgf | "
          "collapse SF %.2f | deflection %.2f%% | buckling SF %.2f" %
          (grade, d["pipe"]["pn_bar"], d["overall_ok"],
           d["pullback"]["T_max_kgf"], d["pullback"]["F_safe_kgf"],
           d["collapse_install"]["sf"], d["service"]["deflection_pct"],
           d["service"]["sf_buckling"]))
