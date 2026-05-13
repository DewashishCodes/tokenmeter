// Claudepix idle-screen animation manager

const CLAUDEPIX_BASE = 'https://claudepix.vercel.app';
const IDLE_ROTATE_MS = 20000;

let spriteCache = null;
let currentAnimIdx = 0;
let rotateTimer = null;
let animFrame = null;
let currentFrameIdx = 0;
let currentFrameMs = 100;

async function fetchSprites() {
  // Try to load from electron-store via IPC (cached) first
  try {
    const cached = await window.tokenmeter.getSettings();
    if (cached._spriteCache) return cached._spriteCache;
  } catch { /* ignore */ }

  // Fetch sprite list from claudepix
  try {
    const res = await fetch(`${CLAUDEPIX_BASE}/api/sprites`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

async function loadSpriteFrames(spriteUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = spriteUrl;
  });
}

function pickAnimByUsage(todayTokens, sprites) {
  if (!sprites || sprites.length === 0) return null;
  let mood = 'idle';
  if (todayTokens >= 50000) mood = 'busy';
  else if (todayTokens >= 10000) mood = 'active';

  const moodSprites = sprites.filter(s => s.mood === mood);
  const pool = moodSprites.length > 0 ? moodSprites : sprites;
  return pool[Math.floor(Math.random() * pool.length)];
}

function stopAnimation() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (rotateTimer) { clearInterval(rotateTimer); rotateTimer = null; }
}

function showFallback() {
  const fallback = document.getElementById('idle-fallback');
  const canvas = document.getElementById('idle-canvas');
  canvas.style.display = 'none';
  fallback.classList.add('visible');
}

async function startIdleAnimation(todayTokens) {
  stopAnimation();
  spriteCache = spriteCache || await fetchSprites();

  const canvas = document.getElementById('idle-canvas');
  const ctx = canvas.getContext('2d');

  async function playSprite(sprite) {
    if (!sprite) { showFallback(); return; }
    let img;
    try { img = await loadSpriteFrames(`${CLAUDEPIX_BASE}${sprite.url}`); }
    catch { showFallback(); return; }

    const frameW = sprite.frameWidth || img.width;
    const frameH = sprite.frameHeight || img.height;
    const frameCount = sprite.frameCount || Math.floor(img.width / frameW);
    const fps = sprite.fps || 10;
    const scale = Math.min(
      (window.innerWidth * 0.5) / frameW,
      (window.innerHeight * 0.6) / frameH,
      8
    );

    canvas.width  = Math.round(frameW * scale);
    canvas.height = Math.round(frameH * scale);
    canvas.style.display = 'block';
    document.getElementById('idle-fallback').classList.remove('visible');

    ctx.imageSmoothingEnabled = false;
    currentFrameIdx = 0;
    currentFrameMs = 1000 / fps;

    let last = 0;
    function draw(ts) {
      if (ts - last >= currentFrameMs) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(
          img,
          currentFrameIdx * frameW, 0, frameW, frameH,
          0, 0, canvas.width, canvas.height
        );
        currentFrameIdx = (currentFrameIdx + 1) % frameCount;
        last = ts;
      }
      animFrame = requestAnimationFrame(draw);
    }
    animFrame = requestAnimationFrame(draw);
  }

  const sprite = pickAnimByUsage(todayTokens, spriteCache);
  await playSprite(sprite);

  rotateTimer = setInterval(async () => {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    const next = pickAnimByUsage(todayTokens, spriteCache);
    await playSprite(next);
  }, IDLE_ROTATE_MS);
}

function stopIdleAnimation() {
  stopAnimation();
}

window.claudepix = { startIdleAnimation, stopIdleAnimation };
