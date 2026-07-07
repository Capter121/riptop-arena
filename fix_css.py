with open('e:/战斗陀螺项目/src/style.css', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

# Truncate anything from line 972 onwards
lines = lines[:971]

css_to_append = """
/* Energy Bar */
.bar--energy {
  height: 6px;
  background: rgba(0, 255, 204, 0.1);
  border: 1px solid rgba(0, 255, 204, 0.3);
}
.bar--energy .bar__fill {
  background: linear-gradient(90deg, #00ffcc, #0088ff);
  box-shadow: 0 0 10px rgba(0, 255, 204, 0.8);
}

/* Vignette */
body::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle, transparent 30%, rgba(0, 0, 0, 0.8) 100%);
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 5;
}
body.vignette-active::after {
  opacity: 1;
}

/* Clash Panel */
.clash-panel {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  z-index: 100;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.clash-panel.active {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}
.clash-panel.hidden {
  display: none;
}
.clash-panel__timer {
  font-size: 64px;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 20px #0ff;
  font-family: "Space Grotesk", sans-serif;
}
.clash-panel__timer.danger {
  color: #f33;
  text-shadow: 0 0 20px #f00;
  animation: pulse 0.5s infinite alternate;
}
.clash-panel__actions {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 600px;
}
.clash-panel__btn {
  background: rgba(10, 20, 30, 0.8);
  border: 1px solid rgba(0, 255, 255, 0.3);
  color: #fff;
  padding: 15px 25px;
  font-size: 18px;
  font-family: "Space Grotesk", sans-serif;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 4px;
  backdrop-filter: blur(5px);
  transition: all 0.1s;
  display: flex;
  align-items: center;
  gap: 10px;
}
.clash-panel__btn:hover {
  background: rgba(0, 255, 255, 0.2);
  border-color: #0ff;
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
}
.clash-panel__btn.active {
  background: rgba(0, 255, 255, 0.4);
  border-color: #0ff;
  box-shadow: 0 0 20px rgba(0, 255, 255, 0.8);
}
.clash-panel__btn.disabled {
  opacity: 0.3;
  pointer-events: none;
  filter: grayscale(1);
}
.clash-panel__btn .key {
  display: inline-block;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-weight: bold;
  color: #0ff;
}
.clash-panel__btn .cost {
  color: #0f0;
  font-size: 14px;
}
.clash-panel__result {
  font-size: 32px;
  font-weight: 700;
  color: #ffcc00;
  text-shadow: 0 0 15px rgba(255, 204, 0, 0.8);
  height: 40px;
  text-transform: uppercase;
}
@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.1); }
}
"""

with open('e:/战斗陀螺项目/src/style.css', 'w', encoding='utf-8') as f:
    f.writelines(lines)
    f.write(css_to_append)
