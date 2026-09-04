"""
tests/test_api.py — Automated tests covering all 12 requirements.
Run: python -m pytest tests/test_api.py -v
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import pytest
from app import app
from database import get_db


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ── Test 1: Initial Import ─────────────────────────────────────────────
def test_01_initial_import(client):
    """Every Ranked Pairs entry exists in SQLite with correct count and order."""
    res = client.get("/api/groups")
    data = json.loads(res.data)
    assert res.status_code == 200
    assert len(data) == 24, f"Expected 24 groups, got {len(data)}"

    # Verify first entry
    first = data[0]
    assert first["professor"] == "C. V. Jawahar"
    assert first["rank"] == 1
    assert first["display_order"] == 1
    assert first["college"] == "IIIT Hyderabad"
    assert first["lab_group"] == "CVIT"

    # Verify display_order matches Excel row order
    for i, g in enumerate(data):
        assert g["display_order"] == i + 1, f"Group {g['professor']} has order {g['display_order']}, expected {i+1}"


# ── Test 2: Selector ──────────────────────────────────────────────────
def test_02_selector_ordering(client):
    """Groups appear in display_order, not rank order."""
    res = client.get("/api/groups")
    data = json.loads(res.data)
    orders = [g["display_order"] for g in data]
    assert orders == sorted(orders), "Groups not sorted by display_order"
    # Each group appears exactly once
    ids = [g["id"] for g in data]
    assert len(ids) == len(set(ids)), "Duplicate group IDs"


# ── Test 3: Rank Modification ─────────────────────────────────────────
def test_03_rank_change(client):
    """Changing rank does not change display_order or identity."""
    # Get Manish Shrivastava (rank 7)
    res = client.get("/api/groups")
    data = json.loads(res.data)
    manish = next(g for g in data if g["professor"] == "Manish Shrivastava")
    gid = manish["id"]
    old_order = manish["display_order"]
    assert manish["rank"] == 7

    # Change rank to 20
    res = client.put(f"/api/groups/{gid}",
                     data=json.dumps({"rank": 20}),
                     content_type="application/json")
    assert res.status_code == 200
    updated = json.loads(res.data)
    assert updated["rank"] == 20
    assert updated["display_order"] == old_order, "display_order changed when only rank was updated"
    assert updated["professor"] == "Manish Shrivastava"
    assert updated["college"] == "IIIT Hyderabad"
    assert updated["lab_group"] == "LTRC / MT-NLP"

    # Verify selector order is unchanged
    res = client.get("/api/groups")
    data = json.loads(res.data)
    manish2 = next(g for g in data if g["id"] == gid)
    assert manish2["rank"] == 20
    assert manish2["display_order"] == old_order

    # Restore rank
    client.put(f"/api/groups/{gid}", data=json.dumps({"rank": 7}), content_type="application/json")


# ── Test 4: Add Paper ─────────────────────────────────────────────────
def test_04_add_paper(client):
    """Adding a paper updates count in selector and dashboard."""
    # Get first group
    res = client.get("/api/groups")
    g = json.loads(res.data)[0]
    gid = g["id"]
    old_count = g["paper_count"]

    # Add paper
    paper = {
        "research_group_id": gid,
        "paper_name": "Test Paper Alpha",
        "link": "https://example.com/alpha",
        "year": 2024,
        "venue": "NeurIPS",
        "topic": "Deep Learning",
        "areas_covered": "ML, Vision",
        "rating": 8,
        "review": "Great paper",
        "what_new_i_learned": "New technique",
        "notes": "For testing"
    }
    res = client.post("/api/papers", data=json.dumps(paper), content_type="application/json")
    assert res.status_code == 201
    created = json.loads(res.data)
    assert created["paper_name"] == "Test Paper Alpha"
    assert created["research_group_id"] == gid

    # Verify paper count incremented
    res = client.get("/api/groups")
    g2 = next(x for x in json.loads(res.data) if x["id"] == gid)
    assert g2["paper_count"] == old_count + 1

    # Verify in group papers
    res = client.get(f"/api/groups/{gid}/papers")
    papers = json.loads(res.data)
    assert any(p["paper_name"] == "Test Paper Alpha" for p in papers)

    # Verify dashboard
    res = client.get("/api/dashboard")
    dash = json.loads(res.data)
    assert dash["paper_count"] >= 1


# ── Test 5: Edit Paper ────────────────────────────────────────────────
def test_05_edit_paper(client):
    """Editing a paper persists changes."""
    res = client.get("/api/papers")
    papers = json.loads(res.data)
    p = next(x for x in papers if x["paper_name"] == "Test Paper Alpha")

    res = client.put(f"/api/papers/{p['id']}",
                     data=json.dumps({"paper_name": "Test Paper Alpha EDITED", "rating": 9}),
                     content_type="application/json")
    assert res.status_code == 200
    updated = json.loads(res.data)
    assert updated["paper_name"] == "Test Paper Alpha EDITED"
    assert updated["rating"] == 9

    # Verify via GET
    res = client.get(f"/api/papers/{p['id']}")
    assert json.loads(res.data)["paper_name"] == "Test Paper Alpha EDITED"


# ── Test 6: Delete Paper ──────────────────────────────────────────────
def test_06_delete_paper(client):
    """Deleting a paper decrements count."""
    res = client.get("/api/papers")
    papers = json.loads(res.data)
    p = next(x for x in papers if "Test Paper Alpha" in x["paper_name"])
    gid = p["research_group_id"]

    # Get count before
    res = client.get(f"/api/groups/{gid}")
    before = json.loads(res.data)["paper_count"]

    res = client.delete(f"/api/papers/{p['id']}")
    assert res.status_code == 200

    # Count decremented
    res = client.get(f"/api/groups/{gid}")
    after = json.loads(res.data)["paper_count"]
    assert after == before - 1


# ── Test 7: Rank Change After Paper ───────────────────────────────────
def test_07_rank_change_with_paper(client):
    """Paper remains attached after rank change — CRITICAL test."""
    res = client.get("/api/groups")
    g = json.loads(res.data)[1]  # Second group
    gid = g["id"]

    # Add paper
    res = client.post("/api/papers",
                      data=json.dumps({"research_group_id": gid, "paper_name": "Rank Test Paper", "rating": 7}),
                      content_type="application/json")
    pid = json.loads(res.data)["id"]

    # Change rank
    old_rank = g["rank"]
    new_rank = 99
    res = client.put(f"/api/groups/{gid}",
                     data=json.dumps({"rank": new_rank}),
                     content_type="application/json")
    assert json.loads(res.data)["rank"] == new_rank

    # Paper still attached
    res = client.get(f"/api/groups/{gid}/papers")
    papers = json.loads(res.data)
    assert any(p["id"] == pid for p in papers), "Paper detached after rank change!"

    # Cleanup
    client.delete(f"/api/papers/{pid}")
    client.put(f"/api/groups/{gid}", data=json.dumps({"rank": old_rank}), content_type="application/json")


# ── Test 8: Add Professor/Group ───────────────────────────────────────
def test_08_add_group(client):
    """New group appears in selector with 0 papers."""
    res = client.post("/api/groups",
                      data=json.dumps({
                          "professor": "Test Professor",
                          "college": "Test University",
                          "lab_group": "Test Lab",
                          "rank": 50,
                          "primary_research_area": "Testing"
                      }),
                      content_type="application/json")
    assert res.status_code == 201
    created = json.loads(res.data)
    assert created["professor"] == "Test Professor"
    assert created["paper_count"] == 0

    # Verify in list
    res = client.get("/api/groups")
    data = json.loads(res.data)
    assert any(g["professor"] == "Test Professor" for g in data)


# ── Test 9: Display Order Change ──────────────────────────────────────
def test_09_display_order_change(client):
    """Moving a group changes selector order; rank alone does not."""
    res = client.get("/api/groups")
    data = json.loads(res.data)
    test_g = next(g for g in data if g["professor"] == "Test Professor")
    gid = test_g["id"]
    old_order = test_g["display_order"]

    # Move up
    res = client.post(f"/api/groups/{gid}/move",
                      data=json.dumps({"direction": "up"}),
                      content_type="application/json")
    assert res.status_code == 200

    # Verify order changed
    res = client.get(f"/api/groups/{gid}")
    new_order = json.loads(res.data)["display_order"]
    assert new_order < old_order, "Display order did not decrease on move up"


# ── Test 10: Delete Group ─────────────────────────────────────────────
def test_10_delete_group(client):
    """Deleting a group removes it and its papers."""
    # Add a paper first
    res = client.get("/api/groups")
    test_g = next(g for g in json.loads(res.data) if g["professor"] == "Test Professor")
    gid = test_g["id"]
    client.post("/api/papers",
                data=json.dumps({"research_group_id": gid, "paper_name": "Orphan Test Paper"}),
                content_type="application/json")

    res = client.delete(f"/api/groups/{gid}")
    assert res.status_code == 200
    result = json.loads(res.data)
    assert result["deleted"] is True
    assert result["papers_removed"] == 1

    # Group gone
    res = client.get(f"/api/groups/{gid}")
    assert res.status_code == 404

    # Paper gone too (cascade)
    res = client.get("/api/papers")
    papers = json.loads(res.data)
    assert not any(p["paper_name"] == "Orphan Test Paper" for p in papers)


# ── Test 11: Persistence ──────────────────────────────────────────────
def test_11_persistence(client):
    """Data persists across client sessions (SQLite file-based)."""
    res = client.get("/api/groups")
    count1 = len(json.loads(res.data))

    # Re-create client (simulates restart)
    with app.test_client() as c2:
        res = c2.get("/api/groups")
        count2 = len(json.loads(res.data))
    assert count1 == count2, "Data lost between sessions"


# ── Test 12: Empty State ──────────────────────────────────────────────
def test_12_empty_state(client):
    """Group with no papers returns empty list, not error."""
    res = client.get("/api/groups")
    groups = json.loads(res.data)
    # Find a group with 0 papers
    empty_g = next((g for g in groups if g["paper_count"] == 0), None)
    assert empty_g is not None, "No empty groups found"

    res = client.get(f"/api/groups/{empty_g['id']}/papers")
    assert res.status_code == 200
    papers = json.loads(res.data)
    assert papers == []


# ── Validation Tests ──────────────────────────────────────────────────
def test_validation_paper_rating(client):
    """Rating must be 0-10."""
    res = client.get("/api/groups")
    gid = json.loads(res.data)[0]["id"]
    res = client.post("/api/papers",
                      data=json.dumps({"research_group_id": gid, "paper_name": "Bad", "rating": 15}),
                      content_type="application/json")
    assert res.status_code == 400


def test_validation_group_required_fields(client):
    """Professor, college, lab_group are required."""
    res = client.post("/api/groups",
                      data=json.dumps({"professor": ""}),
                      content_type="application/json")
    assert res.status_code == 400
