/**
 * evaluator.js — Composite Assessment System
 * ════════════════════════════════════════════
 * Evaluator role module. Loaded for both 'evaluator' and 'admin' roles.
 * Depends on: core.js (App, api, showToast, openModal, closeModal,
 *             statusBadge, escapeHtml, ROUTES)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

ROUTES['#/evaluator/queue'] = renderEvaluatorQueue;
ROUTES['#/evaluator/stats'] = renderEvaluatorStats;

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATOR QUEUE (shared by admin + evaluator roles)
// ═══════════════════════════════════════════════════════════════════════════════

async function renderEvaluatorQueue(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/evaluator/queue';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderEvaluatorQueue(true);
    return;
  }

  if (!isBackground && !main.querySelector('.table-container')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/evaluator/queue');

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-check-circle"></i> Evaluator Queue</h1>
          <p class="page-subtitle">${data.total} responses pending review</p>
        </div>
      </div>

      ${data.responses.length > 0 ? `
        <div class="card">
          <div class="table-container" style="border:none;">
            <table class="data-table">
              <thead>
                <tr><th>Student</th><th>Exam</th><th>Component</th><th>Type</th><th>Max Marks</th><th>Status</th><th>Action</th></tr>
              </thead>
              <tbody>
                ${data.responses.map(r => `
                  <tr>
                    <td style="font-weight:600; color:var(--text-primary);">${r.student_name}</td>
                    <td>${r.exam_title}</td>
                    <td>${r.component_name}</td>
                    <td><span class="badge badge-info">${r.question_type}</span></td>
                    <td class="font-mono">${r.max_marks}</td>
                    <td>${r.marks_awarded !== null ? `<span class="badge badge-success">${r.marks_awarded}/${r.max_marks}</span>` : statusBadge('pending_review')}</td>
                    <td>
                      <button class="btn btn-primary btn-sm" onclick="openScoringModal(${r.id})">
                        ${r.marks_awarded !== null ? '<i class="ph ph-pencil-simple"></i> Re-score' : '<i class="ph ph-file-text"></i> Score'}
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon"><i class="ph ph-check-circle"></i></div>
            <h3>All caught up!</h3>
            <p>No responses pending review</p>
          </div>
        </div>
      `}
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

async function openScoringModal(responseId) {
  try {
    const data = await api(`/api/evaluator/responses/${responseId}`);
    const r = data.response;

    openModal(`Score Response — ${r.student_name}`, `
      <div class="mb-md">
        <span class="badge badge-info">${r.question_type}</span>
        <span class="badge badge-neutral">${r.max_marks} marks max</span>
        <span class="text-sm text-muted" style="margin-left:8px;">${r.exam_title}</span>
      </div>

      <div class="card mb-md" style="padding:var(--sp-md);">
        <div class="form-label">Question</div>
        <p style="color:var(--text-primary);">${escapeHtml(r.question_content)}</p>
      </div>

      <div class="card mb-md" style="padding:var(--sp-md);">
        <div class="form-label">Student's Answer</div>
        <p style="color:var(--text-primary); white-space:pre-wrap; font-family:${r.question_type === 'programming' ? 'monospace' : 'inherit'};">${escapeHtml(r.answer_data || 'No answer provided')}</p>
      </div>

      ${r.correct_answer ? `
        <div class="card mb-md" style="padding:var(--sp-md); border-color:rgba(16,185,129,0.3);">
          <div class="form-label" style="color:var(--accent-emerald);">Model Answer</div>
          <p style="color:var(--text-secondary); white-space:pre-wrap;">${escapeHtml(r.correct_answer)}</p>
        </div>
      ` : ''}

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Marks Awarded (0–${r.max_marks})</label>
          <input type="number" class="form-input" id="score-marks" min="0" max="${r.max_marks}" value="${r.marks_awarded || 0}" step="0.5">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Feedback (optional)</label>
        <textarea class="form-textarea" id="score-feedback" rows="2">${r.feedback || ''}</textarea>
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="submitScore(${responseId})"><i class="ph ph-check-circle"></i> Submit Score</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitScore(responseId) {
  try {
    await api(`/api/evaluator/responses/${responseId}/score`, {
      method: 'POST',
      body: {
        marks_awarded: parseFloat(document.getElementById('score-marks').value),
        feedback: document.getElementById('score-feedback').value,
      },
    });
    closeModal();
    showToast('Score submitted', 'success');
    // Re-render whichever queue we're on
    if (window.location.hash.includes('evaluator')) renderEvaluatorQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVALUATOR STATS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderEvaluatorStats(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/evaluator/stats';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderEvaluatorStats(true);
    return;
  }

  if (!isBackground && !main.querySelector('.data-table')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/evaluator/stats');

    const html = `
      <div class="page-header">
        <div><h1><i class="ph ph-chart-bar"></i> Evaluator Stats</h1></div>
      </div>
      <div class="card">
        <div class="table-container" style="border:none;">
          <table class="data-table">
            <thead><tr><th>Component</th><th>Type</th><th>Pending</th><th>Graded</th><th>Total</th></tr></thead>
            <tbody>
              ${data.stats.map(s => `
                <tr>
                  <td style="font-weight:600;">${s.component_name}</td>
                  <td><span class="badge badge-info">${s.question_type}</span></td>
                  <td class="font-mono">${s.pending}</td>
                  <td class="font-mono">${s.graded}</td>
                  <td class="font-mono">${s.total}</td>
                </tr>
              `).join('')}
              ${data.stats.length === 0 ? '<tr><td colspan="5" class="text-center text-muted">No data yet</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}
