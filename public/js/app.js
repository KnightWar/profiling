/**
 * Composite Assessment System — Main App
 * ═══════════════════════════════════════
 * SPA router, auth, navigation, toast system, shared utilities.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const App = {
  user: null,
  currentPage: null,
  sectionCache: {},
  apiCache: {},
};

function invalidateCache() {
  App.sectionCache = {};
  App.apiCache = {};
}

function isGoogleChrome() {
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';

  const isEdge = /Edg\/|EdgA\/|EdgiOS\//i.test(ua);
  const isOpera = /OPR\/|Opera\//i.test(ua);
  const isVivaldi = /Vivaldi\//i.test(ua);
  const isYandex = /YaBrowser\//i.test(ua);
  const isSamsung = /SamsungBrowser\//i.test(ua);
  const isUC = /UCBrowser\//i.test(ua);
  const isFirefox = /Firefox\//i.test(ua);
  const isSafari = /Safari\//i.test(ua) && !/Chrome\//i.test(ua);
  const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function') || /Brave\//i.test(ua);
  const isChromiumOnly = /Chromium\//i.test(ua);

  if (isEdge || isOpera || isVivaldi || isYandex || isSamsung || isUC || isFirefox || isSafari || isBrave || isChromiumOnly) {
    return false;
  }

  const isChromeUA = /Chrome\//i.test(ua) && /Google Inc/i.test(vendor);
  if (!isChromeUA) return false;

  if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
    const brands = navigator.userAgentData.brands.map(b => b.brand);
    const hasEdge = brands.some(b => b.includes('Edge') || b.includes('Microsoft Edge'));
    const hasOpera = brands.some(b => b.includes('Opera'));
    const hasBrave = brands.some(b => b.includes('Brave'));
    if (hasEdge || hasOpera || hasBrave) return false;
    
    const hasGoogleChrome = brands.includes('Google Chrome');
    if (hasGoogleChrome) return true;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════════════════

async function api(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const defaults = {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.body = JSON.stringify(options.body);
  }

  if (options.body instanceof FormData) {
    delete defaults.headers['Content-Type'];
  }

  const res = await fetch(url, { ...defaults, ...options });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  if (method !== 'GET') {
    invalidateCache();
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '<i class="ph ph-check"></i>', error: '<i class="ph ph-x"></i>', info: '<i class="ph ph-info"></i>', warning: '<i class="ph ph-warning"></i>' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

async function checkAuth() {
  try {
    const data = await api('/api/auth/me');
    App.user = data.user;
    showApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  toggleLoginView('student');

  const existingWarning = document.getElementById('chrome-warning-banner');
  if (!isGoogleChrome()) {
    if (!existingWarning) {
      const banner = document.createElement('div');
      banner.id = 'chrome-warning-banner';
      banner.className = 'form-hint-banner';
      banner.style.background = 'rgba(244, 63, 94, 0.12)';
      banner.style.borderColor = 'var(--accent-rose)';
      banner.style.color = '#fecdd3';
      banner.innerHTML = '<i class="ph ph-warning-circle" style="color:var(--accent-rose)"></i> <strong>Google Chrome Required:</strong> Official Google Chrome is strictly required for student logins and exams.';
      const form = document.getElementById('access-code-form');
      if (form) form.insertBefore(banner, form.firstChild);
    }
  } else if (existingWarning) {
    existingWarning.remove();
  }
}

function showApp() {
  if (App.user && App.user.role === 'student' && !isGoogleChrome()) {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    
    let errOverlay = document.getElementById('chrome-enforce-overlay');
    if (!errOverlay) {
      errOverlay = document.createElement('div');
      errOverlay.id = 'chrome-enforce-overlay';
      document.body.appendChild(errOverlay);
    }
    errOverlay.style.display = 'block';
    errOverlay.innerHTML = `
      <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.96); color:white; z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding: 2rem;">
        <div style="font-size: 4rem; color: var(--accent-rose); margin-bottom: 16px;"><i class="ph ph-warning-circle"></i></div>
        <h1 style="color:var(--accent-rose); margin-bottom: 16px;">Google Chrome Required</h1>
        <p style="margin-bottom: 16px; font-size: 1.1rem; line-height: 1.6; max-width: 550px; color: var(--text-muted);">
          Student exam access strictly requires the official <strong>Google Chrome browser</strong>. 
          No browser extensions or add-ons are needed, but you must take your exam using Google Chrome.
        </p>
        <p style="margin-bottom: 24px; color: var(--text-muted);">Please download and install Google Chrome, then log in again.</p>
        <a href="https://www.google.com/chrome/" target="_blank" class="btn btn-primary btn-lg" style="text-decoration: none; margin-bottom: 16px;">
          <i class="ph ph-download-simple"></i> Download Google Chrome
        </a>
        <button class="btn btn-outline btn-sm" onclick="handleLogout()">Sign Out</button>
      </div>
    `;
    return;
  }

  const errOverlay = document.getElementById('chrome-enforce-overlay');
  if (errOverlay) errOverlay.style.display = 'none';

  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  // Update user info
  document.getElementById('user-name').textContent = App.user.name;
  document.getElementById('user-role').textContent = App.user.role.charAt(0).toUpperCase() + App.user.role.slice(1);
  document.getElementById('user-avatar').textContent = App.user.name.charAt(0).toUpperCase();

  buildNav();
  handleRoute();
}

async function handleAccessCodeLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('access-code-btn');
  const errEl = document.getElementById('access-code-error');
  errEl.style.display = 'none';

  try {
    if (!isGoogleChrome()) {
      errEl.innerHTML = 'Google Chrome is strictly required for student exams. Redirecting to download...';
      errEl.style.display = 'block';
      setTimeout(() => {
        window.location.href = 'https://www.google.com/chrome/';
      }, 1500);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Verifying Code...';

    const roll_no = document.getElementById('login-rollno').value;
    const access_code = document.getElementById('login-accesscode').value;

    const data = await api('/api/auth/access-code-login', {
      method: 'POST',
      body: { roll_no, access_code },
    });

    App.user = data.user;
    showToast(`Access granted! Welcome, ${App.user.name}`, 'success');
    showApp();

    if (data.exam && data.exam.id) {
      window.location.hash = `#/student/exam/${data.exam.id}`;
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '<i class="ph ph-rocket-launch"></i> Enter Exam Session';
  }
}

async function handleAccountLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('account-login-btn');
  const errEl = document.getElementById('account-login-error');
  errEl.style.display = 'none';

  try {
    if (!isGoogleChrome()) {
      errEl.innerHTML = 'Google Chrome is strictly required for student logins and exams. Redirecting to download...';
      errEl.style.display = 'block';
      setTimeout(() => {
        window.location.href = 'https://www.google.com/chrome/';
      }, 1500);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if (data.user.role === 'student' && !isGoogleChrome()) {
      throw new Error('Google Chrome is strictly required for student logins and exams.');
    }

    App.user = data.user;
    showToast(`Welcome, ${App.user.name}!`, 'success');
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '<i class="ph ph-key"></i> Student Sign In';
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('admin-login-btn');
  const errEl = document.getElementById('admin-login-error');
  errEl.style.display = 'none';

  try {
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    App.user = data.user;
    showToast(`Admin session started: ${App.user.name}`, 'success');
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '<i class="ph ph-lock-key"></i> Admin Sign In';
  }
}

function toggleLoginView(view) {
  const studentView = document.getElementById('student-login-view');
  const adminView = document.getElementById('admin-login-view');
  const toggleBtn = document.getElementById('top-admin-toggle-btn');

  if (!studentView || !adminView) return;

  const isStudentVisible = window.getComputedStyle(studentView).display !== 'none';
  let targetView = view;
  if (!targetView) {
    targetView = isStudentVisible ? 'admin' : 'student';
  }

  const hide = targetView === 'admin' ? studentView : adminView;
  const show = targetView === 'admin' ? adminView : studentView;

  hide.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
  hide.style.opacity = '0';
  hide.style.transform = 'translateY(-8px)';

  setTimeout(() => {
    hide.style.display = 'none';
    hide.style.opacity = '';
    hide.style.transform = '';
    hide.style.transition = '';

    show.style.display = 'block';
    show.style.opacity = '0';
    show.style.transform = 'translateY(8px)';
    show.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

    requestAnimationFrame(() => {
      show.style.opacity = '1';
      show.style.transform = 'translateY(0)';
    });

    if (toggleBtn) {
      toggleBtn.innerHTML = targetView === 'admin'
        ? '<i class="ph ph-graduation-cap"></i> Student Access'
        : '<i class="ph ph-key"></i> Admin Login';
    }
  }, 160);
}

function switchStudentOption(option) {
  const accessForm = document.getElementById('access-code-form');
  const accountForm = document.getElementById('account-login-form');
  const tabAccess = document.getElementById('tab-option-access');
  const tabAccount = document.getElementById('tab-option-account');

  if (!accessForm || !accountForm) return;

  if (option === 'account') {
    accessForm.style.display = 'none';
    accountForm.style.display = 'block';
    if (tabAccess) tabAccess.classList.remove('active');
    if (tabAccount) tabAccount.classList.add('active');
  } else {
    accessForm.style.display = 'block';
    accountForm.style.display = 'none';
    if (tabAccess) tabAccess.classList.add('active');
    if (tabAccount) tabAccount.classList.remove('active');
  }
}

async function handleLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  App.user = null;
  window.location.hash = '';
  showLogin();
  showToast('Signed out', 'info');
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_CONFIG = {
  admin: [
    { section: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', icon: '<i class="ph ph-chart-bar"></i>', hash: '#/admin/dashboard' },
    { section: 'Management' },
    { id: 'students', label: 'Students', icon: '<i class="ph ph-users"></i>', hash: '#/admin/students' },
    { id: 'exams', label: 'Exams', icon: '<i class="ph ph-file-text"></i>', hash: '#/admin/exams' },
    { id: 'questions', label: 'Questions', icon: '<i class="ph ph-question"></i>', hash: '#/admin/questions' },
    { section: 'Results' },
    { id: 'scores', label: 'Scores & Reports', icon: '<i class="ph ph-trend-up"></i>', hash: '#/admin/scores' },
    { id: 'evaluator', label: 'Evaluator Queue', icon: '<i class="ph ph-check-circle"></i>', hash: '#/admin/evaluator' },
  ],
  student: [
    { section: 'My Exams' },
    { id: 'student-dashboard', label: 'Dashboard', icon: '<i class="ph ph-chart-bar"></i>', hash: '#/student/dashboard' },
    { id: 'student-results', label: 'My Results', icon: '<i class="ph ph-trend-up"></i>', hash: '#/student/results' },
  ],
  evaluator: [
    { section: 'Evaluation' },
    { id: 'eval-queue', label: 'Scoring Queue', icon: '<i class="ph ph-check-circle"></i>', hash: '#/evaluator/queue' },
    { id: 'eval-stats', label: 'My Stats', icon: '<i class="ph ph-chart-bar"></i>', hash: '#/evaluator/stats' },
  ],
};

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  const items = NAV_CONFIG[App.user.role] || [];

  let idx = 0;
  nav.innerHTML = items.map(item => {
    if (item.section) {
      return `<div class="nav-section-label">${item.section}</div>`;
    }
    const delay = idx++ * 0.05;
    return `<a class="nav-item animate-slide-up" data-nav="${item.id}" href="${item.hash}" style="animation-delay: ${delay}s">
      <span class="nav-icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>`;
  }).join('');
}

function setActiveNav(hash) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('href') === hash);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════

const ROUTES = {
  // Admin routes
  '#/admin/dashboard': renderAdminDashboard,
  '#/admin/students': renderStudentManager,
  '#/admin/exams': renderExamManager,
  '#/admin/questions': renderQuestionManager,
  '#/admin/scores': renderScoreReports,
  '#/admin/evaluator': renderEvaluatorQueue,

  // Student routes
  '#/student/dashboard': renderStudentDashboard,
  '#/student/results': renderStudentResults,
  '#/student/exam': renderStudentExam,

  // Evaluator routes
  '#/evaluator/queue': renderEvaluatorQueue,
  '#/evaluator/stats': renderEvaluatorStats,
};

function handleRoute() {
  if (!App.user) return;

  let hash = window.location.hash || '';

  // Default routes per role
  if (!hash || hash === '#/') {
    const defaults = {
      admin: '#/admin/dashboard',
      student: '#/student/dashboard',
      evaluator: '#/evaluator/queue',
    };
    hash = defaults[App.user.role];
    window.location.hash = hash;
    return;
  }

  // Find matching route (supports /exam/:id style)
  const routeKey = Object.keys(ROUTES).find(key => {
    if (hash === key) return true;
    if (hash.startsWith(key + '/')) return true;
    return false;
  });

  setActiveNav(routeKey || hash);

  const renderer = ROUTES[routeKey];
  if (renderer) {
    const params = hash.replace(routeKey, '').split('/').filter(Boolean);
    renderer(...params);
  } else {
    renderNotFound();
  }
}

window.addEventListener('hashchange', handleRoute);

function renderNotFound() {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i class="ph ph-magnifying-glass"></i></div>
      <h2>Page Not Found</h2>
      <p class="mt-sm">The page you're looking for doesn't exist.</p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL HELPER
// ═══════════════════════════════════════════════════════════════════════════════

function openModal(title, contentHtml, footerHtml = '') {
  // Remove existing modal
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" onclick="closeModal()"><i class="ph ph-x"></i></button>
      </div>
      <div class="modal-body">${contentHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 300);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEVEL BADGE HELPER
// ═══════════════════════════════════════════════════════════════════════════════

function levelBadge(level) {
  const labels = { 3: 'Advanced', 2: 'Intermediate', 1: 'Foundational' };
  return `<span class="badge badge-level-${level}">${labels[level] || 'N/A'}</span>`;
}

function statusBadge(status) {
  const map = {
    submitted: { cls: 'info', label: 'Submitted' },
    graded: { cls: 'success', label: 'Graded' },
    active: { cls: 'warning', label: 'In Progress' },
    pending_review: { cls: 'warning', label: 'Pending Review' },
    flagged: { cls: 'danger', label: 'Flagged' },
    expired: { cls: 'danger', label: 'Expired' },
  };
  const s = map[status] || { cls: 'neutral', label: status || 'N/A' };
  return `<span class="badge badge-${s.cls}">${s.label}</span>`;
}

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
          <div class="stat-value">${s.totalStudents}</div>
          <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card emerald">
          <div class="stat-icon emerald"><i class="ph ph-file-text"></i></div>
          <div class="stat-value">${s.publishedExams}/${s.totalExams}</div>
          <div class="stat-label">Published / Total Exams</div>
        </div>
        <div class="stat-card cyan">
          <div class="stat-icon cyan"><i class="ph ph-question"></i></div>
          <div class="stat-value">${s.totalQuestions}</div>
          <div class="stat-label">Total Questions</div>
        </div>
        <div class="stat-card amber">
          <div class="stat-icon amber"><i class="ph ph-check-circle"></i></div>
          <div class="stat-value">${s.pendingReview}</div>
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
                const ld = data.levelDistribution.find(l => l.level === level);
                const count = ld ? ld.count : 0;
                const total = data.levelDistribution.reduce((a, b) => a + b.count, 0);
                const pct = total ? Math.round(count / total * 100) : 0;
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
            <div class="empty-state">
              <p>No scores computed yet</p>
            </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: STUDENT MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

async function renderStudentManager(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/admin/students';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderStudentManager(true);
    return;
  }

  if (!isBackground && !main.querySelector('.data-table')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const [data, batchesData] = await Promise.all([
      api('/api/admin/students'),
      api('/api/admin/batches')
    ]);

    const batchOptions = batchesData.batches.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-users"></i> Student Manager</h1>
          <p class="page-subtitle">${data.total} students total</p>
        </div>
        <div class="btn-group">
          <button class="btn btn-outline" onclick="openBatchManagerModal()"><i class="ph ph-users"></i> Manage Batches</button>
          <button class="btn btn-outline" onclick="openBulkImportModal()"><i class="ph ph-folder"></i> Bulk Import</button>
          <button class="btn btn-primary" onclick="openAddStudentModal()">+ Add Student</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="flex-direction: column; align-items: stretch; gap: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
            <div class="search-bar" style="flex:1;">
              <span class="search-icon"><i class="ph ph-magnifying-glass"></i></span>
              <input type="text" class="form-input" id="student-search" placeholder="Search students by name, email or roll no..." oninput="fetchFilteredStudents()">
            </div>
            <select class="form-select" id="student-batch-filter" onchange="fetchFilteredStudents()" style="max-width: 250px;">
              <option value="">All Batches</option>
              ${batchOptions}
            </select>
          </div>
          
          <!-- Bulk Action Bar -->
          <div id="bulk-action-bar" style="display: none; padding: 10px; background: rgba(99,102,241,0.1); border-radius: 8px; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--accent-indigo);"><span id="selected-student-count">0</span> students selected</span>
            <div class="btn-group">
              <button class="btn btn-outline btn-sm" onclick="openBulkAssignBatchModal()">Assign to Batch</button>
              <button class="btn btn-danger btn-sm" onclick="bulkDeleteStudents()">Delete Selected</button>
            </div>
          </div>
        </div>
        
        <div class="table-container" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllStudents" onchange="toggleAllStudents(this)"></th>
                <th>Name</th>
                <th>Reg / Roll No</th>
                <th>Composite Score</th>
                <th>Batches</th>
                <th>Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="students-tbody">
              ${data.students.map((s, idx) => `
                <tr class="animate-slide-up" style="animation-delay: ${idx * 0.05}s">
                  <td style="text-align: center;"><input type="checkbox" class="student-checkbox" value="${s.id}" onchange="updateBulkActionBar()"></td>
                  <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(s.name)}</td>
                  <td><code style="background:rgba(99,102,241,0.12); padding:3px 8px; border-radius:6px; font-weight:700; color:var(--accent-indigo-light); font-family:monospace;">${escapeHtml(s.roll_no || '—')}</code></td>
                  <td>${s.total_score !== null ? `<span class="font-mono">${s.total_score}/5000</span>` : '—'}</td>
                  <td><span class="badge badge-neutral" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;" title="${escapeHtml(s.batches || 'None')}">${escapeHtml(s.batches || 'None')}</span></td>
                  <td>${s.level ? levelBadge(s.level) : '<span class="badge badge-neutral">Pending</span>'}</td>
                  <td>${s.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
                  <td>
                    <div class="btn-group">
                      <button class="btn btn-action btn-sm" onclick="editStudent(${s.id})" title="Reset Exams"><i class="ph ph-arrows-clockwise"></i></button>
                      <button class="btn btn-action btn-sm" onclick="deleteStudent(${s.id}, '${escapeHtml(s.name)}')" title="Deactivate"><i class="ph ph-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${data.students.length === 0 ? '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No students yet. Click "Add Student" or "Bulk Import" to get started.</td></tr>' : ''}
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
      const search = document.getElementById('student-search').value;
      const batchId = document.getElementById('student-batch-filter').value;
      
      let url = `/api/admin/students?search=${encodeURIComponent(search)}`;
      if (batchId) {
        url += `&batch_id=${batchId}`;
      }

      const data = await api(url);
      const tbody = document.getElementById('students-tbody');
      if (!tbody) return;
      tbody.innerHTML = data.students.map((s, idx) => `
        <tr class="animate-slide-up" style="animation-delay: ${idx * 0.05}s">
          <td style="text-align: center;"><input type="checkbox" class="student-checkbox" value="${s.id}" onchange="updateBulkActionBar()"></td>
          <td style="font-weight:600; color:var(--text-primary);">${escapeHtml(s.name)}</td>
          <td><code style="background:rgba(99,102,241,0.12); padding:3px 8px; border-radius:6px; font-weight:700; color:var(--accent-indigo-light); font-family:monospace;">${escapeHtml(s.roll_no || '—')}</code></td>
          <td>${s.total_score !== null ? `<span class="font-mono">${s.total_score}/5000</span>` : '—'}</td>
          <td><span class="badge badge-neutral" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle;" title="${escapeHtml(s.batches || 'None')}">${escapeHtml(s.batches || 'None')}</span></td>
          <td>${s.level ? levelBadge(s.level) : '<span class="badge badge-neutral">Pending</span>'}</td>
          <td>${s.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-action btn-sm" onclick="editStudent(${s.id})" title="Reset Exams"><i class="ph ph-arrows-clockwise"></i></button>
              <button class="btn btn-action btn-sm" onclick="deleteStudent(${s.id}, '${escapeHtml(s.name)}')" title="Deactivate"><i class="ph ph-trash"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
      if (data.students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No students found matching your criteria.</td></tr>';
      }
    } catch (err) {
      showToast('Search failed', 'error');
    }
  }, 300);
}

function openAddStudentModal() {
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
    </form>
  `, `
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="submitAddStudent()">Add Student</button>
  `);
}

async function submitAddStudent() {
  try {
    await api('/api/admin/students', {
      method: 'POST',
      body: {
        name: document.getElementById('new-student-name').value,
        roll_no: document.getElementById('new-student-roll').value,
      },
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
    data.batches.forEach(b => {
      batchOptions += `<option value="${b.id}">${b.name}</option>`;
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
        <select id="bulk-import-batch" class="form-control">
          ${batchOptions}
        </select>
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
  const batchId = document.getElementById('bulk-import-batch').value;
  
  if (!fileInput.files[0]) return showToast('Select a file to import', 'warning');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  if (batchId) {
    formData.append('batch_id', batchId);
  }

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
  const checkboxes = document.querySelectorAll('.student-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateBulkActionBar();
}

function updateBulkActionBar() {
  const selectedCount = document.querySelectorAll('.student-checkbox:checked').length;
  const actionBar = document.getElementById('bulk-action-bar');
  const countSpan = document.getElementById('selected-student-count');
  const selectAll = document.getElementById('selectAllStudents');
  
  if (selectedCount > 0) {
    actionBar.style.display = 'flex';
    countSpan.textContent = selectedCount;
  } else {
    actionBar.style.display = 'none';
  }
  
  const totalCheckboxes = document.querySelectorAll('.student-checkbox').length;
  if (selectAll && totalCheckboxes > 0) {
    selectAll.checked = selectedCount === totalCheckboxes;
  }
}

function getSelectedStudentIds() {
  const checkboxes = document.querySelectorAll('.student-checkbox:checked');
  return Array.from(checkboxes).map(cb => parseInt(cb.value));
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
    if (data.batches.length === 0) {
      return showToast('No batches available. Create a batch first.', 'warning');
    }
    
    let options = '<option value="">-- Select a Batch --</option>';
    data.batches.forEach(b => {
      options += `<option value="${b.id}">${b.name} (${b.student_count} students)</option>`;
    });
    
    const html = `
      <p>Assigning <strong>${studentIds.length}</strong> students to a batch:</p>
      <div class="form-group">
        <select id="bulk-batch-select" class="form-control">
          ${options}
        </select>
      </div>
    `;
    const footer = `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveBulkBatch()">Assign Batch</button>
    `;
    
    openModal('Bulk Assign to Batch', html, footer);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveBulkBatch() {
  const batchId = document.getElementById('bulk-batch-select').value;
  if (!batchId) return showToast('Please select a batch', 'warning');
  
  const studentIds = getSelectedStudentIds();
  try {
    await api('/api/admin/students/bulk-batch', {
      method: 'POST',
      body: JSON.stringify({ student_ids: studentIds, batch_id: parseInt(batchId) })
    });
    showToast(`Assigned ${studentIds.length} students to batch`, 'success');
    closeModal();
    renderStudentManager(); // reload to clear selection
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
    await api('/api/admin/batches', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    showToast('Batch created', 'success');
    openBatchManagerModal(); // Reload the modal
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteBatch(id) {
  if (!confirm('Are you sure you want to delete this batch? Students will remain, but lose this batch assignment.')) return;
  try {
    await api(`/api/admin/batches/${id}`, { method: 'DELETE' });
    showToast('Batch deleted', 'success');
    openBatchManagerModal(); // Reload the modal
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editStudent(id) {
  try {
    const data = await api('/api/admin/students?search=');
    const student = data.students.find(s => s.id === id);
    if (!student) return showToast('Student not found', 'error');

    openModal('Reset Student Exams', `
      <p style="margin-bottom: var(--sp-md); font-size: 1.1rem;">
        Are you sure you want to discard all exams and scores for <strong>${escapeHtml(student.name)}</strong> (${escapeHtml(student.roll_no)})?
      </p>
      <div class="alert alert-warning">
        <i class="ph ph-warning"></i> This action cannot be undone. All submitted answers, auto-grades, and manually reviewed scores will be permanently deleted for this student.
      </div>
    `, `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="submitResetStudentExams(${id})">Yes, Reset Exams</button>
    `);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitResetStudentExams(id) {
  try {
    await api(`/api/admin/students/${id}/exams`, { method: 'DELETE' });
    closeModal();
    showToast('Student exams have been reset', 'success');
    renderStudentManager();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

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

    const components = compData.components;
    const groupedExams = {};
    components.forEach(c => { groupedExams[c.id] = { component: c, exams: [] }; });
    examData.exams.forEach(e => {
      if (groupedExams[e.component_id]) {
        groupedExams[e.component_id].exams.push(e);
      }
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
  const html = `
    <div class="form-group">
      <label>Start Date & Time</label>
      <input type="datetime-local" id="edit-start-time" class="form-control" value="${dtLocal}">
    </div>
    <div class="form-group">
      <label>Duration (minutes)</label>
      <input type="number" id="edit-duration" class="form-control" value="${currentDuration}" min="1">
    </div>
  `;
  const footer = `
    <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveExamTime(${examId})">Save Changes</button>
  `;
  openModal('Edit Exam Time & Date', html, footer);
}

async function saveExamTime(examId) {
  const startTime = document.getElementById('edit-start-time').value;
  const duration = document.getElementById('edit-duration').value;
  
  if (!startTime || !duration) {
    showToast('Please fill all fields', 'error');
    return;
  }
  
  try {
    await api(`/api/admin/exams/${examId}`, {
      method: 'PUT',
      body: JSON.stringify({
        start_time: new Date(startTime).toISOString(),
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
        const checked = assignedIds.has(b.id) ? 'checked' : '';
        html += `
          <div style="padding: 10px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" id="batch_${b.id}" class="exam-batch-checkbox" value="${b.id}" ${checked}>
            <label for="batch_${b.id}" style="margin: 0; cursor: pointer; flex: 1;">
              <strong>${b.name}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${b.student_count} students</div>
            </label>
          </div>
        `;
      });
    }
    html += '</div>';
    
    const footer = `
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveExamBatches(${examId})">Save Assignments</button>
    `;
    
    openModal('Assign Batches to Exam', html, footer);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveExamBatches(examId) {
  const checkboxes = document.querySelectorAll('.exam-batch-checkbox:checked');
  const batchIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
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
    if (selectedExamId) {
      loadExamQuestions(selectedExamId, true);
    }
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

      <div class="card mb-lg">
        <div class="form-group">
          <label class="form-label">Select Exam</label>
          <select class="form-select" id="qm-exam-select" onchange="loadExamQuestions(this.value)">
            <option value="">— Select an exam —</option>
            ${examData.exams.map(e => `
              <option value="${e.id}" ${e.id == selectedExamId ? 'selected' : ''}>
                ${e.component_name} — ${e.title} (${e.question_count} Qs, ${e.total_question_marks}/${e.total_marks} marks)
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      <div id="qm-content"></div>
    `;

    main.innerHTML = html;
    App.sectionCache[cacheKey] = html;

    if (selectedExamId) {
      loadExamQuestions(selectedExamId);
    }
  } catch (err) {
    if (!isBackground) main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${err.message}</p></div>`;
  }
}

async function loadExamQuestions(examId, isBackground = false) {
  if (!examId) {
    const contentEl = document.getElementById('qm-content');
    if (contentEl) contentEl.innerHTML = '';
    return;
  }

  const container = document.getElementById('qm-content');
  const activeTabName = container.querySelector('.tab.active')?.dataset?.tab || 'qm-existing';

  if (!isBackground || !container.querySelector('.data-table')) {
    container.innerHTML = `<div class="loading-overlay"><div class="spinner"></div></div>`;
  }

  try {
    const data = await api(`/api/admin/exams/${examId}/questions`);

    container.innerHTML = `
      <!-- Tabs: Questions / AI Generate / Upload -->
      <div class="tabs">
        <button class="tab active" data-tab="qm-existing" onclick="switchQmTab(this, 'qm-existing')">
          <i class="ph ph-clipboard-text"></i> Questions (${data.summary.questionCount})
        </button>
        <button class="tab" data-tab="qm-manual" onclick="switchQmTab(this, 'qm-manual')">
          <i class="ph ph-pencil-simple"></i> Add Manual
        </button>
        <button class="tab" data-tab="qm-ai" onclick="switchQmTab(this, 'qm-ai')">
          <i class="ph ph-robot"></i> AI Generate
        </button>
        <button class="tab" data-tab="qm-upload" onclick="switchQmTab(this, 'qm-upload')">
          <i class="ph ph-folder"></i> Upload File
        </button>
      </div>

      <!-- TAB: Existing Questions -->
      <div class="tab-content active" id="qm-existing">
        <div class="flex justify-between items-center mb-md">
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
              <thead><tr><th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllQuestions" onchange="toggleAllQuestions(this)"></th><th>#</th><th>Type</th><th>Content</th><th>Marks</th><th>Source</th><th>Actions</th></tr></thead>
              <tbody>
                ${data.questions.map((q, i) => `
                  <tr class="animate-slide-up" style="animation-delay: ${i * 0.05}s">
                    <td style="text-align: center;"><input type="checkbox" class="question-checkbox" value="${q.id}" onchange="updateQuestionBulkActionBar()"></td>
                    <td>${i + 1}</td>
                    <td><span class="badge badge-info">${q.type}</span></td>
                    <td style="max-width:400px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(q.content)}</td>
                    <td class="font-mono">${q.marks}</td>
                    <td><span class="badge ${q.source === 'ai_generated' ? 'badge-warning' : 'badge-neutral'}">${q.source === 'ai_generated' ? '<i class="ph ph-robot"></i> AI' : '<i class="ph ph-pencil-simple"></i> Manual'}</span></td>
                    <td>
                      <button class="btn btn-action btn-sm" onclick="viewQuestion(${q.id}, ${examId})" title="View Details"><i class="ph ph-eye"></i></button>
                      <button class="btn btn-action btn-sm" onclick="editExistingQuestion(${q.id}, ${examId})" title="Edit Question"><i class="ph ph-pencil-simple"></i></button>
                      <button class="btn btn-action btn-sm" onclick="deleteQuestion(${q.id}, ${examId})" title="Delete Question"><i class="ph ph-trash"></i></button>
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
      <div class="tab-content" id="qm-manual">
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
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                  <option value="D">D</option>
                </select>
              </div>
            </div>
            <div id="mq-answer-section" class="hidden">
              <div class="form-group">
                <label class="form-label">Model Answer / Hint</label>
                <textarea class="form-textarea" id="mq-answer" rows="3" placeholder="Model answer..."></textarea>
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
              <select class="form-select" id="ai-qtype">
                <option value="auto">Auto (Component Default)</option>
                <option value="mcq">MCQ Only</option>
                <option value="subjective">Subjective Only</option>
                <option value="programming">Programming Only</option>
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
            <textarea class="form-textarea" id="ai-description" rows="2" placeholder="Focus on traversal algorithms, balanced BSTs..."></textarea>
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
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

function updateManualForm() {
  const type = document.getElementById('mq-type').value;
  const optSection = document.getElementById('mq-options-section');
  const ansSection = document.getElementById('mq-answer-section');

  if (type === 'mcq') {
    optSection.classList.remove('hidden');
    ansSection.classList.add('hidden');
  } else {
    optSection.classList.add('hidden');
    ansSection.classList.remove('hidden');
  }
}

async function submitManualQuestion(examId) {
  try {
    const type = document.getElementById('mq-type').value;
    const content = document.getElementById('mq-content').value;

    if (!content.trim()) return showToast('Please enter question content', 'warning');

    if (!confirm('Are you sure you want to add this question to the exam?')) return;

    const body = {
      type,
      marks: parseInt(document.getElementById('mq-marks').value),
      content,
      difficulty: document.getElementById('mq-difficulty').value,
    };

    if (type === 'mcq') {
      body.options = [
        document.getElementById('mq-opt-a').value,
        document.getElementById('mq-opt-b').value,
        document.getElementById('mq-opt-c').value,
        document.getElementById('mq-opt-d').value,
      ];
      body.correct_answer = document.getElementById('mq-correct').value;
    } else {
      body.correct_answer = document.getElementById('mq-answer').value;
    }

    await api(`/api/admin/exams/${examId}/questions`, { method: 'POST', body });
    showToast('Question added', 'success');
    loadExamQuestions(examId, true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function generateAIQuestions(examId) {
  const btn = document.getElementById('ai-generate-btn');
  const preview = document.getElementById('ai-preview');
  const topic = document.getElementById('ai-topic').value;

  if (!topic) return showToast('Enter a topic', 'warning');

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Generating...';
  preview.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><p>Generating questions with Gemini AI...</p></div>`;

  try {
    const qTypeVal = document.getElementById('ai-qtype').value;
    let questionTypes = undefined;
    if (qTypeVal !== 'auto') {
      questionTypes = { [qTypeVal]: 20 }; // default to generating approx 20 marks worth of this type
    }

    const data = await api(`/api/admin/exams/${examId}/questions/generate`, {
      method: 'POST',
      body: {
        topic,
        description: document.getElementById('ai-description').value,
        difficulty: document.getElementById('ai-difficulty').value,
        questionTypes
      },
    });

    if (data.questions.length === 0) {
      preview.innerHTML = `<div class="empty-state"><p>No questions generated. Try adjusting the topic.</p></div>`;
      return;
    }

    // Store globally to avoid inline HTML stringification issues
    window.__tempAiQuestions = data.questions;

    // Show editable preview
    preview.innerHTML = `
      <div class="card-header">
        <h4>Generated ${data.questions.length} Questions — Review & Save</h4>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>#</th><th>Type</th><th>Content</th><th>Marks</th><th>Keep</th></tr></thead>
          <tbody>
            ${data.questions.map((q, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><span class="badge badge-info">${q.type}</span></td>
                <td style="max-width:400px; font-size:0.8rem;">${escapeHtml(q.content).substring(0, 150)}${q.content.length > 150 ? '...' : ''}</td>
                <td class="font-mono">${q.marks}</td>
                <td><input type="checkbox" checked data-idx="${i}"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="mt-md flex gap-sm">
        <button class="btn btn-success" onclick="saveGeneratedQuestions(${examId})">
          <i class="ph ph-check-circle"></i> Save Selected Questions
        </button>
        <button class="btn btn-outline" onclick="document.getElementById('ai-preview').innerHTML=''">
          ✗ Discard All
        </button>
      </div>
    `;
  } catch (err) {
    preview.innerHTML = `<div class="empty-state" style="color:var(--accent-rose);"><p>Generation failed: ${err.message}</p></div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-rocket-launch"></i> Generate Questions';
  }
}

async function saveGeneratedQuestions(examId) {
  if (!window.__tempAiQuestions) return showToast('No questions to save', 'error');

  const checkboxes = document.querySelectorAll('#ai-preview input[type="checkbox"]');
  const selected = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      selected.push(window.__tempAiQuestions[parseInt(cb.dataset.idx)]);
    }
  });

  if (selected.length === 0) return showToast('No questions selected', 'warning');

  if (!confirm(`Are you sure you want to save ${selected.length} AI-generated questions to the exam?`)) return;

  try {
    await api(`/api/admin/exams/${examId}/questions/save-generated`, {
      method: 'POST',
      body: { questions: selected },
    });
    showToast(`Saved ${selected.length} AI-generated questions`, 'success');
    loadExamQuestions(examId, true);
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
    loadExamQuestions(examId, true);
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
      <div class="mb-md"><span class="badge badge-info">${q.type}</span> <span class="badge badge-neutral">${q.marks} marks</span> <span class="badge ${q.source === 'ai_generated' ? 'badge-warning' : 'badge-neutral'}">${q.source}</span></div>
      <div class="mb-md"><strong>Question:</strong><br>${escapeHtml(q.content)}</div>
    `;

    if (q.options) {
      detailHtml += `<div class="mb-md"><strong>Options:</strong><br>${q.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${escapeHtml(o)}`).join('<br>')}</div>`;
    }
    if (q.correct_answer) {
      detailHtml += `<div class="mb-md"><strong>Correct Answer:</strong> ${escapeHtml(q.correct_answer)}</div>`;
    }

    openModal(`Question #${qId}`, detailHtml);
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
      type: q.type,
      marks: q.marks,
      difficulty: q.difficulty || 'medium',
      content: q.content,
      options: q.options ? [...q.options] : [],
      correct_answer: q.correct_answer || ''
    };

    let editHtml = `
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
            <input type="number" class="form-input" id="edit-q-marks" value="${q.marks}" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Difficulty</label>
            <select class="form-select" id="edit-q-difficulty">
              <option value="easy" ${q.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
              <option value="medium" ${q.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="hard" ${q.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Content</label>
          <textarea class="form-textarea" id="edit-q-content" rows="4">${escapeHtml(q.content)}</textarea>
        </div>
        
        <div id="edit-q-mcq-section" style="${q.type === 'mcq' ? 'display:block' : 'display:none'}">
          <div class="form-group">
            <label class="form-label">Options (MCQ)</label>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <input type="text" class="form-input" id="edit-q-opt-0" placeholder="Option A" value="${q.options && q.options[0] ? escapeHtml(q.options[0]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-1" placeholder="Option B" value="${q.options && q.options[1] ? escapeHtml(q.options[1]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-2" placeholder="Option C" value="${q.options && q.options[2] ? escapeHtml(q.options[2]) : ''}">
              <input type="text" class="form-input" id="edit-q-opt-3" placeholder="Option D" value="${q.options && q.options[3] ? escapeHtml(q.options[3]) : ''}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Correct Answer</label>
            <select class="form-select" id="edit-q-correct">
              <option value="A" ${q.correct_answer === 'A' ? 'selected' : ''}>A</option>
              <option value="B" ${q.correct_answer === 'B' ? 'selected' : ''}>B</option>
              <option value="C" ${q.correct_answer === 'C' ? 'selected' : ''}>C</option>
              <option value="D" ${q.correct_answer === 'D' ? 'selected' : ''}>D</option>
            </select>
          </div>
        </div>
        
        <div id="edit-q-nonmcq-section" style="${q.type !== 'mcq' ? 'display:block' : 'display:none'}">
          <div class="form-group">
            <label class="form-label">Model Answer / Hint</label>
            <textarea class="form-textarea" id="edit-q-correct-text" rows="3">${escapeHtml(q.correct_answer && q.type !== 'mcq' ? q.correct_answer : '')}</textarea>
          </div>
        </div>
        
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
          <button type="button" class="btn btn-primary" onclick="saveEditedQuestion(${q.id}, ${examId})">Save Changes</button>
        </div>
      </form>
    `;
    openModal(`Edit Question #${qId}`, editHtml);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function toggleEditOptions(type) {
  if (type === 'mcq') {
    document.getElementById('edit-q-mcq-section').style.display = 'block';
    document.getElementById('edit-q-nonmcq-section').style.display = 'none';
  } else {
    document.getElementById('edit-q-mcq-section').style.display = 'none';
    document.getElementById('edit-q-nonmcq-section').style.display = 'block';
  }
}

async function saveEditedQuestion(qId, examId) {
  try {
    const type = document.getElementById('edit-q-type').value;
    const marks = parseInt(document.getElementById('edit-q-marks').value, 10);
    const difficulty = document.getElementById('edit-q-difficulty').value;
    const content = document.getElementById('edit-q-content').value;

    let opts = [];
    let correct = '';
    if (type === 'mcq') {
      opts = [
        document.getElementById('edit-q-opt-0').value,
        document.getElementById('edit-q-opt-1').value,
        document.getElementById('edit-q-opt-2').value,
        document.getElementById('edit-q-opt-3').value
      ].filter(o => o.trim() !== '');
      if (opts.length < 2) throw new Error('At least 2 options required for MCQ');
      correct = document.getElementById('edit-q-correct').value;
    } else {
      opts = [];
      correct = document.getElementById('edit-q-correct-text').value;
    }

    const payload = { type, marks, difficulty, content, options: opts, correct_answer: correct };

    // Check if question is already saved with identical content
    if (window.__editingQuestionOriginal) {
      const orig = window.__editingQuestionOriginal;
      const isUnchanged =
        payload.type === orig.type &&
        payload.marks === orig.marks &&
        payload.difficulty === orig.difficulty &&
        payload.content.trim() === orig.content.trim() &&
        JSON.stringify(payload.options) === JSON.stringify(orig.options) &&
        payload.correct_answer.trim() === orig.correct_answer.trim();

      if (isUnchanged) {
        showToast('No changes detected — question is already saved.', 'info');
        closeModal();
        return;
      }
    }

    if (!confirm('Are you sure you want to save the changes to this question?')) {
      return;
    }

    await api(`/api/admin/questions/${qId}`, { method: 'PUT', body: payload });
    showToast('Question updated', 'success');
    closeModal();
    loadExamQuestions(examId, true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteQuestion(qId, examId) {
  if (!confirm('Delete this question?')) return;
  try {
    await api(`/api/admin/questions/${qId}`, { method: 'DELETE' });
    showToast('Question deleted', 'success');
    loadExamQuestions(examId, true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── BULK DELETE QUESTIONS ──────────────────────────────────────────────────

function toggleAllQuestions(checkbox) {
  const checkboxes = document.querySelectorAll('.question-checkbox');
  checkboxes.forEach(cb => cb.checked = checkbox.checked);
  updateQuestionBulkActionBar();
}

function updateQuestionBulkActionBar() {
  const selectedCount = document.querySelectorAll('.question-checkbox:checked').length;
  const actionBar = document.getElementById('q-bulk-action-bar');
  const countSpan = document.getElementById('q-selected-count');
  const selectAll = document.getElementById('selectAllQuestions');
  
  if (selectedCount > 0) {
    actionBar.style.display = 'flex';
    countSpan.textContent = selectedCount;
  } else {
    actionBar.style.display = 'none';
  }
  
  const totalCheckboxes = document.querySelectorAll('.question-checkbox').length;
  if (selectAll && totalCheckboxes > 0) {
    selectAll.checked = selectedCount === totalCheckboxes;
  }
}

function getSelectedQuestionIds() {
  const checkboxes = document.querySelectorAll('.question-checkbox:checked');
  return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

async function bulkDeleteQuestions(examId) {
  const qIds = getSelectedQuestionIds();
  if (qIds.length === 0) return;
  
  if (!confirm(`Are you sure you want to delete ${qIds.length} questions?`)) return;
  
  try {
    await api(`/api/admin/exams/${examId}/questions/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ question_ids: qIds })
    });
    showToast(`Deleted ${qIds.length} questions`, 'success');
    loadExamQuestions(examId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN: SCORE REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

async function renderScoreReports(isBackground = false) {
  const main = document.getElementById('main-content');
  const cacheKey = '#/admin/scores';

  if (!isBackground && App.sectionCache[cacheKey]) {
    main.innerHTML = App.sectionCache[cacheKey];
    renderScoreReports(true);
    return;
  }

  if (!isBackground && !main.querySelector('.data-table')) {
    main.innerHTML = `<div class="loading-overlay"><div class="spinner spinner-lg"></div></div>`;
  }

  try {
    const data = await api('/api/scores/all');
    const s = data.summary;

    const html = `
      <div class="page-header">
        <div>
          <h1><i class="ph ph-trend-up"></i> Scores & Reports</h1>
          <p class="page-subtitle">Composite scoring: S = 3T + 3L + 2O + 2W (Max: 5000)</p>
        </div>
        <div class="btn-group">
          <button class="btn btn-outline" onclick="recomputeAll()"><i class="ph ph-arrows-clockwise"></i> Recompute All</button>
          <a href="/api/scores/export" class="btn btn-success" target="_blank"><i class="ph ph-download-simple"></i> Export CSV</a>
        </div>
      </div>

      ${s ? `
        <div class="stats-grid">
          <div class="stat-card indigo">
            <div class="stat-icon indigo"><i class="ph ph-users"></i></div>
            <div class="stat-value">${s.total_students}</div>
            <div class="stat-label">Students Scored</div>
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
          <h3 class="card-title">All Student Scores</h3>
          <div class="search-bar">
            <span class="search-icon"><i class="ph ph-magnifying-glass"></i></span>
            <input type="text" class="form-input" placeholder="Search..." id="score-search">
          </div>
        </div>
        <div class="table-container" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Roll No</th>
                <th style="text-align:right;">Tech (/500)</th>
                <th style="text-align:right;">Apt (/500)</th>
                <th style="text-align:right;">Oral (/500)</th>
                <th style="text-align:right;">Written (/500)</th>
                <th style="text-align:right;">Composite (/5000)</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              ${data.scores.map(sc => `
                <tr>
                  <td style="font-weight:600; color:var(--text-primary);">${sc.name}</td>
                  <td>${sc.roll_no || '—'}</td>
                  <td class="font-mono text-right">${sc.t_score}</td>
                  <td class="font-mono text-right">${sc.l_score}</td>
                  <td class="font-mono text-right">${sc.o_score}</td>
                  <td class="font-mono text-right">${sc.w_score}</td>
                  <td class="font-mono text-right" style="font-weight:700; color:var(--text-primary);">${sc.total_score}</td>
                  <td>${levelBadge(sc.level)}</td>
                </tr>
              `).join('')}
              ${data.scores.length === 0 ? '<tr><td colspan="8" class="text-center text-muted" style="padding:32px;">No scores computed yet. Students must complete exams first.</td></tr>' : ''}
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
// EVALUATOR QUEUE (shared by admin + evaluator)
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

let examState = { questions: [], currentIdx: 0, responses: {}, session: null, timerInterval: null };

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
    examState.session = data.session;
    examState.currentIdx = 0;
    
    // Reset proctoring state
    examState.tabSwitches = 0;

    // Enforce Chrome & Laptop
    if (!setupProctoring(examId)) return;

    renderExamUI(examId);
    startExamTimer(data.session.ends_at);
  } catch (err) {
    main.innerHTML = `<div class="empty-state"><h3>${err.message}</h3><a href="#/student/dashboard" class="btn btn-outline mt-md"><i class="ph ph-arrow-left"></i> Back to Dashboard</a></div>`;
  }
}

function renderExamUI(examId) {
  const main = document.getElementById('main-content');
  const q = examState.questions[examState.currentIdx];
  if (!q) return;

  const currentAnswer = examState.responses[q.id] || '';

  main.innerHTML = `
    <div class="exam-timer" id="exam-timer">
      <span><i class="ph ph-timer"></i></span>
      <span class="timer-value" id="timer-display">--:--</span>
    </div>

    <div style="max-width:900px; margin:0 auto;">
      <div class="flex justify-between items-center mb-md">
        <h2>${examState.session.exam_id ? 'Exam' : 'Exam'}</h2>
        <button class="btn btn-danger" onclick="submitExam(${examId})"><i class="ph ph-upload-simple"></i> Submit Exam</button>
      </div>

      <!-- Question Navigation -->
      <div class="question-nav">
        ${examState.questions.map((qq, i) => {
          const answered = examState.responses[qq.id] ? 'answered' : '';
          const current = i === examState.currentIdx ? 'current' : '';
          return `<div class="question-dot ${answered} ${current}" onclick="goToQuestion(${i}, ${examId})">${i + 1}</div>`;
        }).join('')}
      </div>

      <!-- Question Card -->
      <div class="card" style="animation:fadeIn 0.3s ease;">
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

        ${q.type === 'mcq' && q.options ? `
          <div class="mcq-options">
            ${q.options.map((opt, oi) => {
              const letter = String.fromCharCode(65 + oi);
              const selected = currentAnswer === letter ? 'selected' : '';
              return `
                <div class="mcq-option ${selected}" onclick="selectMCQ('${letter}', ${q.id}, ${examId})">
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
            spellcheck="false" autocomplete="off" autocorrect="off" data-gramm="false" data-lt-active="false" data-dashlane-rm="true"
            style="${q.type === 'programming' ? 'font-family:monospace; font-size:0.9rem;' : ''}"
          >${escapeHtml(currentAnswer)}</textarea>
        `}
      </div>

      <!-- Navigation -->
      <div class="flex justify-between mt-md">
        <button class="btn btn-outline" onclick="goToQuestion(${examState.currentIdx - 1}, ${examId})" ${examState.currentIdx === 0 ? 'disabled' : ''}>
          <i class="ph ph-arrow-left"></i> Previous
        </button>
        <button class="btn btn-primary" onclick="goToQuestion(${examState.currentIdx + 1}, ${examId})" ${examState.currentIdx === examState.questions.length - 1 ? 'disabled' : ''}>
          Next →
        </button>
      </div>
    </div>
  `;
}

function selectMCQ(letter, questionId, examId) {
  examState.responses[questionId] = letter;
  autoSaveResponse(questionId, letter, examId);
  renderExamUI(examId);
}

let activeRecognition = null;

function startOralRecording(qId, examId) {
  alert("Please ensure you are in a quiet environment before starting your oral exam.");

  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast("Speech recognition is not supported in this browser.", "error");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (activeRecognition) {
    activeRecognition.stop();
  }

  activeRecognition = new SpeechRecognition();
  activeRecognition.continuous = true;
  activeRecognition.interimResults = true;
  activeRecognition.lang = 'en-US';

  const btn = document.getElementById('btn-start-recording');
  const status = document.getElementById('recording-status');
  const display = document.getElementById('oral-transcript-display');

  btn.innerHTML = '<i class="ph ph-stop-circle"></i> Stop Recording';
  btn.classList.replace('btn-primary', 'btn-danger');
  btn.onclick = () => {
    if (activeRecognition) activeRecognition.stop();
  };
  
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
    console.error("Speech recognition error:", event.error);
    showToast("Microphone error: " + event.error, "error");
    stopOralRecording(qId, examId, finalTranscript);
  };

  activeRecognition.onend = () => {
    stopOralRecording(qId, examId, finalTranscript);
  };

  activeRecognition.start();
}

function stopOralRecording(qId, examId, finalTranscript) {
  const btn = document.getElementById('btn-start-recording');
  const status = document.getElementById('recording-status');
  
  if (btn) {
    btn.innerHTML = '<i class="ph ph-microphone"></i> Start Recording (Retake)';
    btn.classList.replace('btn-danger', 'btn-primary');
    btn.onclick = () => startOralRecording(qId, examId);
  }
  if (status) {
    status.style.display = 'none';
  }

  if (finalTranscript.trim()) {
    examState.responses[qId] = finalTranscript.trim();
    autoSaveResponse(qId, finalTranscript.trim(), examId);
  }
}

function goToQuestion(idx, examId) {
  if (idx < 0 || idx >= examState.questions.length) return;
  examState.currentIdx = idx;
  renderExamUI(examId);
}

let saveTimeout;
function autoSaveResponse(questionId, value, examId) {
  examState.responses[questionId] = value;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      await api('/api/student/responses', {
        method: 'POST',
        body: { question_id: questionId, answer_data: value, exam_id: examId },
      });
    } catch {}
  }, 1000);
}

function startExamTimer(endsAt) {
  if (examState.timerInterval) clearInterval(examState.timerInterval);

  examState.timerInterval = setInterval(() => {
    const now = new Date();
    const end = new Date(endsAt);
    const diff = Math.max(0, end - now);

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const display = document.getElementById('timer-display');
    const timer = document.getElementById('exam-timer');

    if (display) {
      display.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (timer) {
      timer.classList.toggle('warning', mins <= 10 && mins > 2);
      timer.classList.toggle('danger', mins <= 2);
    }

    if (diff <= 0) {
      clearInterval(examState.timerInterval);
      showToast('Time is up! Auto-submitting...', 'warning');
      submitExam(examState.session.exam_id, true);
    }
  }, 1000);
}

async function submitExam(examId, forceSubmit = false, remarks = null) {
  if (!forceSubmit && !confirm('Submit this exam? You cannot change your answers after submission.')) return;

  try {
    clearInterval(examState.timerInterval);
    cleanupProctoring(); // Remove proctoring listeners

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

// ─── PROCTORING LOGIC ───────────────────────────────────────────────────────

function setupProctoring(examId) {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  const isChrome = isGoogleChrome();
  
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

  // Enforce full screen
  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(err => {
      console.warn(`Error attempting to enable fullscreen: ${err.message}`);
    });
  }

  // Prevent copy/paste/contextmenu
  document.addEventListener('copy', preventEvent);
  document.addEventListener('cut', preventEvent);
  document.addEventListener('paste', preventEvent);
  document.addEventListener('contextmenu', preventEvent);

  // Track tab switches and blurring
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
      // Freeze screen
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
  document.removeEventListener('copy', preventEvent);
  document.removeEventListener('cut', preventEvent);
  document.removeEventListener('paste', preventEvent);
  document.removeEventListener('contextmenu', preventEvent);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('blur', handleBlur);
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

    // Filter exams that have been scored
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
      // Progress Chart Container
      html += `
        <div class="card mb-lg" style="padding:var(--sp-lg);">
          <h3 class="mb-md">Progress Chart</h3>
          <div style="position:relative; height:300px; width:100%;">
            <canvas id="progressChart"></canvas>
          </div>
        </div>
      `;

      // Exams Breakdown Tables
      html += `
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
                        <th>Q#</th>
                        <th>Question</th>
                        <th>Your Answer</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
        `;

        if (e.questions && e.questions.length > 0) {
          e.questions.forEach((q, idx) => {
            const isCorrect = q.marks_awarded > 0;
            const badgeCls = isCorrect ? 'badge-success' : 'badge-danger';
            const badgeText = isCorrect ? 'Correct' : 'Incorrect';
            html += `
                      <tr>
                        <td style="vertical-align:top;">${idx + 1}</td>
                        <td style="max-width:300px; white-space:normal; vertical-align:top;">${escapeHtml(q.content)}</td>
                        <td style="max-width:200px; white-space:normal; vertical-align:top;">
                          <div style="font-family:monospace; margin-bottom:var(--sp-xs);">${escapeHtml(q.student_answer || 'No answer')}</div>
                          ${!isCorrect && q.correct_answer ? `<div class="text-sm text-muted"><strong>Correct:</strong> <span style="color:var(--accent-emerald);">${escapeHtml(q.correct_answer)}</span></div>` : ''}
                        </td>
                        <td style="vertical-align:top;"><span class="badge ${badgeCls}">${badgeText}</span><br><span class="text-sm text-muted">${q.marks_awarded || 0}/${q.marks}</span></td>
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

    // Render Chart.js if data exists
    if (completedExams.length > 0) {
      setTimeout(() => {
        const ctx = document.getElementById('progressChart');
        if (ctx) {
          const labels = completedExams.map(e => e.title);
          const scores = completedExams.map(e => e.marks_obtained);
          new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Exam Score',
                data: scores,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4,
                fill: true,
                tension: 0.3
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  title: { display: true, text: 'Score' }
                }
              },
              plugins: {
                legend: { display: false }
              }
            }
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
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Forms
  const accessCodeForm = document.getElementById('access-code-form');
  if (accessCodeForm) accessCodeForm.addEventListener('submit', handleAccessCodeLogin);

  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) adminLoginForm.addEventListener('submit', handleAdminLogin);

  // Buttons & Toggles
  const topAdminBtn = document.getElementById('top-admin-toggle-btn');
  if (topAdminBtn) {
    topAdminBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleLoginView();
    });
  }

  const adminBackBtn = document.getElementById('admin-back-to-student-btn');
  if (adminBackBtn) adminBackBtn.addEventListener('click', () => toggleLoginView('student'));

  // Logout
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Globally prevent browser back button usage
  window.history.pushState(null, null, window.location.href);
  window.onpopstate = function () {
    window.history.go(1);
  };

  // Auto-refresh for Admin and Student dashboards
  setInterval(() => {
    // Only auto-refresh if no modal is active
    if (!document.querySelector('.modal.active')) {
      if (App.user?.role === 'admin' && document.getElementById('students-tbody') && document.activeElement !== document.getElementById('student-search')) {
        fetchFilteredStudents();
      } else if (App.user?.role === 'student' && document.getElementById('main-content').innerHTML.includes('My Exams')) {
        renderStudentDashboard();
      }
    }
  }, 15000);

  checkAuth();
});
