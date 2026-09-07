"""
app.py — Flask application with all API routes and static file serving.

Run:
    python app.py
    → http://localhost:8000
"""

import os
import sys
import signal
from flask import Flask, request, jsonify, send_from_directory, send_file
from database import get_db, init_db, backup_db, DB_PATH
from datetime import datetime, timezone

app = Flask(__name__, static_folder="static", template_folder="templates")


# ── Serve SPA ─────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("templates", "index.html")


# ── Research Groups API ───────────────────────────────────────────────

@app.route("/api/groups", methods=["GET"])
def list_groups():
    conn = get_db()
    rows = conn.execute("""
        SELECT g.*,
               (SELECT COUNT(*) FROM papers p WHERE p.research_group_id = g.id) AS paper_count
        FROM research_groups g
        ORDER BY g.rank ASC
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/groups", methods=["POST"])
def create_group():
    data = request.json or {}
    errors = validate_group(data)
    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_db()
    # Default rank = max + 1 if not provided
    max_rank = conn.execute("SELECT COALESCE(MAX(rank), 0) FROM research_groups").fetchone()[0]
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        """INSERT INTO research_groups
           (rank, professor, college, lab_group,
            primary_research_area, key_research_directions,
            professor_research_value,
            overall_score, why_it_ranks_here,
            created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            int(data["rank"]) if data.get("rank") else max_rank + 1,
            data["professor"].strip(),
            data.get("college", "IIIT Hyderabad").strip(),
            data.get("lab_group", "").strip(),
            data.get("primary_research_area", "").strip(),
            data.get("key_research_directions", "").strip(),
            data.get("professor_research_value", "").strip(),
            round(float(data["overall_score"]), 2) if data.get("overall_score") else None,
            data.get("why_it_ranks_here", "").strip(),
            now, now,
        ),
    )
    new_id = cur.lastrowid
    conn.commit()
    row = conn.execute("""
        SELECT g.*,
               (SELECT COUNT(*) FROM papers p WHERE p.research_group_id = g.id) AS paper_count
        FROM research_groups g WHERE g.id = ?
    """, (new_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/groups/<int:gid>", methods=["GET"])
def get_group(gid):
    conn = get_db()
    row = conn.execute("""
        SELECT g.*,
               (SELECT COUNT(*) FROM papers p WHERE p.research_group_id = g.id) AS paper_count
        FROM research_groups g WHERE g.id = ?
    """, (gid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Group not found"}), 404
    return jsonify(dict(row))


@app.route("/api/groups/<int:gid>", methods=["PUT"])
def update_group(gid):
    data = request.json or {}
    errors = validate_group(data, partial=True)
    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_db()
    existing = conn.execute("SELECT * FROM research_groups WHERE id = ?", (gid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """UPDATE research_groups SET
           rank = ?, professor = ?, college = ?, lab_group = ?,
           primary_research_area = ?, key_research_directions = ?,
           professor_research_value = ?, overall_score = ?,
           why_it_ranks_here = ?, updated_at = ?
           WHERE id = ?""",
        (
            int(data.get("rank", existing["rank"])),
            data.get("professor", existing["professor"]).strip(),
            data.get("college", existing["college"]).strip(),
            data.get("lab_group", existing["lab_group"]).strip(),
            data.get("primary_research_area", existing["primary_research_area"] or "").strip(),
            data.get("key_research_directions", existing["key_research_directions"] or "").strip(),
            data.get("professor_research_value", existing["professor_research_value"] or "").strip(),
            round(float(data["overall_score"]), 2) if data.get("overall_score") is not None and data.get("overall_score") != "" else existing["overall_score"],
            data.get("why_it_ranks_here", existing["why_it_ranks_here"] or "").strip(),
            now, gid,
        ),
    )
    conn.commit()
    row = conn.execute("""
        SELECT g.*,
               (SELECT COUNT(*) FROM papers p WHERE p.research_group_id = g.id) AS paper_count
        FROM research_groups g WHERE g.id = ?
    """, (gid,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route("/api/groups/<int:gid>", methods=["DELETE"])
def delete_group(gid):
    conn = get_db()
    existing = conn.execute("SELECT * FROM research_groups WHERE id = ?", (gid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Group not found"}), 404
    paper_count = conn.execute("SELECT COUNT(*) FROM papers WHERE research_group_id = ?", (gid,)).fetchone()[0]
    conn.execute("DELETE FROM research_groups WHERE id = ?", (gid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True, "papers_removed": paper_count})


@app.route("/api/groups/<int:gid>/move", methods=["POST"])
def move_group(gid):
    """Change rank. Body: { "direction": "up"|"down" } or { "new_order": N }"""
    data = request.json or {}
    conn = get_db()

    current = conn.execute("SELECT * FROM research_groups WHERE id = ?", (gid,)).fetchone()
    if not current:
        conn.close()
        return jsonify({"error": "Group not found"}), 404

    if "new_order" in data:
        new_order = int(data["new_order"])
        old_order = current["rank"]
        if new_order == old_order:
            conn.close()
            return jsonify({"moved": True})
        if new_order < old_order:
            conn.execute(
                "UPDATE research_groups SET rank = rank + 1 WHERE rank >= ? AND rank < ? AND id != ?",
                (new_order, old_order, gid))
        else:
            conn.execute(
                "UPDATE research_groups SET rank = rank - 1 WHERE rank > ? AND rank <= ? AND id != ?",
                (old_order, new_order, gid))
        conn.execute("UPDATE research_groups SET rank = ?, updated_at = ? WHERE id = ?",
                      (new_order, datetime.now(timezone.utc).isoformat(), gid))
    elif data.get("direction") == "up":
        swap = conn.execute(
            "SELECT * FROM research_groups WHERE rank < ? ORDER BY rank DESC LIMIT 1",
            (current["rank"],)).fetchone()
        if swap:
            conn.execute("UPDATE research_groups SET rank = ?, updated_at = ? WHERE id = ?",
                          (swap["rank"], datetime.now(timezone.utc).isoformat(), gid))
            conn.execute("UPDATE research_groups SET rank = ?, updated_at = ? WHERE id = ?",
                          (current["rank"], datetime.now(timezone.utc).isoformat(), swap["id"]))
    elif data.get("direction") == "down":
        swap = conn.execute(
            "SELECT * FROM research_groups WHERE rank > ? ORDER BY rank ASC LIMIT 1",
            (current["rank"],)).fetchone()
        if swap:
            conn.execute("UPDATE research_groups SET rank = ?, updated_at = ? WHERE id = ?",
                          (swap["rank"], datetime.now(timezone.utc).isoformat(), gid))
            conn.execute("UPDATE research_groups SET rank = ?, updated_at = ? WHERE id = ?",
                          (current["rank"], datetime.now(timezone.utc).isoformat(), swap["id"]))

    conn.commit()
    conn.close()
    return jsonify({"moved": True})


# ── Papers API ────────────────────────────────────────────────────────

@app.route("/api/papers", methods=["GET"])
def list_papers():
    conn = get_db()
    q = request.args.get("q", "").strip()
    group_id = request.args.get("group_id")
    year = request.args.get("year")
    venue = request.args.get("venue")
    rating_min = request.args.get("rating_min")
    rating_max = request.args.get("rating_max")
    professor = request.args.get("professor")
    lab = request.args.get("lab")
    completion = request.args.get("completion", "")  # "completed", "pending", "completed,pending"

    sql = """
        SELECT p.*, g.professor, g.college, g.lab_group, g.rank
        FROM papers p
        JOIN research_groups g ON p.research_group_id = g.id
        WHERE 1=1
    """
    params = []

    if group_id:
        sql += " AND p.research_group_id = ?"
        params.append(int(group_id))
    if year:
        sql += " AND p.year = ?"
        params.append(int(year))
    if venue:
        sql += " AND p.venue LIKE ?"
        params.append(f"%{venue}%")
    if rating_min is not None and rating_min != "":
        sql += " AND p.rating >= ?"
        params.append(float(rating_min))
    if rating_max is not None and rating_max != "":
        sql += " AND p.rating < ?"
        params.append(float(rating_max))
    if professor:
        sql += " AND g.professor LIKE ?"
        params.append(f"%{professor}%")
    if lab:
        sql += " AND g.lab_group LIKE ?"
        params.append(f"%{lab}%")
    if completion:
        parts = [c.strip() for c in completion.split(",") if c.strip()]
        if len(parts) == 1:
            if parts[0] == "completed":
                sql += """ AND (
                    (p.completion_type = 'percentage' AND p.completion_value >= 100)
                    OR (p.completion_type = 'pages' AND p.completion_total > 0 AND p.completion_value >= p.completion_total)
                )"""
            elif parts[0] == "pending":
                sql += """ AND (
                    (p.completion_type = 'percentage' AND p.completion_value < 100)
                    OR (p.completion_type = 'pages' AND (p.completion_total IS NULL OR p.completion_total = 0 OR p.completion_value < p.completion_total))
                )"""
        # both selected = show all, no filter needed
    if q:
        sql += """ AND (p.paper_name LIKE ? OR p.topic LIKE ? OR p.areas_covered LIKE ?
                   OR p.venue LIKE ? OR g.professor LIKE ? OR g.lab_group LIKE ?)"""
        like = f"%{q}%"
        params.extend([like] * 6)

    sql += " ORDER BY p.created_at DESC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/groups/<int:gid>/papers", methods=["GET"])
def list_group_papers(gid):
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, g.professor, g.college, g.lab_group, g.rank
        FROM papers p
        JOIN research_groups g ON p.research_group_id = g.id
        WHERE p.research_group_id = ?
        ORDER BY p.created_at DESC
    """, (gid,)).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/papers", methods=["POST"])
def create_paper():
    data = request.json or {}
    errors = validate_paper(data)
    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_db()
    # Verify group exists
    grp = conn.execute("SELECT id FROM research_groups WHERE id = ?",
                        (int(data["research_group_id"]),)).fetchone()
    if not grp:
        conn.close()
        return jsonify({"errors": ["Research group not found"]}), 400

    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Completion fields
    comp_type = data.get("completion_type", "percentage")
    comp_value = float(data.get("completion_value", 0) or 0)
    comp_total = int(data["completion_total"]) if data.get("completion_total") else None
    # Reading start date: default to today unless explicitly set to null
    rsd = data.get("reading_start_date")
    if rsd is None or rsd == "":
        reading_start = today
    elif rsd == "__none__":
        reading_start = None
    else:
        reading_start = rsd
    cur = conn.execute(
        """INSERT INTO papers
           (research_group_id, paper_name, link, year, venue, topic,
            areas_covered, rating, review, what_new_i_learned, notes,
            completion_type, completion_value, completion_total, reading_start_date,
            created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            int(data["research_group_id"]),
            data["paper_name"].strip(),
            data.get("link", "").strip(),
            int(data["year"]) if data.get("year") else None,
            data.get("venue", "").strip(),
            data.get("topic", "").strip(),
            data.get("areas_covered", "").strip(),
            round(float(data["rating"]), 2) if data.get("rating") is not None and data.get("rating") != "" else None,
            data.get("review", "").strip(),
            data.get("what_new_i_learned", "").strip(),
            data.get("notes", "").strip(),
            comp_type, comp_value, comp_total, reading_start,
            now, now,
        ),
    )
    new_id = cur.lastrowid
    conn.commit()
    row = conn.execute("""
        SELECT p.*, g.professor, g.college, g.lab_group, g.rank
        FROM papers p
        JOIN research_groups g ON p.research_group_id = g.id
        WHERE p.id = ?
    """, (new_id,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route("/api/papers/<int:pid>", methods=["GET"])
def get_paper(pid):
    conn = get_db()
    row = conn.execute("""
        SELECT p.*, g.professor, g.college, g.lab_group, g.rank
        FROM papers p
        JOIN research_groups g ON p.research_group_id = g.id
        WHERE p.id = ?
    """, (pid,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Paper not found"}), 404
    return jsonify(dict(row))


@app.route("/api/papers/<int:pid>", methods=["PUT"])
def update_paper(pid):
    data = request.json or {}
    errors = validate_paper(data, partial=True)
    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_db()
    existing = conn.execute("SELECT * FROM papers WHERE id = ?", (pid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Paper not found"}), 404

    now = datetime.now(timezone.utc).isoformat()
    # Completion fields
    comp_type = data.get("completion_type", existing["completion_type"])
    comp_value = float(data.get("completion_value", existing["completion_value"]) or 0)
    comp_total = int(data["completion_total"]) if data.get("completion_total") else existing["completion_total"]
    rsd = data.get("reading_start_date")
    if rsd == "__none__":
        reading_start = None
    elif rsd is not None and rsd != "":
        reading_start = rsd
    else:
        reading_start = existing["reading_start_date"]
    conn.execute(
        """UPDATE papers SET
           research_group_id = ?, paper_name = ?, link = ?, year = ?,
           venue = ?, topic = ?, areas_covered = ?, rating = ?,
           review = ?, what_new_i_learned = ?, notes = ?,
           completion_type = ?, completion_value = ?, completion_total = ?,
           reading_start_date = ?, updated_at = ?
           WHERE id = ?""",
        (
            int(data.get("research_group_id", existing["research_group_id"])),
            data.get("paper_name", existing["paper_name"]).strip(),
            data.get("link", existing["link"] or "").strip(),
            int(data["year"]) if data.get("year") else existing["year"],
            data.get("venue", existing["venue"] or "").strip(),
            data.get("topic", existing["topic"] or "").strip(),
            data.get("areas_covered", existing["areas_covered"] or "").strip(),
            round(float(data["rating"]), 2) if data.get("rating") is not None and data.get("rating") != "" else existing["rating"],
            data.get("review", existing["review"] or "").strip(),
            data.get("what_new_i_learned", existing["what_new_i_learned"] or "").strip(),
            data.get("notes", existing["notes"] or "").strip(),
            comp_type, comp_value, comp_total, reading_start,
            now, pid,
        ),
    )
    conn.commit()
    row = conn.execute("""
        SELECT p.*, g.professor, g.college, g.lab_group, g.rank
        FROM papers p
        JOIN research_groups g ON p.research_group_id = g.id
        WHERE p.id = ?
    """, (pid,)).fetchone()
    conn.close()
    return jsonify(dict(row))


@app.route("/api/papers/<int:pid>", methods=["DELETE"])
def delete_paper(pid):
    conn = get_db()
    existing = conn.execute("SELECT * FROM papers WHERE id = ?", (pid,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({"error": "Paper not found"}), 404
    conn.execute("DELETE FROM papers WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


# ── Reference Data APIs ───────────────────────────────────────────────

@app.route("/api/field-optionality", methods=["GET"])
def get_field_optionality():
    conn = get_db()
    rows = conn.execute("SELECT * FROM field_optionality ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/field-optionality/<int:fid>", methods=["PUT"])
def update_field_optionality(fid):
    data = request.json or {}
    conn = get_db()
    conn.execute(
        """UPDATE field_optionality SET
           field=?, precog=?, mll=?, cvit=?, ltrc=?, rrc=?, csg=?, serc=?, comments=?
           WHERE id=?""",
        (data.get("field",""), data.get("precog",""), data.get("mll",""),
         data.get("cvit",""), data.get("ltrc",""), data.get("rrc",""),
         data.get("csg",""), data.get("serc",""), data.get("comments",""), fid),
    )
    conn.commit()
    conn.close()
    return jsonify({"updated": True})


@app.route("/api/lab-overview", methods=["GET"])
def get_lab_overview():
    conn = get_db()
    rows = conn.execute("SELECT * FROM lab_overview ORDER BY overall_rank").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/lab-overview/<int:lid>", methods=["PUT"])
def update_lab_overview(lid):
    data = request.json or {}
    conn = get_db()
    conn.execute(
        """UPDATE lab_overview SET
           overall_rank=?, lab_group=?, core_identity=?, main_fields=?,
           optionality=?, key_tradeoff=?
           WHERE id=?""",
        (data.get("overall_rank"), data.get("lab_group",""),
         data.get("core_identity",""), data.get("main_fields",""),
         data.get("optionality",""), data.get("key_tradeoff",""), lid),
    )
    conn.commit()
    conn.close()
    return jsonify({"updated": True})


@app.route("/api/how-to-decide", methods=["GET"])
def get_how_to_decide():
    conn = get_db()
    rows = conn.execute("SELECT * FROM how_to_decide ORDER BY id").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/how-to-decide/<int:hid>", methods=["PUT"])
def update_how_to_decide(hid):
    data = request.json or {}
    conn = get_db()
    conn.execute(
        "UPDATE how_to_decide SET principle=?, details=? WHERE id=?",
        (data.get("principle",""), data.get("details",""), hid),
    )
    conn.commit()
    conn.close()
    return jsonify({"updated": True})


@app.route("/api/how-to-decide", methods=["POST"])
def create_how_to_decide():
    data = request.json or {}
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO how_to_decide (principle, details) VALUES (?, ?)",
        (data.get("principle", ""), data.get("details", ""))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/how-to-decide/<int:hid>", methods=["DELETE"])
def delete_how_to_decide(hid):
    conn = get_db()
    conn.execute("DELETE FROM how_to_decide WHERE id=?", (hid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


@app.route("/api/field-optionality", methods=["POST"])
def create_field_optionality():
    data = request.json or {}
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO field_optionality (field, precog, mll, cvit, ltrc, rrc, csg, serc, comments)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.get("field",""), data.get("precog",""), data.get("mll",""),
         data.get("cvit",""), data.get("ltrc",""), data.get("rrc",""),
         data.get("csg",""), data.get("serc",""), data.get("comments",""))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/field-optionality/<int:fid>", methods=["DELETE"])
def delete_field_optionality(fid):
    conn = get_db()
    conn.execute("DELETE FROM field_optionality WHERE id=?", (fid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


@app.route("/api/lab-overview", methods=["POST"])
def create_lab_overview():
    data = request.json or {}
    conn = get_db()
    cur = conn.execute(
        """INSERT INTO lab_overview (overall_rank, lab_group, core_identity, main_fields, optionality, key_tradeoff)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (data.get("overall_rank"), data.get("lab_group",""),
         data.get("core_identity",""), data.get("main_fields",""),
         data.get("optionality",""), data.get("key_tradeoff",""))
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/lab-overview/<int:lid>", methods=["DELETE"])
def delete_lab_overview(lid):
    conn = get_db()
    conn.execute("DELETE FROM lab_overview WHERE id=?", (lid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


# ── Extra Notes APIs ──────────────────────────────────────────────────

@app.route("/api/extra-notes", methods=["GET"])
def get_extra_notes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM extra_notes ORDER BY created_at DESC").fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/extra-notes", methods=["POST"])
def create_extra_notes():
    data = request.json or {}
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO extra_notes (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (data.get("title", ""), data.get("content", ""), now, now)
    )
    new_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/extra-notes/<int:nid>", methods=["PUT"])
def update_extra_notes(nid):
    data = request.json or {}
    conn = get_db()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE extra_notes SET title=?, content=?, updated_at=? WHERE id=?",
        (data.get("title", ""), data.get("content", ""), now, nid)
    )
    conn.commit()
    conn.close()
    return jsonify({"updated": True})


@app.route("/api/extra-notes/<int:nid>", methods=["DELETE"])
def delete_extra_notes(nid):
    conn = get_db()
    conn.execute("DELETE FROM extra_notes WHERE id=?", (nid,))
    conn.commit()
    conn.close()
    return jsonify({"deleted": True})


# ── Dashboard API ─────────────────────────────────────────────────────

@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    conn = get_db()
    stats = {}
    stats["group_count"] = conn.execute("SELECT COUNT(*) FROM research_groups").fetchone()[0]
    stats["paper_count"] = conn.execute("SELECT COUNT(*) FROM papers").fetchone()[0]
    stats["professors_with_papers"] = conn.execute(
        "SELECT COUNT(DISTINCT research_group_id) FROM papers").fetchone()[0]
    avg = conn.execute("SELECT AVG(rating) FROM papers WHERE rating IS NOT NULL").fetchone()[0]
    stats["avg_rating"] = round(avg, 1) if avg else None

    # Papers per lab
    rows = conn.execute("""
        SELECT g.lab_group, COUNT(p.id) as count
        FROM research_groups g
        LEFT JOIN papers p ON p.research_group_id = g.id
        GROUP BY g.lab_group
        ORDER BY count DESC
    """).fetchall()
    stats["papers_by_lab"] = [dict(r) for r in rows]

    # Papers per professor (top 10)
    rows = conn.execute("""
        SELECT g.professor, COUNT(p.id) as count
        FROM research_groups g
        LEFT JOIN papers p ON p.research_group_id = g.id
        GROUP BY g.id
        HAVING count > 0
        ORDER BY count DESC
        LIMIT 10
    """).fetchall()
    stats["papers_by_professor"] = [dict(r) for r in rows]

    # Papers by year
    rows = conn.execute("""
        SELECT year, COUNT(*) as count
        FROM papers
        WHERE year IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
    """).fetchall()
    stats["papers_by_year"] = [dict(r) for r in rows]

    conn.close()
    return jsonify(stats)


# ── Backup API ────────────────────────────────────────────────────────

@app.route("/api/backup/download", methods=["GET"])
def do_backup():
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return send_file(DB_PATH, as_attachment=True, download_name=f"research_backup_{ts}.db")


# ── Filter options ────────────────────────────────────────────────────

@app.route("/api/filter-options", methods=["GET"])
def filter_options():
    conn = get_db()
    years = [r[0] for r in conn.execute(
        "SELECT DISTINCT year FROM papers WHERE year IS NOT NULL ORDER BY year DESC").fetchall()]
    venues = [r[0] for r in conn.execute(
        "SELECT DISTINCT venue FROM papers WHERE venue IS NOT NULL AND venue != '' ORDER BY venue").fetchall()]
    professors = [dict(r) for r in conn.execute(
        "SELECT id, professor, lab_group FROM research_groups ORDER BY rank").fetchall()]
    labs = [r[0] for r in conn.execute(
        "SELECT DISTINCT lab_group FROM research_groups ORDER BY lab_group").fetchall()]
    conn.close()
    return jsonify({"years": years, "venues": venues, "professors": professors, "labs": labs})


# ── Validation helpers ────────────────────────────────────────────────

def validate_group(data, partial=False):
    errors = []
    if not partial:
        if not data.get("professor", "").strip():
            errors.append("Professor is required.")
    else:
        if "professor" in data and not data["professor"].strip():
            errors.append("Professor cannot be empty.")

    if "rank" in data:
        try:
            int(data["rank"])
        except (ValueError, TypeError):
            errors.append("Rank must be a number.")
    if "overall_score" in data and data["overall_score"] is not None and data["overall_score"] != "":
        try:
            r = float(data["overall_score"])
            if r < 0 or r > 10:
                errors.append("Overall score must be between 0 and 10.")
        except (ValueError, TypeError):
            errors.append("Overall score must be a number.")
    return errors


def validate_paper(data, partial=False):
    errors = []
    if not partial:
        if not data.get("paper_name", "").strip():
            errors.append("Paper name is required.")
        if not data.get("research_group_id"):
            errors.append("Research group is required.")
    else:
        if "paper_name" in data and not data["paper_name"].strip():
            errors.append("Paper name cannot be empty.")

    if "rating" in data and data["rating"] is not None and data["rating"] != "":
        try:
            r = float(data["rating"])
            if r < 0 or r > 10:
                errors.append("Rating must be between 0 and 10.")
        except (ValueError, TypeError):
            errors.append("Rating must be a number.")
    if "year" in data and data["year"] is not None and data["year"] != "":
        try:
            int(data["year"])
        except (ValueError, TypeError):
            errors.append("Year must be a number.")
    return errors


# ── Startup ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.path.exists(DB_PATH):
        print("Database not found. Run 'python import_excel.py' first.")
        print("Initializing empty database...")
        init_db()
    app.run(host="127.0.0.1", port=8000, debug=True)
