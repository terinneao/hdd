"""
Generate the HDPE PE100 pipe database (TIS 982 / ISO 4427 dimensions).

Produces:
  - pipe_data.sql : plain SQL (CREATE TABLE + INSERTs)
  - pipes.db      : SQLite database used by the web app

Wall thicknesses are minimum wall (e_min, mm) per TIS 982-2556 / ISO 4427-2
for PE100. Weight per metre is computed from mean wall dimensions with
PE density 955 kg/m3 and a 5% allowance for dimensional tolerances,
which reproduces typical manufacturer catalogue values.
"""

import math
import sqlite3
import os

PE_DENSITY = 955.0   # kg/m3
TOL_FACTOR = 1.05    # allowance for mean wall vs minimum wall

# PN (bar) for PE100 (MRS 10 MPa, design coefficient C = 1.25)
PN_BY_SDR = {9: 20, 11: 16, 13.6: 12.5, 17: 10, 21: 8, 26: 6.3, 33: 5, 41: 4}

# DN (mm) -> {SDR: e_min (mm)}  per TIS 982 / ISO 4427-2, PE100
WALLS = {
    63:   {9: 7.1,  11: 5.8,  13.6: 4.7,  17: 3.8,  21: 3.0,  26: 2.5},
    75:   {9: 8.4,  11: 6.8,  13.6: 5.6,  17: 4.5,  21: 3.6,  26: 2.9},
    90:   {9: 10.1, 11: 8.2,  13.6: 6.7,  17: 5.4,  21: 4.3,  26: 3.5,  33: 2.8},
    110:  {9: 12.3, 11: 10.0, 13.6: 8.1,  17: 6.6,  21: 5.3,  26: 4.2,  33: 3.4,  41: 2.7},
    125:  {9: 14.0, 11: 11.4, 13.6: 9.2,  17: 7.4,  21: 6.0,  26: 4.8,  33: 3.9,  41: 3.1},
    140:  {9: 15.7, 11: 12.7, 13.6: 10.3, 17: 8.3,  21: 6.7,  26: 5.4,  33: 4.3,  41: 3.5},
    160:  {9: 17.9, 11: 14.6, 13.6: 11.8, 17: 9.5,  21: 7.7,  26: 6.2,  33: 4.9,  41: 4.0},
    180:  {9: 20.1, 11: 16.4, 13.6: 13.3, 17: 10.7, 21: 8.6,  26: 6.9,  33: 5.5,  41: 4.4},
    200:  {9: 22.4, 11: 18.2, 13.6: 14.7, 17: 11.9, 21: 9.6,  26: 7.7,  33: 6.2,  41: 4.9},
    225:  {9: 25.2, 11: 20.5, 13.6: 16.6, 17: 13.4, 21: 10.8, 26: 8.6,  33: 6.9,  41: 5.5},
    250:  {9: 27.9, 11: 22.7, 13.6: 18.4, 17: 14.8, 21: 11.9, 26: 9.6,  33: 7.7,  41: 6.2},
    280:  {9: 31.3, 11: 25.4, 13.6: 20.6, 17: 16.6, 21: 13.4, 26: 10.7, 33: 8.6,  41: 6.9},
    315:  {9: 35.2, 11: 28.6, 13.6: 23.2, 17: 18.7, 21: 15.0, 26: 12.1, 33: 9.7,  41: 7.7},
    355:  {9: 39.7, 11: 32.2, 13.6: 26.1, 17: 21.1, 21: 16.9, 26: 13.6, 33: 10.9, 41: 8.7},
    400:  {9: 44.7, 11: 36.3, 13.6: 29.4, 17: 23.7, 21: 19.1, 26: 15.3, 33: 12.3, 41: 9.8},
    450:  {9: 50.3, 11: 40.9, 13.6: 33.1, 17: 26.7, 21: 21.5, 26: 17.2, 33: 13.8, 41: 11.0},
    500:  {11: 45.4, 13.6: 36.8, 17: 29.7, 21: 23.9, 26: 19.1, 33: 15.3, 41: 12.3},
    560:  {11: 50.8, 13.6: 41.2, 17: 33.2, 21: 26.7, 26: 21.4, 33: 17.2, 41: 13.7},
    630:  {11: 57.2, 13.6: 46.3, 17: 37.4, 21: 30.0, 26: 24.1, 33: 19.3, 41: 15.4},
    710:  {13.6: 52.2, 17: 42.1, 21: 33.9, 26: 27.2, 33: 21.8, 41: 17.4},
    800:  {13.6: 58.8, 17: 47.4, 21: 38.1, 26: 30.6, 33: 24.5, 41: 19.6},
    900:  {17: 53.3, 21: 42.9, 26: 34.4, 33: 27.6, 41: 22.0},
    1000: {17: 59.3, 21: 47.7, 26: 38.2, 33: 30.6, 41: 24.5},
}


def build_rows():
    rows = []
    pid = 1
    for dn in sorted(WALLS):
        for sdr in sorted(WALLS[dn], reverse=True):
            e = WALLS[dn][sdr]
            inner = dn - 2 * e
            # weight per metre from mean dimensions (kg/m)
            w = math.pi * (e / 1000.0) * ((dn - e) / 1000.0) * PE_DENSITY * TOL_FACTOR
            rows.append((pid, dn, sdr, PN_BY_SDR[sdr], e, round(inner, 1), round(w, 2)))
            pid += 1
    return rows


SCHEMA = """DROP TABLE IF EXISTS pipes;
CREATE TABLE pipes (
    id INTEGER PRIMARY KEY,
    dn_mm REAL NOT NULL,          -- nominal outside diameter (mm)
    sdr REAL NOT NULL,            -- standard dimension ratio
    pn_bar REAL NOT NULL,         -- pressure rating for PE100 (bar)
    wall_mm REAL NOT NULL,        -- minimum wall thickness (mm)
    id_mm REAL NOT NULL,          -- mean inside diameter (mm)
    weight_kg_m REAL NOT NULL     -- weight per metre (kg/m)
);
"""


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    rows = build_rows()

    sql_path = os.path.join(here, "pipe_data.sql")
    with open(sql_path, "w", encoding="utf-8") as f:
        f.write("-- HDPE PE100 pipe database per TIS 982-2556 / ISO 4427\n")
        f.write("-- Columns: dn_mm, sdr, pn_bar, wall_mm, id_mm, weight_kg_m\n")
        f.write(SCHEMA)
        f.write("\n")
        for r in rows:
            f.write(
                "INSERT INTO pipes VALUES "
                f"({r[0]}, {r[1]}, {r[2]}, {r[3]}, {r[4]}, {r[5]}, {r[6]});\n"
            )

    db_path = os.path.join(here, "pipes.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    con = sqlite3.connect(db_path)
    con.executescript(open(sql_path, encoding="utf-8").read())
    con.commit()
    con.close()

    print(f"Wrote {len(rows)} pipe records to pipe_data.sql and pipes.db")


if __name__ == "__main__":
    main()
