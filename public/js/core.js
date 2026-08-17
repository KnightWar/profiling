/**
 * core.js — Composite Assessment System
 * ════════════════════════════════════════
 * Shared infrastructure: state, API helper, auth, router, toast, modal.
 * Loaded by every role. After login, loads the correct role module via
 * dynamic <script> injection.
 *
 * Role modules populated by: admin.js, student.js, evaluator.js
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

const App = {
  user: null,
  currentPage: null,
  sectionCache: {},
  apiCache: {},
  _roleModuleLoaded: false,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE INVALIDATION — namespace-keyed (2.5)
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_NS = {
  students: 'students:',
  exams:    'exams:',
  questions: 'questions:',
  scores:   'scores:',
  batches:  'batches:',
  evaluator: 'evaluator:',
  all:      '*',
};

/**
 * Invalidate only the affected namespace rather than the whole cache.
 * @param {string} namespace  One of CACHE_NS values, or '*' for everything.
 */
function invalidateCache(namespace = '*') {
  if (namespace === '*') {
    App.apiCache = {};
    App.sectionCache = {};
    return;
  }
  const ns = namespace.replace(':', '');
  for (const key of Object.keys(App.apiCache)) {
    if (key.includes(ns)) delete App.apiCache[key];
  }
  // Section cache keys are route hashes (#/admin/students → 'students')
  for (const key of Object.keys(App.sectionCache)) {
    if (key.includes(ns)) delete App.sectionCache[key];
  }
}

/**
 * Derive cache namespace from request URL.
 * '/api/admin/students/bulk' → CACHE_NS.students
 */
function deriveNamespace(url) {
  // Order matters: more specific patterns first
  if (/\/exams\/\d+\/questions/.test(url)) return CACHE_NS.questions;
  if (url.includes('/batches'))            return CACHE_NS.batches;
  if (url.includes('/students'))           return CACHE_NS.students;
  if (url.includes('/exams'))              return CACHE_NS.exams;
  if (url.includes('/scores'))             return CACHE_NS.scores;
  if (url.includes('/evaluator'))          return CACHE_NS.evaluator;
  return CACHE_NS.all;
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
    invalidateCache(deriveNamespace(url));
  }

  return data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = {
    success: '<i class="ph ph-check"></i>',
    error:   '<i class="ph ph-x"></i>',
    info:    '<i class="ph ph-info"></i>',
    warning: '<i class="ph ph-warning"></i>',
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function isGoogleChrome() {
  const ua = navigator.userAgent || '';
  const vendor = navigator.vendor || '';

  const isEdge      = /Edg\/|EdgA\/|EdgiOS\//i.test(ua);
  const isOpera     = /OPR\/|Opera\//i.test(ua);
  const isVivaldi   = /Vivaldi\//i.test(ua);
  const isYandex    = /YaBrowser\//i.test(ua);
  const isSamsung   = /SamsungBrowser\//i.test(ua);
  const isUC        = /UCBrowser\//i.test(ua);
  const isFirefox   = /Firefox\//i.test(ua);
  const isSafari    = /Safari\//i.test(ua) && !/Chrome\//i.test(ua);
  const isBrave     = (navigator.brave && typeof navigator.brave.isBrave === 'function') || /Brave\//i.test(ua);
  const isChromiumOnly = /Chromium\//i.test(ua);

  if (isEdge || isOpera || isVivaldi || isYandex || isSamsung || isUC || isFirefox || isSafari || isBrave || isChromiumOnly) {
    return false;
  }

  const isChromeUA = /Chrome\//i.test(ua) && /Google Inc/i.test(vendor);
  if (!isChromeUA) return false;

  if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
    const brands = navigator.userAgentData.brands.map(b => b.brand);
    const hasEdge   = brands.some(b => b.includes('Edge') || b.includes('Microsoft Edge'));
    const hasOpera  = brands.some(b => b.includes('Opera'));
    const hasBrave  = brands.some(b => b.includes('Brave'));
    if (hasEdge || hasOpera || hasBrave) return false;

    const hasGoogleChrome = brands.includes('Google Chrome');
    if (hasGoogleChrome) return true;
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE MODULE LOADER (2.1)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dynamically injects the role-specific <script> tag(s) and waits for load.
 * admin → /dist/admin.js + /dist/evaluator.js
 * student → /dist/student.js
 * evaluator → /dist/evaluator.js
 */
function loadRoleModule(role) {
  if (App._roleModuleLoaded) return Promise.resolve();

  const cb = '?v=' + Date.now();
  const map = {
    admin:     ['/dist/admin.js' + cb, '/dist/evaluator.js' + cb],
    student:   ['/dist/student.js' + cb],
    evaluator: ['/dist/evaluator.js' + cb],
  };

  const scripts = map[role] || [];

  return Promise.all(scripts.map(src => new Promise((resolve, reject) => {
    // Avoid double-loading if already on page
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load role module: ${src}`));
    document.head.appendChild(s);
  }))).then(() => {
    App._roleModuleLoaded = true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

async function checkAuth() {
  try {
    const data = await api('/api/auth/me');
    App.user = data.user;
    await loadRoleModule(App.user.role);
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
    await loadRoleModule(App.user.role);
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
    btn.innerHTML = '<i class="ph ph-rocket-launch"></i> Enter Exam Session';
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
    await loadRoleModule(App.user.role);
    showToast(`Admin session started: ${App.user.name}`, 'success');
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ph ph-lock-key"></i> Admin Sign In';
  }
}

function toggleLoginView(view) {
  const studentView = document.getElementById('student-login-view');
  const adminView   = document.getElementById('admin-login-view');
  const toggleBtn   = document.getElementById('top-admin-toggle-btn');

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

async function handleLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {}
  App.user = null;
  App._roleModuleLoaded = false;
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
    { id: 'dashboard',  label: 'Dashboard',       icon: '<i class="ph ph-chart-bar"></i>',    hash: '#/admin/dashboard' },
    { section: 'Management' },
    { id: 'students',   label: 'Students',         icon: '<i class="ph ph-users"></i>',         hash: '#/admin/students' },
    { id: 'exams',      label: 'Exams',            icon: '<i class="ph ph-file-text"></i>',     hash: '#/admin/exams' },
    { id: 'questions',  label: 'Questions',        icon: '<i class="ph ph-question"></i>',      hash: '#/admin/questions' },
    { section: 'Results' },
    { id: 'scores',     label: 'Scores & Reports', icon: '<i class="ph ph-trend-up"></i>',      hash: '#/admin/scores' },
    { id: 'evaluator',  label: 'Evaluator Queue',  icon: '<i class="ph ph-check-circle"></i>',  hash: '#/admin/evaluator' },
  ],
  student: [
    { section: 'My Exams' },
    { id: 'student-dashboard', label: 'Dashboard',   icon: '<i class="ph ph-chart-bar"></i>',  hash: '#/student/dashboard' },
    { id: 'student-results',   label: 'My Results',  icon: '<i class="ph ph-trend-up"></i>',   hash: '#/student/results' },
  ],
  evaluator: [
    { section: 'Evaluation' },
    { id: 'eval-queue', label: 'Scoring Queue', icon: '<i class="ph ph-check-circle"></i>', hash: '#/evaluator/queue' },
    { id: 'eval-stats', label: 'My Stats',      icon: '<i class="ph ph-chart-bar"></i>',    hash: '#/evaluator/stats' },
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

// ROUTES is populated by role modules (admin.js, student.js, evaluator.js)
// so it must be declared here and extended by them.
const ROUTES = {};

function handleRoute() {
  if (!App.user) return;

  let hash = window.location.hash || '';

  // Default routes per role
  if (!hash || hash === '#/') {
    const defaults = {
      admin:     '#/admin/dashboard',
      student:   '#/student/dashboard',
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
// SHARED BADGE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function levelBadge(level) {
  const labels = { 3: 'Advanced', 2: 'Intermediate', 1: 'Foundational' };
  return `<span class="badge badge-level-${level}">${labels[level] || 'N/A'}</span>`;
}

function statusBadge(status) {
  const map = {
    submitted:      { cls: 'info',    label: 'Submitted' },
    graded:         { cls: 'success', label: 'Graded' },
    active:         { cls: 'warning', label: 'In Progress' },
    pending_review: { cls: 'warning', label: 'Pending Review' },
    flagged:        { cls: 'danger',  label: 'Flagged' },
    expired:        { cls: 'danger',  label: 'Expired' },
  };
  const s = map[status] || { cls: 'neutral', label: status || 'N/A' };
  return `<span class="badge badge-${s.cls}">${s.label}</span>`;
}

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

  checkAuth();
});
