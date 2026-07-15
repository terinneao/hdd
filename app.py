"""Flask web app: HDD design calculator for HDPE PE100 pipe (TIS 982)."""

import os
import sqlite3
from flask import Flask, jsonify, request, send_from_directory

import calculations

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "pipes.db")

app = Flask(__name__, static_folder="static", static_url_path="")


def get_db():
    if not os.path.exists(DB_PATH):
        import generate_db
        generate_db.main()
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/pipes")
def pipes():
    con = get_db()
    rows = con.execute(
        "SELECT * FROM pipes ORDER BY grade, dn_mm, sdr DESC").fetchall()
    con.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/calculate", methods=["POST"])
def calc():
    data = request.get_json(force=True)
    con = get_db()
    pipe = con.execute(
        "SELECT * FROM pipes WHERE grade = ? AND dn_mm = ? AND sdr = ?",
        (data.get("grade", "PE100"), data["dn_mm"], data["sdr"])).fetchone()
    con.close()
    if pipe is None:
        return jsonify({"error": "Pipe not found in database"}), 404
    try:
        result = calculations.calculate(dict(pipe), data)
    except (KeyError, ValueError, ZeroDivisionError) as e:
        return jsonify({"error": f"Invalid input: {e}"}), 400
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=8000)
