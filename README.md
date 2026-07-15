# HDD Calculator — HDPE Pipe PE100 / PE80 (TIS 982)

Web app for designing HDPE pipe installed by Horizontal Directional Drilling,
following **Chapter 12 of the PPI Handbook of Polyethylene Pipe** and the
**ASTM F1962** pull-force model. Metric units throughout (kg, m, kPa, MPa, kgf).

## Run

```powershell
pip install -r requirements.txt
python generate_db.py   # builds pipe_data.sql and pipes.db (first time only)
python app.py           # open http://127.0.0.1:5000
```

## Pipe database

**PE100 and PE80** pipes per **TIS 982-2556 / ISO 4427**: DN 63–1000 mm,
SDR 9–41, with pressure rating per grade (PE100: PN 4–20 bar, PE80:
PN 3.2–16 bar), wall thickness, inside diameter and weight (kg/m).
Dimensions depend only on SDR, so both grades share the same wall table.
Data is stored in SQLite (`pipes.db`); `pipe_data.sql` contains the same
data as plain SQL. Regenerate both with `python generate_db.py`.

## Calculations

**Installation (pullback)**

- Net buoyant weight of pipe in drilling mud (empty or water-ballasted)
- Pull force at points A–D of the bore path (ASTM F1962), plus hydrokinetic drag
- Safe pull force from safe pull stress × wall area; axial + bending stress check
- Ring collapse during pullback: Levy unconstrained buckling with ovality
  factor f₀ and tension reduction factor f_R, checked against mud pressure

**Post-installation (long-term service)**

- Earth prism load (buoyant soil below water table) + groundwater + vacuum
- Ring deflection (PPI HDD equation) vs. design deflection limit per DR
- Long-term unconstrained buckling with ovality factor, required SF
- Ring compressive stress vs. allowable
- Working pressure vs. PN rating

Material defaults switch with the selected grade and remain editable in
the UI: PE100 — apparent modulus 350 MPa (~12-hour pull) / 200 MPa
(50-year), safe pull stress 8.0 MPa; PE80 — 300 / 150 MPa, safe pull
stress 6.5 MPa.

> Results are preliminary estimates. Final designs must be verified by a
> qualified engineer against project-specific conditions.
