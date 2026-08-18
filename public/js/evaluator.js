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

let evaluatorQueueState = {
  rawResponses: [],
  searchQuery: '',
  statusFilter: 'all',
  openStudents: new Set()
};

async function renderEvaluatorQueue(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/evaluator/queue';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderEvaluatorQueue(true);
    return;
  }

  if (!isBackground && !main.querySelector('.evaluator-container')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/evaluator/queue');
    evaluatorQueueState.rawResponses = data.responses || [];

    const html = buildEvaluatorQueueHtml();
    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;

    attachEvaluatorQueueListeners();
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function buildEvaluatorQueueHtml() {
  const { rawResponses, searchQuery, statusFilter } = evaluatorQueueState;

  // Filter responses
  let filtered = rawResponses;
  if (statusFilter === 'pending') {
    filtered = filtered.filter(r => r.marks_awarded === null || r.status !== 'graded');
  } else if (statusFilter === 'graded') {
    filtered = filtered.filter(r => r.marks_awarded !== null && r.status === 'graded');
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(r => 
      (r.student_name && r.student_name.toLowerCase().includes(q)) ||
      (r.roll_no && r.roll_no.toLowerCase().includes(q)) ||
      (r.exam_title && r.exam_title.toLowerCase().includes(q))
    );
  }

  // Group by student then by exam
  const studentGroups = {};
  filtered.forEach(r => {
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
  const totalPending = rawResponses.filter(r => r.marks_awarded === null).length;
  const totalGraded = rawResponses.filter(r => r.marks_awarded !== null).length;

  let html = `
    <div class="evaluator-container">
      <div class="page-header">
        <div>
          <h1><i class="ph ph-check-circle"></i> Evaluator Queue</h1>
          <p class="page-subtitle">Score & review submitted student responses across all exams</p>
        </div>
      </div>

      <!-- Stats Bar & Filter Controls -->
      <div class="card mb-md" style="padding: 16px;">
        <div class="flex justify-between items-center flex-wrap gap-md">
          <div class="flex items-center gap-sm flex-wrap">
            <button class="btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-outline'}" onclick="setEvaluatorFilter('all')">
              All (${rawResponses.length})
            </button>
            <button class="btn btn-sm ${statusFilter === 'pending' ? 'btn-warning' : 'btn-outline'}" onclick="setEvaluatorFilter('pending')">
              <i class="ph ph-clock"></i> Pending (${totalPending})
            </button>
            <button class="btn btn-sm ${statusFilter === 'graded' ? 'btn-success' : 'btn-outline'}" onclick="setEvaluatorFilter('graded')">
              <i class="ph ph-check"></i> Graded (${totalGraded})
            </button>
          </div>

          <div style="min-width: 260px; position: relative;">
            <input type="text" id="evaluator-search-input" class="form-input" placeholder="Search student or roll no..." value="${escapeHtml(searchQuery)}" style="padding-left: 36px;">
            <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted);"></i>
          </div>
        </div>
      </div>
  `;

  if (students.length > 0) {
    html += `<div class="evaluator-groups" style="display: flex; flex-direction: column; gap: 12px;">`;
    
    students.forEach(student => {
      const allStudentResponses = Object.values(student.exams).flatMap(ex => ex.responses);
      const studentPendingCount = allStudentResponses.filter(r => r.marks_awarded === null).length;
      const isOpen = evaluatorQueueState.openStudents.has(String(student.student_id));

      html += `
        <div class="card evaluator-group" style="padding: 0; overflow: hidden; border: 1px solid var(--border-color); transition: border-color 0.2s;">
          <!-- Accordion Header -->
          <div class="group-header" 
               style="padding: 16px 20px; cursor: pointer; background: var(--bg-surface); display: flex; justify-content: space-between; align-items: center; user-select: none;"
               onclick="toggleStudentAccordion(${student.student_id})">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div style="width: 38px; height: 38px; border-radius: 50%; background: var(--gradient-primary); display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-size: 1rem;">
                ${(student.student_name || 'S').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style="margin: 0; font-size: 1.05rem; font-weight: 600; color: var(--text-primary);">
                  ${escapeHtml(student.student_name)}
                </h3>
                <div class="text-sm text-muted" style="margin-top: 2px;">
                  <span class="font-mono">${student.roll_no ? escapeHtml(student.roll_no) : 'No Roll No'}</span>
                  <span style="margin: 0 6px;">•</span>
                  <span>${Object.keys(student.exams).length} Exam${Object.keys(student.exams).length > 1 ? 's' : ''} (${allStudentResponses.length} Question${allStudentResponses.length > 1 ? 's' : ''})</span>
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
              ${studentPendingCount > 0 
                ? `<span class="badge badge-warning"><i class="ph ph-hourglass"></i> ${studentPendingCount} Pending</span>`
                : `<span class="badge badge-success"><i class="ph ph-check-circle"></i> All Scored</span>`
              }
              <button class="btn btn-outline btn-sm" style="pointer-events: none; padding: 4px 8px;">
                <i class="ph ph-caret-down" id="icon-student-${student.student_id}" style="transition: transform 0.2s; ${isOpen ? 'transform: rotate(180deg);' : ''}"></i>
              </button>
            </div>
          </div>
          
          <!-- Accordion Body -->
          <div id="student-${student.student_id}" class="group-content" style="display: ${isOpen ? 'block' : 'none'}; border-top: 1px solid var(--border-color); background: var(--bg-body); padding: 16px 20px;">
      `;

      Object.values(student.exams).forEach(exam => {
        const examPending = exam.responses.filter(r => r.marks_awarded === null).length;

        html += `
            <div id="student-${student.student_id}-exam-${exam.exam_id}" class="exam-section mb-lg" style="background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-color); padding: 18px; margin-bottom: 20px;">
              <div style="margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                <div>
                  <h4 style="margin: 0; font-size: 1.05rem; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                    <i class="ph ph-file-text" style="color: var(--accent-indigo);"></i>
                    ${escapeHtml(exam.exam_title)}
                    <span class="badge badge-info" style="font-weight: normal; font-size: 0.75rem;">${escapeHtml(exam.component_name)}</span>
                  </h4>
                  <span class="text-sm text-muted">${exam.responses.length} Question${exam.responses.length > 1 ? 's' : ''} (${examPending} pending review)</span>
                </div>
                
                <button class="btn btn-success btn-sm" onclick="bulkSubmitScores(${student.student_id}, ${exam.exam_id})" id="btn-save-${student.student_id}-${exam.exam_id}">
                  <i class="ph ph-check-circle"></i> Save All Scores for Exam
                </button>
              </div>
              
              <div class="responses-grid" style="display: flex; flex-direction: column; gap: 20px;">
        `;

        exam.responses.forEach((r, idx) => {
          const isGraded = r.marks_awarded !== null;
          const currentMarks = isGraded ? r.marks_awarded : '';

          html += `
                <div class="response-card" id="response-card-${r.id}" style="padding: 16px; background: var(--bg-body); border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; font-size: 0.9rem; color: var(--text-muted);">Q${idx + 1}</span>
                      <span class="badge badge-info">${escapeHtml(r.question_type || 'question')}</span>
                      <span class="badge badge-neutral">${r.max_marks} marks max</span>
                    </div>
                    <div id="status-badge-${r.id}">
                      ${isGraded 
                        ? `<span class="badge badge-success"><i class="ph ph-check"></i> Scored: ${r.marks_awarded} / ${r.max_marks}</span>` 
                        : `<span class="badge badge-warning"><i class="ph ph-clock"></i> Pending Review</span>`
                      }
                    </div>
                  </div>
                  
                  <!-- Question Content -->
                  <div style="margin-bottom: 14px;">
                    <div class="text-sm text-muted" style="margin-bottom: 4px; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Question Statement</div>
                    <div style="color: var(--text-primary); font-size: 0.95rem; line-height: 1.5; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                      ${escapeHtml(r.question_content)}
                    </div>
                  </div>
                  
                  <!-- Student Answer -->
                  <div style="margin-bottom: 14px;">
                    <div class="text-sm text-muted" style="margin-bottom: 4px; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Student's Submitted Answer</div>
                    <div style="color: var(--text-primary); padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 6px; white-space: pre-wrap; font-family: ${r.question_type === 'programming' ? 'monospace' : 'inherit'}; background: var(--bg-surface); min-height: 48px; font-size: 0.92rem; line-height: 1.5;">
                      ${escapeHtml(r.answer_data || 'No answer submitted')}
                    </div>
                  </div>
                  
                  <!-- Model Answer (if any) -->
                  ${r.correct_answer ? `
                  <div style="margin-bottom: 14px;">
                    <div class="text-sm" style="color: var(--accent-emerald); margin-bottom: 4px; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Model / Correct Answer</div>
                    <div style="color: var(--text-secondary); padding: 10px 14px; border: 1px solid rgba(16,185,129,0.25); border-radius: 6px; white-space: pre-wrap; background: rgba(16,185,129,0.04); font-size: 0.9rem;">
                      ${escapeHtml(r.correct_answer)}
                    </div>
                  </div>
                  ` : ''}
                  
                  <!-- Grading Inputs -->
                  <div style="display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; background: var(--bg-surface); padding: 12px 14px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div class="form-group" style="flex: 0 0 130px; margin-bottom: 0;">
                      <label class="form-label" style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">
                        Marks (0–${r.max_marks})
                      </label>
                      <input type="number" 
                             class="form-input score-input" 
                             data-response-id="${r.id}" 
                             data-max="${r.max_marks}"
                             min="0" 
                             max="${r.max_marks}" 
                             value="${currentMarks}" 
                             placeholder="0"
                             step="0.5" 
                             style="font-weight: 700; font-size: 1rem;">
                    </div>
                    
                    <div class="form-group" style="flex: 1; min-width: 200px; margin-bottom: 0;">
                      <label class="form-label" style="font-size: 0.8rem; font-weight: 600; margin-bottom: 4px;">Feedback (Optional)</label>
                      <textarea class="form-textarea feedback-input" 
                                data-response-id="${r.id}" 
                                rows="1" 
                                placeholder="Add comments or feedback for student..." 
                                style="resize: vertical; min-height: 38px;">${escapeHtml(r.feedback || '')}</textarea>
                    </div>

                    <div style="margin-bottom: 0;">
                      <button type="button" class="btn btn-outline btn-sm" onclick="saveSingleScore(${r.id}, this)" id="btn-save-single-${r.id}">
                        <i class="ph ph-floppy-disk"></i> Save
                      </button>
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
        <div class="empty-state" style="padding: 48px 24px; text-align: center;">
          <div class="empty-icon" style="font-size: 3rem; color: var(--accent-emerald); margin-bottom: 12px;"><i class="ph ph-check-circle"></i></div>
          <h3 style="margin-bottom: 8px;">No responses match the criteria</h3>
          <p class="text-muted">All responses have been reviewed or no submissions found.</p>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function attachEvaluatorQueueListeners() {
  const searchInput = document.getElementById('evaluator-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      evaluatorQueueState.searchQuery = e.target.value;
      const main = document.getElementById('main-content');
      const html = buildEvaluatorQueueHtml();
      main.innerHTML = html;
      App.sectionCache['#/evaluator/queue'] = html;
      attachEvaluatorQueueListeners();
      
      const newSearch = document.getElementById('evaluator-search-input');
      if (newSearch) {
        newSearch.focus();
        newSearch.setSelectionRange(newSearch.value.length, newSearch.value.length);
      }
    });
  }
}

// ─── DOM HELPERS & ACTIONS ──────────────────────────────────────────────────

window.setEvaluatorFilter = function(filter) {
  evaluatorQueueState.statusFilter = filter;
  const main = document.getElementById('main-content');
  const html = buildEvaluatorQueueHtml();
  main.innerHTML = html;
  App.sectionCache['#/evaluator/queue'] = html;
  attachEvaluatorQueueListeners();
};

window.toggleStudentAccordion = function(studentId) {
  const idStr = String(studentId);
  const el = document.getElementById(`student-${studentId}`);
  const icon = document.getElementById(`icon-student-${studentId}`);
  
  if (!el) return;

  if (el.style.display === 'none' || !el.style.display) {
    el.style.display = 'block';
    evaluatorQueueState.openStudents.add(idStr);
    if (icon) icon.style.transform = 'rotate(180deg)';
  } else {
    el.style.display = 'none';
    evaluatorQueueState.openStudents.delete(idStr);
    if (icon) icon.style.transform = 'rotate(0deg)';
  }
};

window.saveSingleScore = async function(responseId, btn) {
  const card = document.getElementById(`response-card-${responseId}`);
  if (!card) return;

  const scoreInput = card.querySelector('.score-input');
  const feedbackInput = card.querySelector('.feedback-input');
  
  const marks = parseFloat(scoreInput.value);
  const maxMarks = parseFloat(scoreInput.getAttribute('data-max') || '100');
  const feedback = feedbackInput ? feedbackInput.value.trim() : '';

  if (isNaN(marks) || marks < 0 || marks > maxMarks) {
    showToast(`Please enter valid marks between 0 and ${maxMarks}`, 'warning');
    scoreInput.focus();
    return;
  }

  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i>`;
    btn.disabled = true;
  }

  try {
    await api(`/api/evaluator/responses/${responseId}/score`, {
      method: 'POST',
      body: { marks_awarded: marks, feedback }
    });

    // Update in-memory state
    const target = evaluatorQueueState.rawResponses.find(r => r.id === responseId);
    if (target) {
      target.marks_awarded = marks;
      target.feedback = feedback;
      target.status = 'graded';
    }

    const badgeEl = document.getElementById(`status-badge-${responseId}`);
    if (badgeEl) {
      badgeEl.innerHTML = `<span class="badge badge-success"><i class="ph ph-check"></i> Scored: ${marks} / ${maxMarks}</span>`;
    }

    showToast('Score saved successfully', 'success');
  } catch (err) {
    showToast('Error saving score: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
};

window.bulkSubmitScores = async function(studentId, examId) {
  const container = document.getElementById(`student-${studentId}-exam-${examId}`);
  if (!container) return;

  const btn = document.getElementById(`btn-save-${studentId}-${examId}`);
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Saving...`;
    btn.disabled = true;
  }

  try {
    const scoreInputs = container.querySelectorAll('.score-input');
    const promises = [];
    const savedUpdates = [];

    for (const input of scoreInputs) {
      const responseId = parseInt(input.getAttribute('data-response-id'), 10);
      const marks = parseFloat(input.value);
      const maxMarks = parseFloat(input.getAttribute('data-max') || '100');
      
      const feedbackInput = container.querySelector(`.feedback-input[data-response-id="${responseId}"]`);
      const feedback = feedbackInput ? feedbackInput.value.trim() : '';

      if (!isNaN(marks) && marks >= 0 && marks <= maxMarks) {
        savedUpdates.push({ responseId, marks, feedback, maxMarks });
        promises.push(
          api(`/api/evaluator/responses/${responseId}/score`, {
            method: 'POST',
            body: { marks_awarded: marks, feedback }
          })
        );
      }
    }

    if (promises.length === 0) {
      showToast('No valid marks entered to save.', 'info');
      if (btn) {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
      return;
    }

    await Promise.all(promises);

    // Update in-memory state & DOM badges
    savedUpdates.forEach(({ responseId, marks, feedback, maxMarks }) => {
      const target = evaluatorQueueState.rawResponses.find(r => r.id === responseId);
      if (target) {
        target.marks_awarded = marks;
        target.feedback = feedback;
        target.status = 'graded';
      }
      const badgeEl = document.getElementById(`status-badge-${responseId}`);
      if (badgeEl) {
        badgeEl.innerHTML = `<span class="badge badge-success"><i class="ph ph-check"></i> Scored: ${marks} / ${maxMarks}</span>`;
      }
    });

    showToast(`Saved ${promises.length} score(s) successfully!`, 'success');
  } catch (err) {
    showToast('Error saving scores: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
};

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
                  <td style="font-weight:600;">${escapeHtml(s.component_name)}</td>
                  <td><span class="badge badge-info">${escapeHtml(s.question_type)}</span></td>
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
    if (!isBackground) main.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}
