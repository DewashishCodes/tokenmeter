const path = require('path');
const { aggregateClaude } = require('./claude-parser');
const { aggregateGemini } = require('./gemini-parser');

function getToday(daily) {
  if (!daily || daily.length === 0) return { tokens: 0, cost: 0 };
  const todayKey = new Date().toLocaleDateString('en-CA');
  const entry = daily.find(d => d.date === todayKey);
  return entry ? { tokens: entry.totalTokens, cost: entry.estimatedCostUSD } : { tokens: 0, cost: 0 };
}

async function scan(settings) {
  const userProfile = process.env.USERPROFILE || require('os').homedir();
  const claudeDir = settings?.claudePath || path.join(userProfile, '.claude', 'projects');
  const geminiDir = settings?.geminiPath || path.join(userProfile, '.gemini');

  const start = Date.now();

  let claude, gemini;
  try { claude = aggregateClaude(claudeDir); } catch (e) {
    claude = { available: false, dataNote: `Scan error: ${e.message}` };
  }
  try { gemini = aggregateGemini(geminiDir); } catch (e) {
    gemini = { available: false, dataNote: `Scan error: ${e.message}` };
  }

  const claudeToday = getToday(claude.daily);
  const geminiToday = getToday(gemini.daily);

  const combined = {
    totalTokens: (claude.totalTokens || 0) + (gemini.totalTokens || 0),
    estimatedCostUSD: (claude.estimatedCostUSD || 0) + (gemini.estimatedCostUSD || 0),
    activeCLIs: [claude.available, gemini.available].filter(Boolean).length,
    todayTokens: claudeToday.tokens + geminiToday.tokens,
    todayCost: claudeToday.cost + geminiToday.cost,
  };

  return {
    timestamp: Date.now(),
    scanDurationMs: Date.now() - start,
    claude,
    gemini,
    combined,
  };
}

module.exports = { scan };
