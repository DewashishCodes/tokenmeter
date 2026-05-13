const fs = require('fs');
const path = require('path');
const { calcClaudeCost, calcCacheSavings } = require('./pricer');

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const LOOKBACK_DAYS = 90;

function decodeProjectName(folderName) {
  // e.g. "C--Users-Dewashish-Lambore-desktop-projects-burnlink" → "burnlink"
  if (folderName.includes('-desktop-projects-')) {
    const parts = folderName.split('-desktop-projects-');
    return parts[parts.length - 1] || folderName;
  }
  if (folderName.match(/^[A-Z]--Users-/i)) {
    const segments = folderName.split('-');
    const last = segments[segments.length - 1];
    if (last && last.length > 1) return last;
  }
  return folderName === 'C--Users-Dewashish-Lambore' ? 'Home' : folderName;
}

function parseClaudeJsonl(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) return null;

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  if (stat.mtimeMs < cutoff) return null;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const records = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch { continue; }

    if (obj.type !== 'assistant') continue;
    const msg = obj.message;
    if (!msg || !msg.usage) continue;

    const usage = msg.usage;
    const model = msg.model || 'unknown';
    const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : stat.mtimeMs;

    records.push({
      model,
      ts,
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    });
  }

  return { records, mtime: stat.mtimeMs };
}

function aggregateClaude(claudeDir) {
  if (!fs.existsSync(claudeDir)) {
    return { available: false };
  }

  const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const projectMap = new Map(); // project name → aggregated
  const modelMap = new Map();   // model name → aggregated
  const dailyMap = new Map();   // "YYYY-MM-DD" → aggregated
  const recentSessions = [];

  let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
  let totalCost = 0, totalSessions = 0;

  for (const projectFolder of projectDirs) {
    const projectPath = path.join(claudeDir, projectFolder);
    const jsonlFiles = fs.readdirSync(projectPath)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => path.join(projectPath, f));

    const projectName = decodeProjectName(projectFolder);
    let projInput = 0, projOutput = 0, projCacheRead = 0, projCacheWrite = 0;
    let projCost = 0, projSessions = 0;

    for (const filePath of jsonlFiles) {
      let parsed;
      try { parsed = parseClaudeJsonl(filePath); } catch { continue; }
      if (!parsed) continue;

      projSessions++;
      totalSessions++;

      let sessionInput = 0, sessionOutput = 0, sessionCacheRead = 0, sessionCacheWrite = 0;
      let lastModel = 'unknown';

      for (const rec of parsed.records) {
        sessionInput += rec.inputTokens;
        sessionOutput += rec.outputTokens;
        sessionCacheRead += rec.cacheReadTokens;
        sessionCacheWrite += rec.cacheWriteTokens;
        lastModel = rec.model;

        // daily bucketing (local time)
        const dateKey = new Date(rec.ts).toLocaleDateString('en-CA'); // YYYY-MM-DD
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 });
        }
        const day = dailyMap.get(dateKey);
        const recCost = calcClaudeCost(rec.model, rec.inputTokens, rec.outputTokens, rec.cacheReadTokens, rec.cacheWriteTokens);
        day.inputTokens += rec.inputTokens;
        day.outputTokens += rec.outputTokens;
        day.totalTokens += rec.inputTokens + rec.outputTokens;
        day.estimatedCostUSD += recCost;

        // model breakdown
        if (!modelMap.has(rec.model)) {
          modelMap.set(rec.model, { inputTokens: 0, outputTokens: 0, estimatedCostUSD: 0 });
        }
        const m = modelMap.get(rec.model);
        const mCost = calcClaudeCost(rec.model, rec.inputTokens, rec.outputTokens, rec.cacheReadTokens, rec.cacheWriteTokens);
        m.inputTokens += rec.inputTokens;
        m.outputTokens += rec.outputTokens;
        m.estimatedCostUSD += mCost;
      }

      const sessionCost = calcClaudeCost(lastModel, sessionInput, sessionOutput, sessionCacheRead, sessionCacheWrite);
      projInput += sessionInput;
      projOutput += sessionOutput;
      projCacheRead += sessionCacheRead;
      projCacheWrite += sessionCacheWrite;
      projCost += sessionCost;

      recentSessions.push({
        project: projectName,
        mtime: parsed.mtime,
        inputTokens: sessionInput,
        outputTokens: sessionOutput,
        model: lastModel,
        totalTokens: sessionInput + sessionOutput,
      });
    }

    if (projInput + projOutput > 0) {
      if (!projectMap.has(projectName)) {
        projectMap.set(projectName, { name: projectName, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0, sessionCount: 0 });
      }
      const p = projectMap.get(projectName);
      p.inputTokens += projInput;
      p.outputTokens += projOutput;
      p.totalTokens += projInput + projOutput;
      p.estimatedCostUSD += projCost;
      p.sessionCount += projSessions;
    }

    totalInput += projInput;
    totalOutput += projOutput;
    totalCacheRead += projCacheRead;
    totalCacheWrite += projCacheWrite;
    totalCost += projCost;
  }

  // Build daily array for last 14 days
  const daily = buildDailyArray(dailyMap, 14);

  // Sort projects by total tokens
  const projectBreakdown = Array.from(projectMap.values())
    .sort((a, b) => b.totalTokens - a.totalTokens);

  // Sort recent sessions by mtime desc, take top 10
  const sortedSessions = recentSessions
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10);

  const modelBreakdown = {};
  for (const [name, data] of modelMap.entries()) {
    modelBreakdown[name] = data;
  }

  // Cache savings across all models
  let totalCacheSavings = 0;
  for (const [model, data] of modelMap.entries()) {
    // approximate savings — use the dominant model
    totalCacheSavings += calcCacheSavings(model, data.inputTokens * 0.3); // rough approximation
  }

  // Check for stats-cache.json
  const statsCachePath = path.join(path.dirname(claudeDir), 'stats-cache.json');
  const dataNote = fs.existsSync(statsCachePath) ? 'stats-cache.json also found' : null;

  return {
    available: true,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    totalCacheWriteTokens: totalCacheWrite,
    totalTokens: totalInput + totalOutput,
    estimatedCostUSD: totalCost,
    totalSessions,
    modelBreakdown,
    projectBreakdown,
    daily,
    recentSessions: sortedSessions,
    dataNote,
  };
}

function buildDailyArray(dailyMap, days) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toLocaleDateString('en-CA');
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const data = dailyMap.get(dateKey) || { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 };
    result.push({ date: dateKey, label, ...data });
  }
  return result;
}

module.exports = { aggregateClaude };
