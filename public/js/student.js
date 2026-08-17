/**
 * student.js — Composite Assessment System
 * ══════════════════════════════════════════
 * Student role module: dashboard, exam taking (with optimistic UI + targeted
 * DOM patches), results, proctoring.
 *
 * Depends on: core.js (App, api, showToast, escapeHtml, isGoogleChrome, ROUTES)
 *
 * Hot-path changes (2.3 & 2.4):
 *  - goToQuestion()   → patchExamQuestion() + patchQuestionNav()  (no full rebuild)
 *  - selectMCQ()      → class toggle only                         (no full rebuild)
 *  - autoSaveResponse → optimistic update + server rollback on failure
 */

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

ROUTES['#/student/dashboard'] = renderStudentDashboard;
ROUTES['#/student/results']   = renderStudentResults;
ROUTES['#/student/exam']      = renderStudentExam;

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT: DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

async function renderStudentDashboard(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/student/dashboard';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderStudentDashboard(true);
    return;
  }

  if (!isBackground && !main.querySelector('.card')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/student/exams');
    const componentMap = {};

    data.exams.forEach(e => {
      if (!componentMap[e.component_key]) {
        componentMap[e.component_key] = {
          name: e.component_name,
          weight: e.weight,
          exams: [],
        };
      }
      componentMap[e.component_key].exams.push(e);
    });

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-chart-bar"></i> My Exams</h1>
          <p class="page-subtitle">Welcome, ${App.user.name}</p>
        </div>
      </div>

      ${Object.entries(componentMap).map(([key, comp]) => `
        <div class="card mb-lg">
          <div class="card-header">
            <h3 class="card-title">${comp.name} <span class="badge badge-info">×${comp.weight}</span></h3>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:var(--sp-md);">
            ${comp.exams.map((e, idx) => {
              const status = e.session_status || 'not_started';
              const isExpired = e.is_expired;
              const isNotScheduled = (e.question_count === 0 || !e.is_published);

              let statusLabel = 'Not Started';
              let statusCls = 'neutral';
              if (status === 'submitted') {
                statusLabel = 'Completed';
                statusCls = 'success';
              } else if (isExpired) {
                statusLabel = 'Access Expired';
                statusCls = 'danger';
              } else if (isNotScheduled) {
                statusLabel = 'Not Scheduled';
                statusCls = 'neutral';
              } else if (status === 'active') {
                statusLabel = 'In Progress';
                statusCls = 'warning';
              }

              const isTargetMatch = e.target_match;

              return `
                <div class="card animate-slide-up" style="padding:var(--sp-md); animation-delay: ${idx * 0.05}s; ${isTargetMatch ? 'border: 2px solid var(--accent-indigo);' : ''}">
                  <div class="flex justify-between items-center mb-sm">
                    <h4>${e.title} ${isTargetMatch ? '<span class="badge badge-primary">Current Session</span>' : ''}</h4>
                    <span class="badge badge-${statusCls}">${statusLabel}</span>
                  </div>
                  <p class="text-sm text-muted mb-sm">${e.question_count} questions · ${e.total_marks} marks · ${e.duration_minutes} min</p>
                  ${status === 'submitted' ? `
                    <p class="text-sm mb-sm"><span class="font-mono" style="color:var(--accent-emerald);">Score: ${e.marks_obtained}/${e.total_marks}</span></p>
                    <button class="btn btn-outline btn-sm w-full mt-sm" onclick="window.location.hash='#/student/results'">
                      <i class="ph ph-trend-up"></i> View Score & Analytics
                    </button>
                  ` : isExpired ? `
                    ${e.marks_obtained > 0 ? `<p class="text-sm mb-sm"><span class="font-mono" style="color:var(--text-muted);">Score: ${e.marks_obtained}/${e.total_marks}</span></p>` : ''}
                    <div style="font-size:0.85rem; color:var(--accent-rose); margin-bottom:8px;">
                      <i class="ph ph-clock-afternoon"></i> Access code or exam time limit has expired. Exam taking closed.
                    </div>
                    <button class="btn btn-outline btn-sm w-full mt-sm" onclick="window.location.hash='#/student/results'">
                      <i class="ph ph-trend-up"></i> View Score & Analytics
                    </button>
                  ` : isNotScheduled ? `
                    <button class="btn btn-neutral btn-sm w-full mt-sm" disabled style="opacity:0.65; cursor:not-allowed;">
                      <i class="ph ph-clock"></i> Exam Not Scheduled
                    </button>
                  ` : `
                    <button class="btn ${status === 'active' ? 'btn-success' : 'btn-primary'} btn-sm w-full mt-sm"
                      onclick="window.location.hash='#/student/exam/${e.id}'">
                      ${status === 'active' ? '▶ Continue Exam' : '▶ Start Exam'}
                    </button>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}

      ${data.exams.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon"><i class="ph ph-file-text"></i></div>
            <h3>No exams available yet</h3>
            <p>Your exams will appear here once they are published.</p>
          </div>
        </div>
      ` : ''}
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT: EXAM TAKING
// ═══════════════════════════════════════════════════════════════════════════════

let examState = {
  questions: [],
  currentIdx: 0,
  responses: {},
  session: null,
  timerInterval: null,
  tabSwitches: 0,
  proctorExamId: null,
};

async function renderStudentExam(examId) {
  if (!examId) return renderStudentDashboard();

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div><p>Starting exam...</p></div>`;

  // Enforce Chrome Usage for Students
  if (!isGoogleChrome()) {
    main.innerHTML = `
      <div class="card" style="text-align: center; margin-top: 50px; max-width: 600px; margin-left: auto; margin-right: auto; padding: 32px;">
        <div style="font-size: 4rem; color: var(--accent-rose); margin-bottom: 16px;"><i class="ph ph-warning-circle"></i></div>
        <h2 style="color: var(--accent-rose); margin-bottom: 16px;">Google Chrome Required</h2>
        <p style="margin-bottom: 16px; font-size: 1.05rem; line-height: 1.6;">
          This exam features advanced oral tasks that rely on Google Chrome's native Speech Recognition engine.
          <strong>No browser extension or add-on is required</strong>, but you must use the official <strong>Google Chrome browser</strong> and grant microphone permissions when prompted.
        </p>
        <p style="margin-bottom: 24px; color: var(--text-muted);">Please download and install Google Chrome, then log in again to take your exam.</p>
        <a href="https://www.google.com/chrome/" target="_blank" class="btn btn-primary btn-lg" style="text-decoration: none;">
          <i class="ph ph-download-simple"></i> Download Google Chrome
        </a>
      </div>
    `;
    return;
  }

  try {
    const data = await api(`/api/student/exams/${examId}/start`, { method: 'POST' });
    if (!data.questions || data.questions.length === 0) {
      main.innerHTML = `
        <div class="card" style="text-align: center; margin-top: 50px; max-width: 600px; margin-left: auto; margin-right: auto; padding: 32px;">
          <div style="font-size: 4rem; color: var(--accent-amber); margin-bottom: 16px;"><i class="ph ph-clock"></i></div>
          <h2 style="color: var(--text-primary); margin-bottom: 16px;">Exam Not Scheduled</h2>
          <p style="margin-bottom: 24px; color: var(--text-muted);">This exam session has no questions scheduled yet. Please check back later or contact your administrator.</p>
          <a href="#/student/dashboard" class="btn btn-outline btn-lg"><i class="ph ph-arrow-left"></i> Return to Dashboard</a>
        </div>
      `;
      return;
    }

    examState.questions = data.questions;
    examState.responses = data.responses || {};
    examState.session   = data.session;
    examState.currentIdx = 0;
    examState.tabSwitches = 0;

    if (!setupProctoring(examId)) return;

    renderExamShell(examId);
    startExamTimer(data.session.ends_at);
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><h3>${err.message}</h3><a href="#/student/dashboard" class="btn btn-outline mt-md"><i class="ph ph-arrow-left"></i> Back to Dashboard</a></div>`;
  }
}

/**
 * Renders the full exam shell (timer + nav dots + question card + prev/next).
 * Called once on exam start. Subsequent question changes use targeted patches.
 */
function renderExamShell(examId) {
  const main = document.getElementById('main-content');
  const q = examState.questions[examState.currentIdx];
  if (!q) return;

  main.innerHTML = `
    <div class="exam-timer" id="exam-timer">
      <span><i class="ph ph-timer"></i></span>
      <span class="timer-value" id="timer-display">--:--</span>
    </div>

    <div style="max-width:900px; margin:0 auto;">
      <div class="flex justify-between items-center mb-md">
        <h2>Exam</h2>
        <button class="btn btn-danger" id="submit-exam-btn" onclick="submitExam(${examId})">
          <i class="ph ph-upload-simple"></i> Submit Exam
        </button>
      </div>

      <!-- Question Navigation dots -->
      <div class="question-nav" id="question-nav">
        ${buildNavDots(examId)}
      </div>

      <!-- Question card (patched in-place on navigation) -->
      <div id="question-card">
        ${buildQuestionCard(examId)}
      </div>

      <!-- Prev / Next -->
      <div class="flex justify-between mt-md" id="exam-nav-btns">
        ${buildNavButtons(examId)}
      </div>
    </div>
  `;
}

// ─── DOM PATCH HELPERS (2.3) ─────────────────────────────────────────────────

/** Rebuilds only the navigation dots (answered/current state). */
function patchQuestionNav(examId) {
  const nav = document.getElementById('question-nav');
  if (nav) nav.innerHTML = buildNavDots(examId);
}

/** Rebuilds only the question card content (question text + answer input). */
function patchExamQuestion(examId) {
  const card = document.getElementById('question-card');
  if (card) card.innerHTML = buildQuestionCard(examId);

  const navBtns = document.getElementById('exam-nav-btns');
  if (navBtns) navBtns.innerHTML = buildNavButtons(examId);
}

function buildNavDots(examId) {
  return examState.questions.map((qq, i) => {
    const answered = examState.responses[qq.id] ? 'answered' : '';
    const current  = i === examState.currentIdx ? 'current' : '';
    return `<div class="question-dot ${answered} ${current}" onclick="goToQuestion(${i}, ${examId})">${i + 1}</div>`;
  }).join('');
}

function buildNavButtons(examId) {
  const isFirst = examState.currentIdx === 0;
  const isLast  = examState.currentIdx === examState.questions.length - 1;
  return `
    <button class="btn btn-outline" onclick="goToQuestion(${examState.currentIdx - 1}, ${examId})" ${isFirst ? 'disabled' : ''}>
      <i class="ph ph-arrow-left"></i> Previous
    </button>
    <button class="btn btn-primary" onclick="goToQuestion(${examState.currentIdx + 1}, ${examId})" ${isLast ? 'disabled' : ''}>
      Next →
    </button>
  `;
}

function buildQuestionCard(examId) {
  const q = examState.questions[examState.currentIdx];
  if (!q) return '';
  const currentAnswer = examState.responses[q.id] || '';

  const answerHtml = q.type === 'mcq' && q.options ? `
    <div class="mcq-options">
      ${q.options.map((opt, oi) => {
        const letter   = String.fromCharCode(65 + oi);
        const selected = currentAnswer === letter ? 'selected' : '';
        return `
          <div class="mcq-option ${selected}" data-letter="${letter}" onclick="selectMCQ('${letter}', ${q.id}, ${examId})">
            <div class="mcq-option-letter">${letter}</div>
            <span>${escapeHtml(opt)}</span>
          </div>
        `;
      }).join('')}
    </div>
  ` : q.type === 'oral_task' ? `
    <div class="oral-task-container">
      <p class="text-muted mb-md"><i class="ph ph-info"></i> An alert will prompt you to ensure you are in a quiet environment before starting.</p>
      <div id="oral-transcript-display" class="card" style="min-height:100px; background:var(--bg-glass); margin-bottom:16px;">
        ${currentAnswer ? escapeHtml(currentAnswer) : '<span style="color:var(--text-muted)">Your transcribed speech will appear here...</span>'}
      </div>
      <button class="btn btn-primary btn-lg" id="btn-start-recording" onclick="startOralRecording(${q.id}, ${examId})">
        <i class="ph ph-microphone"></i> Start Recording
      </button>
      <div id="recording-status" style="display:none; color:var(--accent-red); margin-top:8px; font-weight:bold; align-items:center; gap:8px;">
        <i class="ph ph-record" style="animation:pulse 1.5s infinite"></i> Recording in progress... Please read the text above clearly.
      </div>
    </div>
  ` : `
    <textarea class="form-textarea" id="answer-input" rows="6"
      placeholder="Type your answer here..."
      oninput="autoSaveResponse(${q.id}, this.value, ${examId})"
      spellcheck="false" autocomplete="off" autocorrect="off"
      data-gramm="false" data-lt-active="false" data-dashlane-rm="true"
      style="${q.type === 'programming' ? 'font-family:monospace; font-size:0.9rem;' : ''}"
    >${escapeHtml(currentAnswer)}</textarea>
  `;

  return `
    <div class="card" style="animation:fadeIn 0.2s ease;">
      <div class="flex justify-between items-center mb-md">
        <span class="text-sm text-muted">Question ${examState.currentIdx + 1} of ${examState.questions.length}</span>
        <div>
          <span class="badge badge-info">${q.type}</span>
          <span class="badge badge-neutral">${q.marks} mark${q.marks > 1 ? 's' : ''}</span>
        </div>
      </div>

      <div style="font-size:1.05rem; color:var(--text-primary); margin-bottom:var(--sp-lg); line-height:1.7;">
        ${escapeHtml(q.content)}
      </div>

      ${answerHtml}
    </div>
  `;
}

// ─── HOT-PATH: NAVIGATION (2.3) ──────────────────────────────────────────────

/**
 * Navigate to question by index.
 * Patches only the question card and nav dots — no full page rebuild.
 */
function goToQuestion(idx, examId) {
  if (idx < 0 || idx >= examState.questions.length) return;
  examState.currentIdx = idx;
  patchExamQuestion(examId);  // replaces only #question-card + nav buttons
  patchQuestionNav(examId);   // replaces only .question-nav dots
}

// ─── HOT-PATH: MCQ SELECT (2.3) ──────────────────────────────────────────────

/**
 * MCQ option select — toggles the .selected class only.
 * Does NOT call renderExamUI / rebuild innerHTML.
 */
function selectMCQ(letter, questionId, examId) {
  examState.responses[questionId] = letter;

  // Patch: only toggle CSS classes on existing MCQ option elements
  document.querySelectorAll('.mcq-option').forEach(el => el.classList.remove('selected'));
  const target = document.querySelector(`.mcq-option[data-letter="${letter}"]`);
  if (target) target.classList.add('selected');

  // Update answered dot in nav (targeted)
  patchQuestionNav(examId);

  // Persist to server with optimistic UI
  autoSaveResponse(questionId, letter, examId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPTIMISTIC AUTO-SAVE WITH ROLLBACK (2.4)
// ═══════════════════════════════════════════════════════════════════════════════

let saveTimeout;

/**
 * Saves a response optimistically:
 * 1. Updates examState.responses immediately (UI already updated by caller)
 * 2. Debounces the network request 1s
 * 3. On failure: rolls back examState + re-patches UI + shows persistent banner
 */
function autoSaveResponse(questionId, value, examId) {
  const prev = examState.responses[questionId];
  examState.responses[questionId] = value; // optimistic

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await api('/api/student/responses', {
        method: 'POST',
        body: { question_id: questionId, answer_data: value, exam_id: examId },
      });
      clearSaveErrorBanner();
    } catch {
      // Rollback
      examState.responses[questionId] = prev;
      patchQuestionNav(examId);   // restore answered dot state
      showSaveErrorBanner();
    }
  }, 1000);
}

function showSaveErrorBanner() {
  if (document.getElementById('save-error-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'save-error-banner';
  banner.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(244,63,94,0.15); border: 1px solid var(--accent-rose);
    color: #fecdd3; padding: 12px 20px; border-radius: 10px; z-index: 9998;
    display: flex; align-items: center; gap: 10px; font-weight: 600;
    backdrop-filter: blur(8px);
  `;
  banner.innerHTML = `
    <i class="ph ph-warning-circle" style="color:var(--accent-rose); font-size:1.2rem;"></i>
    Answer could not be saved — check your connection. It will retry on your next input.
  `;
  document.body.appendChild(banner);
}

function clearSaveErrorBanner() {
  const b = document.getElementById('save-error-banner');
  if (b) b.remove();
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM TIMER
// ═══════════════════════════════════════════════════════════════════════════════

function startExamTimer(endsAt) {
  if (examState.timerInterval) clearInterval(examState.timerInterval);

  let ticks = 0;
  examState.timerInterval = setInterval(() => {
    ticks++;
    if (ticks % 15 === 0) {
      // Ping the server every 15s to check authorization and active exam status
      api('/api/auth/me').catch(() => {});
    }

    const diff = Math.max(0, new Date(endsAt) - new Date());
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    const display = document.getElementById('timer-display');
    const timer   = document.getElementById('exam-timer');

    if (display) {
      display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (timer) {
      timer.classList.toggle('warning', mins <= 10 && mins > 2);
      timer.classList.toggle('danger',  mins <= 2);
    }

    if (diff <= 0) {
      clearInterval(examState.timerInterval);
      showToast('Time is up! Auto-submitting...', 'warning');
      submitExam(examState.session.exam_id, true);
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAM SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════════

async function submitExam(examId, forceSubmit = false, remarks = null) {
  if (!forceSubmit && !confirm('Submit this exam? You cannot change your answers after submission.')) return;

  try {
    clearInterval(examState.timerInterval);
    cleanupProctoring();

    const responses = Object.entries(examState.responses).map(([qId, answer]) => ({
      question_id: parseInt(qId),
      answer_data: answer,
    }));

    const bodyData = { responses };
    if (remarks) bodyData.remarks = remarks;

    const data = await api(`/api/student/exams/${examId}/submit`, {
      method: 'POST',
      body: bodyData,
    });

    showToast(`Exam submitted! ${data.autoGraded} auto-graded, ${data.pendingReview} pending review`, 'success');
    window.location.replace(window.location.origin + window.location.pathname + '#/student/dashboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORAL RECORDING
// ═══════════════════════════════════════════════════════════════════════════════

let activeRecognition = null;

function startOralRecording(qId, examId) {
  alert('Please ensure you are in a quiet environment before starting your oral exam.');

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Speech recognition is not supported in this browser.', 'error');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (activeRecognition) activeRecognition.stop();

  activeRecognition = new SpeechRecognition();
  activeRecognition.continuous      = true;
  activeRecognition.interimResults  = true;
  activeRecognition.lang            = 'en-US';

  const btn     = document.getElementById('btn-start-recording');
  const status  = document.getElementById('recording-status');
  const display = document.getElementById('oral-transcript-display');

  btn.innerHTML = '<i class="ph ph-stop-circle"></i> Stop Recording';
  btn.classList.replace('btn-primary', 'btn-danger');
  btn.onclick = () => { if (activeRecognition) activeRecognition.stop(); };
  status.style.display = 'flex';

  let finalTranscript = '';

  activeRecognition.onresult = (event) => {
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript + ' ';
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    display.innerHTML = escapeHtml(finalTranscript) + '<i style="color:var(--text-muted)">' + escapeHtml(interimTranscript) + '</i>';
  };

  activeRecognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    showToast('Microphone error: ' + event.error, 'error');
    stopOralRecording(qId, examId, finalTranscript);
  };

  activeRecognition.onend = () => {
    stopOralRecording(qId, examId, finalTranscript);
  };

  activeRecognition.start();
}

function stopOralRecording(qId, examId, finalTranscript) {
  const btn    = document.getElementById('btn-start-recording');
  const status = document.getElementById('recording-status');

  if (btn) {
    btn.innerHTML = '<i class="ph ph-microphone"></i> Start Recording (Retake)';
    btn.classList.replace('btn-danger', 'btn-primary');
    btn.onclick = () => startOralRecording(qId, examId);
  }
  if (status) status.style.display = 'none';

  if (finalTranscript.trim()) {
    examState.responses[qId] = finalTranscript.trim();
    autoSaveResponse(qId, finalTranscript.trim(), examId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCTORING
// ═══════════════════════════════════════════════════════════════════════════════

function setupProctoring(examId) {
  const isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  const isChrome  = isGoogleChrome();

  if (isMobile || !isChrome) {
    document.getElementById('main-content').innerHTML = `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.92); color:white; z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 2rem;">
        <h1 style="color:var(--accent-rose); margin-bottom: 1rem;"><i class="ph ph-prohibit"></i> Access Denied</h1>
        <p style="font-size:1.2rem; max-width: 550px; line-height: 1.6; margin-bottom: 2rem;">
          ${!isChrome ? 'You must use <strong>Google Chrome</strong> to take this exam. No browser extension is required — Chrome includes built-in speech recognition for oral tasks. Please allow microphone permissions when asked.<br><br><a href="https://www.google.com/chrome/" target="_blank" class="btn btn-primary" style="text-decoration:none; margin-bottom:1rem; display:inline-block;"><i class="ph ph-download-simple"></i> Download Google Chrome</a><br><br>' : ''}
          ${isMobile ? 'Compulsory use of a <strong>Laptop or Desktop computer</strong> is required. Mobile devices are strictly prohibited.' : ''}
        </p>
        <button class="btn btn-secondary" onclick="window.location.hash='#/student/dashboard'">Return to Dashboard</button>
      </div>
    `;
    return false;
  }

  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Error attempting to enable fullscreen: ${err.message}`);
    });
  }

  document.addEventListener('copy',        preventEvent);
  document.addEventListener('cut',         preventEvent);
  document.addEventListener('paste',       preventEvent);
  document.addEventListener('contextmenu', preventEvent);

  examState.proctorExamId = examId;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleBlur);
  document.addEventListener('fullscreenchange', handleFullscreenChange);

  return true;
}

function preventEvent(e) {
  e.preventDefault();
  showToast('Copy/paste and right-click are disabled during the exam.', 'warning');
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    logViolation('tab_switch', 'Student switched tabs or minimized the browser.');
  }
}

function handleBlur() {
  logViolation('window_blur', 'Exam window lost focus.');
}

function handleFullscreenChange() {
  if (!document.fullscreenElement) {
    logViolation('fullscreen_exit', 'Student exited full screen mode.');
  }
}

async function logViolation(type, details) {
  if (!examState.proctorExamId) return;

  examState.tabSwitches = (examState.tabSwitches || 0) + 1;

  try {
    await api('/api/student/violations', {
      method: 'POST',
      body: { exam_id: examState.proctorExamId, type, details }
    });

    if (examState.tabSwitches >= 3) {
      showToast('Maximum violations exceeded. Auto-submitting exam...', 'error');
      submitExam(examState.proctorExamId, true, 'Auto-submitted because of violations');
    } else {
      const overlay = document.createElement('div');
      overlay.id = 'violation-freeze-overlay';
      overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); color:white; z-index:9999; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 2rem; backdrop-filter: blur(10px);';
      overlay.innerHTML = `
        <h1 style="color:var(--accent-rose); margin-bottom: 1rem;"><i class="ph ph-warning"></i> Warning: Exam Violation</h1>
        <p style="font-size:1.2rem; max-width: 500px; line-height: 1.5; margin-bottom: 1rem;">
          You have navigated away from the exam window, exited full screen, or switched tabs. This is a violation of exam rules.
        </p>
        <p style="font-size:1.2rem; max-width: 500px; line-height: 1.5; margin-bottom: 2rem; font-weight:bold;">
          Violation ${examState.tabSwitches} of 3.
        </p>
        <p style="margin-bottom: 2rem; color:#ccc;">
          On the 3rd violation, your exam will be automatically submitted and locked.
        </p>
        <button class="btn btn-primary" onclick="document.getElementById('violation-freeze-overlay').remove(); if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(e=>console.warn(e));">I Understand, Return to Exam</button>
      `;
      document.body.appendChild(overlay);
    }
  } catch (err) {
    console.error('Failed to log violation', err);
  }
}

function cleanupProctoring() {
  document.removeEventListener('copy',             preventEvent);
  document.removeEventListener('cut',              preventEvent);
  document.removeEventListener('paste',            preventEvent);
  document.removeEventListener('contextmenu',      preventEvent);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('blur',               handleBlur);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(err => console.warn(err));
  }

  examState.proctorExamId = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT: RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderStudentResults() {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;

  try {
    const data = await api('/api/student/results');
    const c = data.composite;
    const completedExams = data.examBreakdown.filter(e => e.session_status === 'submitted');

    let html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-trend-up"></i> My Results</h1>
          <p class="page-subtitle">${App.user.name} — ${App.user.roll_no || ''}</p>
        </div>
      </div>
    `;

    if (!c && completedExams.length === 0) {
      html += `
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon"><i class="ph ph-chart-bar"></i></div>
            <h3>No scores yet</h3>
            <p>Complete your exams to see your results</p>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="card mb-lg" style="padding:var(--sp-lg);">
          <h3 class="mb-md">Progress Chart</h3>
          <div style="position:relative; height:300px; width:100%;">
            <canvas id="progressChart"></canvas>
          </div>
        </div>

        <div class="card mb-lg">
          <div class="card-header"><h3 class="card-title">Exam Details</h3></div>
          <div style="padding:var(--sp-md);">
      `;

      completedExams.forEach(e => {
        html += `
            <div style="border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: var(--sp-md); overflow:hidden;">
              <div style="background:var(--bg-secondary); padding:var(--sp-md); display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="toggleAccordion('exam-details-${e.id}')">
                <div>
                  <h4 style="margin:0;">${e.title} <span class="badge badge-info ml-sm">${e.component_name}</span></h4>
                  ${e.remarks ? `<span class="badge badge-warning mt-sm">Note: ${escapeHtml(e.remarks)}</span>` : ''}
                </div>
                <div class="font-mono" style="font-weight:600; font-size:1.1rem; color:var(--accent-emerald);">
                  ${e.marks_obtained} / ${e.total_marks}
                </div>
              </div>
              <div id="exam-details-${e.id}" style="display:none; padding:var(--sp-md); background:var(--bg-primary);">
                <div class="table-container" style="border:none;">
                  <table class="data-table" style="width:100%;">
                    <thead>
                      <tr>
                        <th>Q#</th><th>Question</th><th>Your Answer</th><th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
        `;

        if (e.questions && e.questions.length > 0) {
          e.questions.forEach((q, idx) => {
            const isCorrect = q.marks_awarded > 0;
            html += `
                      <tr>
                        <td style="vertical-align:top;">${idx + 1}</td>
                        <td style="max-width:300px; white-space:normal; vertical-align:top;">${escapeHtml(q.content)}</td>
                        <td style="max-width:200px; white-space:normal; vertical-align:top;">
                          <div style="font-family:monospace; margin-bottom:var(--sp-xs);">${escapeHtml(q.student_answer || 'No answer')}</div>
                          ${!isCorrect && q.correct_answer ? `<div class="text-sm text-muted"><strong>Correct:</strong> <span style="color:var(--accent-emerald);">${escapeHtml(q.correct_answer)}</span></div>` : ''}
                        </td>
                        <td style="vertical-align:top;"><span class="badge ${isCorrect ? 'badge-success' : 'badge-danger'}">${isCorrect ? 'Correct' : 'Incorrect'}</span><br><span class="text-sm text-muted">${q.marks_awarded || 0}/${q.marks}</span></td>
                      </tr>
            `;
          });
        } else {
          html += `<tr><td colspan="4" class="text-center text-muted">No question details available.</td></tr>`;
        }

        html += `
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
        `;
      });

      html += `
          </div>
        </div>
      `;

      if (c) {
        html += `
          <div class="card mb-lg" style="text-align:center; padding:var(--sp-2xl);">
            <h2 style="margin-bottom:var(--sp-md);">Current Proficiency Level</h2>
            <div style="margin-bottom:var(--sp-md);">${levelBadge(c.level)}</div>
            <div class="text-muted">${data.levelDescriptions[c.level]}</div>
          </div>
        `;
      }
    }

    main.innerHTML = html;

    if (completedExams.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('progressChart');
        if (ctx && window.Chart) {
          new Chart(ctx, {
            type: 'line',
            data: {
              labels:   completedExams.map(e => e.title),
              datasets: [{
                label: 'Exam Score',
                data:  completedExams.map(e => e.marks_obtained),
                borderColor:     '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4,
                fill: true,
                tension: 0.3,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Score' } }
              },
              plugins: { legend: { display: false } }
            },
          });
        }
      }, 100);
    }
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><p>${err.message}</p></div>`;
  }
}

window.toggleAccordion = function(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH: student dashboard (targeted patch)
// ═══════════════════════════════════════════════════════════════════════════════

setInterval(() => {
  if (!document.querySelector('.modal.active') && App.user?.role === 'student') {
    const hasExamList = document.getElementById('main-content')?.innerHTML.includes('My Exams');
    if (hasExamList) renderStudentDashboard();
  }
}, 15000);
