const screenCanvas = document.getElementById('screen-canvas');
const screenCtx = screenCanvas.getContext('2d', { willReadFrequently: true });
const magnifierCanvas = document.getElementById('magnifier-canvas');
const magnifierCtx = magnifierCanvas.getContext('2d');
const magnifier = document.getElementById('magnifier');
const colorSwatch = document.getElementById('color-swatch');
const colorHexEl = document.getElementById('color-hex');
const colorRgbEl = document.getElementById('color-rgb');
const mousePosEl = document.getElementById('mouse-pos');
const overlay = document.getElementById('picker-overlay');

const MAGNIFY_ZOOM = 10;
const MAGNIFY_SIZE = 200;
const SAMPLE_SIZE = MAGNIFY_SIZE / MAGNIFY_ZOOM;

let screenImage = null;
let screenWidth = 0;
let screenHeight = 0;
let displayWidth = 0;
let displayHeight = 0;
let mouseX = 0;
let mouseY = 0;
let currentColor = '#ffffff';
let selectedFor = null;
let isImageLoaded = false;

function init() {
  window.electronAPI.onScreenCaptured((data) => {
    if (data) {
      loadScreenImage(data);
    }
  });

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeyDown);

  const urlParams = new URLSearchParams(window.location.search);
  selectedFor = urlParams.get('for') || null;
}

function loadScreenImage(data) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    screenImage = img;
    screenWidth = img.naturalWidth;
    screenHeight = img.naturalHeight;
    displayWidth = data.displayWidth || window.screen.width;
    displayHeight = data.displayHeight || window.screen.height;

    screenCanvas.width = displayWidth;
    screenCanvas.height = displayHeight;
    
    screenCtx.imageSmoothingEnabled = false;
    screenCtx.drawImage(img, 0, 0, displayWidth, displayHeight);
    
    isImageLoaded = true;
    
    updateMagnifier();
    updateColorInfo();
  };
  img.onerror = (e) => {
    console.error('Failed to load screen image:', e);
  };
  img.src = data.dataUrl;
}

function handleMouseMove(e) {
  mouseX = e.clientX;
  mouseY = e.clientY;

  updateMagnifierPosition();
  if (isImageLoaded) {
    updateMagnifier();
    updateColorInfo();
  }
}

function updateMagnifierPosition() {
  const magnifierWidth = magnifier.offsetWidth;
  const magnifierHeight = magnifier.offsetHeight;
  const margin = 20;

  let left = mouseX + margin;
  let top = mouseY + margin;

  if (left + magnifierWidth > window.innerWidth) {
    left = mouseX - magnifierWidth - margin;
  }
  if (top + magnifierHeight > window.innerHeight) {
    top = mouseY - magnifierHeight - margin;
  }

  magnifier.style.left = Math.max(0, left) + 'px';
  magnifier.style.top = Math.max(0, top) + 'px';
}

function updateMagnifier() {
  if (!isImageLoaded) return;

  const sampleHalf = SAMPLE_SIZE / 2;
  const srcX = Math.max(0, Math.min(displayWidth - SAMPLE_SIZE, mouseX - sampleHalf));
  const srcY = Math.max(0, Math.min(displayHeight - SAMPLE_SIZE, mouseY - sampleHalf));

  magnifierCtx.clearRect(0, 0, MAGNIFY_SIZE, MAGNIFY_SIZE);
  magnifierCtx.imageSmoothingEnabled = false;
  
  try {
    magnifierCtx.drawImage(
      screenCanvas,
      srcX, srcY, SAMPLE_SIZE, SAMPLE_SIZE,
      0, 0, MAGNIFY_SIZE, MAGNIFY_SIZE
    );
  } catch (e) {
    console.error('Magnifier draw error:', e);
  }

  magnifierCtx.strokeStyle = 'rgba(99, 102, 241, 1)';
  magnifierCtx.lineWidth = 2;
  magnifierCtx.strokeRect(
    (MAGNIFY_SIZE - MAGNIFY_ZOOM) / 2,
    (MAGNIFY_SIZE - MAGNIFY_ZOOM) / 2,
    MAGNIFY_ZOOM,
    MAGNIFY_ZOOM
  );

  magnifierCtx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
  magnifierCtx.lineWidth = 1;
  magnifierCtx.beginPath();
  magnifierCtx.moveTo(MAGNIFY_SIZE / 2, 0);
  magnifierCtx.lineTo(MAGNIFY_SIZE / 2, MAGNIFY_SIZE);
  magnifierCtx.moveTo(0, MAGNIFY_SIZE / 2);
  magnifierCtx.lineTo(MAGNIFY_SIZE, MAGNIFY_SIZE / 2);
  magnifierCtx.stroke();
}

function updateColorInfo() {
  if (!isImageLoaded) return;

  try {
    const pixelData = screenCtx.getImageData(
      Math.max(0, Math.min(displayWidth - 1, mouseX)),
      Math.max(0, Math.min(displayHeight - 1, mouseY)),
      1, 1
    ).data;

    const r = pixelData[0];
    const g = pixelData[1];
    const b = pixelData[2];

    currentColor = rgbToHex(r, g, b);

    colorSwatch.style.setProperty('--swatch-color', currentColor);
    colorHexEl.textContent = currentColor.toUpperCase();
    colorRgbEl.textContent = `RGB(${r}, ${g}, ${b})`;
    mousePosEl.textContent = `X: ${mouseX}, Y: ${mouseY}`;
  } catch (e) {
    console.error('Pixel read error:', e);
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

async function handleClick(e) {
  e.preventDefault();
  e.stopPropagation();

  const color = {
    hex: currentColor.toUpperCase(),
    x: mouseX,
    y: mouseY,
    for: selectedFor
  };

  if (window.electronAPI) {
    await window.electronAPI.colorSelected(color);
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    if (window.electronAPI) {
      window.electronAPI.closePicker();
    }
    return;
  }

  const step = e.shiftKey ? 10 : 1;

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      mouseY = Math.max(0, mouseY - step);
      simulateMouseMove();
      break;
    case 'ArrowDown':
      e.preventDefault();
      mouseY = Math.min(window.innerHeight - 1, mouseY + step);
      simulateMouseMove();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      mouseX = Math.max(0, mouseX - step);
      simulateMouseMove();
      break;
    case 'ArrowRight':
      e.preventDefault();
      mouseX = Math.min(window.innerWidth - 1, mouseX + step);
      simulateMouseMove();
      break;
    case ' ':
    case 'Enter':
      e.preventDefault();
      handleClick({ clientX: mouseX, clientY: mouseY, preventDefault: () => {}, stopPropagation: () => {} });
      break;
  }
}

function simulateMouseMove() {
  updateMagnifierPosition();
  updateMagnifier();
  updateColorInfo();
}

init();
