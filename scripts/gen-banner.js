// Generates images/banner.svg — animated creature banner for README
// Run: node scripts/gen-banner.js

const fs = require('fs');
const path = require('path');

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

const BODY_COLOR = '#CD7F6A';  // matches app creature color
const BG         = '#161616';
const SURFACE    = '#1e1e1e';
const ORANGE     = '#e8650a';
const TEXT       = '#e8e8e8';
const MUTED      = '#b0b0b0';
const DIM        = '#525252';
const BORDER     = '#2e2e2e';

const W = 820, H = 200;
const CELL = 8;

// Creature grid placed so content is centered in the right ~260px
// Content spans rows 4-16, cols 3-17 → center col=10, center row=10
// Target center: x=690, y=100
const OX = 690 - 10 * CELL;  // = 610
const OY = 100 - 10 * CELL;  // = 20

function cx(col) { return OX + col * CELL; }
function cy(row) { return OY + row * CELL; }

const bodyRects = [];
const eyeCovers = [];

for (let r = 0; r < 20; r++) {
  for (let c = 0; c < 20; c++) {
    const v = CREATURE[r][c];
    if (v === 1) {
      bodyRects.push(
        `  <rect x="${cx(c)}" y="${cy(r)}" width="${CELL-1}" height="${CELL-1}" rx="1" fill="${BODY_COLOR}"/>`
      );
    } else if (v === 2) {
      // Eye position — transparent by default; covered when blinking
      // Blink at ~2.5s and ~5.5s within a 7s cycle
      eyeCovers.push(
        `  <rect x="${cx(c)}" y="${cy(r)}" width="${CELL-1}" height="${CELL-1}" rx="1" fill="${BODY_COLOR}" opacity="0">` +
        `<animate attributeName="opacity" ` +
        `values="0;0;1;1;0;0;0;1;1;0;0" ` +
        `keyTimes="0;0.34;0.36;0.38;0.40;0.76;0.78;0.80;0.82;0.84;1" ` +
        `dur="7s" repeatCount="indefinite"/></rect>`
      );
    }
  }
}

// Small floating particle (ambient effect, top-right of creature)
function particle(x, y, delay, dur, dx, dy) {
  return `  <circle cx="${x}" cy="${y}" r="2" fill="${ORANGE}" opacity="0">` +
    `<animate attributeName="opacity" values="0;0.7;0" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
    `<animateTransform attributeName="transform" type="translate" values="0,0;${dx},${dy}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" additive="sum"/>` +
    `</circle>`;
}

const particles = [
  particle(cx(17), cy(4), 1.0, 2.8, 6, -12),
  particle(cx(16), cy(5), 2.3, 3.2, 4, -10),
  particle(cx(18), cy(6), 0.4, 2.5, 8, -14),
];

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

  <!-- Background -->
  <rect width="${W}" height="${H}" rx="10" fill="${BG}"/>
  <rect x="1" y="1" width="${W-2}" height="${H-2}" rx="9" fill="none" stroke="${BORDER}" stroke-width="1"/>

  <!-- Orange left accent bar -->
  <rect x="0" y="30" width="3" height="${H-60}" rx="1.5" fill="${ORANGE}"/>

  <!-- TOKEN text -->
  <text x="30" y="92"
    font-family="'Courier New', Courier, monospace"
    font-size="50" font-weight="bold" letter-spacing="3"
    fill="${TEXT}">TOKEN</text>

  <!-- METER text (orange) -->
  <text x="30" y="140"
    font-family="'Courier New', Courier, monospace"
    font-size="50" font-weight="bold" letter-spacing="3"
    fill="${ORANGE}">METER</text>

  <!-- Subtitle -->
  <text x="32" y="165"
    font-family="'Courier New', Courier, monospace"
    font-size="11" fill="${DIM}" letter-spacing="1">
    claude code · token usage · cost tracking · idle companion
  </text>

  <!-- Divider line between text and creature -->
  <line x1="570" y1="20" x2="570" y2="${H-20}" stroke="${BORDER}" stroke-width="1"/>

  <!-- Creature group with smooth bob animation -->
  <g>
    <animateTransform attributeName="transform" type="translate"
      values="0,0; 0,-3; 0,-4; 0,-3; 0,0"
      keyTimes="0; 0.25; 0.5; 0.75; 1"
      calcMode="spline"
      keySplines="0.45 0 0.55 1; 0.45 0 0.55 1; 0.45 0 0.55 1; 0.45 0 0.55 1"
      dur="3s" repeatCount="indefinite"/>

${bodyRects.join('\n')}

${eyeCovers.join('\n')}
  </g>

  <!-- Ambient particles -->
${particles.join('\n')}

</svg>`;

const outPath = path.join(__dirname, '..', 'images', 'banner.svg');
fs.writeFileSync(outPath, svg);
console.log(`✓  images/banner.svg  (${W}×${H}px, animated creature)`);
