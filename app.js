const state = {
  currentColor: { hex: '#3498DB', r: 52, g: 152, b: 219, h: 204, s: 70, l: 53, a: 1 },
  palette: [],
  history: [],
  gradient: {
    type: 'linear',
    angle: 90,
    stops: [
      { color: '#667eea', position: 0 },
      { color: '#764ba2', position: 100 }
    ]
  },
  contrast: {
    fg: '#FFFFFF',
    bg: '#3498DB'
  },
  isAlwaysOnTop: false,
  pickFor: null
};

const MAX_HISTORY = 20;

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function isValidHex(hex) {
  return /^#?([a-f\d]{3}|[a-f\d]{6})$/i.test(hex);
}

function normalizeHex(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  return '#' + hex.toUpperCase();
}

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (!rgb1 || !rgb2) return 1;

  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function getContrastGrade(ratio, isLargeText = false, isAAA = false) {
  const threshold = isAAA ? (isLargeText ? 4.5 : 7) : (isLargeText ? 3 : 4.5);
  return ratio >= threshold;
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => {
    toast.className = 'toast';
  }, 2000);
}

async function copyToClipboard(text) {
  if (window.electronAPI) {
    await window.electronAPI.copyToClipboard(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
  showToast('已复制到剪贴板');
}

function updateColorUI(source = 'all') {
  const { hex, r, g, b, h, s, l, a } = state.currentColor;

  if (source !== 'input') {
    document.getElementById('input-hex').value = hex;
    document.getElementById('input-r').value = r;
    document.getElementById('input-g').value = g;
    document.getElementById('input-b').value = b;
    document.getElementById('input-h').value = h;
    document.getElementById('input-s').value = s;
    document.getElementById('input-l').value = l;
  }

  if (source !== 'slider') {
    document.getElementById('slider-h').value = h;
    document.getElementById('slider-s').value = s;
    document.getElementById('slider-l').value = l;
    document.getElementById('slider-a').value = a * 100;
  }

  const colorPreview = document.getElementById('color-preview');
  colorPreview.style.background = hex;
  colorPreview.style.opacity = a;
  document.getElementById('current-hex').textContent = hex;

  const saturation = `linear-gradient(to right, hsl(${h}, 0%, 50%), hsl(${h}, 100%, 50%))`;
  const lightness = `linear-gradient(to right, hsl(${h}, ${s}%, 0%), hsl(${h}, ${s}%, 50%), hsl(${h}, ${s}%, 100%))`;
  
  document.getElementById('slider-s').style.background = saturation;
  document.getElementById('slider-l').style.background = lightness;
}

function setColorFromHex(hex, updateHistory = false) {
  if (!isValidHex(hex)) return;
  
  hex = normalizeHex(hex);
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  
  state.currentColor = { ...state.currentColor, hex, ...rgb, ...hsl };
  updateColorUI();
  
  if (updateHistory) {
    addToHistory(hex);
  }
}

function setColorFromRgb(r, g, b) {
  const hex = rgbToHex(r, g, b);
  const hsl = rgbToHsl(r, g, b);
  state.currentColor = { ...state.currentColor, hex, r, g, b, ...hsl };
  updateColorUI();
}

function setColorFromHsl(h, s, l) {
  const rgb = hslToRgb(h, s, l);
  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
  state.currentColor = { ...state.currentColor, hex, ...rgb, h, s, l };
  updateColorUI();
}

async function addToHistory(hex) {
  const timestamp = Date.now();
  state.history = state.history.filter(h => h.hex !== hex);
  state.history.unshift({ hex, timestamp });
  
  if (state.history.length > MAX_HISTORY) {
    state.history = state.history.slice(0, MAX_HISTORY);
  }
  
  await saveData();
  renderHistory();
}

async function addToPalette() {
  const hex = state.currentColor.hex;
  const exists = state.palette.find(p => p.hex === hex);
  
  if (exists) {
    showToast('该颜色已在调色板中', true);
    return;
  }
  
  const rgb = hexToRgb(hex);
  state.palette.push({
    hex,
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    id: Date.now()
  });
  
  await saveData();
  renderPalette();
  showToast('已添加到调色板');
}

async function removeFromPalette(id) {
  state.palette = state.palette.filter(p => p.id !== id);
  await saveData();
  renderPalette();
}

async function clearPalette() {
  if (state.palette.length === 0) return;
  if (!confirm('确定要清空调色板吗？')) return;
  
  state.palette = [];
  await saveData();
  renderPalette();
  showToast('调色板已清空');
}

async function exportPalette() {
  if (state.palette.length === 0) {
    showToast('调色板为空', true);
    return;
  }
  
  const data = {
    name: 'ColorPicker Palette',
    exportedAt: new Date().toISOString(),
    colors: state.palette
  };
  
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `palette-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('调色板已导出');
}

function importPalette(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.colors && Array.isArray(data.colors)) {
        for (const color of data.colors) {
          if (color.hex && isValidHex(color.hex)) {
            const exists = state.palette.find(p => p.hex === color.hex);
            if (!exists) {
              const rgb = hexToRgb(color.hex);
              state.palette.push({
                hex: color.hex,
                r: rgb.r,
                g: rgb.g,
                b: rgb.b,
                id: Date.now() + Math.random()
              });
            }
          }
        }
        await saveData();
        renderPalette();
        showToast(`成功导入 ${data.colors.length} 个颜色`);
      } else {
        showToast('无效的调色板文件', true);
      }
    } catch (err) {
      showToast('导入失败: ' + err.message, true);
    }
  };
  reader.readAsText(file);
}

function renderPalette() {
  const grid = document.getElementById('palette-grid');
  
  if (state.palette.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
        </svg>
        <p>调色板为空</p>
        <span>使用"添加到调色板"保存您喜欢的颜色</span>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = state.palette.map(item => `
    <div class="palette-item" data-hex="${item.hex}">
      <div class="palette-color" style="--item-color: ${item.hex}"></div>
      <div class="palette-info">
        <div class="palette-hex">${item.hex}</div>
        <div class="palette-rgb">RGB(${item.r}, ${item.g}, ${item.b})</div>
      </div>
      <div class="palette-actions-item">
        <button class="btn btn-small" onclick="event.stopPropagation(); copyToClipboard('${item.hex}')">复制</button>
        <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); removeFromPalette(${item.id})">删除</button>
      </div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('click', () => {
      const hex = item.dataset.hex;
      setColorFromHex(hex, true);
      switchTab('converter');
    });
  });
}

function renderHistory() {
  const list = document.getElementById('history-list');
  
  if (state.history.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        <p>暂无历史记录</p>
        <span>使用屏幕取色功能后，颜色会自动保存在这里</span>
      </div>
    `;
    return;
  }
  
  list.innerHTML = state.history.map((item, index) => {
    const rgb = hexToRgb(item.hex);
    const time = new Date(item.timestamp);
    const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="history-item" data-hex="${item.hex}">
        <div class="history-color" style="--item-color: ${item.hex}"></div>
        <div class="history-info">
          <div class="history-hex">${item.hex}</div>
          <div class="history-rgb">RGB(${rgb.r}, ${rgb.g}, ${rgb.b})</div>
        </div>
        <div class="history-time">${timeStr}</div>
      </div>
    `;
  }).join('');
  
  list.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const hex = item.dataset.hex;
      setColorFromHex(hex, false);
      switchTab('converter');
    });
  });
}

async function clearHistory() {
  if (state.history.length === 0) return;
  if (!confirm('确定要清空历史记录吗？')) return;
  
  state.history = [];
  await saveData();
  renderHistory();
  showToast('历史记录已清空');
}

function updateContrast() {
  const { fg, bg } = state.contrast;
  const ratio = getContrastRatio(fg, bg);
  
  document.getElementById('contrast-ratio').textContent = ratio.toFixed(2) + ':1';
  
  const aa = getContrastGrade(ratio, false, false);
  const aaLarge = getContrastGrade(ratio, true, false);
  const aaa = getContrastGrade(ratio, false, true);
  const aaaLarge = getContrastGrade(ratio, true, true);
  
  const setGrade = (id, pass) => {
    const el = document.getElementById(id);
    el.textContent = pass ? '✓ 通过' : '✗ 未通过';
    el.className = 'result-grade ' + (pass ? 'pass' : 'fail');
  };
  
  setGrade('contrast-aa', aa);
  setGrade('contrast-aa-large', aaLarge);
  setGrade('contrast-aaa', aaa);
  setGrade('contrast-aaa-large', aaaLarge);
  
  const previewCard = document.getElementById('contrast-preview-card');
  previewCard.style.setProperty('--bg-color', bg);
  previewCard.style.setProperty('--fg-color', fg);
  
  document.getElementById('contrast-fg-preview').style.background = fg;
  document.getElementById('contrast-bg-preview').style.background = bg;
}

function setContrastColor(type, hex) {
  if (!isValidHex(hex)) return;
  hex = normalizeHex(hex);
  state.contrast[type] = hex;
  document.getElementById('contrast-' + type).value = hex;
  updateContrast();
}

function swapContrastColors() {
  const temp = state.contrast.fg;
  state.contrast.fg = state.contrast.bg;
  state.contrast.bg = temp;
  
  document.getElementById('contrast-fg').value = state.contrast.fg;
  document.getElementById('contrast-bg').value = state.contrast.bg;
  updateContrast();
}

function updateGradient() {
  const { type, angle, stops } = state.gradient;
  
  const sortedStops = [...stops].sort((a, b) => a.position - b.position);
  const stopsStr = sortedStops.map(s => `${s.color} ${s.position}%`).join(', ');
  
  let css;
  if (type === 'linear') {
    css = `linear-gradient(${angle}deg, ${stopsStr})`;
  } else {
    css = `radial-gradient(circle, ${stopsStr})`;
  }
  
  document.getElementById('gradient-preview-box').style.background = css;
  document.getElementById('gradient-code').textContent = css;
  
  document.getElementById('angle-control').style.display = type === 'linear' ? 'block' : 'none';
}

function addGradientStop() {
  if (state.gradient.stops.length >= 10) {
    showToast('最多支持10个色标', true);
    return;
  }
  
  const lastStop = state.gradient.stops[state.gradient.stops.length - 1];
  const newPosition = Math.min(100, lastStop.position + 20);
  state.gradient.stops.push({
    color: '#ffffff',
    position: newPosition
  });
  
  renderGradientStops();
  updateGradient();
}

function removeGradientStop() {
  if (state.gradient.stops.length <= 2) {
    showToast('至少需要2个色标', true);
    return;
  }
  
  state.gradient.stops.pop();
  renderGradientStops();
  updateGradient();
}

function renderGradientStops() {
  const container = document.getElementById('gradient-stops');
  
  container.innerHTML = state.gradient.stops.map((stop, index) => `
    <div class="color-stop" data-index="${index}">
      <input type="color" value="${stop.color}" data-index="${index}" class="stop-color">
      <input type="range" min="0" max="100" value="${stop.position}" class="stop-position" data-index="${index}">
    </div>
  `).join('');
  
  container.querySelectorAll('.stop-color').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      state.gradient.stops[index].color = e.target.value.toUpperCase();
      updateGradient();
    });
  });
  
  container.querySelectorAll('.stop-position').forEach(input => {
    input.addEventListener('input', (e) => {
      const index = parseInt(e.target.dataset.index);
      state.gradient.stops[index].position = parseInt(e.target.value);
      updateGradient();
    });
  });
}

function applyPresetGradient(colors, angle) {
  const colorArray = colors.split(',');
  state.gradient.stops = colorArray.map((color, index) => ({
    color: color.trim(),
    position: index === 0 ? 0 : index === colorArray.length - 1 ? 100 : Math.round((index / (colorArray.length - 1)) * 100)
  }));
  state.gradient.angle = angle;
  document.getElementById('gradient-angle').value = angle;
  document.getElementById('angle-value').textContent = angle + '°';
  
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === 'linear');
  });
  state.gradient.type = 'linear';
  
  renderGradientStops();
  updateGradient();
}

function getRandomColor() {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return rgbToHex(r, g, b);
}

function getInvertedColor(hex) {
  const rgb = hexToRgb(hex);
  return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
}

function getComplementaryColor(hex) {
  const hsl = rgbToHsl(hexToRgb(hex).r, hexToRgb(hex).g, hexToRgb(hex).b);
  hsl.h = (hsl.h + 180) % 360;
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

async function saveData() {
  if (window.electronAPI) {
    await window.electronAPI.storeSet('palette', state.palette);
    await window.electronAPI.storeSet('history', state.history);
  } else {
    localStorage.setItem('colorpicker_palette', JSON.stringify(state.palette));
    localStorage.setItem('colorpicker_history', JSON.stringify(state.history));
  }
}

async function loadData() {
  if (window.electronAPI) {
    state.palette = await window.electronAPI.storeGet('palette', []) || [];
    state.history = await window.electronAPI.storeGet('history', []) || [];
    state.isAlwaysOnTop = await window.electronAPI.getAlwaysOnTopStatus() || false;
  } else {
    state.palette = JSON.parse(localStorage.getItem('colorpicker_palette') || '[]');
    state.history = JSON.parse(localStorage.getItem('colorpicker_history') || '[]');
  }
  updateAlwaysOnTopButton();
}

function updateAlwaysOnTopButton() {
  const btn = document.getElementById('btn-always-top');
  if (state.isAlwaysOnTop) {
    btn.classList.add('active');
    btn.title = '取消置顶 (Ctrl+Shift+T)';
  } else {
    btn.classList.remove('active');
    btn.title = '窗口置顶 (Ctrl+Shift+T)';
  }
}

async function toggleAlwaysOnTop() {
  if (window.electronAPI) {
    state.isAlwaysOnTop = await window.electronAPI.toggleAlwaysOnTop();
  } else {
    state.isAlwaysOnTop = !state.isAlwaysOnTop;
  }
  updateAlwaysOnTopButton();
  showToast(state.isAlwaysOnTop ? '已置顶' : '已取消置顶');
}

async function startPicker(forTarget = null) {
  state.pickFor = forTarget;
  if (window.electronAPI) {
    await window.electronAPI.startPicker();
  } else {
    showToast('请在Electron环境中使用取色器', true);
  }
}

function handleColorSelected(color) {
  if (!color || !color.hex) return;
  
  if (color.for === 'fg') {
    setContrastColor('fg', color.hex);
    switchTab('contrast');
  } else if (color.for === 'bg') {
    setContrastColor('bg', color.hex);
    switchTab('contrast');
  } else {
    setColorFromHex(color.hex, true);
  }
  
  showToast(`已选取颜色: ${color.hex}`);
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === 'tab-' + tabName);
  });
}

function initEventListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('input-hex').addEventListener('input', (e) => {
    const val = e.target.value;
    if (val.startsWith('#') && isValidHex(val)) {
      setColorFromHex(val);
    }
  });

  ['input-r', 'input-g', 'input-b'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const r = parseInt(document.getElementById('input-r').value) || 0;
      const g = parseInt(document.getElementById('input-g').value) || 0;
      const b = parseInt(document.getElementById('input-b').value) || 0;
      setColorFromRgb(r, g, b);
    });
  });

  ['input-h', 'input-s', 'input-l'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      const h = parseInt(document.getElementById('input-h').value) || 0;
      const s = parseInt(document.getElementById('input-s').value) || 0;
      const l = parseInt(document.getElementById('input-l').value) || 0;
      setColorFromHsl(h, s, l);
    });
  });

  document.getElementById('slider-h').addEventListener('input', (e) => {
    const h = parseInt(e.target.value);
    setColorFromHsl(h, state.currentColor.s, state.currentColor.l);
  });

  document.getElementById('slider-s').addEventListener('input', (e) => {
    const s = parseInt(e.target.value);
    setColorFromHsl(state.currentColor.h, s, state.currentColor.l);
  });

  document.getElementById('slider-l').addEventListener('input', (e) => {
    const l = parseInt(e.target.value);
    setColorFromHsl(state.currentColor.h, state.currentColor.s, l);
  });

  document.getElementById('slider-a').addEventListener('input', (e) => {
    state.currentColor.a = parseInt(e.target.value) / 100;
    updateColorUI('slider');
  });

  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.copy;
      let text = '';
      
      if (type === 'hex') {
        text = state.currentColor.hex;
      } else if (type === 'gradient') {
        text = document.getElementById('gradient-code').textContent;
      }
      
      copyToClipboard(text);
    });
  });

  document.getElementById('btn-add-palette').addEventListener('click', addToPalette);
  document.getElementById('btn-random').addEventListener('click', () => {
    setColorFromHex(getRandomColor(), true);
  });
  document.getElementById('btn-invert').addEventListener('click', () => {
    setColorFromHex(getInvertedColor(state.currentColor.hex), true);
  });
  document.getElementById('btn-complement').addEventListener('click', () => {
    setColorFromHex(getComplementaryColor(state.currentColor.hex), true);
  });

  document.getElementById('btn-picker').addEventListener('click', () => startPicker());
  document.getElementById('btn-always-top').addEventListener('click', toggleAlwaysOnTop);

  document.getElementById('btn-import-palette').addEventListener('click', () => {
    document.getElementById('file-import').click();
  });
  document.getElementById('file-import').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      importPalette(e.target.files[0]);
    }
  });
  document.getElementById('btn-export-palette').addEventListener('click', exportPalette);
  document.getElementById('btn-clear-palette').addEventListener('click', clearPalette);

  document.getElementById('contrast-fg').addEventListener('input', (e) => {
    if (isValidHex(e.target.value)) {
      setContrastColor('fg', e.target.value);
    }
  });
  document.getElementById('contrast-bg').addEventListener('input', (e) => {
    if (isValidHex(e.target.value)) {
      setContrastColor('bg', e.target.value);
    }
  });
  document.getElementById('btn-swap-colors').addEventListener('click', swapContrastColors);
  document.getElementById('btn-pick-fg').addEventListener('click', () => startPicker('fg'));
  document.getElementById('btn-pick-bg').addEventListener('click', () => startPicker('bg'));

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.gradient.type = btn.dataset.type;
      updateGradient();
    });
  });

  document.getElementById('gradient-angle').addEventListener('input', (e) => {
    state.gradient.angle = parseInt(e.target.value);
    document.getElementById('angle-value').textContent = state.gradient.angle + '°';
    updateGradient();
  });

  document.getElementById('btn-add-stop').addEventListener('click', addGradientStop);
  document.getElementById('btn-remove-stop').addEventListener('click', removeGradientStop);

  document.querySelectorAll('.preset-item').forEach(item => {
    item.addEventListener('click', () => {
      applyPresetGradient(item.dataset.colors, parseInt(item.dataset.angle));
    });
  });

  document.getElementById('btn-clear-history').addEventListener('click', clearHistory);

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      startPicker();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      toggleAlwaysOnTop();
    }
  });

  if (window.electronAPI) {
    window.electronAPI.onColorSelected(handleColorSelected);
    window.electronAPI.onAlwaysOnTopChanged((isOnTop) => {
      state.isAlwaysOnTop = isOnTop;
      updateAlwaysOnTopButton();
    });
  }
}

async function init() {
  await loadData();
  initEventListeners();
  updateColorUI();
  renderPalette();
  renderHistory();
  renderGradientStops();
  updateGradient();
  updateContrast();
}

window.removeFromPalette = removeFromPalette;
window.copyToClipboard = copyToClipboard;

init();
