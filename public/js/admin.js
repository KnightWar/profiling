/**
 * admin.js — Composite Assessment System
 * ════════════════════════════════════════
 * Admin role module: dashboard, student manager, exam manager,
 * question manager (manual + AI), score reports.
 * The evaluator queue is in evaluator.js, which is also loaded for admins.
 *
 * Depends on: core.js (App, api, showToast, openModal, closeModal,
 *             levelBadge, statusBadge, escapeHtml, ROUTES)
 *             evaluator.js (renderEvaluatorQueue — registered via ROUTES)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

ROUTES['#/admin/dashboard']  = renderAdminDashboard;
ROUTES['#/admin/students']   = renderStudentManager;
ROUTES['#/admin/exams']      = renderExamManager;
ROUTES['#/admin/questions']  = renderQuestionManager;
ROUTES['#/admin/scores']     = renderScoreReports;
// #/admin/evaluator → renderEvaluatorQueue registered by evaluator.js
ROUTES['#/admin/evaluator']  = (...args) => renderEvaluatorQueue(...args);

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

async function renderAdminDashboard(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/admin/dashboard';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderAdminDashboard(true);
    return;
  }

  if (!isBackground && !main.querySelector('.stats-grid')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/admin/dashboard');
    const s = data.stats;

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-chart-bar"></i> Dashboard</h1>
          <p class="page-subtitle">Composite Assessment System overview</p>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card indigo">
          <div class="stat-icon indigo"><i class="ph ph-users"></i></div>
          <div class="stat-value" data-stat="students">${s.totalStudents}</div>
          <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card emerald">
          <div class="stat-icon emerald"><i class="ph ph-file-text"></i></div>
          <div class="stat-value" data-stat="exams">${s.publishedExams}/${s.totalExams}</div>
          <div class="stat-label">Published / Total Exams</div>
        </div>
        <div class="stat-card cyan">
          <div class="stat-icon cyan"><i class="ph ph-question"></i></div>
          <div class="stat-value" data-stat="questions">${s.totalQuestions}</div>
          <div class="stat-label">Total Questions</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-icon amber"><i class="ph ph-check-circle"></i></div>
          <div class="stat-value" data-stat="pending">${s.pendingReview}</div>
          <div class="stat-label">Pending Review</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--sp-lg);">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Components & Weights</h3>
          </div>
          <div class="table-container" style="border:none;">
            <table class="data-table">
              <thead><tr><th>Component</th><th>Weight</th><th>Max Raw</th><th>Max Weighted</th></tr></thead>
              <tbody>
                ${data.components.map(c => `
                  <tr>
                    <td style="font-weight:600; color:var(--text-primary);">${c.display_name}</td>
                    <td>×${c.weight}</td>
                    <td>${c.max_raw_score}</td>
                    <td style="font-weight:600;">${c.max_raw_score * c.weight}</td>
                  </tr>
                `).join('')}
                <tr style="border-top:1px solid var(--border-color);">
                  <td colspan="3" style="font-weight:700; color:var(--text-primary);">Composite Maximum</td>
                  <td style="font-weight:800; color:var(--accent-indigo-light);">5000</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Level Distribution</h3>
          </div>
          ${data.levelDistribution.length > 0 ? `
            <div style="display:flex; flex-direction:column; gap:var(--sp-md);">
              ${[3, 2, 1].map(level => {
                const ld    = data.levelDistribution.find(l => l.level === level);
                const count = ld ? ld.count : 0;
                const total = data.levelDistribution.reduce((a, b) => a + b.count, 0);
                const pct   = total ? Math.round(count / total * 100) : 0;
                const labels = { 3: 'Advanced', 2: 'Intermediate', 1: 'Foundational' };
                return `
                  <div>
                    <div class="flex justify-between mb-sm">
                      <span class="text-sm">${levelBadge(level)} ${labels[level]}</span>
                      <span class="text-sm text-muted">${count} students (${pct}%)</span>
                    </div>
                    <div class="progress-bar">
                      <div class="progress-fill ${level === 3 ? 'success' : level === 2 ? '' : 'warning'}" style="width:${pct}%"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="empty-state"><p>No scores computed yet</p></div>
          `}
        </div>
      </div>

      <div class="card mt-lg">
        <div class="card-header">
          <h3 class="card-title">Scoring Formula</h3>
        </div>
        <div style="text-align:center; padding:var(--sp-lg);">
          <div style="font-size:1.3rem; font-weight:700; font-family:monospace; color:var(--accent-indigo-light); margin-bottom:var(--sp-md);">
            S = 3T + 3L + 2O + 2W
          </div>
          <div style="display:flex; justify-content:center; gap:var(--sp-xl); flex-wrap:wrap;">
            <div class="badge badge-level-3" style="padding:8px 16px;">Advanced (75–100%)</div>
            <div class="badge badge-level-2" style="padding:8px 16px;">Intermediate (50–74%)</div>
            <div class="badge badge-level-1" style="padding:8px 16px;">Foundational (0–49%)</div>
          </div>
        </div>
      </div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${err.message}</p></div>`;
  }
}

// ─── TARGETED STAT PATCH (2.3) ────────────────────────────────────────────────

/**
 * Patches only the stat-card values in the admin dashboard — no full rebuild.
 * Called by the 15s auto-refresh if dashboard is currently visible.
 */
async function patchAdminDashboardStats() {
  try {
    const data = await api('/api/admin/dashboard');
    const s = data.stats;
    const patch = (attr, value) => {
      const el = document.querySelector(`[data-stat="${attr}"]`);
      if (el && el.textContent !== String(value)) el.textContent = value;
    };
    patch('students',  s.totalStudents);
    patch('exams',     `${s.publishedExams}/${s.totalExams}`);
    patch('questions', s.totalQuestions);
    patch('pending',   s.pendingReview);
  } catch { /* silent — dashboard is just stale for one tick */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: STUDENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

let currentStudentManagerBatchFilter = '';
let currentStudentManagerSearch = '';

async function renderStudentManager(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = `#/admin/students?batch=${currentStudentManagerBatchFilter}&q=${currentStudentManagerSearch}`;

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderStudentManager(true);
    return;
  }

  if (!isBackground && !main.querySelector('.data-table')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    let studentsUrl = '/api/admin/students?limit=100';
    if (currentStudentManagerBatchFilter) studentsUrl += `&batch_id=${currentStudentManagerBatchFilter}`;
    if (currentStudentManagerSearch) studentsUrl += `&search=${encodeURIComponent(currentStudentManagerSearch)}`;

    const [data, batchesData] = await Promise.all([
      api(studentsUrl),
      api('/api/admin/batches')
    ]);

    const batchesList = batchesData?.batches || [];
    const selectedBatch = batchesList.find(b => String(b.id) === String(currentStudentManagerBatchFilter));
    const batchOptions = batchesList.map(b => `
      <option value="${b.id}" ${String(currentStudentManagerBatchFilter) === String(b.id) ? 'selected' : ''}>
        🏷️ ${escapeHtml(b.name)}
      </option>
    `).join('');

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-users"></i> Student Manager</h1>
          <p class="page-subtitle" id="student-manager-subtitle">${data.total || 0} students ${selectedBatch ? `in Batch: <strong style="color:var(--accent-light);">${escapeHtml(selectedBatch.name)}</strong>` : 'total'}</p>
        </div>
        <div class="btn-group">
          <button class="btn btn-outline" onclick="openBatchManagerModal()"><i class="ph ph-users"></i> Manage Batches</button>
          <button class="btn btn-outline" onclick="openBulkImportModal()"><i class="ph ph-folder"></i> Bulk Import</button>
          <button class="btn btn-primary" onclick="openAddStudentModal()">+ Add Student</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div class="search-bar" style="flex:1; min-width:240px;">
              <span class="search-icon"><i class="ph ph-magnifying-glass"></i></span>
              <input type="text" class="form-input" id="student-search" value="${escapeHtml(currentStudentManagerSearch)}" placeholder="Search students by name, email or roll no..." oninput="fetchFilteredStudents()">
            </div>
            <select class="form-select" id="student-batch-filter" onchange="fetchFilteredStudents()" style="min-width: 220px; font-weight:600;">
              <option value="" ${currentStudentManagerBatchFilter === '' ? 'selected' : ''}>👥 All Batches</option>
              ${batchOptions}
            </select>
          </div>

          <!-- Bulk Action Bar -->
          <div id="bulk-action-bar" style="display: none; padding: 10px; background: rgba(99,102,241,0.1); border-radius: 8px; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--accent-indigo);"><span id="selected-student-count">0</span> students selected</span>
            <div class="btn-group">
              <button class="btn btn-outline btn-sm" onclick="bulkSetAuthorization(true)" title="Authorize Login"><i class="ph ph-lock-open"></i> Authorize</button>
              <button class="btn btn-outline btn-sm" onclick="bulkSetAuthorization(false)" title="Revoke Login"><i class="ph ph-lock-key"></i> Revoke</button>
              <button class="btn btn-outline btn-sm" onclick="openBulkAssignBatchModal()">Assign to Batch</button>
              <button class="btn btn-danger btn-sm" onclick="bulkDeleteStudents()">Delete Selected</button>
            </div>
          </div>
        </div>

        <div class="table-container" style="border:none; min-height:250px;">
          <table class="data-table" style="table-layout:fixed; width:100%;">
            <thead>
              <tr>
                <th style="width: 44px; text-align: center;"><input type="checkbox" id="selectAllStudents" onchange="toggleAllStudents(this)"></th>
                <th style="width: 22%;">Name</th>
                <th style="width: 16%;">Reg / Roll No</th>
                <th style="width: 14%;">Composite Score</th>
                <th style="width: 16%;">Batches</th>
                <th style="width: 12%;">Level</th>
                <th style="width: 10%;">Status</th>
                <th style="width: 10%;">Login</th>
                <th style="width: 80px; text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody id="students-tbody">
              ${data.students.map((s, idx) => `
                <tr style="height: 52px;">
                  <td style="text-align: center;"><input type="checkbox" class="student-checkbox" value="${s.id}" onchange="updateBulkActionBar()"></td>
                  <td style="font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.name)}</td>
                  <td><code style="background:rgba(99,102,241,0.12); padding:3px 8px; border-radius:6px; font-weight:700; color:var(--accent-indigo-light); font-family:monospace;">${escapeHtml(s.roll_no || '—')}</code></td>
                  <td>${s.total_score !== null ? `<span class="font-mono" style="font-weight:700;">${s.total_score} <span style="font-size:0.75rem; color:var(--text-muted);">/ 5000</span></span>` : '—'}</td>
                  <td>
                    ${s.batches 
                      ? `<span class="badge badge-primary" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;" title="${escapeHtml(s.batches)}">${escapeHtml(s.batches)}</span>`
                      : `<span class="badge" style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:0.75rem;">Unassigned</span>`
                    }
                  </td>
                  <td>${s.level ? levelBadge(s.level) : '<span class="badge badge-neutral">Pending</span>'}</td>
                  <td>${s.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
                  <td style="cursor: pointer;" onclick="toggleSingleAuthorization(${s.id}, ${!s.login_authorized})">
                    ${s.login_authorized ? '<span class="badge badge-success" title="Click to Revoke"><i class="ph ph-lock-open"></i> Allowed</span>' : '<span class="badge badge-danger" title="Click to Authorize"><i class="ph ph-lock-key"></i> Locked</span>'}
                  </td>
                  <td style="text-align:right;">
                    <div class="btn-group" style="justify-content:flex-end;">
                      <button class="btn btn-action btn-sm" onclick="editStudent(${s.id})" title="Reset Exams"><i class="ph ph-arrows-clockwise"></i></button>
                      <button class="btn btn-action btn-sm" onclick="deleteStudent(${s.id}, '${escapeHtml(s.name)}')" title="Deactivate"><i class="ph ph-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${data.students.length === 0 ? '<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No students found in this batch. Click "Add Student" or "Bulk Import" to get started.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

let filterTimeout;
async function fetchFilteredStudents() {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(async () => {
    try {
      const searchInput  = document.getElementById('student-search');
      const batchSelect  = document.getElementById('student-batch-filter');
      const search  = searchInput ? searchInput.value.trim() : '';
      const batchId = batchSelect ? batchSelect.value : '';

      currentStudentManagerSearch = search;
      currentStudentManagerBatchFilter = batchId;

      let url = `/api/admin/students?limit=100&search=${encodeURIComponent(search)}`;
      if (batchId) url += `&batch_id=${batchId}`;

      const data = await api(url);
      const tbody = document.getElementById('students-tbody');
      if (!tbody) return;

      const subtitleEl = document.getElementById('student-manager-subtitle');
      if (subtitleEl && batchSelect) {
        const selectedText = batchSelect.options[batchSelect.selectedIndex]?.text || '';
        subtitleEl.innerHTML = `${data.total || 0} students ${batchId ? `in Batch: <strong style="color:var(--accent-light);">${escapeHtml(selectedText.replace('🏷️ ', ''))}</strong>` : 'total'}`;
      }

      tbody.innerHTML = data.students.map((s) => `
        <tr style="height: 52px;">
          <td style="text-align: center;"><input type="checkbox" class="student-checkbox" value="${s.id}" onchange="updateBulkActionBar()"></td>
          <td style="font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.name)}</td>
          <td><code style="background:rgba(99,102,241,0.12); padding:3px 8px; border-radius:6px; font-weight:700; color:var(--accent-indigo-light); font-family:monospace;">${escapeHtml(s.roll_no || '—')}</code></td>
          <td>${s.total_score !== null ? `<span class="font-mono" style="font-weight:700;">${s.total_score} <span style="font-size:0.75rem; color:var(--text-muted);">/ 5000</span></span>` : '—'}</td>
          <td>
            ${s.batches 
              ? `<span class="badge badge-primary" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;" title="${escapeHtml(s.batches)}">${escapeHtml(s.batches)}</span>`
              : `<span class="badge" style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:0.75rem;">Unassigned</span>`
            }
          </td>
          <td>${s.level ? levelBadge(s.level) : '<span class="badge badge-neutral">Pending</span>'}</td>
          <td>${s.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
          <td style="cursor: pointer;" onclick="toggleSingleAuthorization(${s.id}, ${!s.login_authorized})">
            ${s.login_authorized ? '<span class="badge badge-success" title="Click to Revoke"><i class="ph ph-lock-open"></i> Allowed</span>' : '<span class="badge badge-danger" title="Click to Authorize"><i class="ph ph-lock-key"></i> Locked</span>'}
          </td>
          <td style="text-align:right;">
            <div class="btn-group" style="justify-content:flex-end;">
              <button class="btn btn-action btn-sm" onclick="editStudent(${s.id})" title="Reset Exams"><i class="ph ph-arrows-clockwise"></i></button>
              <button class="btn btn-action btn-sm" onclick="deleteStudent(${s.id}, '${escapeHtml(s.name)}')" title="Deactivate"><i class="ph ph-trash"></i></button>
            </div>
          </td>
        </tr>
      `).join('');

      if (data.students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:32px;">No students found matching your criteria in this batch.</td></tr>';
      }
      updateBulkActionBar();
    } catch (err) {
      showToast('Search failed', 'error');
    }
  }, 250);
}

async function openAddStudentModal() {
  try {
    const data = await api('/api/admin/batches');
    const batches = data?.batches || [];
    let batchOptions = `<option value="">-- No Batch (Unassigned) --</option>`;
    batches.forEach(b => {
      const isSel = String(currentStudentManagerBatchFilter) === String(b.id) ? 'selected' : '';
      batchOptions += `<option value="${b.id}" ${isSel}>🏷️ ${escapeHtml(b.name)}</option>`;
    });

    openModal('Add Student', `
      <form id="add-student-form">
        <div class="form-group">
          <label class="form-label">Student Name *</label>
          <input type="text" class="form-input" id="new-student-name" placeholder="e.g. Alice Johnson" required>
        </div>
        <div class="form-group">
          <label class="form-label">Registration / Roll Number *</label>
          <input type="text" class="form-input" id="new-student-roll" placeholder="e.g. REG001 or STU001" required>
        </div>
        <div class="form-group">
          <label class="form-label">Assign to Batch</label>
          <select id="new-student-batch" class="form-select">${batchOptions}</select>
        </div>
      </form>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitAddStudent()">Add Student</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitAddStudent() {
  try {
    const name = document.getElementById('new-student-name').value.trim();
    const roll_no = document.getElementById('new-student-roll').value.trim();
    const batch_id = document.getElementById('new-student-batch')?.value || null;

    if (!name || !roll_no) {
      return showToast('Name and Roll Number are required', 'warning');
    }

    await api('/api/admin/students', {
      method: 'POST',
      body: { name, roll_no, batch_id },
    });
    closeModal();
    showToast('Student added successfully', 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openBulkImportModal() {
  try {
    const data = await api('/api/admin/batches');
    let batchOptions = '<option value="">-- No Batch (Unassigned) --</option>';
    (data.batches || []).forEach(b => {
      const isSel = String(currentStudentManagerBatchFilter) === String(b.id) ? 'selected' : '';
      batchOptions += `<option value="${b.id}" ${isSel}>🏷️ ${escapeHtml(b.name)}</option>`;
    });

    openModal('Bulk Import Students', `
      <p class="text-sm text-muted mb-sm">Upload an Excel (.xlsx) or CSV (.csv) file with columns: <strong>name, reg_no</strong></p>
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <a href="/templates/students_template.xlsx" download class="btn btn-outline btn-sm"><i class="ph ph-download-simple"></i> Download XLSX Template</a>
        <a href="/templates/students_template.csv" download class="btn btn-outline btn-sm"><i class="ph ph-download-simple"></i> Download CSV Template</a>
      </div>
      <div class="form-group">
        <label>File</label>
        <input type="file" id="bulk-csv-file" accept=".xlsx,.xls,.csv" class="form-input">
      </div>
      <div class="form-group">
        <label>Assign to Batch (Optional)</label>
        <select id="bulk-import-batch" class="form-control">${batchOptions}</select>
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitBulkImport()">Import Students</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitBulkImport() {
  const fileInput = document.getElementById('bulk-csv-file');
  const batchId   = document.getElementById('bulk-import-batch').value;
  if (!fileInput.files[0]) return showToast('Select a file to import', 'warning');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (batchId) formData.append('batch_id', batchId);

  try {
    const data = await api('/api/admin/students/bulk', { method: 'POST', body: formData });
    closeModal();
    showToast(data.message, 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteStudent(id, name) {
  if (!confirm(`Are you sure you want to PERMANENTLY delete student "${name}"?\n\nThis will remove the student from the database and wipe all their scores.`)) return;
  try {
    await api(`/api/admin/students/${id}`, { method: 'DELETE' });
    showToast('Student permanently deleted from database', 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── BULK ACTIONS ─────────────────────────────────────────────────────────────

function toggleAllStudents(checkbox) {
  document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = checkbox.checked);
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const selectedCount   = document.querySelectorAll('.student-checkbox:checked').length;
  const actionBar       = document.getElementById('bulk-action-bar');
  const countSpan       = document.getElementById('selected-student-count');
  const selectAll       = document.getElementById('selectAllStudents');
  const totalCheckboxes = document.querySelectorAll('.student-checkbox').length;

  if (selectedCount > 0) {
    actionBar.style.display = 'flex';
    countSpan.textContent = selectedCount;
  } else {
    actionBar.style.display = 'none';
  }
  if (selectAll && totalCheckboxes > 0) {
    selectAll.checked = selectedCount === totalCheckboxes;
  }
}

function getSelectedStudentIds() {
  return Array.from(document.querySelectorAll('.student-checkbox:checked')).map(cb => parseInt(cb.value));
}

async function bulkSetAuthorization(authorized) {
  const studentIds = getSelectedStudentIds();
  if (studentIds.length === 0) return;

  try {
    await api('/api/admin/authorizations', {
      method: 'PUT',
      body: JSON.stringify({ studentIds, authorized })
    });
    showToast(`Successfully ${authorized ? 'authorized' : 'revoked'} login for ${studentIds.length} students`, 'success');
    renderStudentManager(); // refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleSingleAuthorization(studentId, authorized) {
  try {
    await api('/api/admin/authorizations', {
      method: 'PUT',
      body: JSON.stringify({ studentIds: [studentId], authorized })
    });
    showToast(`Successfully ${authorized ? 'authorized' : 'revoked'} login`, 'success');
    renderStudentManager(); // refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function bulkDeleteStudents() {
  const studentIds = getSelectedStudentIds();
  if (studentIds.length === 0) return;
  if (!confirm(`Are you sure you want to PERMANENTLY delete ${studentIds.length} students?`)) return;

  try {
    await api('/api/admin/students/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ student_ids: studentIds })
    });
    showToast(`Successfully deleted ${studentIds.length} students`, 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openBulkAssignBatchModal() {
  const studentIds = getSelectedStudentIds();
  if (studentIds.length === 0) return;

  try {
    const data = await api('/api/admin/batches');
    if (data.batches.length === 0) return showToast('No batches available. Create a batch first.', 'warning');

    let options = '<option value="">-- Select a Batch --</option>';
    data.batches.forEach(b => { options += `<option value="${b.id}">${b.name} (${b.student_count} students)</option>`; });

    openModal('Bulk Assign to Batch', `
      <p>Assigning <strong>${studentIds.length}</strong> students to a batch:</p>
      <div class="form-group">
        <select id="bulk-batch-select" class="form-control">${options}</select>
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBulkBatch()">Assign Batch</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveBulkBatch() {
  const batchId = document.getElementById('bulk-batch-select').value;
  if (!batchId) return showToast('Please select a batch', 'warning');

  try {
    await api('/api/admin/students/bulk-batch', {
      method: 'POST',
      body: JSON.stringify({ student_ids: getSelectedStudentIds(), batch_id: parseInt(batchId) })
    });
    showToast(`Assigned ${getSelectedStudentIds().length} students to batch`, 'success');
    closeModal();
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── BATCH MANAGER ────────────────────────────────────────────────────────────

async function openBatchManagerModal() {
  try {
    const data = await api('/api/admin/batches');
    let html = `
      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <input type="text" id="new-batch-name" class="form-control" placeholder="New Batch Name (e.g. CS-Section-A)">
        <button class="btn btn-primary" onclick="createBatch()">Create</button>
      </div>
      <div style="max-height: 400px; overflow-y: auto;">
        ${data.batches.length === 0 ? '<p class="text-muted">No batches exist.</p>' : ''}
        ${data.batches.map(b => `
          <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <strong>${b.name}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${b.student_count} students | ${b.exam_count} exams</div>
            </div>
            <button class="btn btn-danger btn-sm" onclick="deleteBatch(${b.id})">Delete</button>
          </div>
        `).join('')}
      </div>
    `;
    openModal('Manage Batches', html, '<button class="btn btn-outline" onclick="closeModal(); renderStudentManager()">Close</button>');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function createBatch() {
  const name = document.getElementById('new-batch-name').value;
  if (!name.trim()) return showToast('Batch name is required', 'warning');
  try {
    await api('/api/admin/batches', { method: 'POST', body: JSON.stringify({ name }) });
    showToast('Batch created', 'success');
    openBatchManagerModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBatch(id) {
  if (!confirm('Are you sure you want to delete this batch? Students will remain, but lose this batch assignment.')) return;
  try {
    await api(`/api/admin/batches/${id}`, { method: 'DELETE' });
    showToast('Batch deleted', 'success');
    openBatchManagerModal();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editStudent(id) {
  try {
    const data = await api(`/api/admin/students/${id}/exams`);
    const student = data.student;
    const exams = data.exams || [];

    const attemptedExams = exams.filter(e => e.session_status || e.responses_count > 0);

    let examOptionsHtml = '';
    if (attemptedExams.length > 0) {
      examOptionsHtml = attemptedExams.map((e, idx) => {
        const scoreText = e.session_status === 'submitted' 
          ? `Score: ${Math.round(e.score * 10) / 10} / ${e.total_marks}`
          : (e.session_status ? `In Progress (${e.responses_count} answered)` : 'Attempted');
        return `
          <option value="${e.exam_id}" ${idx === 0 ? 'selected' : ''}>
            [${escapeHtml(e.component_display_name || e.component_name)}] Exam #${e.exam_number}: ${escapeHtml(e.exam_title)} (${scoreText})
          </option>
        `;
      }).join('');
    } else {
      examOptionsHtml = exams.map((e, idx) => `
        <option value="${e.exam_id}" ${idx === 0 ? 'selected' : ''}>
          [${escapeHtml(e.component_display_name || e.component_name)}] Exam #${e.exam_number}: ${escapeHtml(e.exam_title)} (${e.total_marks} marks)
        </option>
      `).join('');
    }

    openModal('Reset Student Exam(s)', `
      <div style="margin-bottom: var(--sp-md);">
        <p style="font-size: 1.05rem; margin-bottom: 0.5rem;">
          Select reset options for <strong>${escapeHtml(student.name)}</strong> (${escapeHtml(student.roll_no || student.email)}):
        </p>
      </div>

      <div class="card p-sm mb-md" style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px;">
        <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer; margin-bottom:12px;">
          <input type="radio" name="reset-scope" value="single" id="reset-scope-single" checked onchange="toggleResetScopeUI()" style="margin-top:4px;">
          <div>
            <strong style="color:var(--text-primary);">Reset Specific Exam Only (Recommended)</strong>
            <p class="text-sm text-muted" style="margin:2px 0 0 0;">
              Clears the student's attempt, submitted answers, and score for the selected exam. Other exams and composite scores will be automatically recalculated.
            </p>
          </div>
        </label>

        <div id="single-exam-select-container" style="margin-left: 26px; margin-bottom: 8px;">
          <label class="form-label" style="font-size:0.82rem; font-weight:600;">Choose Exam to Reset:</label>
          <select class="form-select" id="reset-selected-exam-id">
            ${examOptionsHtml || '<option value="">No exams available</option>'}
          </select>
        </div>

        <hr style="border:0; border-top:1px solid var(--border-color); margin:12px 0;">

        <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
          <input type="radio" name="reset-scope" value="all" id="reset-scope-all" onchange="toggleResetScopeUI()" style="margin-top:4px;">
          <div>
            <strong style="color:var(--accent-rose);">Reset ALL Exams & Scores</strong>
            <p class="text-sm text-muted" style="margin:2px 0 0 0;">
              Permanently wipes all exam submissions, scores, violations, and composite rank for this student across all components.
            </p>
          </div>
        </label>
      </div>

      <div class="alert alert-warning" style="font-size:0.85rem;">
        <i class="ph ph-warning"></i> This action cannot be undone. The student will be granted access to re-attempt the reset exam(s).
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-reset" onclick="submitResetStudentExams(${id})">
        <i class="ph ph-arrows-clockwise"></i> Reset Selected Exam
      </button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleResetScopeUI() {
  const isSingle = document.getElementById('reset-scope-single')?.checked;
  const selectContainer = document.getElementById('single-exam-select-container');
  const confirmBtn = document.getElementById('btn-confirm-reset');

  if (selectContainer) {
    selectContainer.style.display = isSingle ? 'block' : 'none';
  }
  if (confirmBtn) {
    confirmBtn.innerHTML = isSingle 
      ? '<i class="ph ph-arrows-clockwise"></i> Reset Selected Exam'
      : '<i class="ph ph-warning"></i> Reset ALL Exams for Student';
  }
}

async function submitResetStudentExams(id) {
  const isSingle = document.getElementById('reset-scope-single')?.checked;
  const examId = isSingle ? document.getElementById('reset-selected-exam-id')?.value : 'all';

  if (isSingle && !examId) {
    showToast('Please select an exam to reset', 'warning');
    return;
  }

  const promptText = isSingle 
    ? 'Are you sure you want to reset this exam for this student?' 
    : 'Are you sure you want to completely wipe ALL exams and scores for this student?';

  if (!confirm(promptText)) return;

  try {
    const res = await api(`/api/admin/students/${id}/exams?exam_id=${encodeURIComponent(examId)}`, { method: 'DELETE' });
    closeModal();
    showToast(res.message || 'Exam(s) reset successfully', 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.toggleResetScopeUI = toggleResetScopeUI;

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: EXAM MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

async function renderExamManager(isBackground = false) {
  const main = document.getElementById('main-content');
  const hasExistingTable = main.querySelector('.data-table');
  if (!isBackground || !hasExistingTable) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const [examData, compData] = await Promise.all([
      api('/api/admin/exams'),
      api('/api/admin/components'),
    ]);

    const components  = compData.components;
    const groupedExams = {};
    components.forEach(c => { groupedExams[c.id] = { component: c, exams: [] }; });
    examData.exams.forEach(e => {
      if (groupedExams[e.component_id]) groupedExams[e.component_id].exams.push(e);
    });

    main.innerHTML = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-file-text"></i> Exam Manager</h1>
          <p class="page-subtitle">${examData.exams.length} exams across ${components.length} components</p>
        </div>
      </div>

      ${Object.values(groupedExams).map(group => `
        <div class="card mb-lg">
          <div class="card-header">
            <h3 class="card-title">${group.component.display_name} <span class="badge badge-info">×${group.component.weight}</span></h3>
            <span class="text-sm text-muted">${group.exams.length} exams</span>
          </div>
          <div class="table-container" style="border:none;">
            <table class="data-table">
              <thead>
                <tr><th>#</th><th>Title</th><th>Questions</th><th>Marks</th><th>Access Code (Time-Limited)</th><th>Timer Config</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                ${group.exams.length === 0 ? '<tr><td colspan="8" class="text-center text-muted">No exams</td></tr>' : group.exams.map((e, idx) => `
                  <tr class="animate-slide-up" style="animation-delay: ${idx * 0.05}s">
                    <td>${e.exam_number}</td>
                    <td style="font-weight:600; color:var(--text-primary);">${e.title}</td>
                    <td>${e.question_count}</td>
                    <td><span class="font-mono">${e.total_question_marks}/${e.total_marks}</span></td>
                    <td>
                      <div style="font-size: 0.8rem; margin-bottom: 4px;">
                        <code style="background:rgba(99,102,241,0.15); padding:4px 8px; border-radius:6px; color:var(--accent-indigo-light); font-weight:700; font-family:monospace; letter-spacing:0.05em;">
                          ${e.access_code || 'NONE'}
                        </code>
                      </div>
                      ${e.start_time ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Starts: ${new Date(e.start_time).toLocaleString()}</div>` : '<div style="font-size: 0.75rem; color: var(--text-muted);">Starts: Not set</div>'}
                      ${e.access_code_expires_at ? `<div style="font-size: 0.75rem; color: var(--text-muted);">Ends: ${new Date(e.access_code_expires_at).toLocaleString()}</div>` : ''}
                    </td>
                    <td>
                      ${e.timer_enabled !== 0
                        ? `<span class="badge badge-info">${e.duration_minutes} min <i class="ph ph-timer"></i></span>`
                        : `<span class="badge badge-neutral">Disabled <i class="ph ph-pause"></i></span>`}
                    </td>
                    <td>${e.is_published ? '<span class="badge badge-success">Published</span>' : '<span class="badge badge-neutral">Draft</span>'}</td>
                    <td>
                      <div class="btn-group">
                        <button class="btn btn-action btn-sm" onclick="openAssignBatchesModal(${e.id})" title="Assign Student Batches"><i class="ph ph-users-three"></i></button>
                        <button class="btn btn-action btn-sm" onclick="openEditExamTimeModal(${e.id}, '${e.start_time || ''}', ${e.duration_minutes})" title="Edit Time & Date"><i class="ph ph-calendar-plus"></i></button>
                        <button class="btn btn-action btn-sm" onclick="generateExamAccessCode(${e.id})" title="Generate / Reset Access Code"><i class="ph ph-password"></i></button>
                        <button class="btn btn-action btn-sm" onclick="toggleExamTimer(${e.id}, ${e.timer_enabled !== 0 ? 1 : 0})" title="Toggle Timer"><i class="ph ph-hourglass-high"></i></button>
                        <button class="btn btn-action btn-sm" onclick="togglePublish(${e.id}, ${e.is_published})" title="${e.is_published ? 'Unpublish' : 'Publish'}">
                          ${e.is_published ? '<i class="ph ph-lock-key"></i>' : '<i class="ph ph-rocket-launch"></i>'}
                        </button>
                        <a class="btn btn-action btn-sm" href="/api/admin/exams/${e.id}/export" target="_blank" title="Export Scores (XLSX)">
                          <i class="ph ph-export"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

async function generateExamAccessCode(examId) {
  try {
    const res = await api(`/api/admin/exams/${examId}/access-code`, { method: 'POST' });
    showToast(`Access code generated: ${res.access_code}`, 'success');
    renderExamManager(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditExamTimeModal(examId, currentStartTime, currentDuration) {
  const dtLocal = currentStartTime ? new Date(currentStartTime).toISOString().slice(0, 16) : '';
  openModal('Edit Exam Time & Date', `
    <div class="form-group">
      <label>Start Date & Time</label>
      <input type="datetime-local" id="edit-start-time" class="form-control" value="${dtLocal}">
    </div>
    <div class="form-group">
      <label>Duration (minutes)</label>
      <input type="number" id="edit-duration" class="form-control" value="${currentDuration}" min="1">
    </div>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveExamTime(${examId})">Save Changes</button>
  `);
}

async function saveExamTime(examId) {
  const startTime = document.getElementById('edit-start-time').value;
  const duration  = document.getElementById('edit-duration').value;
  if (!startTime || !duration) return showToast('Please fill all fields', 'error');

  try {
    await api(`/api/admin/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify({
        start_time:       new Date(startTime).toISOString(),
        duration_minutes: parseInt(duration)
      })
    });
    showToast('Exam time updated successfully', 'success');
    closeModal();
    renderExamManager(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openAssignBatchesModal(examId) {
  try {
    const [allBatchesData, assignedBatchesData] = await Promise.all([
      api('/api/admin/batches'),
      api(`/api/admin/exams/${examId}/batches`)
    ]);

    const assignedIds = new Set(assignedBatchesData.batches.map(b => b.id));
    let html = '<div style="max-height: 400px; overflow-y: auto;">';

    if (allBatchesData.batches.length === 0) {
      html += '<p class="text-muted">No batches exist. Create batches in the Student section first.</p>';
    } else {
      html += '<p class="text-sm text-muted mb-md">Select batches to assign to this exam. Note: This will remove these batches from any other exams they are currently assigned to (1 batch = 1 active exam restriction).</p>';
      allBatchesData.batches.forEach(b => {
        html += `
          <div style="padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="batch_${b.id}" class="exam-batch-checkbox" value="${b.id}" ${assignedIds.has(b.id) ? 'checked' : ''}>
            <label for="batch_${b.id}" style="margin: 0; cursor: pointer; flex: 1;">
              <strong>${b.name}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${b.student_count} students</div>
            </label>
          </div>
        `;
      });
    }
    html += '</div>';

    openModal('Assign Batches to Exam', html, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExamBatches(${examId})">Save Assignments</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveExamBatches(examId) {
  const batchIds = Array.from(document.querySelectorAll('.exam-batch-checkbox:checked')).map(cb => parseInt(cb.value));
  try {
    await api(`/api/admin/exams/${examId}/batches`, {
      method: 'POST',
      body: JSON.stringify({ batch_ids: batchIds })
    });
    showToast('Batches assigned to exam successfully', 'success');
    closeModal();
    renderExamManager(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleExamTimer(examId, currentTimerEnabled) {
  try {
    await api(`/api/admin/exams/${examId}`, {
      method: 'PUT',
      body: { timer_enabled: !currentTimerEnabled },
    });
    showToast(currentTimerEnabled ? 'Timer disabled for exam' : 'Timer enabled for exam', 'info');
    renderExamManager(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function togglePublish(examId, current) {
  try {
    await api(`/api/admin/exams/${examId}`, {
      method: 'PUT',
      body: { is_published: !current },
    });
    showToast(current ? 'Exam unpublished' : 'Exam published', 'success');
    renderExamManager(true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: QUESTION MANAGER (Manual + AI Generation)
// ═══════════════════════════════════════════════════════════════════════════════

async function renderQuestionManager(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/admin/questions';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const selectedExamId = urlParams.get('exam') || '';
    if (selectedExamId) loadExamQuestions(selectedExamId, true);
    renderQuestionManager(true);
    return;
  }

  if (!isBackground && !main.querySelector('#qm-exam-select')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const examData = await api('/api/admin/exams');
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const selectedExamId = urlParams.get('exam') || '';

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-question"></i> Question Manager</h1>
          <p class="page-subtitle">Add questions manually or generate with AI</p>
        </div>
      </div>

      <div class="card mb-lg" style="padding: 20px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
        <div class="form-group mb-0">
          <label class="form-label" style="font-weight: 700; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <i class="ph ph-file-text" style="color: var(--accent-indigo);"></i> Select Exam to Manage Questions
          </label>
          <select class="form-select form-select-lg" id="qm-exam-select" onchange="loadExamQuestions(this.value)" style="font-size: 1rem; font-weight: 500; padding: 12px 16px; border-radius: var(--radius-sm); border: 1.5px solid var(--border-color); background-color: var(--bg-body); transition: all 0.2s ease;">
            <option value="">— Select an exam to view & edit questions —</option>
            ${examData.exams.map(e => `
              <option value="${e.id}" ${e.id == selectedExamId ? 'selected' : ''}>
                ${e.component_name} — ${e.title} (Exam #${e.exam_number} • ${e.question_count} Qs • ${e.total_question_marks || 0}/${e.total_marks} marks)
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div id="qm-content"></div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;

    if (selectedExamId) loadExamQuestions(selectedExamId);
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

async function loadExamQuestions(examId, isBackground = false, targetTab = null) {
  if (!examId) {
    const contentEl = document.getElementById('qm-content');
    if (contentEl) contentEl.innerHTML = '';
    return;
  }

  const container = document.getElementById('qm-content');
  const activeTabName = targetTab || container.querySelector('.tab.active')?.dataset?.tab || 'qm-existing';

  if (!isBackground || !container.querySelector('.data-table')) {
    container.innerHTML = `<div class="loading-overlay"><div class="spinner"></div></div>`;
  }

  try {
    const data = await api(`/api/admin/exams/${examId}/questions`);

    container.innerHTML = `
      <!-- Tabs: Questions / AI Generate / Upload -->
      <div class="tabs">
        <button class="tab ${activeTabName === 'qm-existing' ? 'active' : ''}" data-tab="qm-existing" onclick="switchQmTab(this, 'qm-existing')">
          <i class="ph ph-clipboard-text"></i> Questions (${data.summary.questionCount})
        </button>
        <button class="tab ${activeTabName === 'qm-manual' ? 'active' : ''}" data-tab="qm-manual" onclick="switchQmTab(this, 'qm-manual')">
          <i class="ph ph-pencil-simple"></i> Add Manual
        </button>
        <button class="tab ${activeTabName === 'qm-ai' ? 'active' : ''}" data-tab="qm-ai" onclick="switchQmTab(this, 'qm-ai')">
          <i class="ph ph-robot"></i> AI Generate
        </button>
        <button class="tab ${activeTabName === 'qm-upload' ? 'active' : ''}" data-tab="qm-upload" onclick="switchQmTab(this, 'qm-upload')">
          <i class="ph ph-folder"></i> Upload File
        </button>
      </div>

      <!-- TAB: Existing Questions -->
      <div class="tab-content ${activeTabName === 'qm-existing' ? 'active' : ''}" id="qm-existing">
        <div class="flex justify-between items-center mb-md flex-wrap gap-sm">
          <div>
            <span class="text-sm">Total: <strong class="font-mono">${data.summary.totalMarks}/${data.exam.total_marks}</strong> marks</span>
            ${Object.entries(data.summary.typeCounts).map(([type, marks]) =>
              `<span class="badge badge-info" style="margin-left:8px;">${type}: ${marks}m</span>`
            ).join('')}
          </div>
        </div>
        ${data.questions.length > 0 ? `
          <!-- Bulk Action Bar -->
          <div id="q-bulk-action-bar" style="display: none; padding: 10px; background: rgba(99,102,241,0.1); border-radius: 8px; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-weight: 600; color: var(--accent-indigo);"><span id="q-selected-count">0</span> questions selected</span>
            <div class="btn-group">
              <button class="btn btn-danger btn-sm" onclick="bulkDeleteQuestions(${examId})">Delete Selected</button>
            </div>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllQuestions" onchange="toggleAllQuestions(this)"></th><th>#</th><th>Type</th><th>Content</th><th>Correct / Model Answer</th><th>Marks</th><th>Source</th><th>Actions</th></tr></thead>
              <tbody>
                ${data.questions.map((q, i) => `
                  <tr class="animate-slide-up" style="animation-delay: ${i * 0.03}s">
                    <td style="text-align: center;"><input type="checkbox" class="question-checkbox" value="${q.id}" onchange="updateQuestionBulkActionBar()"></td>
                    <td>${i + 1}</td>
                    <td><span class="badge badge-info">${q.type}</span></td>
                    <td style="max-width:320px; white-space:normal; line-height: 1.4;">${escapeHtml(q.content)}</td>
                    <td style="max-width:260px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-family: ${q.type === 'programming' ? 'monospace' : 'inherit'}; font-size: 0.85rem; color: var(--accent-emerald);">
                      ${escapeHtml(typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer) : (q.correct_answer || '—'))}
                    </td>
                    <td class="font-mono" style="font-weight:600;">${q.marks}</td>
                    <td><span class="badge ${q.source === 'ai_generated' ? 'badge-warning' : 'badge-neutral'}">${q.source === 'ai_generated' ? '<i class="ph ph-robot"></i> AI' : '<i class="ph ph-pencil-simple"></i> Manual'}</span></td>
                    <td>
                      <div class="flex gap-xs">
                        <button class="btn btn-action btn-sm" onclick="viewQuestion(${q.id}, ${examId})" title="View Details"><i class="ph ph-eye"></i></button>
                        <button class="btn btn-action btn-sm" onclick="editExistingQuestion(${q.id}, ${examId})" title="Edit Question"><i class="ph ph-pencil-simple"></i></button>
                        <button class="btn btn-action btn-sm" onclick="deleteQuestion(${q.id}, ${examId})" title="Delete Question"><i class="ph ph-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="empty-state">
            <div class="empty-icon"><i class="ph ph-file-text"></i></div>
            <h3>No questions yet</h3>
            <p>Add questions manually, generate with AI, or upload a file</p>
          </div>
        `}
      </div>

      <!-- TAB: Add Manual -->
      <div class="tab-content ${activeTabName === 'qm-manual' ? 'active' : ''}" id="qm-manual">
        <div class="card">
          <form id="manual-question-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Question Type</label>
                <select class="form-select" id="mq-type" onchange="updateManualForm()">
                  <option value="mcq">MCQ</option>
                  <option value="subjective">Subjective</option>
                  <option value="programming">Programming</option>
                  <option value="oral_task">Oral Task</option>
                  <option value="writing_task">Writing Task</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Marks</label>
                <input type="number" class="form-input" id="mq-marks" value="1" min="1" max="25">
              </div>
              <div class="form-group">
                <label class="form-label">Difficulty</label>
                <select class="form-select" id="mq-difficulty">
                  <option value="easy">Easy</option>
                  <option value="medium" selected>Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Question Content</label>
              <textarea class="form-textarea" id="mq-content" rows="3" placeholder="Enter question text..."></textarea>
            </div>
            <div id="mq-options-section">
              <div class="form-group">
                <label class="form-label">Options (MCQ)</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <input type="text" class="form-input" id="mq-opt-a" placeholder="Option A">
                  <input type="text" class="form-input" id="mq-opt-b" placeholder="Option B">
                  <input type="text" class="form-input" id="mq-opt-c" placeholder="Option C">
                  <input type="text" class="form-input" id="mq-opt-d" placeholder="Option D">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Correct Answer</label>
                <select class="form-select" id="mq-correct" style="max-width:120px;">
                  <option value="A">A</option><option value="B">B</option>
                  <option value="C">C</option><option value="D">D</option>
                </select>
              </div>
            </div>
            <div id="mq-answer-section" class="hidden">
              <div class="form-group">
                <label class="form-label">Model Answer / Hint / Solution Code</label>
                <textarea class="form-textarea" id="mq-answer" rows="4" placeholder="Model answer or reference code..."></textarea>
              </div>
            </div>
            <button type="button" class="btn btn-primary" onclick="submitManualQuestion(${examId})">Add Question</button>
          </form>
        </div>
      </div>

      <!-- TAB: AI Generate -->
      <div class="tab-content ${activeTabName === 'qm-ai' ? 'active' : ''}" id="qm-ai">
        <div class="card">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
            <span style="font-size:1.3rem;"><i class="ph ph-robot"></i></span>
            <h3>Generate Questions with Gemini AI</h3>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Topic *</label>
              <input type="text" class="form-input" id="ai-topic" placeholder="e.g. Data Structures - Binary Trees">
            </div>
            <div class="form-group">
              <label class="form-label">Question Type (Mix)</label>
              <select class="form-select" id="ai-qtype" onchange="updateAiTopicHint()">
                <option value="auto">Auto (Component Default)</option>
                <option value="mcq">MCQ Only</option>
                <option value="subjective">Subjective Only</option>
                <option value="programming">Programming (Algorithms & Code)</option>
                <option value="sql">Database Querying (SQL Only)</option>
                <option value="bash">Command Writing (Linux / Bash Only)</option>
                <option value="oral_task">Oral Task Only</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Difficulty</label>
              <select class="form-select" id="ai-difficulty">
                <option value="easy">Easy</option>
                <option value="medium" selected>Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Description (optional)</label>
            <textarea class="form-textarea" id="ai-description" rows="2" placeholder="e.g. Target specific tables, algorithms, or CLI text-processing tools..."></textarea>
          </div>
          <button type="button" class="btn btn-primary btn-lg" onclick="generateAIQuestions(${examId})" id="ai-generate-btn">
            <i class="ph ph-rocket-launch"></i> Generate Questions
          </button>
          <div id="ai-preview" class="mt-lg"></div>
        </div>
      </div>

      <!-- TAB: Upload File -->
      <div class="tab-content ${activeTabName === 'qm-upload' ? 'active' : ''}" id="qm-upload">
        <div class="card">
          <p class="text-sm text-muted mb-sm">Upload questions from Excel (.xlsx), CSV (.csv), or JSON (.json) file.</p>
          <p class="text-sm text-muted mb-md">Expected columns: <strong>question, type, Option A, Option B, Option C, Option D, Correct Answer, marks, difficulty</strong></p>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
            <a href="/templates/questions_template.xlsx" download class="btn btn-outline btn-sm"><i class="ph ph-download-simple"></i> Download Questions XLSX Template</a>
            <a href="/templates/questions_template.csv" download class="btn btn-outline btn-sm"><i class="ph ph-download-simple"></i> Download CSV Template</a>
            <a href="/templates/questions_template.json" download class="btn btn-outline btn-sm"><i class="ph ph-download-simple"></i> Download JSON Template</a>
          </div>
          <div class="form-group">
            <input type="file" id="qm-upload-file" accept=".xlsx,.xls,.csv,.json" class="form-input">
          </div>
          <button type="button" class="btn btn-primary" onclick="uploadQuestions(${examId})"><i class="ph ph-folder"></i> Upload & Import</button>
          <div id="upload-result" class="mt-md"></div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

function switchQmTab(btn, tabId) {
  const container = document.getElementById('qm-content');
  if (!container) return;
  container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  container.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

function updateManualForm() {
  const type = document.getElementById('mq-type')?.value;
  const optSec = document.getElementById('mq-options-section');
  const ansSec = document.getElementById('mq-answer-section');
  if (optSec) optSec.classList.toggle('hidden', type !== 'mcq');
  if (ansSec) ansSec.classList.toggle('hidden', type === 'mcq');
}

async function submitManualQuestion(examId) {
  const type    = document.getElementById('mq-type')?.value || 'mcq';
  const content = document.getElementById('mq-content')?.value || '';
  if (!content.trim()) return showToast('Please enter question content', 'warning');

  const body = {
    type,
    marks:      parseFloat(document.getElementById('mq-marks')?.value) || 1,
    content:    content.trim(),
    difficulty: document.getElementById('mq-difficulty')?.value || 'medium',
  };

  if (type === 'mcq') {
    body.options = [
      document.getElementById('mq-opt-a')?.value?.trim() || '',
      document.getElementById('mq-opt-b')?.value?.trim() || '',
      document.getElementById('mq-opt-c')?.value?.trim() || '',
      document.getElementById('mq-opt-d')?.value?.trim() || '',
    ].filter(o => o !== '');
    if (body.options.length < 2) return showToast('At least 2 options required for MCQ', 'warning');
    body.correct_answer = document.getElementById('mq-correct')?.value || 'A';
  } else {
    body.correct_answer = document.getElementById('mq-answer')?.value?.trim() || '';
  }

  try {
    await api(`/api/admin/exams/${examId}/questions`, { method: 'POST', body });
    showToast('Question added successfully', 'success');
    loadExamQuestions(examId, false, 'qm-existing');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateAiTopicHint() {
  const typeSelect = document.getElementById('ai-qtype');
  const topicInput = document.getElementById('ai-topic');
  const descInput = document.getElementById('ai-description');
  if (!typeSelect || !topicInput) return;

  const val = typeSelect.value;
  if (val === 'sql') {
    if (!topicInput.value || topicInput.value.includes('Data Structures')) topicInput.value = 'SQL Database - Queries & Aggregations';
    if (descInput && !descInput.value) descInput.value = 'Relational queries with JOINs, GROUP BY, HAVING, subqueries, and window functions.';
  } else if (val === 'bash') {
    if (!topicInput.value || topicInput.value.includes('Data Structures')) topicInput.value = 'Linux Command Line & Shell Pipelines';
    if (descInput && !descInput.value) descInput.value = 'Text processing with grep, awk, sed, sort, uniq, cut, and command pipelines.';
  }
}

window.switchQmTab = switchQmTab;
window.updateManualForm = updateManualForm;
window.submitManualQuestion = submitManualQuestion;
window.updateAiTopicHint = updateAiTopicHint;

async function generateAIQuestions(examId) {
  const btn     = document.getElementById('ai-generate-btn');
  const preview = document.getElementById('ai-preview');
  const topic   = document.getElementById('ai-topic').value;
  if (!topic) return showToast('Enter a topic', 'warning');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Generating...';
  preview.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><p>Generating questions with Gemini AI...</p></div>`;

  try {
    const qTypeVal = document.getElementById('ai-qtype').value;
    let questionTypes = undefined;
    if (qTypeVal !== 'auto') questionTypes = { [qTypeVal]: 20 };

    const data = await api(`/api/admin/exams/${examId}/questions/generate`, {
      method: 'POST',
      body: {
        topic,
        description:   document.getElementById('ai-description').value,
        difficulty:    document.getElementById('ai-difficulty').value,
        questionTypes,
      },
    });

    if (!data.questions || data.questions.length === 0) {
      preview.innerHTML = `<div class="empty-state"><p>No questions generated. Try adjusting the topic.</p></div>`;
      return;
    }

    window.__tempAiQuestions = data.questions;

    preview.innerHTML = `
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <h4 style="margin:0;"><i class="ph ph-check-circle" style="color:var(--accent-emerald);"></i> Generated ${data.questions.length} Questions — Full Review & Edit</h4>
        <span class="text-sm text-muted">Edit question text, options, or answers before saving to the exam</span>
      </div>
      <div class="ai-generated-questions-list" style="display:flex; flex-direction:column; gap:1.25rem; max-height: 680px; overflow-y: auto; padding-right: 8px; margin-top: 14px;">
        ${data.questions.map((q, i) => {
          const isMcq = q.type === 'mcq' || (q.options && Array.isArray(q.options) && q.options.length > 0);
          const isProg = q.type === 'programming';

          let optionsBlock = '';
          if (isMcq) {
            const opts = q.options || ['Option A', 'Option B', 'Option C', 'Option D'];
            const correctVal = typeof q.correct_answer === 'string' ? q.correct_answer.trim() : (opts[0] || 'A');
            
            optionsBlock = `
              <div class="mt-sm" style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                <label class="form-label" style="font-size: 0.8rem; font-weight: 600;">MCQ Options</label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                  ${opts.map((opt, optIdx) => `
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="font-weight:700; font-size:0.85rem; color:var(--text-muted); width:20px;">${String.fromCharCode(65 + optIdx)}</span>
                      <input type="text" class="form-input form-input-sm ai-q-opt-item" data-idx="${i}" data-opt-idx="${optIdx}" value="${escapeHtml(opt)}" placeholder="Option ${String.fromCharCode(65 + optIdx)}">
                    </div>
                  `).join('')}
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <label class="form-label" style="margin:0; font-size:0.8rem; font-weight:600; color:var(--accent-emerald);">Correct Option:</label>
                  <select class="form-select form-select-sm ai-q-correct-select" data-idx="${i}" style="max-width:140px; font-weight:700;">
                    ${opts.map((opt, optIdx) => {
                      const letter = String.fromCharCode(65 + optIdx);
                      const isSelected = correctVal.toUpperCase() === letter || correctVal === opt || (optIdx === 0 && !correctVal);
                      return `<option value="${letter}" ${isSelected ? 'selected' : ''}>${letter} (${escapeHtml(opt.substring(0, 18))})</option>`;
                    }).join('')}
                  </select>
                </div>
              </div>
            `;
          }

          let answerBlock = '';
          if (!isMcq) {
            const modelAnsText = typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer, null, 2) : (q.correct_answer || '');
            answerBlock = `
              <div class="mt-sm">
                <label class="form-label" style="font-size: 0.8rem; font-weight:600; color: var(--accent-emerald);">
                  ${isProg ? 'Model Solution Code (Python / Language-Specific Reference Code — Press Tab to Indent)' : 'Model / Correct Answer Statement'}
                </label>
                <textarea class="form-textarea ai-q-answer" data-idx="${i}" rows="${isProg ? 8 : 4}" style="font-family:${isProg ? "'JetBrains Mono', Consolas, monospace" : 'inherit'}; font-size:0.88rem; line-height:1.5; tab-size:4; white-space:pre; border-color:rgba(16,185,129,0.3); background:${isProg ? '#0d1117' : 'rgba(16,185,129,0.02)'}; color:${isProg ? '#34d399' : 'inherit'};">${escapeHtml(modelAnsText)}</textarea>
              </div>
            `;
          }

          return `
            <div class="card p-md ai-question-card" data-idx="${i}" style="border-left: 4px solid var(--accent-indigo); background: var(--bg-surface); padding: 18px;">
              <div class="flex justify-between items-start mb-sm flex-wrap gap-sm">
                <div class="flex items-center gap-sm">
                  <span class="badge badge-info">${q.type}</span>
                  <label class="flex items-center gap-xs cursor-pointer" style="user-select:none;">
                    <input type="checkbox" checked class="ai-q-keep" data-idx="${i}">
                    <strong style="font-size: 0.9rem; color: var(--text-primary);">Keep Question</strong>
                  </label>
                </div>
                <div class="flex items-center gap-sm">
                  <div style="width: 100px;">
                    <label class="form-label" style="font-size:0.75rem; margin-bottom:2px;">Marks</label>
                    <input type="number" class="form-input form-input-sm ai-q-marks" data-idx="${i}" value="${q.marks || 1}" min="0.5" step="0.5" style="font-weight:700;">
                  </div>
                  <div style="width: 110px;">
                    <label class="form-label" style="font-size:0.75rem; margin-bottom:2px;">Difficulty</label>
                    <select class="form-select form-select-sm ai-q-difficulty" data-idx="${i}">
                      <option value="easy" ${q.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
                      <option value="medium" ${!q.difficulty || q.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
                      <option value="hard" ${q.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label class="form-label" style="font-size: 0.8rem; font-weight:600; color: var(--text-muted);">Question Statement (Markdown & Code Supported)</label>
                <textarea class="form-textarea ai-q-content" data-idx="${i}" rows="5" style="font-size:0.92rem; line-height:1.5; tab-size:4;">${escapeHtml(q.content || q.question || '')}</textarea>
              </div>

              ${optionsBlock}
              ${answerBlock}
            </div>
          `;
        }).join('')}
      </div>
      <div class="mt-md flex gap-sm flex-wrap">
        <button class="btn btn-success" onclick="saveGeneratedQuestions(${examId})">
          <i class="ph ph-check-circle"></i> Save Selected Questions to Exam
        </button>
        <button class="btn btn-primary" onclick="generateAIQuestions(${examId})">
          <i class="ph ph-arrows-clockwise"></i> Redraft Questions
        </button>
        <button class="btn btn-outline" onclick="document.getElementById('ai-preview').innerHTML=''">
          ✗ Discard All
        </button>
      </div>
    `;

    document.querySelectorAll('.ai-q-answer, .ai-q-content').forEach(el => setupCodeTextarea(el));
  } catch (err) {
    preview.innerHTML = `<div class="empty-state" style="color:var(--accent-rose);"><p>Generation failed: ${err.message}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-rocket-launch"></i> Generate Questions';
  }
}

async function saveGeneratedQuestions(examId) {
  if (!window.__tempAiQuestions) return showToast('No questions to save', 'error');

  const checkboxes = document.querySelectorAll('.ai-q-keep');
  const selected = [];
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.dataset.idx);
      const original = window.__tempAiQuestions[idx];
      const q = { ...original };
      
      const contentEl = document.querySelector(`.ai-q-content[data-idx="${idx}"]`);
      if (contentEl) q.content = contentEl.value.trim();
      
      const marksEl = document.querySelector(`.ai-q-marks[data-idx="${idx}"]`);
      if (marksEl) q.marks = parseFloat(marksEl.value) || 1;

      const diffEl = document.querySelector(`.ai-q-difficulty[data-idx="${idx}"]`);
      if (diffEl) q.difficulty = diffEl.value;

      // Extract MCQ options if present
      const optInputs = document.querySelectorAll(`.ai-q-opt-item[data-idx="${idx}"]`);
      if (optInputs.length > 0) {
        q.options = Array.from(optInputs).map(inp => inp.value.trim()).filter(v => v);
        const correctSelect = document.querySelector(`.ai-q-correct-select[data-idx="${idx}"]`);
        if (correctSelect) {
          q.correct_answer = correctSelect.value;
        }
      } else {
        const answerTextarea = document.querySelector(`.ai-q-answer[data-idx="${idx}"]`);
        if (answerTextarea) {
          q.correct_answer = answerTextarea.value.trim();
        }
      }
      
      selected.push(q);
    }
  });

  if (selected.length === 0) return showToast('No questions selected', 'warning');
  if (!confirm(`Save ${selected.length} questions to this exam?`)) return;

  try {
    await api(`/api/admin/exams/${examId}/questions/save-generated`, {
      method: 'POST',
      body: { questions: selected },
    });
    showToast(`Saved ${selected.length} questions successfully!`, 'success');
    window.__tempAiQuestions = null;
    loadExamQuestions(examId, false, 'qm-existing');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function uploadQuestions(examId) {
  const fileInput = document.getElementById('qm-upload-file');
  if (!fileInput.files[0]) return showToast('Select a file', 'warning');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  try {
    const data = await api(`/api/admin/exams/${examId}/questions/upload`, { method: 'POST', body: formData });
    showToast(data.message, 'success');
    loadExamQuestions(examId, false, 'qm-existing');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function viewQuestion(qId, examId) {
  try {
    const data = await api(`/api/admin/exams/${examId}/questions`);
    const q = data.questions.find(x => x.id === qId);
    if (!q) return;

    let detailHtml = `
      <div class="mb-md"><span class="badge badge-info">${escapeHtml(q.type)}</span> <span class="badge badge-neutral">${q.marks} marks</span> <span class="badge ${q.source === 'ai_generated' ? 'badge-warning' : 'badge-neutral'}">${escapeHtml(q.source)}</span> <span class="badge badge-neutral">${escapeHtml(q.difficulty || 'medium')}</span></div>
      <div class="mb-md"><strong>Question:</strong><br><div style="padding:12px 14px; background:var(--bg-body); border-radius:6px; border:1px solid var(--border-color); margin-top:6px; line-height:1.6;">${renderRichContent(q.content)}</div></div>
    `;
    if (q.options && q.options.length > 0) {
      detailHtml += `<div class="mb-md"><strong>Options:</strong><div style="margin-top:6px; display:grid; grid-template-columns:1fr 1fr; gap:6px;">${q.options.map((o, i) => `<div style="padding:6px 10px; background:rgba(255,255,255,0.02); border-radius:4px;"><strong>${String.fromCharCode(65 + i)})</strong> ${escapeHtml(o)}</div>`).join('')}</div></div>`;
    }
    if (q.correct_answer) {
      detailHtml += `
        <div class="mb-md"><strong>Correct / Model Answer:</strong>
          ${q.type === 'programming' ? `
            <pre style="padding:12px 14px; background:#0d1117; border:1px solid rgba(16,185,129,0.3); border-radius:6px; font-family:'JetBrains Mono', Consolas, monospace; font-size:0.88rem; white-space:pre; overflow-x:auto; line-height:1.5; color:#34d399; margin-top:6px;"><code>${escapeHtml(typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer, null, 2) : q.correct_answer)}</code></pre>
          ` : `
            <div style="padding:10px 14px; background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2); border-radius:6px; font-size:0.9rem; white-space:pre-wrap; color:var(--text-primary); margin-top:6px;">${escapeHtml(typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer, null, 2) : q.correct_answer)}</div>
          `}
        </div>
      `;
    }
    openModal(`Question Details #${qId}`, detailHtml);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editExistingQuestion(qId, examId) {
  try {
    const data = await api(`/api/admin/exams/${examId}/questions`);
    const q = data.questions.find(x => x.id === qId);
    if (!q) return;

    window.__editingQuestionOriginal = {
      type: q.type, marks: q.marks, difficulty: q.difficulty || 'medium',
      content: q.content, options: q.options ? [...q.options] : [], correct_answer: q.correct_answer || ''
    };

    const isMcq = q.type === 'mcq';
    const isProg = q.type === 'programming';

    openModal(`Edit Question #${qId}`, `
      <form id="edit-question-form-${qId}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="edit-q-type" onchange="toggleEditOptions(this.value)">
              <option value="mcq" ${q.type === 'mcq' ? 'selected' : ''}>MCQ</option>
              <option value="subjective" ${q.type === 'subjective' ? 'selected' : ''}>Subjective</option>
              <option value="programming" ${q.type === 'programming' ? 'selected' : ''}>Programming</option>
              <option value="oral_task" ${q.type === 'oral_task' ? 'selected' : ''}>Oral Task</option>
              <option value="writing_task" ${q.type === 'writing_task' ? 'selected' : ''}>Writing Task</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Marks</label>
            <input type="number" class="form-input" id="edit-q-marks" value="${q.marks}" min="0.5" step="0.5">
          </div>
          <div class="form-group">
            <label class="form-label">Difficulty</label>
            <select class="form-select" id="edit-q-difficulty">
              <option value="easy" ${q.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
              <option value="medium" ${!q.difficulty || q.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="hard" ${q.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Question Statement (Markdown & Code Supported)</label>
          <textarea class="form-textarea" id="edit-q-content" rows="6" style="line-height:1.5; font-size:0.92rem; tab-size:4;">${escapeHtml(q.content)}</textarea>
        </div>

        <!-- MCQ Options Section -->
        <div id="edit-q-mcq-section" style="${isMcq ? 'display:block' : 'display:none'}; background:rgba(255,255,255,0.02); padding:14px; border-radius:6px; border:1px solid var(--border-color); margin-bottom:16px;">
          <div class="form-group">
            <label class="form-label">Options (MCQ)</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
              <input type="text" class="form-input" id="edit-q-opt-0" placeholder="Option A" value="${q.options && q.options[0] ? escapeHtml(q.options[0]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-1" placeholder="Option B" value="${q.options && q.options[1] ? escapeHtml(q.options[1]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-2" placeholder="Option C" value="${q.options && q.options[2] ? escapeHtml(q.options[2]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-3" placeholder="Option D" value="${q.options && q.options[3] ? escapeHtml(q.options[3]) : ''}">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" style="color:var(--accent-emerald);">Correct Option</label>
            <select class="form-select" id="edit-q-correct" style="max-width:140px;">
              <option value="A" ${q.correct_answer === 'A' ? 'selected' : ''}>A</option>
              <option value="B" ${q.correct_answer === 'B' ? 'selected' : ''}>B</option>
              <option value="C" ${q.correct_answer === 'C' ? 'selected' : ''}>C</option>
              <option value="D" ${q.correct_answer === 'D' ? 'selected' : ''}>D</option>
            </select>
          </div>
        </div>

        <!-- Non-MCQ Model Answer Section -->
        <div id="edit-q-nonmcq-section" style="${!isMcq ? 'display:block' : 'display:none'}">
          <div class="form-group">
            <label class="form-label" style="color:var(--accent-emerald);">Model / Correct Answer / Reference Code (Press Tab to Indent)</label>
            <textarea class="form-textarea" id="edit-q-correct-text" rows="8" style="font-family:'JetBrains Mono', Consolas, monospace; font-size:0.88rem; line-height:1.5; tab-size:4; white-space:pre; border-color:rgba(16,185,129,0.3); background:#0d1117; color:#34d399;">${escapeHtml(typeof q.correct_answer === 'object' ? JSON.stringify(q.correct_answer, null, 2) : (q.correct_answer || ''))}</textarea>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
          <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="saveEditedQuestion(${q.id}, ${examId})">Save Changes</button>
        </div>
      </form>
    `);

    setupCodeTextarea(document.getElementById('edit-q-correct-text'));
    setupCodeTextarea(document.getElementById('edit-q-content'));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleEditOptions(type) {
  document.getElementById('edit-q-mcq-section').style.display    = type === 'mcq' ? 'block' : 'none';
  document.getElementById('edit-q-nonmcq-section').style.display = type !== 'mcq' ? 'block' : 'none';
  const textarea = document.getElementById('edit-q-correct-text');
  if (textarea) textarea.style.fontFamily = type === 'programming' ? 'monospace' : 'inherit';
}

async function saveEditedQuestion(qId, examId) {
  try {
    const type       = document.getElementById('edit-q-type').value;
    const marks      = parseFloat(document.getElementById('edit-q-marks').value) || 1;
    const difficulty = document.getElementById('edit-q-difficulty').value;
    const content    = document.getElementById('edit-q-content').value.trim();

    if (!content) return showToast('Question statement cannot be empty', 'warning');

    let opts = [], correct = '';
    if (type === 'mcq') {
      opts = [
        document.getElementById('edit-q-opt-0').value.trim(),
        document.getElementById('edit-q-opt-1').value.trim(),
        document.getElementById('edit-q-opt-2').value.trim(),
        document.getElementById('edit-q-opt-3').value.trim(),
      ].filter(o => o !== '');
      if (opts.length < 2) return showToast('At least 2 options required for MCQ', 'warning');
      correct = document.getElementById('edit-q-correct').value;
    } else {
      correct = document.getElementById('edit-q-correct-text').value.trim();
    }

    const payload = { type, marks, difficulty, content, options: opts, correct_answer: correct };

    await api(`/api/admin/questions/${qId}`, {
      method: 'PUT',
      body: payload,
    });

    closeModal();
    showToast('Question updated successfully!', 'success');
    loadExamQuestions(examId, true);
  } catch (err) {
    showToast('Failed to update question: ' + err.message, 'error');
  }
}

async function deleteQuestion(qId, examId) {
  if (!confirm('Delete this question?')) return;
  try {
    const res = await api(`/api/admin/questions/${qId}`, { method: 'DELETE' });
    showToast(res.message || 'Question deleted', 'success');
    loadExamQuestions(examId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleAllQuestions(checkbox) {
  document.querySelectorAll('.question-checkbox').forEach(cb => cb.checked = checkbox.checked);
  updateQuestionBulkActionBar();
}

function updateQuestionBulkActionBar() {
  const selectedCount   = document.querySelectorAll('.question-checkbox:checked').length;
  const actionBar       = document.getElementById('q-bulk-action-bar');
  const countSpan       = document.getElementById('q-selected-count');
  const selectAll       = document.getElementById('selectAllQuestions');
  const totalCheckboxes = document.querySelectorAll('.question-checkbox').length;

  if (selectedCount > 0) { actionBar.style.display = 'flex'; countSpan.textContent = selectedCount; }
  else { actionBar.style.display = 'none'; }
  if (selectAll && totalCheckboxes > 0) selectAll.checked = selectedCount === totalCheckboxes;
}

function getSelectedQuestionIds() {
  return Array.from(document.querySelectorAll('.question-checkbox:checked'))
    .map(cb => parseInt(cb.value, 10))
    .filter(id => !isNaN(id));
}

async function bulkDeleteQuestions(examId) {
  const qIds = getSelectedQuestionIds();
  if (qIds.length === 0) {
    showToast('No questions selected', 'warning');
    return;
  }
  if (!confirm(`Are you sure you want to delete ${qIds.length} question(s)?`)) return;

  try {
    const res = await api(`/api/admin/exams/${examId}/questions/bulk-delete`, {
      method: 'POST',
      body: { question_ids: qIds }
    });
    showToast(res.message || `Deleted ${qIds.length} questions`, 'success');
    loadExamQuestions(examId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.generateAIQuestions = generateAIQuestions;
window.saveGeneratedQuestions = saveGeneratedQuestions;
window.uploadQuestions = uploadQuestions;
window.viewQuestion = viewQuestion;
window.editExistingQuestion = editExistingQuestion;
window.toggleEditOptions = toggleEditOptions;
window.saveEditedQuestion = saveEditedQuestion;
window.deleteQuestion = deleteQuestion;
window.toggleAllQuestions = toggleAllQuestions;
window.updateQuestionBulkActionBar = updateQuestionBulkActionBar;
window.bulkDeleteQuestions = bulkDeleteQuestions;

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: SCORE REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

let currentScoreBatchFilter = 'all';

function renderComponentScoreCell(studentId, componentKey, componentTitle, scoreVal, examList) {
  const ddId = `score_dd_${studentId}_${componentKey}`;
  const exams = Array.isArray(examList) ? examList : [];

  return `
    <td class="font-mono text-right" style="position:relative;">
      <div style="display:inline-block; position:relative;">
        <button type="button" class="btn btn-sm btn-ghost score-breakdown-btn"
          onclick="event.stopPropagation(); toggleScoreDropdown('${ddId}')"
          title="Click to view ${componentTitle} exams list"
          style="display:inline-flex; align-items:center; gap:4px; font-family:monospace; padding:3px 8px; border-radius:4px; font-weight:600; color:var(--text-primary); cursor:pointer; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08);">
          <span>${scoreVal}</span>
          <i class="ph ph-caret-down" style="font-size:0.75rem; color:var(--text-muted);"></i>
        </button>
        <div id="${ddId}" class="score-dropdown-menu" style="display:none; position:absolute; right:0; top:calc(100% + 4px); background:#1e293b; border:1px solid #334155; border-radius:8px; box-shadow:0 12px 28px -4px rgba(0,0,0,0.6); z-index:999; min-width:240px; max-width:320px; text-align:left; padding:8px 0; font-family:sans-serif;">
          <div style="padding:6px 12px; font-size:0.78rem; font-weight:700; text-transform:uppercase; color:#94a3b8; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
            <span>${componentTitle}</span>
            <span style="color:#38bdf8;">${scoreVal} / 500</span>
          </div>
          <div style="max-height:220px; overflow-y:auto; padding:4px 0;">
            ${exams.length > 0 ? exams.map(e => `
              <div style="padding:6px 12px; font-size:0.8rem; display:flex; flex-direction:column; border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="color:#f1f5f9; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:160px;">${escapeHtml(e.exam_title || `Exam #${e.exam_number}`)}</span>
                  <span style="font-family:monospace; font-weight:700; color:${e.score > 0 ? '#34d399' : '#94a3b8'};">${e.score} / ${e.total_marks}</span>
                </div>
                ${e.remarks ? `<div style="font-size:0.72rem; color:#f87171; margin-top:2px; line-height:1.2;">⚠️ ${escapeHtml(e.remarks)}</div>` : ''}
              </div>
            `).join('') : '<div style="padding:10px 12px; font-size:0.78rem; color:#64748b; text-align:center;">No exams attempted</div>'}
          </div>
        </div>
      </div>
    </td>
  `;
}

window.toggleScoreDropdown = function(ddId) {
  const target = document.getElementById(ddId);
  if (!target) return;
  const isVisible = target.style.display === 'block';

  // Close all open dropdowns
  document.querySelectorAll('.score-dropdown-menu').forEach(el => {
    el.style.display = 'none';
  });

  if (!isVisible) {
    target.style.display = 'block';
  }
};

document.addEventListener('click', (e) => {
  if (!e.target.closest('.score-breakdown-btn') && !e.target.closest('.score-dropdown-menu')) {
    document.querySelectorAll('.score-dropdown-menu').forEach(el => {
      el.style.display = 'none';
    });
  }
});

async function renderScoreReports(isBackground = false, batchId = currentScoreBatchFilter) {
  currentScoreBatchFilter = batchId;
  const main = document.getElementById('main-content');
  const cacheKey = `#/admin/scores?batch=${batchId}`;

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderScoreReports(true, batchId);
    return;
  }

  if (!isBackground && !main.querySelector('.data-table')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const url = batchId && batchId !== 'all' ? `/api/scores/all?batch_id=${batchId}` : '/api/scores/all';
    const data = await api(url);
    const scoresList = (data && Array.isArray(data.scores)) ? data.scores : [];
    const batches = (data && Array.isArray(data.batches)) ? data.batches : [];
    const s = data?.summary;

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-trend-up"></i> Scores & Reports</h1>
          <p class="page-subtitle">Composite scoring: S = 3T + 3L + 2O + 2W (Max: 5000) — Batch-wise analytics</p>
        </div>
        <div class="btn-group" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <select id="score-batch-select" class="form-select" onchange="filterScoresByBatch(this.value)" style="min-width:180px; padding:7px 12px; font-weight:600;">
            <option value="all" ${batchId === 'all' ? 'selected' : ''}>👥 All Batches</option>
            ${batches.map(b => `<option value="${b.id}" ${String(batchId) === String(b.id) ? 'selected' : ''}>🏷️ ${escapeHtml(b.name)}</option>`).join('')}
            <option value="unassigned" ${batchId === 'unassigned' ? 'selected' : ''}>⚠️ Unassigned Students</option>
          </select>
          <button class="btn btn-outline" onclick="recomputeAll()"><i class="ph ph-arrows-clockwise"></i> Recompute All</button>
          <a href="/api/scores/export${batchId && batchId !== 'all' ? `?batch_id=${batchId}` : ''}" class="btn btn-success" target="_blank"><i class="ph ph-download-simple"></i> Export CSV</a>
        </div>
      </div>

      ${s ? `
        <div class="stats-grid">
          <div class="stat-card indigo">
            <div class="stat-icon indigo"><i class="ph ph-users"></i></div>
            <div class="stat-value">${s.total_students || 0}</div>
            <div class="stat-label">${batchId && batchId !== 'all' ? 'Batch Students' : 'Total Students'}</div>
          </div>
          <div class="stat-card emerald">
            <div class="stat-icon emerald"><i class="ph ph-chart-bar"></i></div>
            <div class="stat-value">${s.avg_score || 0}</div>
            <div class="stat-label">Average Score</div>
          </div>
          <div class="stat-card cyan">
            <div class="stat-icon cyan">🏆</div>
            <div class="stat-value">${s.level_3_count || 0}</div>
            <div class="stat-label">Level 3 (Advanced)</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-icon amber"><i class="ph ph-trend-up"></i></div>
            <div class="stat-value">${s.level_2_count || 0}</div>
            <div class="stat-label">Level 2 (Intermediate)</div>
          </div>
          <div class="stat-card rose">
            <div class="stat-icon rose">📉</div>
            <div class="stat-value">${s.level_1_count || 0}</div>
            <div class="stat-label">Level 1 (Foundational)</div>
          </div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Student Scores (${scoresList.length} ${batchId && batchId !== 'all' ? 'in selected batch' : 'total'})</h3>
          <div class="search-bar">
            <span class="search-icon"><i class="ph ph-magnifying-glass"></i></span>
            <input type="text" class="form-input" placeholder="Search student, roll no, or batch..." id="score-search">
          </div>
        </div>
        <div class="table-container" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll No</th>
                <th>Batch</th>
                <th style="text-align:right;">Tech (/500)</th>
                <th style="text-align:right;">Apt (/500)</th>
                <th style="text-align:right;">Oral (/500)</th>
                <th style="text-align:right;">Written (/500)</th>
                <th style="text-align:right;">Composite (/5000)</th>
                <th>Level</th>
                <th style="text-align:right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${scoresList.map(sc => {
                const eb = sc.exam_breakdown || {};
                return `
                <tr onclick="viewStudentScoreDetails(${sc.student_id})" style="cursor:pointer;" title="Click to view detailed student score breakdown & AI analysis">
                  <td style="font-weight:600; color:var(--accent-light);">${escapeHtml(sc.name)}</td>
                  <td>${escapeHtml(sc.roll_no || '—')}</td>
                  <td>
                    ${sc.batch_name 
                      ? `<span class="badge badge-primary" style="font-size:0.75rem;">${escapeHtml(sc.batch_name)}</span>`
                      : `<span class="badge" style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:0.75rem;">Unassigned</span>`
                    }
                  </td>
                  ${renderComponentScoreCell(sc.student_id, 'tech', 'Technical', sc.t_score, eb.technical)}
                  ${renderComponentScoreCell(sc.student_id, 'apt', 'Logical & Aptitude', sc.l_score, eb.aptitude)}
                  ${renderComponentScoreCell(sc.student_id, 'oral', 'Oral English', sc.o_score, eb.oral_english)}
                  ${renderComponentScoreCell(sc.student_id, 'written', 'Written English', sc.w_score, eb.written_english)}
                  <td class="font-mono text-right" style="font-weight:700; color:var(--text-primary);">${sc.total_score}</td>
                  <td>${levelBadge(sc.level)}</td>
                  <td style="text-align:right;" onclick="event.stopPropagation()">
                    <button class="btn btn-action btn-sm" onclick="editStudent(${sc.student_id})" title="Reset Exam(s)"><i class="ph ph-arrows-clockwise"></i></button>
                  </td>
                </tr>
              `}).join('')}
              ${scoresList.length === 0 ? '<tr><td colspan="10" class="text-center text-muted" style="padding:32px;">No student records found for this batch.</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;

    const searchInput = document.getElementById('score-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        document.querySelectorAll('.data-table tbody tr').forEach((tr) => {
          const text = tr.textContent.toLowerCase();
          tr.style.display = text.includes(query) ? '' : 'none';
        });
      });
    }
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

window.filterScoresByBatch = function(batchId) {
  renderScoreReports(false, batchId);
};

window.viewStudentScoreDetails = async function(studentId) {
  try {
    const data = await api(`/api/scores/student/${studentId}`);
    const s = data.student;
    const c = data.composite || {};
    const compTotals = data.componentTotals || [];
    const exams = data.examBreakdown || [];
    const responses = data.responses || [];

    const contentHtml = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-surface); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color);">
          <div>
            <h4 style="margin: 0 0 2px 0; font-size: 1.1rem; color: var(--text-primary);">${escapeHtml(s.name)}</h4>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Roll No: ${escapeHtml(s.roll_no || 'N/A')} | Batch: <span style="color:var(--accent-light); font-weight:600;">${escapeHtml(s.batch_name || 'Unassigned')}</span> | ${escapeHtml(s.email)}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.3rem; font-weight: 800; color: var(--accent-light);">${c.total_score || 0} / 5000</div>
            <div>${levelBadge(c.level)}</div>
          </div>
        </div>

        <h4 style="margin: 8px 0 4px; font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Component Totals</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
          ${compTotals.map(ct => `
            <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color);">
              <div style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">${escapeHtml(ct.display_name)}</div>
              <div style="font-size: 1.1rem; font-weight: 700; margin-top: 2px;">${ct.total_marks} <span style="font-size: 0.75rem; color: var(--text-muted);">/ ${ct.max_raw_score}</span></div>
            </div>
          `).join('')}
        </div>

        <h4 style="margin: 12px 0 4px; font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Exam Performance Breakdown</h4>
        <div style="overflow-x: auto;">
          <table class="data-table" style="font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Exam Title</th>
                <th>Component</th>
                <th>Status</th>
                <th style="text-align: right;">Score</th>
                <th style="text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${exams.map(e => `
                <tr>
                  <td style="font-weight: 600;">${escapeHtml(e.title)}</td>
                  <td>${escapeHtml(e.component_name)}</td>
                  <td>${statusBadge(e.session_status || 'not_attempted')}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: 700;">${e.marks_obtained} / ${e.total_marks}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${responses.length > 0 ? `
          <h4 style="margin: 12px 0 4px; font-size: 0.95rem; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">Submitted Answers & AI Detection Analysis</h4>
          <div style="display: flex; flex-direction: column; gap: 12px; max-height: 280px; overflow-y: auto; padding-right: 4px;">
            ${responses.map((r, i) => `
              <div style="background: var(--bg-surface); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.88rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                  <strong>Q${i + 1}: ${escapeHtml(r.question_content ? r.question_content.substring(0, 70) + '...' : '')}</strong>
                  <span class="badge badge-info">${r.marks_awarded !== null ? r.marks_awarded : 'Pending'} / ${r.max_marks} marks</span>
                </div>
                <div style="color: var(--text-muted); font-size: 0.82rem; margin-bottom: 4px;">Answer:</div>
                <div style="background: var(--bg-body); padding: 6px 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; font-size: 0.82rem;">${escapeHtml(r.answer_data || 'No answer')}</div>
                ${r.ai_analysis ? `
                  <div style="margin-top: 6px; font-size: 0.78rem; color: ${r.ai_analysis.isAiGenerated ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight: 600;">
                    ${escapeHtml(r.ai_analysis.note)}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;

    openModal(`Score Report: ${s.name}`, contentHtml, '<button class="btn btn-secondary" onclick="closeModal()">Close</button>');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function recomputeAll() {
  try {
    showToast('Recomputing all scores...', 'info');
    const data = await api('/api/scores/recompute', { method: 'POST' });
    showToast(data.message, 'success');
    renderScoreReports();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH: admin (targeted stat patch, 2.3)
// ═══════════════════════════════════════════════════════════════════════════════

setInterval(() => {
  if (!document.querySelector('.modal.active') && App.user?.role === 'admin') {
    const studentsTbody = document.getElementById('students-tbody');
    const activeInput   = document.activeElement;
    
    // Only refresh if no checkboxes are selected and we aren't typing in the search box
    const hasSelection = document.querySelectorAll('.student-checkbox:checked').length > 0;

    if (studentsTbody && activeInput !== document.getElementById('student-search') && !hasSelection) {
      fetchFilteredStudents();
    } else if (document.querySelector('[data-stat="students"]')) {
      // On dashboard: patch only stat values, no full rebuild
      patchAdminDashboardStats();
    }
  }
}, 15000);
