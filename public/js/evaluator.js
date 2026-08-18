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

  if (!isBackground && !main.querySelector('.evaluator-group')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/evaluator/queue');

    // Group by student then by exam
    const studentGroups = {};
    data.responses.forEach(r => {
      const sKey = r.student_id;
      if (!studentGroups[sKey]) {
        studentGroups[sKey] = {
          student_id: r.student_id,
          student_name: r.student_name,
          roll_no: r.roll_no,
          exams: {}
        };
      }
      
      const eKey = r.exam_id;
      if (!studentGroups[sKey].exams[eKey]) {
        studentGroups[sKey].exams[eKey] = {
          exam_id: r.exam_id,
          exam_title: r.exam_title,
          component_name: r.component_name,
          responses: []
        };
      }
      studentGroups[sKey].exams[eKey].responses.push(r);
    });

    const students = Object.values(studentGroups);

    let html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-check-circle"></i> Evaluator Queue</h1>
          <p class="page-subtitle">${data.total} responses pending review across ${students.length} students</p>
        </div>
      </div>
    `;

    if (students.length > 0) {
      html += `<div class="evaluator-groups">`;
      
      students.forEach(student => {
        html += `
          <div class="card mb-sm evaluator-group" style="overflow: hidden; border: 1px solid var(--border-color);">
            <div class="group-header" style="padding: 16px; cursor: pointer; background: var(--bg-surface); display: flex; justify-content: space-between; align-items: center;" onclick="toggleAccordion('student-${student.student_id}')">
              <div>
                <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-primary);"><i class="ph ph-user"></i> ${student.student_name}</h3>
                <span class="text-sm text-muted">${student.roll_no ? student.roll_no : 'No Roll Number'}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="badge badge-info">${Object.values(student.exams).reduce((acc, ex) => acc + ex.responses.length, 0)} pending responses</span>
                <i class="ph ph-caret-down" id="icon-student-${student.student_id}" style="transition: transform 0.2s;"></i>
              </div>
            </div>
            
            <div id="student-${student.student_id}" class="group-content" style="display: none; border-top: 1px solid var(--border-color); background: var(--bg-body);">
        `;

        Object.values(student.exams).forEach(exam => {
          html += `
              <div id="student-${student.student_id}-exam-${exam.exam_id}" class="exam-section" style="padding: 16px; border-bottom: 1px dashed var(--border-color);">
                <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                  <h4 style="margin: 0; color: var(--text-primary);"><i class="ph ph-file-text"></i> ${exam.exam_title} <span class="text-muted" style="font-size: 0.9em; font-weight: normal;">(${exam.component_name})</span></h4>
                  <button class="btn btn-success btn-sm" onclick="bulkSubmitScores(${student.student_id}, ${exam.exam_id})" id="btn-save-${student.student_id}-${exam.exam_id}">
                    <i class="ph ph-check-circle"></i> Save Scores
                  </button>
                </div>
                
                <div class="responses-grid" style="display: flex; flex-direction: column; gap: 24px;">
          `;

          exam.responses.forEach(r => {
            html += `
                  <div class="response-card card" style="padding: 16px; background: var(--bg-surface); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                      <div style="display:flex; align-items:center; gap:8px;">
                        <span class="badge badge-info">${r.question_type}</span>
                        <span class="badge badge-neutral">${r.max_marks} marks max</span>
                      </div>
                      ${r.marks_awarded !== null ? `<span class="badge badge-success">Scored: ${r.marks_awarded}/${r.max_marks}</span>` : statusBadge('pending_review')}
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                      <div class="text-sm text-muted" style="margin-bottom: 4px; font-weight: 500;">Question:</div>
                      <div style="color: var(--text-primary); padding: 8px 12px; background: rgba(0,0,0,0.02); border-radius: 6px;">${escapeHtml(r.question_content)}</div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                      <div class="text-sm text-muted" style="margin-bottom: 4px; font-weight: 500;">Student's Answer:</div>
                      <div style="color: var(--text-primary); padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; white-space: pre-wrap; font-family: ${r.question_type === 'programming' ? 'monospace' : 'inherit'}; background: var(--bg-body); min-height: 40px;">${escapeHtml(r.answer_data || 'No answer provided')}</div>
                    </div>
                    
                    ${r.correct_answer ? `
                    <div style="margin-bottom: 16px;">
                      <div class="text-sm" style="color: var(--accent-emerald); margin-bottom: 4px; font-weight: 500;">Model Answer:</div>
                      <div style="color: var(--text-secondary); padding: 12px; border: 1px solid rgba(16,185,129,0.2); border-radius: 6px; white-space: pre-wrap; background: rgba(16,185,129,0.02);">${escapeHtml(r.correct_answer)}</div>
                    </div>
                    ` : ''}
                    
                    <div class="form-row" style="margin-bottom: 0; align-items: flex-start;">
                      <div class="form-group" style="flex: 0 0 120px; margin-bottom: 0;">
                        <label class="form-label" style="font-size: 0.85rem;">Marks (0-${r.max_marks})</label>
                        <input type="number" class="form-input score-input" data-response-id="${r.id}" min="0" max="${r.max_marks}" value="${r.marks_awarded || 0}" step="0.5" style="font-weight: 600;">
                      </div>
                      <div class="form-group" style="flex: 1; margin-bottom: 0;">
                        <label class="form-label" style="font-size: 0.85rem;">Feedback (Optional)</label>
                        <textarea class="form-textarea feedback-input" data-response-id="${r.id}" rows="1" placeholder="Provide constructive feedback...">${r.feedback || ''}</textarea>
                      </div>
                    </div>
                  </div>
            `;
          });

          html += `
                </div>
              </div>
          `;
        });

        html += `
            </div>
          </div>
        `;
      });
      html += `</div>`;
    } else {
      html += `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon"><i class="ph ph-check-circle"></i></div>
            <h3>All caught up!</h3>
            <p>No responses pending review</p>
          </div>
        </div>
      `;
    }

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

// ─── DOM HELPERS ────────────────────────────────────────────────────────────

window.toggleAccordion = function(id) {
  const el = document.getElementById(id);
  const icon = document.getElementById('icon-' + id);
  if (el.style.display === 'none' || !el.style.display) {
    el.style.display = 'block';
    if (icon) icon.style.transform = 'rotate(180deg)';
  } else {
    el.style.display = 'none';
    if (icon) icon.style.transform = 'rotate(0deg)';
  }
};

window.bulkSubmitScores = async function(studentId, examId) {
  const container = document.getElementById(`student-\${studentId}-exam-\${examId}`);
  if (!container) return;
  
  // Find the button and show loading state
  const btn = document.getElementById(`btn-save-${studentId}-${examId}`);
  const originalText = btn.innerHTML;
  btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Saving...`;
  btn.disabled = true;
  
  try {
    const scoreInputs = container.querySelectorAll(\`.score-input\`);
    
    // Build array of promises for concurrent submission
    const promises = [];
    
    scoreInputs.forEach(input => {
      const responseId = input.getAttribute('data-response-id');
      const marks = parseFloat(input.value);
      
      const feedbackInput = container.querySelector(\`.feedback-input[data-response-id="\${responseId}"]\`);
      const feedback = feedbackInput ? feedbackInput.value : '';
      
      if (!isNaN(marks)) {
        promises.push(
          api(`/api/evaluator/responses/\${responseId}/score`, {
            method: 'POST',
            body: { marks_awarded: marks, feedback }
          })
        );
      }
    });
    
    await Promise.all(promises);
    showToast('Scores saved successfully', 'success');
    renderEvaluatorQueue(); // Refresh queue
  } catch (err) {
    showToast('Error saving scores: ' + err.message, 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
};


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
