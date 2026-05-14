// Tokenmeter — Pixel creature with all animations, grounded at bottom-left
// PixelEngine inlined from claudepix (offline, no external fetch)

(function () {
  const BODY = 1, EYE = 2;

  const CREATURE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,2,1,1,1,1,1,2,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,2,1,1,1,1,1,2,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,0],
    [0,0,0,0,0,1,0,0,1,0,0,0,1,0,0,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  function shift(base, dr, dc) {
    const out = Array.from({length:20}, () => new Array(20).fill(0));
    for (let r=0;r<20;r++) for (let c=0;c<20;c++) {
      const nr=r+dr, nc=c+dc;
      if (nr>=0&&nr<20&&nc>=0&&nc<20) out[nr][nc]=base[r][c];
    }
    return out;
  }

  function patch(base, ops) {
    const out = base.map(r=>r.slice());
    for (const [r,c,v] of ops)
      if (r>=0&&r<20&&c>=0&&c<20) out[r][c]=v;
    return out;
  }

  function mount(host, opts={}) {
    const { preset, color='#CD7F6A', bg='transparent', speed=1, autoplay=true } = opts;
    host.innerHTML='';
    host.style.cssText=`position:relative;width:100%;aspect-ratio:1/1;background:${bg};display:grid;grid-template-columns:repeat(20,1fr);grid-template-rows:repeat(20,1fr)`;
    const cells=[];
    for(let r=0;r<20;r++){cells.push([]);for(let c=0;c<20;c++){const d=document.createElement('div');host.appendChild(d);cells[r].push(d);}}
    let _c=color,_p=preset,_s=speed,_playing=autoplay,fi=0,t0=performance.now(),raf=0;
    function paint(frame){
      for(let r=0;r<20;r++) for(let c=0;c<20;c++){
        const v=frame[r][c],el=cells[r][c];
        if(v===BODY){el.style.background=_c;el.style.boxShadow='inset 0 0 0 1px rgba(0,0,0,0.25)';}
        else{el.style.background='transparent';el.style.boxShadow='none';}
      }
    }
    function cur(){return _p.frames[fi];}
    function render(){const f=cur();paint(f.frame?f.frame:CREATURE);}
    function tick(now){
      if(_playing&&_p.frames.length>1){
        if((now-t0)*_s>=cur().hold){fi=(fi+1)%_p.frames.length;t0=now;render();}
      }
      raf=requestAnimationFrame(tick);
    }
    render(); raf=requestAnimationFrame(tick);
    return {
      setPreset(p){_p=p;fi=0;t0=performance.now();render();},
      setColor(c){_c=c;render();},
      destroy(){cancelAnimationFrame(raf);host.innerHTML='';},
    };
  }

  window.PixelEngine={BODY,EYE,CREATURE,shift,patch,mount};
})();

// ── All Animation Presets ─────────────────────────────────────────────────

const {BODY,EYE,CREATURE,shift,patch}=window.PixelEngine;

// 1. BREATH
const _B_INH      = shift(CREATURE,-1,0);
const _B_HBLINK   = patch(CREATURE,[[6,7,BODY],[6,13,BODY]]);
const _B_FBLINK   = patch(CREATURE,[[6,7,BODY],[7,7,BODY],[6,13,BODY],[7,13,BODY]]);
const _B_IBLINK   = patch(_B_INH,[[5,7,BODY],[6,7,BODY],[5,13,BODY],[6,13,BODY]]);
const PRESET_BREATH = {name:'breath',frames:[
  {hold:500,frame:null},{hold:200,frame:patch(CREATURE,[[2,1,BODY]])},
  {hold:280,frame:_B_INH},{hold:80,frame:_B_IBLINK},{hold:360,frame:_B_INH},
  {hold:200,frame:patch(CREATURE,[[1,2,BODY]])},{hold:320,frame:null},
  {hold:80,frame:_B_HBLINK},{hold:700,frame:null},
  {hold:200,frame:patch(CREATURE,[[3,18,BODY]])},{hold:300,frame:_B_INH},
  {hold:500,frame:_B_INH},{hold:200,frame:patch(CREATURE,[[2,17,BODY]])},
  {hold:80,frame:_B_FBLINK},{hold:80,frame:_B_HBLINK},{hold:340,frame:null},
]};

// 2. BLINK
const _BL_HALF   = patch(CREATURE,[[6,7,BODY],[6,13,BODY]]);
const _BL_FULL   = patch(CREATURE,[[6,7,BODY],[7,7,BODY],[6,13,BODY],[7,13,BODY]]);
const _BL_GDOWN  = patch(CREATURE,[[6,7,BODY],[6,13,BODY],[8,7,EYE],[8,13,EYE]]);
const _BL_BROW   = patch(CREATURE,[[5,7,BODY],[5,13,BODY]]);
const PRESET_BLINK = {name:'blink',frames:[
  {hold:2400,frame:null},
  {hold:60,frame:_BL_HALF},{hold:100,frame:_BL_FULL},{hold:60,frame:_BL_HALF},{hold:80,frame:null},
  {hold:220,frame:_BL_GDOWN},{hold:1600,frame:null},
  {hold:60,frame:_BL_HALF},{hold:90,frame:_BL_FULL},{hold:60,frame:_BL_HALF},
  {hold:70,frame:null},{hold:60,frame:_BL_FULL},{hold:100,frame:_BL_HALF},{hold:70,frame:null},
  {hold:200,frame:_BL_BROW},{hold:900,frame:null},
]};

// 3. THINK
const _T_EU   = patch(CREATURE,[[6,7,BODY],[7,7,BODY],[6,13,BODY],[7,13,BODY],[5,7,EYE],[5,13,EYE]]);
const _T_CH   = patch(_T_EU,[[9,2,BODY],[9,3,BODY],[9,4,BODY],[10,3,BODY],[10,4,BODY]]);
const _T_CB   = patch(_T_CH,[[4,7,BODY],[4,12,BODY]]);
const _T_P1=patch(_T_CH,[[3,16,BODY]]);
const _T_P2=patch(_T_CH,[[2,17,BODY],[3,16,BODY]]);
const _T_P3=patch(_T_CH,[[1,17,BODY],[2,17,BODY],[3,16,BODY]]);
const _T_P4=patch(_T_CH,[[1,18,BODY],[2,17,BODY]]);
const _T_P5=patch(_T_CH,[[0,18,BODY],[1,18,BODY]]);
const _T_SP1=patch(_T_CH,[[2,15,BODY],[1,16,BODY],[0,17,BODY],[2,17,BODY],[1,18,BODY]]);
const _T_SP2=patch(_T_CH,[[1,14,BODY],[0,15,BODY],[0,16,BODY],[0,17,BODY],[0,18,BODY],[1,18,BODY],[2,17,BODY]]);
const _T_SPF=patch(_T_CH,[[0,16,BODY],[1,17,BODY]]);
const _T_WU=patch(_T_SP2,[[5,7,BODY],[5,13,BODY],[5,6,EYE],[5,7,EYE],[5,8,EYE],[5,12,EYE],[5,13,EYE],[5,14,EYE]]);
const PRESET_THINK = {name:'think',frames:[
  {hold:400,frame:null},{hold:300,frame:_T_EU},{hold:300,frame:_T_CH},
  {hold:200,frame:_T_CB},{hold:350,frame:_T_CH},
  {hold:350,frame:_T_P1},{hold:350,frame:_T_P2},{hold:350,frame:_T_P3},
  {hold:350,frame:_T_P4},{hold:350,frame:_T_P5},
  {hold:600,frame:_T_CH},{hold:200,frame:_T_CB},{hold:400,frame:_T_CH},
  {hold:300,frame:_T_P1},{hold:300,frame:_T_P2},{hold:300,frame:_T_P3},
  {hold:80,frame:_T_SP1},{hold:100,frame:_T_SP2},
  {hold:80,frame:_T_WU},{hold:120,frame:_T_SP1},
  {hold:150,frame:_T_SPF},{hold:300,frame:_T_CH},
  {hold:300,frame:_T_EU},{hold:400,frame:null},
]};

// 4. DANCE BOUNCE
const _D_CR = patch(shift(CREATURE,1,0),[[9,2,BODY],[10,2,BODY],[9,18,BODY],[10,18,BODY]]);
const _D_U1 = shift(CREATURE,-1,0);
const _D_U2 = patch(shift(CREATURE,-2,0),[[7,1,BODY],[8,1,BODY],[8,2,BODY],[7,18,BODY],[8,18,BODY],[8,19,BODY]]);
const _D_D1 = shift(CREATURE,-1,0);
const _D_LA = patch(CREATURE,[[17,4,BODY],[17,5,BODY],[17,15,BODY],[17,16,BODY]]);
const _D_IM = patch(shift(CREATURE,1,0),[[18,3,BODY],[18,4,BODY],[18,5,BODY],[18,15,BODY],[18,16,BODY],[18,17,BODY]]);
const _D_RE = patch(CREATURE,[[18,4,BODY],[18,16,BODY]]);
const PRESET_DANCE = {name:'dance',frames:[
  {hold:100,frame:_D_CR},{hold:80,frame:_D_U1},{hold:140,frame:_D_U2},
  {hold:100,frame:_D_D1},{hold:60,frame:_D_LA},{hold:80,frame:_D_IM},
  {hold:120,frame:_D_RE},{hold:80,frame:null},
  {hold:100,frame:_D_CR},{hold:80,frame:_D_U1},{hold:160,frame:_D_U2},
  {hold:80,frame:_D_D1},{hold:60,frame:_D_LA},{hold:80,frame:_D_IM},
  {hold:120,frame:_D_RE},{hold:100,frame:null},
]};

// 5. WINK
const _W_SQ  = patch(CREATURE,[[6,13,BODY]]);
const _W_WK  = patch(CREATURE,[[6,13,BODY],[7,13,BODY]]);
const _W_TL  = shift(CREATURE,0,1);
const _W_TLW = patch(_W_TL,[[6,14,BODY],[7,14,BODY]]);
const _W_SP1 = patch(_W_TLW,[[4,17,BODY],[5,18,BODY]]);
const _W_SP2 = patch(_W_TLW,[[3,18,BODY],[5,17,BODY]]);
const _W_SP3 = patch(_W_TLW,[[4,18,BODY]]);
const _W_TLS = patch(_W_TL,[[6,14,BODY]]);
const _W_RS  = patch(CREATURE,[[6,13,BODY]]);
const PRESET_WINK = {name:'wink',frames:[
  {hold:1200,frame:null},
  {hold:100,frame:_W_SQ},{hold:120,frame:_W_WK},{hold:150,frame:_W_TLW},
  {hold:120,frame:_W_SP1},{hold:100,frame:_W_SP2},{hold:100,frame:_W_SP3},
  {hold:400,frame:_W_TLW},
  {hold:100,frame:_W_TLS},{hold:100,frame:_W_RS},{hold:80,frame:null},
  {hold:800,frame:null},
]};

// 6. SURPRISE
const _S_ANT  = patch(CREATURE,[[6,7,BODY],[6,13,BODY]]);
const _S_WIDE = patch(CREATURE,[[6,6,EYE],[6,7,EYE],[6,8,EYE],[7,6,EYE],[7,7,EYE],[7,8,EYE],[6,12,EYE],[6,13,EYE],[6,14,EYE],[7,12,EYE],[7,13,EYE],[7,14,EYE]]);
const _S_RC   = patch(shift(CREATURE,-1,0),[[5,6,EYE],[5,7,EYE],[5,8,EYE],[6,6,EYE],[6,7,EYE],[6,8,EYE],[5,12,EYE],[5,13,EYE],[5,14,EYE],[6,12,EYE],[6,13,EYE],[6,14,EYE]]);
const _S_SK1  = patch(_S_RC,[[2,4,BODY],[2,10,BODY],[2,15,BODY],[3,2,BODY],[3,17,BODY]]);
const _S_SK2  = patch(_S_RC,[[1,3,BODY],[1,10,BODY],[1,16,BODY],[2,1,BODY],[2,18,BODY],[4,0,BODY],[4,19,BODY]]);
const _S_SK3  = patch(_S_RC,[[0,5,BODY],[0,14,BODY],[2,0,BODY],[2,19,BODY]]);
const _S_SW   = patch(CREATURE,[[6,6,EYE],[6,7,EYE],[6,8,EYE],[7,6,EYE],[7,7,EYE],[7,8,EYE],[6,12,EYE],[6,13,EYE],[6,14,EYE],[7,12,EYE],[7,13,EYE],[7,14,EYE]]);
const _S_SH   = patch(CREATURE,[[6,6,EYE],[6,7,EYE],[6,13,EYE],[6,14,EYE],[7,7,EYE],[7,13,EYE]]);
const PRESET_SURPRISE = {name:'surprise',frames:[
  {hold:900,frame:null},{hold:120,frame:_S_ANT},{hold:60,frame:_S_WIDE},
  {hold:80,frame:_S_RC},{hold:100,frame:_S_SK1},{hold:100,frame:_S_SK2},
  {hold:100,frame:_S_SK3},{hold:500,frame:_S_RC},{hold:180,frame:_S_SW},
  {hold:180,frame:_S_SH},{hold:300,frame:null},{hold:600,frame:null},
]};

// 7. SWAY
const _SW_L1  = shift(CREATURE,-1,-1);
const _SW_L2  = shift(CREATURE,0,-2);
const _SW_L1b = shift(CREATURE,0,-1);
const _SW_R1  = shift(CREATURE,-1,1);
const _SW_R2  = shift(CREATURE,0,2);
const _SW_R1b = shift(CREATURE,0,1);
const _SW_NA  = patch(CREATURE,[[1,17,BODY],[2,17,BODY],[2,18,BODY]]);
const _SW_NB  = patch(CREATURE,[[0,15,BODY],[1,15,BODY],[1,16,BODY],[1,18,BODY],[2,18,BODY],[2,19,BODY]]);
const _SW_NC  = patch(CREATURE,[[0,14,BODY],[0,15,BODY],[1,15,BODY]]);
const _SW_L2N = patch(_SW_L2,[[1,15,BODY],[2,15,BODY],[2,16,BODY]]);
const _SW_R2N = patch(_SW_R2,[[1,17,BODY],[2,17,BODY],[2,18,BODY]]);
const PRESET_SWAY = {name:'sway',frames:[
  {hold:240,frame:null},{hold:180,frame:_SW_NA},
  {hold:200,frame:_SW_L1},{hold:240,frame:_SW_L2N},{hold:200,frame:_SW_L1b},
  {hold:160,frame:null},{hold:180,frame:_SW_NB},
  {hold:200,frame:_SW_R1},{hold:240,frame:_SW_R2N},{hold:200,frame:_SW_R1b},
  {hold:200,frame:_SW_NC},{hold:180,frame:null},
]};

// ── Creature Controller ───────────────────────────────────────────────────

// Idle pool (cycles through randomly) and expressive pool (occasional)
const IDLE_POOL       = [PRESET_BREATH, PRESET_BLINK, PRESET_SWAY, PRESET_BREATH, PRESET_BLINK];
const EXPRESSIVE_POOL = [PRESET_WINK, PRESET_SURPRISE, PRESET_DANCE];

let creatureApi  = null;
let cycleTimer   = null;
let cycleCount   = 0;
let lockedState  = null; // 'working' locks to THINK until released

function presetDuration(p) {
  return p.frames.reduce((s,f)=>s+f.hold, 0);
}

function pickNext() {
  if (lockedState === 'working') return PRESET_THINK;
  cycleCount++;
  // Every 5th cycle show an expressive animation
  if (cycleCount % 5 === 0) {
    return EXPRESSIVE_POOL[Math.floor(Math.random() * EXPRESSIVE_POOL.length)];
  }
  return IDLE_POOL[Math.floor(Math.random() * IDLE_POOL.length)];
}

function scheduleNext(preset) {
  if (cycleTimer) clearTimeout(cycleTimer);
  // Run each animation for ~2 loops, then switch
  const dur = presetDuration(preset) * 2;
  cycleTimer = setTimeout(() => {
    const next = pickNext();
    if (creatureApi) creatureApi.setPreset(next);
    scheduleNext(next);
  }, Math.max(dur, 4000)); // at least 4s per animation
}

function initCreature() {
  const host = document.getElementById('creature-grid');
  if (!host) return;

  creatureApi = window.PixelEngine.mount(host, {
    preset: PRESET_SURPRISE,
    color: '#CD7F6A',
    bg: 'transparent',
    speed: 1,
  });

  // Fade in
  const el = document.getElementById('roaming-creature');
  if (el) setTimeout(() => el.classList.add('visible'), 300);

  // After surprise plays once, switch to dance then start cycling
  const surpriseDur = presetDuration(PRESET_SURPRISE);
  setTimeout(() => {
    if (creatureApi) creatureApi.setPreset(PRESET_DANCE);
    const danceDur = presetDuration(PRESET_DANCE) * 2;
    setTimeout(() => {
      const first = IDLE_POOL[0];
      if (creatureApi) creatureApi.setPreset(first);
      scheduleNext(first);
    }, danceDur);
  }, surpriseDur);
}

function setCreatureState(state) {
  if (state === 'working') {
    lockedState = 'working';
    if (cycleTimer) clearTimeout(cycleTimer);
    if (creatureApi) creatureApi.setPreset(PRESET_THINK);
  } else {
    lockedState = null;
    const next = pickNext();
    if (creatureApi) creatureApi.setPreset(next);
    scheduleNext(next);
  }
}

// Legacy compat
function startIdleAnimation() { setCreatureState('idle'); }
function stopIdleAnimation()  { setCreatureState('idle'); }

window.claudepix = { initCreature, setCreatureState, startIdleAnimation, stopIdleAnimation };
