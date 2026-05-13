// Tokenmeter renderer — UI logic, routing, chart rendering

const tm = window.tokenmeter;

// ── State ──────────────────────────────────────────────────────────────────
let usageData = null;
let charts = {};
let idleTimer = null;
let idleTimeout = 60000;
let isIdle = false;

// ── Formatting Helpers ─────────────────────────────────────────────────────
function fmtTokens(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function fmtCost(n) {
  if (n == null || isNaN(n)) return '~$0.00';
  return '~$' + n.toFixed(2);
}

function fmtRelTime(mtime) {
  const diff = Date.now() - mtime;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)   return 'just now';
  if (min < 60)  return `${min}m ago`;
  if (hr < 24)   return `${hr}h ago`;
  return `${day}d ago`;
}

function fmtTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pct(val, total) {
  if (!total) return 0;
  return Math.min(100, (val / total) * 100);
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

  document.getElementById(`page-${pageId}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-page="${pageId}"]`)?.classList.add('active');
  document.querySelector(`.sidebar-item[data-page="${pageId}"]`)?.classList.add('active');
}

// ── Chart Helpers ──────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  animation: { duration: 400 },
  plugins: { legend: { display: false }, tooltip: {
    backgroundColor: '#0e0e1a',
    borderColor: '#2a2a4a',
    borderWidth: 1,
    titleFont: { family: "'Space Mono', monospace", size: 10 },
    bodyFont: { family: "'Space Mono', monospace", size: 11 },
    callbacks: {
      label: ctx => ` ${fmtTokens(ctx.raw)} tokens`,
    }
  }},
  scales: {
    x: {
      stacked: true,
      grid: { color: '#1e1e35' },
      ticks: { color: '#5a5a7a', font: { family: "'Space Mono', monospace", size: 9 } },
    },
    y: {
      stacked: true,
      grid: { color: '#1e1e35' },
      ticks: {
        color: '#5a5a7a',
        font: { family: "'Space Mono', monospace", size: 9 },
        callback: v => fmtTokens(v),
      },
    },
  },
};

function makeBarChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  if (charts[canvasId]) { charts[canvasId].destroy(); }
  charts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: JSON.parse(JSON.stringify(CHART_DEFAULTS)),
  });
  return charts[canvasId];
}

function dailyLabels(daily) { return daily.map(d => d.label); }

// ── Render Overview ────────────────────────────────────────────────────────
function renderOverview(data) {
  const { claude, gemini, combined } = data;

  document.getElementById('ov-total-tokens').textContent = fmtTokens(combined.totalTokens);
  document.getElementById('ov-total-cost').textContent   = fmtCost(combined.estimatedCostUSD);
  document.getElementById('ov-active-clis').textContent  = `${combined.activeCLIs} / 2`;
  document.getElementById('ov-today').textContent        = fmtTokens(combined.todayTokens);
  document.getElementById('ov-today-cost').textContent   = fmtCost(combined.todayCost) + ' today';

  // Sidebar totals
  document.getElementById('sidebar-total-tokens').textContent = fmtTokens(combined.totalTokens);
  document.getElementById('sidebar-total-cost').textContent   = fmtCost(combined.estimatedCostUSD) + ' estimated';

  // Claude summary card
  const clTotal = claude.totalTokens || 0;
  const gmTotal = gemini.totalTokens || 0;
  const maxTokens = Math.max(clTotal, gmTotal, 1);

  if (claude.available) {
    document.getElementById('ov-claude-status').className = 'status-badge active';
    document.getElementById('ov-claude-status').innerHTML = '<div class="status-badge-dot"></div> Active';
  } else {
    document.getElementById('ov-claude-status').className = 'status-badge inactive';
    document.getElementById('ov-claude-status').innerHTML = '<div class="status-badge-dot"></div> Not Detected';
  }

  document.getElementById('ov-claude-input-bar').style.width  = pct(claude.totalInputTokens, clTotal) + '%';
  document.getElementById('ov-claude-output-bar').style.width = pct(claude.totalOutputTokens, clTotal) + '%';
  document.getElementById('ov-claude-input-val').textContent  = fmtTokens(claude.totalInputTokens);
  document.getElementById('ov-claude-output-val').textContent = fmtTokens(claude.totalOutputTokens);
  document.getElementById('ov-claude-sessions').textContent   = claude.totalSessions || 0;
  document.getElementById('ov-claude-tokens').textContent     = fmtTokens(clTotal);
  document.getElementById('ov-claude-cost').textContent       = fmtCost(claude.estimatedCostUSD);
  document.getElementById('sidebar-claude-badge').textContent = fmtTokens(clTotal);

  const claudeNote = document.getElementById('ov-claude-note');
  if (!claude.available) {
    claudeNote.textContent = `No Claude Code data found. Expected: %USERPROFILE%\\.claude\\projects\\**\\*.jsonl`;
    claudeNote.style.display = 'block';
  } else {
    claudeNote.style.display = 'none';
  }

  // Gemini summary card
  if (gemini.available) {
    document.getElementById('ov-gemini-status').className = 'status-badge active';
    document.getElementById('ov-gemini-status').innerHTML = '<div class="status-badge-dot"></div> Active';
  } else {
    document.getElementById('ov-gemini-status').className = 'status-badge inactive';
    document.getElementById('ov-gemini-status').innerHTML = '<div class="status-badge-dot"></div> Not Detected';
  }

  document.getElementById('ov-gemini-input-bar').style.width  = pct(gemini.totalInputTokens, gmTotal) + '%';
  document.getElementById('ov-gemini-output-bar').style.width = pct(gemini.totalOutputTokens, gmTotal) + '%';
  document.getElementById('ov-gemini-input-val').textContent  = fmtTokens(gemini.totalInputTokens);
  document.getElementById('ov-gemini-output-val').textContent = fmtTokens(gemini.totalOutputTokens);
  document.getElementById('ov-gemini-sessions').textContent   = gemini.totalSessions || 0;
  document.getElementById('ov-gemini-tokens').textContent     = fmtTokens(gmTotal);
  document.getElementById('ov-gemini-cost').textContent       = fmtCost(gemini.estimatedCostUSD);
  document.getElementById('sidebar-gemini-badge').textContent = fmtTokens(gmTotal);

  const geminiNote = document.getElementById('ov-gemini-note');
  if (!gemini.available && gemini.dataNote) {
    geminiNote.textContent = gemini.dataNote;
    geminiNote.style.display = 'block';
  } else {
    geminiNote.style.display = 'none';
  }

  // Combined daily chart
  const clDaily = claude.daily || [];
  const gmDaily = gemini.daily || [];
  const labels = dailyLabels(clDaily.length ? clDaily : gmDaily);

  const clValues = clDaily.map(d => d.totalTokens || 0);
  const gmValues = gmDaily.map(d => d.totalTokens || 0);

  makeBarChart('chart-combined-daily', labels, [
    { label: 'Claude', data: clValues, backgroundColor: 'rgba(212,162,122,0.75)', borderRadius: 3, borderSkipped: false },
    { label: 'Gemini', data: gmValues, backgroundColor: 'rgba(79,158,240,0.75)',  borderRadius: 3, borderSkipped: false },
  ]);
}

// ── Render Claude Detail ───────────────────────────────────────────────────
function renderClaude(data) {
  const cl = data.claude;
  if (!cl) return;

  document.getElementById('cl-header-sub').textContent =
    `${cl.totalSessions || 0} sessions · ${fmtCost(cl.estimatedCostUSD)} estimated`;

  document.getElementById('cl-input').textContent       = fmtTokens(cl.totalInputTokens);
  document.getElementById('cl-output').textContent      = fmtTokens(cl.totalOutputTokens);
  document.getElementById('cl-cache-read').textContent  = fmtTokens(cl.totalCacheReadTokens);
  document.getElementById('cl-cache-write').textContent = fmtTokens(cl.totalCacheWriteTokens);

  // Estimate savings from cache reads vs uncached
  const M = 1_000_000;
  // rough savings: assume sonnet default pricing (cache read $0.30 vs input $3.00)
  const savings = ((cl.totalCacheReadTokens || 0) / M) * (3.00 - 0.30);
  document.getElementById('cl-cache-savings').textContent = `saved ~$${savings.toFixed(2)} vs uncached`;

  // Daily chart
  const daily = cl.daily || [];
  makeBarChart('chart-claude-daily', dailyLabels(daily), [
    { label: 'Input',  data: daily.map(d => d.inputTokens),  backgroundColor: 'rgba(212,162,122,0.5)',  borderRadius: 3, borderSkipped: false },
    { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: 'rgba(212,162,122,0.85)', borderRadius: 3, borderSkipped: false },
  ]);

  // Model breakdown table
  const modelBreakdown = cl.modelBreakdown || {};
  const totalClTokens = cl.totalTokens || 1;
  const tbody = document.getElementById('cl-model-tbody');
  tbody.innerHTML = '';
  const models = Object.entries(modelBreakdown).sort((a, b) =>
    (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens)
  );
  for (const [model, stats] of models) {
    const tokens = stats.inputTokens + stats.outputTokens;
    const share = pct(tokens, totalClTokens);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${model}">
        ${model.length > 28 ? model.slice(0, 26) + '…' : model}
      </td>
      <td class="mono dim">${fmtTokens(tokens)}</td>
      <td class="mono dim">${fmtCost(stats.estimatedCostUSD)}</td>
      <td>
        <div class="table-bar-track">
          <div class="table-bar-fill claude" style="width:${share}%"></div>
        </div>
        <span style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">${share.toFixed(1)}%</span>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // Project breakdown table
  const projects = cl.projectBreakdown || [];
  const ptbody = document.getElementById('cl-project-tbody');
  ptbody.innerHTML = '';
  for (const proj of projects) {
    const share = pct(proj.totalTokens, totalClTokens);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono">${proj.name}</td>
      <td class="mono dim">${proj.sessionCount}</td>
      <td class="mono dim">${fmtTokens(proj.totalTokens)}</td>
      <td class="mono dim">${fmtCost(proj.estimatedCostUSD)}</td>
      <td>
        <div class="table-bar-track">
          <div class="table-bar-fill claude" style="width:${share}%"></div>
        </div>
        <span style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">${share.toFixed(1)}%</span>
      </td>
    `;
    ptbody.appendChild(tr);
  }

  // Recent sessions
  const sessionsList = document.getElementById('cl-sessions-list');
  sessionsList.innerHTML = '';
  for (const s of (cl.recentSessions || [])) {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.innerHTML = `
      <div class="session-project">${s.project}</div>
      <div class="session-time">${fmtRelTime(s.mtime)}</div>
      <div class="session-tokens">${fmtTokens(s.totalTokens)}</div>
      <div class="session-model">${s.model}</div>
    `;
    sessionsList.appendChild(div);
  }
}

// ── Render Gemini Detail ───────────────────────────────────────────────────
function renderGemini(data) {
  const gm = data.gemini;
  if (!gm) return;

  document.getElementById('gm-header-sub').textContent =
    `${gm.totalSessions || 0} sessions · ${fmtCost(gm.estimatedCostUSD)} estimated`;

  const noDataCard = document.getElementById('gm-no-data');
  if (!gm.available) {
    noDataCard.style.display = 'block';
  } else {
    noDataCard.style.display = 'none';
  }

  document.getElementById('gm-input').textContent  = fmtTokens(gm.totalInputTokens);
  document.getElementById('gm-output').textContent = fmtTokens(gm.totalOutputTokens);
  document.getElementById('gm-total').textContent  = fmtTokens(gm.totalTokens);
  document.getElementById('gm-cost').textContent   = fmtCost(gm.estimatedCostUSD);

  // Daily chart
  const daily = gm.daily || [];
  makeBarChart('chart-gemini-daily', dailyLabels(daily), [
    { label: 'Input',  data: daily.map(d => d.inputTokens),  backgroundColor: 'rgba(79,158,240,0.5)',  borderRadius: 3, borderSkipped: false },
    { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: 'rgba(79,158,240,0.85)', borderRadius: 3, borderSkipped: false },
  ]);

  // Recent sessions
  const sessionsList = document.getElementById('gm-sessions-list');
  sessionsList.innerHTML = '';
  for (const s of (gm.recentSessions || [])) {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.innerHTML = `
      <div class="session-project">${s.project}</div>
      <div class="session-time">${fmtRelTime(s.mtime)}</div>
      <div class="session-tokens">${fmtTokens(s.totalTokens)}</div>
      <div class="session-model">${s.model}</div>
    `;
    sessionsList.appendChild(div);
  }
}

// ── Render All ─────────────────────────────────────────────────────────────
function render(data) {
  usageData = data;
  renderOverview(data);
  renderClaude(data);
  renderGemini(data);

  const lastUpdatedEl = document.getElementById('last-updated');
  lastUpdatedEl.textContent = `Updated ${fmtTimestamp(data.timestamp)}`;
}

// ── Idle Screen ────────────────────────────────────────────────────────────
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (isIdle) dismissIdle();
  if (idleTimeout <= 0) return;
  idleTimer = setTimeout(showIdle, idleTimeout);
}

function showIdle() {
  isIdle = true;
  const screen = document.getElementById('idle-screen');
  screen.classList.add('visible');
  const todayTokens = usageData?.combined?.todayTokens || 0;
  window.claudepix.startIdleAnimation(todayTokens);
}

function dismissIdle() {
  isIdle = false;
  const screen = document.getElementById('idle-screen');
  screen.classList.remove('visible');
  window.claudepix.stopIdleAnimation();
}

// ── Settings ───────────────────────────────────────────────────────────────
async function openSettings() {
  const settings = await tm.getSettings();
  document.getElementById('s-refresh').value      = settings.refreshInterval || 60;
  document.getElementById('s-lookback').value     = settings.lookbackDays || 14;
  document.getElementById('s-claude-path').value  = settings.claudePath || '';
  document.getElementById('s-gemini-path').value  = settings.geminiPath || '';
  document.getElementById('s-idle-timeout').value = settings.idleTimeout || 60;
  document.getElementById('settings-overlay').classList.add('visible');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.remove('visible');
}

async function saveSettings() {
  const settings = {
    refreshInterval: parseInt(document.getElementById('s-refresh').value),
    lookbackDays:    parseInt(document.getElementById('s-lookback').value),
    claudePath:      document.getElementById('s-claude-path').value.trim(),
    geminiPath:      document.getElementById('s-gemini-path').value.trim(),
    idleTimeout:     parseInt(document.getElementById('s-idle-timeout').value),
  };
  await tm.saveSettings(settings);
  idleTimeout = (settings.idleTimeout || 60) * 1000;
  resetIdleTimer();
  closeSettings();
  await refresh();
}

// ── Refresh ─────────────────────────────────────────────────────────────────
async function refresh() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  try {
    const data = await tm.getUsageData();
    if (data) render(data);
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Wire up navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // Title bar controls
  document.getElementById('btn-close').addEventListener('click', () => tm.windowClose());
  document.getElementById('btn-minimize').addEventListener('click', () => tm.windowMinimize());
  document.getElementById('btn-maximize').addEventListener('click', () => tm.windowMaximize());
  document.getElementById('btn-refresh').addEventListener('click', refresh);

  // Settings
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('s-cancel').addEventListener('click', closeSettings);
  document.getElementById('s-save').addEventListener('click', saveSettings);
  document.getElementById('settings-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('settings-overlay')) closeSettings();
  });

  // Idle screen
  document.getElementById('idle-screen').addEventListener('click', dismissIdle);
  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', resetIdleTimer);

  // Gemini docs link
  document.getElementById('gm-docs-link').addEventListener('click', e => {
    e.preventDefault();
    tm.openExternal('https://github.com/google-gemini/gemini-cli');
  });

  // Push updates from main process
  tm.onUsageUpdated(data => {
    render(data);
  });

  // Load settings for idle timeout
  try {
    const settings = await tm.getSettings();
    idleTimeout = (settings.idleTimeout || 60) * 1000;
  } catch { /* use default */ }

  // Initial data load
  const loadingOverlay = document.getElementById('loading-overlay');
  try {
    const data = await tm.getUsageData();
    if (data) render(data);
  } finally {
    loadingOverlay.classList.add('hidden');
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
  }

  resetIdleTimer();
}

init();
