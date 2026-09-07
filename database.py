"""
database.py — SQLite schema initialization and helper functions.
"""

import sqlite3
import os
import shutil
from datetime import datetime

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "research.db")

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS research_groups (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    rank                      INTEGER NOT NULL,
    professor                 TEXT    NOT NULL,
    college                   TEXT    NOT NULL DEFAULT '',
    lab_group                 TEXT    NOT NULL DEFAULT '',
    primary_research_area     TEXT,
    key_research_directions   TEXT,
    professor_research_value  TEXT,
    overall_score             REAL CHECK(overall_score >= 0 AND overall_score <= 10),
    why_it_ranks_here         TEXT,
    created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS papers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    research_group_id   INTEGER NOT NULL,
    paper_name          TEXT    NOT NULL,
    link                TEXT,
    year                INTEGER,
    venue               TEXT,
    topic               TEXT,
    areas_covered       TEXT,
    rating              REAL CHECK(rating >= 0 AND rating <= 10),
    review              TEXT,
    what_new_i_learned  TEXT,
    notes               TEXT,
    completion_type     TEXT    NOT NULL DEFAULT 'percentage',
    completion_value    REAL    NOT NULL DEFAULT 0,
    completion_total    INTEGER,
    reading_start_date  TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (research_group_id) REFERENCES research_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_optionality (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    field    TEXT NOT NULL,
    precog   TEXT,
    mll      TEXT,
    cvit     TEXT,
    ltrc     TEXT,
    rrc      TEXT,
    csg      TEXT,
    serc     TEXT,
    comments TEXT
);

CREATE TABLE IF NOT EXISTS lab_overview (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    overall_rank    INTEGER,
    lab_group       TEXT NOT NULL,
    core_identity   TEXT,
    main_fields     TEXT,
    optionality     TEXT,
    key_tradeoff    TEXT
);

CREATE TABLE IF NOT EXISTS how_to_decide (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    principle TEXT NOT NULL,
    details   TEXT
);

CREATE TABLE IF NOT EXISTS extra_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def get_db():
    """Return a new connection with row_factory set."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create the data directory and run the schema."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def backup_db():
    """Copy research.db to a timestamped backup file. Returns the backup path."""
    os.makedirs(os.path.join(DB_DIR, "backups"), exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(DB_DIR, "backups", f"research_backup_{ts}.db")
    shutil.copy2(DB_PATH, backup_path)
    return backup_path
