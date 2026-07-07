const fs = require('fs');
let css = fs.readFileSync('src/style.css', 'utf8');

const target = `}
  gap: 10px;
}

.touch-controls[data-phase='launch'] .touch-controls__group--launch {`;

const startIdx = css.indexOf('.garage-summary__empty {');
const endIdx = css.indexOf(`.touch-controls[data-phase='launch']`);

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `.garage-summary__empty {
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);
  color: #d4e6f8;
  font-size: 12px;
  line-height: 1.55;
}

.hud {
  position: fixed;
  inset: 24px 24px auto 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  pointer-events: none;
}

.hud > * {
  pointer-events: auto;
}

.touch-controls {
  position: fixed;
  right: 24px;
  bottom: 118px;
  z-index: 2;
  display: none;
  gap: 10px;
  width: min(360px, calc(100vw - 48px));
}

.touch-controls[data-visible='true'] {
  display: grid;
}

.touch-controls__group {
  display: none;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

`;
  css = css.substring(0, startIdx) + replacement + css.substring(endIdx);
  fs.writeFileSync('src/style.css', css);
  console.log('Fixed style.css');
} else {
  console.log('Could not find markers');
}
