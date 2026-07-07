const fs = require('fs');
let css = fs.readFileSync('src/style.css', 'utf8');

// 1. Remove the incorrectly placed block inside the media query:
const badBlock = `.bar__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3ac4ff, #7ef0ff);
  box-shadow: 0 0 12px rgba(126, 240, 255, 0.4);
  transition: width 0.1s linear;
}

.bar--integrity .bar__fill {
  background: linear-gradient(90deg, #ff7b5b, #ffd166);
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.4);
}

.status-enemy .status__title {
  flex-direction: row-reverse;
}

.status-enemy .status__meta {
  text-align: right;
}

.status-enemy .bar {
  display: flex;
  justify-content: flex-end;
}

.status-enemy .bar__fill {
  background: linear-gradient(270deg, #3ac4ff, #7ef0ff);
}

.status-enemy .bar--integrity .bar__fill {
  background: linear-gradient(270deg, #ff7b5b, #ffd166);
}

`;

css = css.replace(badBlock, '');

// 2. Insert the block globally where `.hud__timer` is, restoring `.hud__center` globally.
const globalFix = `.bar__fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #3ac4ff, #7ef0ff);
  box-shadow: 0 0 12px rgba(126, 240, 255, 0.4);
  transition: width 0.1s linear;
}

.bar--integrity .bar__fill {
  background: linear-gradient(90deg, #ff7b5b, #ffd166);
  box-shadow: 0 0 12px rgba(255, 209, 102, 0.4);
}

.status-enemy .status__title {
  flex-direction: row-reverse;
}

.status-enemy .status__meta {
  text-align: right;
}

.status-enemy .bar {
  display: flex;
  justify-content: flex-end;
}

.status-enemy .bar__fill {
  background: linear-gradient(270deg, #3ac4ff, #7ef0ff);
}

.status-enemy .bar--integrity .bar__fill {
  background: linear-gradient(270deg, #ff7b5b, #ffd166);
}

.hud__center {
  min-width: 260px;
  text-align: center;
}

.hud__timer {`;

css = css.replace('.hud__timer {', globalFix);

fs.writeFileSync('src/style.css', css);
console.log('Fixed style.css');
