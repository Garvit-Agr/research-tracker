/* ────────────────────────────────────────────────────────────────────
   Research Tracker — Frontend Application
   Vanilla JS SPA with fetch-based API calls
   ──────────────────────────────────────────────────────────────────── */

(function () {
    "use strict";

    // ── State ─────────────────────────────────────────────────────────
    let currentPage = "dashboard";
    let groups = [];
    let selectedGroupId = null;

    // ── API helpers ───────────────────────────────────────────────────
    async function api(url, opts = {}) {
        if (opts.body && typeof opts.body === "object") {
            opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
            opts.body = JSON.stringify(opts.body);
        }
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw { status: res.status, data };
        return data;
    }

    // ── Utility ───────────────────────────────────────────────────────
    function esc(str) {
        if (str == null) return "";
        const d = document.createElement("div");
        d.textContent = String(str);
        return d.innerHTML;
    }
    function pluralize(n, word) { return `${n} ${word}${n === 1 ? "" : "s"}`; }
    function ratingClass(r) {
        if (r == null) return "";
        if (r >= 7) return "rating-high";
        if (r >= 4) return "rating-mid";
        return "rating-low";
    }

    // ── Toast ─────────────────────────────────────────────────────────
    function toast(msg, type = "info") {
        const c = document.getElementById("toast-container");
        const t = document.createElement("div");
        t.className = `toast ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity 0.3s"; setTimeout(() => t.remove(), 300); }, 3000);
    }

    // ── Modal ─────────────────────────────────────────────────────────
    function openModal(title, bodyHtml) {
        document.getElementById("modal-title").textContent = title;
        document.getElementById("modal-body").innerHTML = bodyHtml;
        document.getElementById("modal-overlay").classList.add("active");
    }
    function closeModal() {
        document.getElementById("modal-overlay").classList.remove("active");
    }

    // ── Navigation ────────────────────────────────────────────────────
    function navigate(page) {
        currentPage = page;
        document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.page === page));
        render();
    }

    // ── Main render ───────────────────────────────────────────────────
    async function render() {
        const main = document.getElementById("main-content");
        main.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary)">Loading…</div>';
        try {
            switch (currentPage) {
                case "dashboard":    await renderDashboard(main); break;
                case "tracker":      await renderTracker(main); break;
                case "groups":       await renderGroups(main); break;
                case "papers":       await renderAllPapers(main); break;
                case "optionality":  await renderOptionalityPage(main); break;
                case "laboverview":  await renderLabOverview(main); break;
                case "decide":       await renderHowToDecide(main); break;
                case "extranotes":   await renderExtraNotes(main); break;
            }
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><p>Error loading page: ${esc(e.message || e)}</p></div>`;
            console.error(e);
        }
    }

    // ── Load groups ───────────────────────────────────────────────────
    async function loadGroups() {
        groups = await api("/api/groups");
        return groups;
    }

    // ════════════════════════════════════════════════════════════════════
    //  DASHBOARD
    // ════════════════════════════════════════════════════════════════════
    async function renderDashboard(el) {
        const stats = await api("/api/dashboard");
        el.innerHTML = `
            <div class="page-header">
                <h1>Dashboard</h1>
                <p class="subtitle">Overview of your research tracking progress</p>
            </div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Research Groups</div>
                    <div class="stat-value primary">${stats.group_count}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Papers</div>
                    <div class="stat-value accent">${stats.paper_count}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Groups with Papers</div>
                    <div class="stat-value success">${stats.professors_with_papers}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Average Rating</div>
                    <div class="stat-value">${stats.avg_rating != null ? stats.avg_rating : "—"}</div>
                </div>
            </div>
            <div class="dashboard-grid">
                <div class="card">
                    <div class="card-header"><h3>Papers by Lab</h3></div>
                    <div class="card-body">
                        ${stats.papers_by_lab.length ? renderBarChart(stats.papers_by_lab, "lab_group", "count", "blue") : '<p class="text-muted">No papers yet</p>'}
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Papers by Professor</h3></div>
                    <div class="card-body">
                        ${stats.papers_by_professor.length ? renderBarChart(stats.papers_by_professor, "professor", "count", "teal") : '<p class="text-muted">No papers yet</p>'}
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Papers by Year</h3></div>
                    <div class="card-body">
                        ${stats.papers_by_year.length ? renderBarChart(stats.papers_by_year, "year", "count", "green") : '<p class="text-muted">No papers yet</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    function renderBarChart(data, labelKey, valueKey, colorClass) {
        const max = Math.max(...data.map(d => d[valueKey]), 1);
        return `<div class="bar-chart">${data.map(d => `
            <div class="bar-row">
                <div class="bar-label" title="${esc(d[labelKey])}">${esc(d[labelKey])}</div>
                <div class="bar-track">
                    <div class="bar-fill ${colorClass}" style="width:${(d[valueKey] / max * 100)}%"></div>
                    <span class="bar-value">${d[valueKey]}</span>
                </div>
            </div>
        `).join("")}</div>`;
    }

    // ════════════════════════════════════════════════════════════════════
    //  RESEARCH TRACKER
    // ════════════════════════════════════════════════════════════════════
    async function renderTracker(el) {
        await loadGroups();

        el.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1>Research Papers by Rank</h1>
                        <p class="subtitle">Select a research group to view and manage papers</p>
                    </div>
                    <button class="btn btn-primary" id="btn-add-paper">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Paper
                    </button>
                </div>
            </div>
            <div class="selector-bar">
                <label for="group-select">Select Research Group:</label>
                <select class="form-select" id="group-select">
                    <option value="">— Select —</option>
                    ${groups.map(g => `<option value="${g.id}" ${g.id === selectedGroupId ? "selected" : ""}>${g.rank}. ${esc(g.professor)} | ${esc(g.college)} | ${esc(g.lab_group)} | ${pluralize(g.paper_count, "paper")}</option>`).join("")}
                </select>
            </div>
            <div id="tracker-content"></div>
        `;

        document.getElementById("group-select").addEventListener("change", async function () {
            selectedGroupId = this.value ? parseInt(this.value) : null;
            await renderTrackerContent();
        });

        document.getElementById("btn-add-paper").addEventListener("click", () => openPaperForm());

        if (selectedGroupId) await renderTrackerContent();
        else document.getElementById("tracker-content").innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>Select a research group from the dropdown above to view papers.</p>
            </div>`;
    }

    async function renderTrackerContent() {
        const container = document.getElementById("tracker-content");
        if (!selectedGroupId) return;
        const group = groups.find(g => g.id === selectedGroupId);
        if (!group) { container.innerHTML = '<p class="text-muted">Group not found.</p>'; return; }

        const papers = await api(`/api/groups/${selectedGroupId}/papers`);

        container.innerHTML = `
            <div class="group-header">
                <div class="rank-badge">${group.rank}</div>
                <div class="group-info">
                    <h2>${esc(group.professor)}</h2>
                    <p>${esc(group.college)} · ${esc(group.lab_group)}</p>
                </div>
            </div>
            ${papers.length ? `
            <div class="card">
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Paper Name</th>
                                <th>Link</th>
                                <th>Year</th>
                                <th>Venue</th>
                                <th>Topic</th>
                                <th>Areas Covered</th>
                                <th>Rating</th>
                                <th>Review</th>
                                <th>What New I Learned</th>
                                <th>Notes</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${papers.map(p => renderPaperRow(p)).join("")}
                        </tbody>
                    </table>
                </div>
            </div>` : `
            <div class="card">
                <div class="empty-state">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <p>No papers added yet.</p>
                    <button class="btn btn-primary btn-sm mt-1" onclick="document.getElementById('btn-add-paper').click()">+ Add Paper</button>
                </div>
            </div>`}
        `;

        // Wire up edit/delete buttons
        container.querySelectorAll("[data-edit-paper]").forEach(btn => {
            btn.addEventListener("click", () => openPaperForm(parseInt(btn.dataset.editPaper)));
        });
        container.querySelectorAll("[data-delete-paper]").forEach(btn => {
            btn.addEventListener("click", () => confirmDeletePaper(parseInt(btn.dataset.deletePaper)));
        });
    }

    function renderPaperRow(p) {
        return `<tr>
            <td><strong>${esc(p.paper_name)}</strong></td>
            <td class="cell-link">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Link ↗</a>` : "—"}</td>
            <td>${p.year || "—"}</td>
            <td>${esc(p.venue) || "—"}</td>
            <td>${esc(p.topic) || "—"}</td>
            <td class="cell-long"><div class="cell-long-text">${esc(p.areas_covered) || "—"}</div></td>
            <td>${p.rating != null ? `<span class="rating-badge ${ratingClass(p.rating)}">${p.rating}/10</span>` : "—"}</td>
            <td class="cell-long"><div class="cell-long-text">${esc(p.review) || "—"}</div></td>
            <td class="cell-long"><div class="cell-long-text">${esc(p.what_new_i_learned) || "—"}</div></td>
            <td class="cell-long"><div class="cell-long-text">${esc(p.notes) || "—"}</div></td>
            <td class="actions">
                <div class="btn-group">
                    <button class="btn btn-ghost btn-xs" data-edit-paper="${p.id}" title="Edit">✏️</button>
                    <button class="btn btn-ghost btn-xs" data-delete-paper="${p.id}" title="Delete">🗑️</button>
                </div>
            </td>
        </tr>`;
    }

    // ── Paper Form Modal ──────────────────────────────────────────────
    async function openPaperForm(paperId) {
        await loadGroups();
        let paper = null;
        if (paperId) {
            paper = await api(`/api/papers/${paperId}`);
        }
        const isEdit = !!paper;
        const title = isEdit ? "Edit Paper" : "Add Paper";

        const groupOptions = groups.map(g => {
            const sel = paper ? (paper.research_group_id === g.id ? "selected" : "") : (selectedGroupId === g.id ? "selected" : "");
            return `<option value="${g.id}" ${sel}>${g.rank}. ${esc(g.professor)} | ${esc(g.lab_group)}</option>`;
        }).join("");



        openModal(title, `
            <form id="paper-form">
                <div class="form-group">
                    <label class="form-label form-required">Research Group</label>
                    <select class="form-select" name="research_group_id" required>${groupOptions}</select>
                </div>
                <div class="form-group">
                    <label class="form-label form-required">Paper Name</label>
                    <input class="form-input" name="paper_name" required value="${esc(paper?.paper_name || "")}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Link</label>
                        <input class="form-input" name="link" value="${esc(paper?.link || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Year</label>
                        <input class="form-input" name="year" type="number" value="${paper?.year || ""}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Venue</label>
                        <input class="form-input" name="venue" value="${esc(paper?.venue || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Topic</label>
                        <input class="form-input" name="topic" value="${esc(paper?.topic || "")}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Areas Covered</label>
                        <input class="form-input" name="areas_covered" value="${esc(paper?.areas_covered || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rating (0–10)</label>
                        <input class="form-input" name="rating" type="number" step="0.01" min="0" max="10" value="${paper?.rating ?? ""}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Review</label>
                    <textarea class="form-textarea" name="review">${esc(paper?.review || "")}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">What New I Learned</label>
                    <textarea class="form-textarea" name="what_new_i_learned">${esc(paper?.what_new_i_learned || "")}</textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea class="form-textarea" name="notes">${esc(paper?.notes || "")}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Paper"}</button>
                </div>
            </form>
        `);

        document.getElementById("paper-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            if (body.year) body.year = parseInt(body.year);
            if (body.rating !== "") body.rating = parseFloat(body.rating);
            else body.rating = null;
            body.research_group_id = parseInt(body.research_group_id);
            try {
                if (isEdit) {
                    await api(`/api/papers/${paperId}`, { method: "PUT", body });
                    toast("Paper updated", "success");
                } else {
                    await api("/api/papers", { method: "POST", body });
                    toast("Paper added", "success");
                }
                closeModal();
                await loadGroups();
                if (currentPage === "tracker") {
                    // Re-render the selector with updated counts
                    const sel = document.getElementById("group-select");
                    if (sel) {
                        sel.innerHTML = '<option value="">— Select —</option>' +
                            groups.map(g => `<option value="${g.id}" ${g.id === selectedGroupId ? "selected" : ""}>${g.rank}. ${esc(g.professor)} | ${esc(g.college)} | ${esc(g.lab_group)} | ${pluralize(g.paper_count, "paper")}</option>`).join("");
                    }
                    await renderTrackerContent();
                } else {
                    render();
                }
            } catch (err) {
                const msgs = err.data?.errors || [err.data?.error || "Error saving paper"];
                toast(msgs.join("; "), "error");
            }
        });
    }

    // ── Delete Paper ──────────────────────────────────────────────────
    function confirmDeletePaper(paperId) {
        openModal("Delete Paper", `
            <p class="confirm-text">Are you sure you want to delete this paper?<br><span class="confirm-warning">This action cannot be undone.</span></p>
            <div class="form-actions">
                <button class="btn btn-outline" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancel</button>
                <button class="btn btn-danger" id="confirm-delete-paper">Delete Paper</button>
            </div>
        `);
        document.getElementById("confirm-delete-paper").addEventListener("click", async () => {
            try {
                await api(`/api/papers/${paperId}`, { method: "DELETE" });
                toast("Paper deleted", "success");
                closeModal();
                await loadGroups();
                if (currentPage === "tracker") {
                    const sel = document.getElementById("group-select");
                    if (sel) {
                        sel.innerHTML = '<option value="">— Select —</option>' +
                            groups.map(g => `<option value="${g.id}" ${g.id === selectedGroupId ? "selected" : ""}>${g.rank}. ${esc(g.professor)} | ${esc(g.college)} | ${esc(g.lab_group)} | ${pluralize(g.paper_count, "paper")}</option>`).join("");
                    }
                    await renderTrackerContent();
                } else {
                    render();
                }
            } catch (err) {
                toast("Error deleting paper", "error");
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════
    //  RESEARCH GROUPS
    // ════════════════════════════════════════════════════════════════════
    async function renderGroups(el) {
        await loadGroups();
        el.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1>Research Groups</h1>
                        <p class="subtitle">Manage professors, labs, rankings, and display order</p>
                    </div>
                    <button class="btn btn-primary" id="btn-add-group">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Group
                    </button>
                </div>
            </div>
            <div class="card">
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Professor</th>
                                <th>College</th>
                                <th>Lab / Group</th>
                                <th>Primary Research Area</th>
                                <th>Score</th>
                                <th>Papers</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groups.map(g => `
                            <tr>
                                <td>
                                    <div style="display:flex;align-items:center;gap:6px;">
                                        <span style="font-weight:600;min-width:24px">${g.rank}</span>
                                        <div class="order-arrows">
                                            <button data-move-up="${g.id}" title="Move up">▲</button>
                                            <button data-move-down="${g.id}" title="Move down">▼</button>
                                        </div>
                                    </div>
                                </td>
                                <td>${esc(g.professor)}</td>
                                <td>${esc(g.college)}</td>
                                <td>${esc(g.lab_group)}</td>
                                <td class="cell-long"><div class="cell-long-text">${esc(g.primary_research_area) || "—"}</div></td>
                                <td>${g.overall_score != null ? g.overall_score : "—"}</td>
                                <td><span class="paper-count-badge">${pluralize(g.paper_count, "paper")}</span></td>
                                <td class="actions">
                                    <div class="btn-group">
                                        <button class="btn btn-ghost btn-xs" data-edit-group="${g.id}" title="Edit">✏️</button>
                                        <button class="btn btn-ghost btn-xs" data-delete-group="${g.id}" data-paper-count="${g.paper_count}" title="Delete">🗑️</button>
                                    </div>
                                </td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById("btn-add-group").addEventListener("click", () => openGroupForm());
        el.querySelectorAll("[data-edit-group]").forEach(b => b.addEventListener("click", () => openGroupForm(parseInt(b.dataset.editGroup))));
        el.querySelectorAll("[data-delete-group]").forEach(b => b.addEventListener("click", () => confirmDeleteGroup(parseInt(b.dataset.deleteGroup), parseInt(b.dataset.paperCount))));
        el.querySelectorAll("[data-move-up]").forEach(b => b.addEventListener("click", () => moveGroup(parseInt(b.dataset.moveUp), "up")));
        el.querySelectorAll("[data-move-down]").forEach(b => b.addEventListener("click", () => moveGroup(parseInt(b.dataset.moveDown), "down")));
    }

    async function moveGroup(gid, direction) {
        try {
            await api(`/api/groups/${gid}/move`, { method: "POST", body: { direction } });
            render();
        } catch (e) { toast("Error moving group", "error"); }
    }

    async function openGroupForm(groupId) {
        let group = null;
        if (groupId) {
            group = await api(`/api/groups/${groupId}`);
        }
        const isEdit = !!group;
        const title = isEdit ? "Edit Research Group" : "Add Research Group";

        openModal(title, `
            <form id="group-form">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label form-required">Professor</label>
                        <input class="form-input" name="professor" required value="${esc(group?.professor || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">College</label>
                        <input class="form-input" name="college" value="${esc(group?.college || "IIIT Hyderabad")}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Lab / Group</label>
                        <input class="form-input" name="lab_group" value="${esc(group?.lab_group || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Rank</label>
                        <input class="form-input" name="rank" type="number" value="${group?.rank || ""}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Primary Research Area</label>
                    <input class="form-input" name="primary_research_area" value="${esc(group?.primary_research_area || "")}">
                </div>
                <div class="form-group">
                    <label class="form-label">Key Research Directions</label>
                    <textarea class="form-textarea" name="key_research_directions">${esc(group?.key_research_directions || "")}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Prof / Research Value</label>
                        <input class="form-input" name="professor_research_value" value="${esc(group?.professor_research_value || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Overall Score (0–10)</label>
                        <input class="form-input" name="overall_score" type="number" step="0.01" min="0" max="10" value="${group?.overall_score ?? ""}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Why It Ranks Here</label>
                    <textarea class="form-textarea" name="why_it_ranks_here">${esc(group?.why_it_ranks_here || "")}</textarea>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-outline" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Add Group"}</button>
                </div>
            </form>
        `);

        document.getElementById("group-form").addEventListener("submit", async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const body = Object.fromEntries(fd.entries());
            if (body.rank) body.rank = parseInt(body.rank);
            if (body.overall_score) body.overall_score = parseFloat(body.overall_score);
            else body.overall_score = null;
            try {
                if (isEdit) {
                    await api(`/api/groups/${groupId}`, { method: "PUT", body });
                    toast("Group updated", "success");
                } else {
                    await api("/api/groups", { method: "POST", body });
                    toast("Group added", "success");
                }
                closeModal();
                render();
            } catch (err) {
                const msgs = err.data?.errors || [err.data?.error || "Error saving group"];
                toast(msgs.join("; "), "error");
            }
        });
    }

    function confirmDeleteGroup(gid, paperCount) {
        const msg = paperCount > 0
            ? `This group has <strong>${pluralize(paperCount, "paper")}</strong>. Deleting will also remove all associated papers.`
            : "This group has no papers.";
        openModal("Delete Research Group", `
            <p class="confirm-text">${msg}<br><span class="confirm-warning">This action cannot be undone.</span></p>
            <div class="form-actions">
                <button class="btn btn-outline" onclick="document.getElementById('modal-overlay').classList.remove('active')">Cancel</button>
                <button class="btn btn-danger" id="confirm-delete-group">Delete Group</button>
            </div>
        `);
        document.getElementById("confirm-delete-group").addEventListener("click", async () => {
            try {
                await api(`/api/groups/${gid}`, { method: "DELETE" });
                toast("Group deleted", "success");
                closeModal();
                if (selectedGroupId === gid) selectedGroupId = null;
                render();
            } catch (err) { toast("Error deleting group", "error"); }
        });
    }

    // ════════════════════════════════════════════════════════════════════
    //  ALL PAPERS
    // ════════════════════════════════════════════════════════════════════
    async function renderAllPapers(el) {
        const [filterOpts] = await Promise.all([api("/api/filter-options")]);
        el.innerHTML = `
            <div class="page-header">
                <div class="page-header-row">
                    <div>
                        <h1>All Papers</h1>
                        <p class="subtitle">Database-wide view of all tracked research papers</p>
                    </div>
                    <button class="btn btn-primary" id="btn-add-paper-all">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add Paper
                    </button>
                </div>
            </div>
            <div class="search-bar">
                <input class="form-input" id="papers-search" placeholder="Search papers…">
                <select class="form-select" id="filter-professor">
                    <option value="">All Professors</option>
                    ${filterOpts.professors.map(p => `<option value="${p.id}">${esc(p.professor)}</option>`).join("")}
                </select>
                <select class="form-select" id="filter-lab">
                    <option value="">All Labs</option>
                    ${filterOpts.labs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join("")}
                </select>
                <select class="form-select" id="filter-year">
                    <option value="">All Years</option>
                    ${filterOpts.years.map(y => `<option value="${y}">${y}</option>`).join("")}
                </select>
                <select class="form-select" id="filter-rating">
                    <option value="">All Ratings</option>
                    ${Array.from({length: 11}, (_, i) => 10-i).map(r => `<option value="${r}">${r}/10</option>`).join("")}
                </select>
            </div>
            <div id="all-papers-content"></div>
        `;

        document.getElementById("btn-add-paper-all").addEventListener("click", () => openPaperForm());

        async function loadPapers() {
            const params = new URLSearchParams();
            const q = document.getElementById("papers-search").value.trim();
            const prof = document.getElementById("filter-professor").value;
            const lab = document.getElementById("filter-lab").value;
            const year = document.getElementById("filter-year").value;
            const rating = document.getElementById("filter-rating").value;
            if (q) params.set("q", q);
            if (prof) params.set("group_id", prof);
            if (lab) params.set("lab", lab);
            if (year) params.set("year", year);
            if (rating) params.set("rating", rating);

            const papers = await api(`/api/papers?${params}`);
            const container = document.getElementById("all-papers-content");

            if (!papers.length) {
                container.innerHTML = `<div class="card"><div class="empty-state"><p>No papers found.</p></div></div>`;
                return;
            }

            container.innerHTML = `
                <div class="card">
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Paper Name</th>
                                    <th>Professor</th>
                                    <th>Lab</th>
                                    <th>Year</th>
                                    <th>Venue</th>
                                    <th>Topic</th>
                                    <th>Rating</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${papers.map(p => `
                                <tr>
                                    <td><strong>${esc(p.paper_name)}</strong></td>
                                    <td>${esc(p.professor)}</td>
                                    <td>${esc(p.lab_group)}</td>
                                    <td>${p.year || "—"}</td>
                                    <td>${esc(p.venue) || "—"}</td>
                                    <td>${esc(p.topic) || "—"}</td>
                                    <td>${p.rating != null ? `<span class="rating-badge ${ratingClass(p.rating)}">${p.rating}/10</span>` : "—"}</td>
                                    <td class="actions">
                                        <div class="btn-group">
                                            <button class="btn btn-ghost btn-xs" data-edit-paper="${p.id}">✏️</button>
                                            <button class="btn btn-ghost btn-xs" data-delete-paper="${p.id}">🗑️</button>
                                        </div>
                                    </td>
                                </tr>`).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            container.querySelectorAll("[data-edit-paper]").forEach(b => b.addEventListener("click", () => openPaperForm(parseInt(b.dataset.editPaper))));
            container.querySelectorAll("[data-delete-paper]").forEach(b => b.addEventListener("click", () => confirmDeletePaper(parseInt(b.dataset.deletePaper))));
        }

        let debounce;
        document.getElementById("papers-search").addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(loadPapers, 300); });
        document.getElementById("filter-professor").addEventListener("change", loadPapers);
        document.getElementById("filter-lab").addEventListener("change", loadPapers);
        document.getElementById("filter-year").addEventListener("change", loadPapers);
        document.getElementById("filter-rating").addEventListener("change", loadPapers);

        await loadPapers();
    }

    // ════════════════════════════════════════════════════════════════════
    //  FIELD OPTIONALITY
    // ════════════════════════════════════════════════════════════════════
    async function renderOptionalityPage(el) {
        const rows = await api("/api/field-optionality");
        const labs = ["precog", "mll", "cvit", "ltrc", "rrc", "csg", "serc"];
        const labLabels = ["Precog", "MLL", "CVIT", "LTRC", "RRC", "CSG", "SERC"];

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>Field Optionality</h1>
                    <p class="subtitle">How well each lab covers different AI/CS fields</p>
                </div>
                <button class="btn btn-primary" id="btn-add-field">Add Field</button>
            </div>
            <div class="card">
                <div class="table-wrapper">
                    <table class="ref-table">
                        <thead>
                            <tr>
                                <th>Field</th>
                                ${labLabels.map(l => `<th style="text-align:center">${l}</th>`).join("")}
                                <th>Comments</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                            <tr>
                                <td><strong>${esc(r.field)}</strong></td>
                                ${labs.map(l => `<td class="star-cell">${esc(r[l])}</td>`).join("")}
                                <td class="cell-long"><div class="cell-long-text">${esc(r.comments)}</div></td>
                                <td>
                                    <div style="display:flex; gap:8px;">
                                        <button class="btn-icon text-muted btn-edit-field" data-id="${r.id}" title="Edit">✏️</button>
                                        <button class="btn-icon text-danger btn-delete-field" data-id="${r.id}" title="Delete">🗑️</button>
                                    </div>
                                </td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById("btn-add-field").addEventListener("click", () => openOptionalityForm(null));
        
        document.querySelectorAll(".btn-edit-field").forEach(btn => {
            btn.addEventListener("click", () => {
                const row = rows.find(r => r.id == btn.dataset.id);
                if (row) openOptionalityForm(row);
            });
        });

        document.querySelectorAll(".btn-delete-field").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to delete this field?")) return;
                try {
                    await api(`/api/field-optionality/${btn.dataset.id}`, { method: "DELETE" });
                    toast("Field deleted", "success");
                    render();
                } catch (e) { toast("Error deleting field", "error"); }
            });
        });
        
        function openOptionalityForm(field) {
            const isEdit = !!field;
            openModal(isEdit ? "Edit Field" : "Add Field", `
                <form id="opt-form">
                    <div class="form-group">
                        <label class="form-label form-required">Field</label>
                        <input class="form-input" name="field" required value="${esc(field?.field || "")}">
                    </div>
                    <div class="form-row">
                        ${labs.map((l, i) => `
                        <div class="form-group">
                            <label class="form-label">${labLabels[i]}</label>
                            <input class="form-input" name="${l}" value="${esc(field?.[l] || "")}">
                        </div>`).join("")}
                    </div>
                    <div class="form-group">
                        <label class="form-label">Comments</label>
                        <textarea class="form-textarea" name="comments">${esc(field?.comments || "")}</textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save Field"}</button>
                    </div>
                </form>
            `);

            document.getElementById("opt-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.target).entries());
                try {
                    if (isEdit) {
                        await api(`/api/field-optionality/${field.id}`, { method: "PUT", body });
                    } else {
                        await api("/api/field-optionality", { method: "POST", body });
                    }
                    toast("Saved successfully", "success");
                    closeModal();
                    render();
                } catch (err) { toast("Error saving", "error"); }
            });
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  LAB OVERVIEW
    // ════════════════════════════════════════════════════════════════════
    async function renderLabOverview(el) {
        const rows = await api("/api/lab-overview");

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>Lab Overview</h1>
                    <p class="subtitle">Summary of IIIT Hyderabad research labs ranked by optionality</p>
                </div>
                <button class="btn btn-primary" id="btn-add-lab">Add Lab</button>
            </div>
            <div class="card">
                <div class="table-wrapper">
                    <table class="ref-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Lab / Group</th>
                                <th>Core Identity</th>
                                <th>Main Fields</th>
                                <th>Optionality</th>
                                <th>Key Tradeoff</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(r => `
                            <tr>
                                <td><strong>${r.overall_rank}</strong></td>
                                <td><strong>${esc(r.lab_group)}</strong></td>
                                <td>${esc(r.core_identity)}</td>
                                <td class="cell-long"><div class="cell-long-text">${esc(r.main_fields)}</div></td>
                                <td class="star-cell">${esc(r.optionality)}</td>
                                <td class="cell-long"><div class="cell-long-text">${esc(r.key_tradeoff)}</div></td>
                                <td>
                                    <div style="display:flex; gap:8px;">
                                        <button class="btn-icon text-muted btn-edit-lab" data-id="${r.id}" title="Edit">✏️</button>
                                        <button class="btn-icon text-danger btn-delete-lab" data-id="${r.id}" title="Delete">🗑️</button>
                                    </div>
                                </td>
                            </tr>`).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById("btn-add-lab").addEventListener("click", () => openLabOverviewForm(null));
        
        document.querySelectorAll(".btn-edit-lab").forEach(btn => {
            btn.addEventListener("click", () => {
                const row = rows.find(r => r.id == btn.dataset.id);
                if (row) openLabOverviewForm(row);
            });
        });

        document.querySelectorAll(".btn-delete-lab").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to delete this lab overview?")) return;
                try {
                    await api(`/api/lab-overview/${btn.dataset.id}`, { method: "DELETE" });
                    toast("Lab deleted", "success");
                    render();
                } catch (e) { toast("Error deleting lab", "error"); }
            });
        });
        
        function openLabOverviewForm(lab) {
            const isEdit = !!lab;
            openModal(isEdit ? "Edit Lab Overview" : "Add Lab Overview", `
                <form id="lab-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label form-required">Overall Rank</label>
                            <input class="form-input" name="overall_rank" type="number" required value="${lab?.overall_rank || ""}">
                        </div>
                        <div class="form-group">
                            <label class="form-label form-required">Lab / Group</label>
                            <input class="form-input" name="lab_group" required value="${esc(lab?.lab_group || "")}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Core Identity</label>
                            <input class="form-input" name="core_identity" value="${esc(lab?.core_identity || "")}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Optionality</label>
                            <input class="form-input" name="optionality" value="${esc(lab?.optionality || "")}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Main Fields</label>
                        <textarea class="form-textarea" name="main_fields">${esc(lab?.main_fields || "")}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Key Tradeoff</label>
                        <textarea class="form-textarea" name="key_tradeoff">${esc(lab?.key_tradeoff || "")}</textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save Lab"}</button>
                    </div>
                </form>
            `);

            document.getElementById("lab-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.target).entries());
                body.overall_rank = parseInt(body.overall_rank);
                try {
                    if (isEdit) {
                        await api(`/api/lab-overview/${lab.id}`, { method: "PUT", body });
                    } else {
                        await api("/api/lab-overview", { method: "POST", body });
                    }
                    toast("Saved successfully", "success");
                    closeModal();
                    render();
                } catch (err) { toast("Error saving", "error"); }
            });
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  HOW TO DECIDE
    // ════════════════════════════════════════════════════════════════════
    async function renderHowToDecide(el) {
        const rows = await api("/api/how-to-decide");

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>How To Decide</h1>
                    <p class="subtitle">Decision framework for choosing a research group</p>
                </div>
                <button class="btn btn-primary" id="btn-add-principle">Add Principle</button>
            </div>
            <div class="card">
                <div class="card-body">
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        ${rows.map(r => `
                        <div style="border-bottom:1px solid var(--border);padding-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;">
                            <div>
                                <h3 style="margin-bottom:4px;">${esc(r.principle)}</h3>
                                ${r.details ? `<p class="text-muted" style="font-size:0.92rem;">${esc(r.details)}</p>` : ""}
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-icon text-muted btn-edit-principle" data-id="${r.id}" title="Edit">✏️</button>
                                <button class="btn-icon text-danger btn-delete-principle" data-id="${r.id}" title="Delete">🗑️</button>
                            </div>
                        </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;

        document.getElementById("btn-add-principle").addEventListener("click", () => openHowToDecideForm(null));
        
        document.querySelectorAll(".btn-edit-principle").forEach(btn => {
            btn.addEventListener("click", () => {
                const row = rows.find(r => r.id == btn.dataset.id);
                if (row) openHowToDecideForm(row);
            });
        });

        document.querySelectorAll(".btn-delete-principle").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to delete this principle?")) return;
                try {
                    await api(`/api/how-to-decide/${btn.dataset.id}`, { method: "DELETE" });
                    toast("Principle deleted", "success");
                    render();
                } catch (e) { toast("Error deleting principle", "error"); }
            });
        });
        
        function openHowToDecideForm(principle) {
            const isEdit = !!principle;
            openModal(isEdit ? "Edit Principle" : "Add Principle", `
                <form id="principle-form">
                    <div class="form-group">
                        <label class="form-label form-required">Principle</label>
                        <input class="form-input" name="principle" required value="${esc(principle?.principle || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Details</label>
                        <textarea class="form-textarea" name="details" style="min-height: 100px;">${esc(principle?.details || "")}</textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save Principle"}</button>
                    </div>
                </form>
            `);

            document.getElementById("principle-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.target).entries());
                try {
                    if (isEdit) {
                        await api(`/api/how-to-decide/${principle.id}`, { method: "PUT", body });
                    } else {
                        await api("/api/how-to-decide", { method: "POST", body });
                    }
                    toast("Saved successfully", "success");
                    closeModal();
                    render();
                } catch (err) { toast("Error saving", "error"); }
            });
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  EXTRA NOTES
    // ════════════════════════════════════════════════════════════════════
    async function renderExtraNotes(el) {
        const rows = await api("/api/extra-notes");

        el.innerHTML = `
            <div class="page-header">
                <div>
                    <h1>Extra Notes</h1>
                    <p class="subtitle">Miscellaneous notes, questions, and thoughts</p>
                </div>
                <button class="btn btn-primary" id="btn-add-note">Add Note</button>
            </div>
            <div class="card">
                <div class="card-body">
                    ${rows.length === 0 ? '<div class="empty-state"><p>No notes added yet.</p></div>' : ''}
                    <div style="display:flex;flex-direction:column;gap:16px;">
                        ${rows.map(r => `
                        <div style="border-bottom:1px solid var(--border);padding-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;">
                            <div style="flex:1; padding-right: 16px;">
                                <h3 style="margin-bottom:4px;">${esc(r.title)}</h3>
                                <div class="text-muted" style="font-size:0.92rem; white-space: pre-wrap;">${esc(r.content || "")}</div>
                                <div style="font-size:0.75rem; color:var(--text-tertiary); margin-top:8px;">Updated: ${new Date(r.updated_at).toLocaleString()}</div>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn-icon text-muted btn-edit-note" data-id="${r.id}" title="Edit">✏️</button>
                                <button class="btn-icon text-danger btn-delete-note" data-id="${r.id}" title="Delete">🗑️</button>
                            </div>
                        </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;

        document.getElementById("btn-add-note").addEventListener("click", () => openNoteForm(null));
        
        document.querySelectorAll(".btn-edit-note").forEach(btn => {
            btn.addEventListener("click", () => {
                const row = rows.find(r => r.id == btn.dataset.id);
                if (row) openNoteForm(row);
            });
        });

        document.querySelectorAll(".btn-delete-note").forEach(btn => {
            btn.addEventListener("click", async () => {
                if (!confirm("Are you sure you want to delete this note?")) return;
                try {
                    await api(`/api/extra-notes/${btn.dataset.id}`, { method: "DELETE" });
                    toast("Note deleted", "success");
                    render();
                } catch (e) { toast("Error deleting note", "error"); }
            });
        });
        
        function openNoteForm(note) {
            const isEdit = !!note;
            openModal(isEdit ? "Edit Note" : "Add Note", `
                <form id="note-form">
                    <div class="form-group">
                        <label class="form-label form-required">Title</label>
                        <input class="form-input" name="title" required value="${esc(note?.title || "")}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Content</label>
                        <textarea class="form-textarea" name="content" style="min-height: 150px;">${esc(note?.content || "")}</textarea>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary">${isEdit ? "Save Changes" : "Save Note"}</button>
                    </div>
                </form>
            `);

            document.getElementById("note-form").addEventListener("submit", async (e) => {
                e.preventDefault();
                const body = Object.fromEntries(new FormData(e.target).entries());
                try {
                    if (isEdit) {
                        await api(`/api/extra-notes/${note.id}`, { method: "PUT", body });
                    } else {
                        await api("/api/extra-notes", { method: "POST", body });
                    }
                    toast("Saved successfully", "success");
                    closeModal();
                    render();
                } catch (err) { toast("Error saving", "error"); }
            });
        }
    }

    // ── Init ──────────────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", () => {
        // Navigation
        document.querySelectorAll(".nav-link").forEach(link => {
            link.addEventListener("click", (e) => {
                e.preventDefault();
                navigate(link.dataset.page);
            });
        });

        // Modal close
        document.getElementById("modal-close").addEventListener("click", closeModal);
        document.getElementById("modal-overlay").addEventListener("click", (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        // Backup
        document.getElementById("btn-backup").addEventListener("click", () => {
            window.location.href = "/api/backup/download";
            toast("Downloading backup...", "success");
        });

        // Initial render
        render();
    });

})();
