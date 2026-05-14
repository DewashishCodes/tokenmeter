// Tokenmeter renderer — UI logic, routing, chart rendering

const tm = window.tokenmeter;

// ── State ──────────────────────────────────────────────────────────────────
let usageData = null;
let charts = {};
let idleTimer = null;
let idleTimeout = 60000;
let isIdle = false;
let currentSettings = null;
let alertFiredForDate = '';

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

function updateStatus(msg) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = msg;
}

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
  document.getElementById(`page-${pageId}`)?.classList.add('active');
  document.querySelector(`.nav-tab[data-page="${pageId}"]`)?.classList.add('active');
}

// ── Chart Helpers ──────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: true,
  animation: { duration: 400 },
  plugins: { legend: { display: false }, tooltip: {
    backgroundColor: '#1e1e1e',
    borderColor: '#3d3d3d',
    borderWidth: 1,
    titleFont: { family: "'Space Mono', monospace", size: 9 },
    bodyFont:  { family: "'Space Mono', monospace", size: 10 },
    callbacks: { label: ctx => ` ${fmtTokens(ctx.raw)} tokens` },
  }},
  scales: {
    x: {
      stacked: true,
      grid: { color: '#2e2e2e' },
      ticks: { color: '#525252', font: { family: "'Space Mono', monospace", size: 9 } },
    },
    y: {
      stacked: true,
      grid: { color: '#2e2e2e' },
      ticks: {
        color: '#525252',
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

// ── Heatmap ────────────────────────────────────────────────────────────────
function renderHeatmap(heatmap) {
  const grid = document.getElementById('heatmap-grid');
  if (!grid || !heatmap || !heatmap.length) return;

  const maxTokens = Math.max(...heatmap.map(d => d.totalTokens), 1);
  grid.innerHTML = '';

  // Pad front so column 0 starts on the right day-of-week (Mon=0)
  const firstDow = (new Date(heatmap[0].date).getDay() + 6) % 7;
  for (let i = 0; i < firstDow; i++) {
    const pad = document.createElement('div');
    pad.className = 'heatmap-cell';
    grid.appendChild(pad);
  }

  for (const day of heatmap) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const t = day.totalTokens;
    if (t > 0) {
      const ratio = t / maxTokens;
      const level = ratio < 0.15 ? 1 : ratio < 0.40 ? 2 : ratio < 0.70 ? 3 : 4;
      cell.setAttribute('data-level', level);
    }
    cell.title = `${day.date}: ${fmtTokens(t)} tokens`;
    grid.appendChild(cell);
  }
}

// ── Peak Hours ─────────────────────────────────────────────────────────────
function renderPeakHours(hourly) {
  const canvas = document.getElementById('chart-peak-hours');
  if (!canvas || !hourly) return;
  if (charts['chart-peak-hours']) charts['chart-peak-hours'].destroy();

  const maxH = Math.max(...hourly, 1);
  charts['chart-peak-hours'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: hourly.map((_, i) => i % 6 === 0 ? `${i}h` : ''),
      datasets: [{
        data: hourly,
        backgroundColor: hourly.map(v => `rgba(232,101,10,${(0.15 + (v / maxH) * 0.75).toFixed(2)})`),
        borderRadius: 2, borderSkipped: false,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e1e1e', borderColor: '#3d3d3d', borderWidth: 1,
          titleFont: { family: "'Space Mono', monospace", size: 9 },
          bodyFont:  { family: "'Space Mono', monospace", size: 10 },
          callbacks: {
            title: ctx => `${ctx[0].dataIndex}:00 – ${ctx[0].dataIndex + 1}:00`,
            label: ctx => ` ${fmtTokens(ctx.raw)} tokens`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#2e2e2e' }, ticks: { color: '#525252', font: { family: "'Space Mono', monospace", size: 9 } } },
        y: { grid: { color: '#2e2e2e' }, ticks: { color: '#525252', font: { family: "'Space Mono', monospace", size: 9 }, callback: v => fmtTokens(v) } },
      },
    },
  });
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function drawSparkline(canvas, data) {
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);

  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = i * step;
    const y = h - (data[i] / max) * h * 0.88 - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(232,101,10,0.8)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  ctx.lineTo((data.length - 1) * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = 'rgba(232,101,10,0.12)';
  ctx.fill();
}

// ── Cost Alert ─────────────────────────────────────────────────────────────
function checkCostAlert(data) {
  if (!currentSettings) return;
  const threshold = parseFloat(currentSettings.dailyCostAlert) || 0;
  if (threshold <= 0) return;
  const daily = data.claude?.daily || [];
  if (!daily.length) return;
  const todayEntry = daily[daily.length - 1];
  const todayCost = todayEntry?.estimatedCostUSD || 0;
  if (todayCost >= threshold && alertFiredForDate !== todayEntry.date) {
    alertFiredForDate = todayEntry.date;
    showToast(`Daily cost alert: ~$${todayCost.toFixed(2)} (threshold: $${threshold})`);
    tm.showNotification?.('Tokenmeter Alert',
      `Today's Claude cost ~$${todayCost.toFixed(2)} exceeded $${threshold} threshold`);
  }
}

// ── Render Overview ────────────────────────────────────────────────────────
function renderOverview(data) {
  const { claude } = data;
  const clTotal = claude.totalTokens || 0;
  const todayEntry = (claude.daily || []).find(d => d.date === new Date().toLocaleDateString('en-CA'));

  document.getElementById('ov-total-tokens').textContent      = fmtTokens(clTotal);
  document.getElementById('ov-total-cost').textContent        = fmtCost(claude.estimatedCostUSD);
  document.getElementById('ov-today').textContent             = fmtTokens(todayEntry?.totalTokens || 0);
  document.getElementById('ov-combined-sessions').textContent = claude.totalSessions || 0;

  // Claude row
  const clStatus = document.getElementById('ov-claude-status');
  if (claude.available) {
    clStatus.className = 'cli-status-pill active';
    clStatus.textContent = 'Active';
  } else {
    clStatus.className = 'cli-status-pill inactive';
    clStatus.textContent = 'Not Detected';
  }
  document.getElementById('ov-claude-bar').style.width        = claude.available ? '100%' : '0%';
  document.getElementById('ov-claude-tokens').textContent     = fmtTokens(clTotal);
  document.getElementById('ov-claude-cost').textContent       = fmtCost(claude.estimatedCostUSD);
  document.getElementById('ov-claude-sessions').textContent   = claude.totalSessions || 0;
  document.getElementById('ov-claude-input-val').textContent  = fmtTokens(claude.totalInputTokens);
  document.getElementById('ov-claude-output-val').textContent = fmtTokens(claude.totalOutputTokens);

  const claudeNote = document.getElementById('ov-claude-note');
  if (!claude.available) {
    claudeNote.textContent = 'No Claude Code data found. Expected: %USERPROFILE%\\.claude\\projects\\**\\*.jsonl';
    claudeNote.style.display = 'block';
  } else {
    claudeNote.style.display = 'none';
  }

  // Daily chart (Claude only)
  const daily = claude.daily || [];
  makeBarChart('chart-combined-daily', dailyLabels(daily), [
    { label: 'Input',  data: daily.map(d => d.inputTokens),  backgroundColor: 'rgba(212,162,122,0.5)',  borderRadius: 3, borderSkipped: false },
    { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: 'rgba(212,162,122,0.85)', borderRadius: 3, borderSkipped: false },
  ]);
}

// ── Render Claude Detail ───────────────────────────────────────────────────
function renderClaude(data) {
  const cl = data.claude;
  if (!cl) return;

  document.getElementById('cl-header-sub').textContent =
    `${cl.totalSessions || 0} sessions · ${fmtCost(cl.estimatedCostUSD)} estimated`;

  // Last active session card
  const sessions = cl.recentSessions || [];
  const lastActiveCard = document.getElementById('cl-last-active');
  if (sessions.length > 0) {
    const s = sessions[0];
    document.getElementById('cl-last-project').textContent = s.project;
    document.getElementById('cl-last-time').textContent    = fmtRelTime(s.mtime);
    document.getElementById('cl-last-tokens').textContent  = fmtTokens(s.totalTokens) + ' tokens';
    document.getElementById('cl-last-model').textContent   = s.model.length > 30 ? s.model.slice(0, 28) + '…' : s.model;
    lastActiveCard.style.display = 'flex';
  } else {
    lastActiveCard.style.display = 'none';
  }

  // Insight cards
  document.getElementById('cl-cache-savings-total').textContent = fmtCost(cl.cacheSavingsUSD || 0);
  document.getElementById('cl-cost-projection').textContent     = fmtCost(cl.costProjection30d || 0);

  // Usage summary
  document.getElementById('cl-input').textContent       = fmtTokens(cl.totalInputTokens);
  document.getElementById('cl-output').textContent      = fmtTokens(cl.totalOutputTokens);
  document.getElementById('cl-cache-read').textContent  = fmtTokens(cl.totalCacheReadTokens);
  document.getElementById('cl-cache-write').textContent = fmtTokens(cl.totalCacheWriteTokens);
  document.getElementById('cl-cache-savings').textContent =
    `saved ${fmtCost(cl.cacheSavingsUSD || 0)} vs uncached`;

  // Daily chart
  const daily = cl.daily || [];
  makeBarChart('chart-claude-daily', dailyLabels(daily), [
    { label: 'Input',  data: daily.map(d => d.inputTokens),  backgroundColor: 'rgba(212,162,122,0.5)',  borderRadius: 3, borderSkipped: false },
    { label: 'Output', data: daily.map(d => d.outputTokens), backgroundColor: 'rgba(212,162,122,0.85)', borderRadius: 3, borderSkipped: false },
  ]);

  // Heatmap and peak hours
  renderHeatmap(cl.heatmap);
  renderPeakHours(cl.hourly);

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

  // Project breakdown table with sparklines
  const projects = cl.projectBreakdown || [];
  const ptbody = document.getElementById('cl-project-tbody');
  ptbody.innerHTML = '';
  for (const proj of projects) {
    const share = pct(proj.totalTokens, totalClTokens);
    const tr = document.createElement('tr');
    const canvasId = `spark-${proj.name.replace(/\W/g, '_')}`;
    tr.innerHTML = `
      <td class="mono">${proj.name}</td>
      <td class="mono dim">${proj.sessionCount}</td>
      <td class="mono dim">${fmtTokens(proj.totalTokens)}</td>
      <td class="mono dim">${fmtCost(proj.estimatedCostUSD)}</td>
      <td><canvas id="${canvasId}" class="sparkline-canvas" width="58" height="20"></canvas></td>
      <td>
        <div class="table-bar-track">
          <div class="table-bar-fill claude" style="width:${share}%"></div>
        </div>
        <span style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">${share.toFixed(1)}%</span>
      </td>
    `;
    ptbody.appendChild(tr);
    if (proj.sparkline) {
      drawSparkline(document.getElementById(canvasId), proj.sparkline);
    }
  }

  // Recent sessions
  const sessionsList = document.getElementById('cl-sessions-list');
  sessionsList.innerHTML = '';
  for (const s of sessions) {
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
  checkCostAlert(data);

  const ts = new Date(data.timestamp);
  document.getElementById('last-updated').textContent =
    `Updated ${ts.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;

  const total = data.claude?.totalTokens || 0;
  const cost  = data.claude?.estimatedCostUSD || 0;
  updateStatus(`* ${fmtTokens(total)} tokens · ${fmtCost(cost)}`);
}

// ── Idle ────────────────────────────────────────────────────────────────────
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (isIdle) dismissIdle();
  if (idleTimeout <= 0) return;
  idleTimer = setTimeout(showIdle, idleTimeout);
}

function showIdle() {
  isIdle = true;
  document.body.classList.add('app-idle');
  window.claudepix?.setCreatureState('idle');
}

function dismissIdle() {
  isIdle = false;
  document.body.classList.remove('app-idle');
  window.claudepix?.setCreatureState('idle');
}

// ── Settings ───────────────────────────────────────────────────────────────
async function openSettings() {
  const settings = await tm.getSettings();
  document.getElementById('s-refresh').value      = settings.refreshInterval || 60;
  document.getElementById('s-lookback').value     = settings.lookbackDays || 14;
  document.getElementById('s-claude-path').value  = settings.claudePath || '';
  document.getElementById('s-gemini-path').value  = settings.geminiPath || '';
  document.getElementById('s-idle-timeout').value = settings.idleTimeout || 60;
  document.getElementById('s-cost-alert').value   = settings.dailyCostAlert || 0;
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
    dailyCostAlert:  parseFloat(document.getElementById('s-cost-alert').value) || 0,
  };
  await tm.saveSettings(settings);
  currentSettings = settings;
  idleTimeout = (settings.idleTimeout || 60) * 1000;
  resetIdleTimer();
  closeSettings();
  await refresh();
}

// ── Refresh ─────────────────────────────────────────────────────────────────
async function refresh() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('spinning');
  updateStatus('* Scanning sessions…');
  window.claudepix?.setCreatureState('working');
  try {
    const data = await tm.getUsageData();
    if (data) {
      render(data);
      window.claudepix?.setCreatureState('idle');
    }
  } finally {
    btn.classList.remove('spinning');
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Navigation (bottom nav + any data-page buttons)
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

  // Dismiss idle on click anywhere in content
  document.getElementById('main-content').addEventListener('click', () => { if (isIdle) dismissIdle(); });
  document.addEventListener('mousemove', resetIdleTimer);
  document.addEventListener('keydown', e => {
    resetIdleTimer();
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); refresh(); }
  });

  // Push updates from main process
  tm.onUsageUpdated(data => { render(data); });

  // Load settings
  try {
    const settings = await tm.getSettings();
    currentSettings = settings;
    idleTimeout = (settings.idleTimeout || 60) * 1000;
  } catch { /* use default */ }

  // Initial data load
  updateStatus('* Scanning sessions…');
  const loadingOverlay = document.getElementById('loading-overlay');
  try {
    const data = await tm.getUsageData();
    if (data) {
      render(data);
      window.claudepix?.setCreatureState('dance');
    }
  } finally {
    loadingOverlay.classList.add('hidden');
    setTimeout(() => { loadingOverlay.style.display = 'none'; }, 400);
  }

  // Start roaming creature after content loads
  setTimeout(() => window.claudepix?.initCreature(), 600);

  resetIdleTimer();
}

init();
