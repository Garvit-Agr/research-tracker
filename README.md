# IIITH Research Tracker

A local SQLite + Flask web application for tracking research papers and professor/lab rankings at IIIT Hyderabad.

## Quick Start

### 1. Install dependencies

```bash
cd research-tracker
uv venv .venv
source .venv/bin/activate
uv pip install flask openpyxl
```

### 2. Initialize the Database

**Option A: Import existing data from Excel (Optional)**
If you have the `Sample_data.xlsx` workbook, you can import it:
```bash
python import_excel.py
# or with a custom path:
python import_excel.py path/to/workbook.xlsx
```
This imports all data from the Excel workbook into SQLite.

**Option B: Start from scratch**
If you don't have an Excel file or just want an empty database, skip this step completely. The application will automatically create an empty SQLite database for you the first time you start the server!

### 3. Run the server

```bash
source .venv/bin/activate
python3 app.py
```

Open: **http://localhost:8000**

---

## How To Use

### Research Tracker
- Select a professor/group from the dropdown
- View all papers for that group
- Click **+ Add Paper** to add a new paper
- Click ✏️ to edit, 🗑️ to delete papers
- Papers show: name, link, year, venue, topic, areas, rating, review, notes

### Research Groups
- View all professors with their rank, college, lab, and paper count
- Click **+ Add Group** to add a new professor/lab entry
- Click ✏️ to edit any field (rank, professor, college, lab, research areas, scores, rationale)
- Use ▲/▼ arrows to change **display order** (controls dropdown order)
- Changing **rank** does NOT change display order

### All Papers
- Database-wide view of every paper
- Search by name, professor, lab, venue, topic
- Filter by professor, lab, year, rating

### Dashboard
- Stats: total groups, papers, groups with papers, average rating
- Charts: papers by lab, professor, and year

### Field Optionality / Lab Overview / How To Decide
- Reference data imported from the Excel workbook
- View the star-rating matrix, lab summaries, and decision framework

---

## Key Concepts

### Rank vs Display Order
- **Rank**: Your subjective ranking number. Editable, shown everywhere.
- **Display Order**: Controls the dropdown/table ordering. Independent of rank.
- Changing rank does NOT reorder the dropdown. Change display order explicitly.

### Stable IDs
- Each professor/group has a permanent database `id`
- Papers reference this `id`, not the rank
- Changing rank never detaches papers

---

## Backup

The database file is: `data/research.db`

### Quick backup
Click **Backup DB** in the sidebar → creates `data/backups/research_backup_YYYYMMDD_HHMMSS.db`

### Manual backup
```bash
cp data/research.db data/research_backup.db
```

---

## Project Structure

```
research-tracker/
├── app.py                  # Flask application (all routes)
├── database.py             # SQLite schema and helpers
├── import_excel.py         # Excel → SQLite importer
├── requirements.txt        # Python dependencies
├── README.md
├── data/
│   ├── research.db         # ← YOUR DATABASE (source of truth)
│   └── backups/            # Timestamped backups
├── static/
│   ├── css/style.css       # All styles
│   └── js/app.js           # Frontend SPA logic
├── templates/
│   └── index.html          # HTML shell
└── tests/
    └── test_api.py         # Automated test suite
```

## Running Tests

```bash
source .venv/bin/activate
python -m pytest tests/test_api.py -v
```
