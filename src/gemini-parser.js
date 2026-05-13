const fs = require('fs');
const path = require('path');
const { calcGeminiCost } = require('./pricer');

const MAX_FILE_SIZE = 200 * 1024 * 1024;
const LOOKBACK_DAYS = 90;

function parseGeminiJsonl(filePath) {
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

    let inputTokens = 0, outputTokens = 0, model = 'unknown';

    if (obj.usageMetadata) {
      inputTokens = obj.usageMetadata.promptTokenCount || 0;
      outputTokens = obj.usageMetadata.candidatesTokenCount || 0;
    } else if (obj.usage) {
      inputTokens = obj.usage.input_tokens || 0;
      outputTokens = obj.usage.output_tokens || 0;
    } else {
      continue;
    }

    if (obj.model) model = obj.model;
    const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : stat.mtimeMs;

    if (inputTokens + outputTokens > 0) {
      records.push({ model, ts, inputTokens, outputTokens });
    }
  }

  return { records, mtime: stat.mtimeMs };
}

function aggregateGemini(geminiDir) {
  const sessionDir = path.join(geminiDir, 'tmp', 'chats');
  const fallbackDir = path.join(geminiDir, 'history');

  const hasSession = fs.existsSync(sessionDir);
  const hasFallback = fs.existsSync(fallbackDir);

  if (!hasSession && !hasFallback) {
    return {
      available: false,
      dataNote: 'No local session data found. Enable local telemetry in ~/.gemini/settings.json',
    };
  }

  const dailyMap = new Map();
  const recentSessions = [];
  let totalInput = 0, totalOutput = 0, totalCost = 0, totalSessions = 0;

  const dirsToScan = [];
  if (hasSession) dirsToScan.push({ dir: sessionDir, pattern: /^session-.*\.jsonl$/ });
  if (hasFallback) dirsToScan.push({ dir: fallbackDir, pattern: /\.jsonl$/ });

  for (const { dir, pattern } of dirsToScan) {
    let files;
    try {
      files = fs.readdirSync(dir).filter(f => pattern.test(f)).map(f => path.join(dir, f));
    } catch { continue; }

    for (const filePath of files) {
      let parsed;
      try { parsed = parseGeminiJsonl(filePath); } catch { continue; }
      if (!parsed) continue;
      if (parsed.records.length === 0) continue;

      totalSessions++;
      let sessionInput = 0, sessionOutput = 0, lastModel = 'unknown';

      for (const rec of parsed.records) {
        sessionInput += rec.inputTokens;
        sessionOutput += rec.outputTokens;
        lastModel = rec.model;

        const dateKey = new Date(rec.ts).toLocaleDateString('en-CA');
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUSD: 0 });
        }
        const day = dailyMap.get(dateKey);
        const recCost = calcGeminiCost(rec.model, rec.inputTokens, rec.outputTokens);
        day.inputTokens += rec.inputTokens;
        day.outputTokens += rec.outputTokens;
        day.totalTokens += rec.inputTokens + rec.outputTokens;
        day.estimatedCostUSD += recCost;
      }

      const sessionCost = calcGeminiCost(lastModel, sessionInput, sessionOutput);
      totalInput += sessionInput;
      totalOutput += sessionOutput;
      totalCost += sessionCost;

      recentSessions.push({
        project: 'gemini',
        mtime: parsed.mtime,
        inputTokens: sessionInput,
        outputTokens: sessionOutput,
        model: lastModel,
        totalTokens: sessionInput + sessionOutput,
      });
    }
  }

  const daily = buildDailyArray(dailyMap, 14);
  const sortedSessions = recentSessions.sort((a, b) => b.mtime - a.mtime).slice(0, 10);

  let dataNote = null;
  if (totalSessions === 0) {
    dataNote = 'Limited data — enable local telemetry in ~/.gemini/settings.json';
  } else if (!hasSession) {
    dataNote = 'Using fallback history directory';
  }

  return {
    available: totalSessions > 0,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUSD: totalCost,
    totalSessions,
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

module.exports = { aggregateGemini };
