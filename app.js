// Chat Screenshot → Text
// Runs entirely in the browser. Uses Tesseract.js for OCR, then uses the
// horizontal position of each line of text to guess who said it (Me vs Them),
// and cleans out timestamps / status-bar / app junk.

// Register the service worker so the app is installable / loads offline-ish.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

const dropzone   = document.getElementById('dropzone');
const fileInput  = document.getElementById('fileInput');
const statusEl   = document.getElementById('status');
const statusText = document.getElementById('statusText');
const results    = document.getElementById('results');
const preview    = document.getElementById('preview');
const output     = document.getElementById('output');
const copyBtn    = document.getElementById('copyBtn');
const resetBtn   = document.getElementById('resetBtn');
const mySideSel  = document.getElementById('mySide');
const showLabels = document.getElementById('showLabels');
const cleanJunk  = document.getElementById('cleanJunk');
const myNameEl   = document.getElementById('myName');
const theirNameEl = document.getElementById('theirName');

// Remember the names between visits so you only type them once.
myNameEl.value    = localStorage.getItem('myName') || '';
theirNameEl.value = localStorage.getItem('theirName') || '';
myNameEl.addEventListener('input', () => localStorage.setItem('myName', myNameEl.value));
theirNameEl.addEventListener('input', () => localStorage.setItem('theirName', theirNameEl.value));

// --- Upload interactions ---------------------------------------------------

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

// Paste an image straight from the clipboard
document.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      handleFile(item.getAsFile());
      break;
    }
  }
});

// Re-run render if the user changes options after a result is already shown
[mySideSel, showLabels, cleanJunk].forEach((el) =>
  el.addEventListener('change', reRenderIfPossible));
[myNameEl, theirNameEl].forEach((el) =>
  el.addEventListener('input', reRenderIfPossible));

resetBtn.addEventListener('click', () => {
  results.hidden = true;
  fileInput.value = '';
  lastLines = null;
  lastImageWidth = 0;
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    output.select();
    document.execCommand('copy');
  }
  copyBtn.textContent = '✓ Copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = '📋 Copy text';
    copyBtn.classList.remove('copied');
  }, 1600);
});

// --- OCR engine (created once, reused for speed) ---------------------------

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          statusText.textContent = `Reading your screenshot… ${Math.round(m.progress * 100)}%`;
        }
      },
    });
  }
  return workerPromise;
}

let lastLines = null;        // cached OCR lines so option changes re-render instantly
let lastImageWidth = 0;

async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please choose an image file (screenshot).');
    return;
  }

  const url = URL.createObjectURL(file);
  preview.src = url;
  results.hidden = true;
  statusEl.hidden = false;
  statusText.textContent = 'Reading your screenshot…';

  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(file);

    lastImageWidth = data?.imageWidth || preview.naturalWidth || 1000;
    lastLines = (data.lines || [])
      .map((ln) => ({
        text: (ln.text || '').trim(),
        x0: ln.bbox?.x0 ?? 0,
        x1: ln.bbox?.x1 ?? 0,
        y0: ln.bbox?.y0 ?? 0,
        y1: ln.bbox?.y1 ?? 0,
      }))
      .filter((ln) => ln.text.length > 0);

    render();
  } catch (err) {
    statusText.textContent = 'Something went wrong reading that image. Try another screenshot.';
    console.error(err);
  }
}

function reRenderIfPossible() {
  if (lastLines) render();
}

// --- Junk cleaning ---------------------------------------------------------

// Timestamp patterns that can appear on their own line OR tacked onto the end
// of a message, e.g. "Jul 20 7:57 PM".
const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE_TIME_RE = new RegExp(
  `\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:,)?\\s+\\d{1,2}:\\d{2}\\s*[ap]\\.?m\\.?`, 'gi');
const TIME_RE      = /\b\d{1,2}:\d{2}\s*[ap]\.?m\.?\b/gi;              // 7:57 PM
const DATE_ONLY_RE = new RegExp(`\\b(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}\\b`, 'gi');
const REL_DATE_RE  = /\b(today|yesterday|mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*\d{1,2}:\d{2}\s*[ap]\.?m\.?/gi;

// Whole lines that are pure UI chrome and should be dropped entirely.
const JUNK_LINE_RE = /^(online|active now|typing\.?\.?\.?|type a message|delivered|read|sent|seen|now|new match|it'?s a match|you matched|say something|send a message|message|back)$/i;
const STATUS_BAR_RE = /\b(lte|5g|4g|3g|wi-?fi|edge)\b/i;

function cleanLine(raw) {
  let s = raw;

  // Strip timestamps/dates anywhere in the line.
  s = s.replace(REL_DATE_RE, ' ')
       .replace(DATE_TIME_RE, ' ')
       .replace(TIME_RE, ' ')
       .replace(DATE_ONLY_RE, ' ');

  // Strip a trailing "Type a message ..." footer and anything after it.
  s = s.replace(/type a message.*/i, ' ');

  // Remove read-receipt checkmarks and stray symbol clutter.
  s = s.replace(/[✓✔»«•·|©®™]+/g, ' ');

  // Drop icon / emoji gibberish: keep only word-like tokens (real letters).
  s = stripGibberish(s);

  // Collapse whitespace.
  s = s.replace(/\s{2,}/g, ' ').trim();

  return s;
}

// Keep only word-like tokens and throw away icon/emoji junk (e.g. "(@]", "Gs",
// "[=]"). A token is kept if it's a number, or contains a real vowel-ish
// letter, or is the standalone word "I"/"a". Vowel set includes "y" so words
// like "my", "by", "cry" survive.
function stripGibberish(s) {
  return s.split(/\s+/).filter((tok) => {
    if (!tok) return false;
    if (/^\d[\d.,:%$]*$/.test(tok)) return true;      // numbers like 12, 7:50
    const core = tok.replace(/[^a-z]/gi, '');
    if (core.length === 0) return false;              // pure symbols/brackets
    if (/[aeiouy]/i.test(core)) return true;          // has a vowel -> a word
    if (core.length === 1 && /[ia]/i.test(core)) return true; // "I", "a"
    return false;                                     // vowelless cluster = junk
  }).join(' ');
}

// Decide whether a whole line is junk we should drop.
function isJunkLine(raw, x0, x1, imageWidth) {
  const s = raw.trim();
  if (!s) return true;

  // Status bar clock like "20:44" or "9:41" usually sits at the very top and
  // alongside signal/battery text.
  if (STATUS_BAR_RE.test(s)) return true;

  // Pure UI words.
  if (JUNK_LINE_RE.test(s)) return true;

  // After removing letters/spaces, if almost nothing but symbols/numbers is
  // left, it's icon/emoji garbage (e.g. the bottom nav row).
  const letters = s.replace(/[^a-z]/gi, '');
  if (letters.length <= 1 && s.length <= 4) return true;

  // Lines that are mostly symbols (low letter ratio) are icon rows.
  if (s.length >= 3 && letters.length / s.length < 0.4) return true;

  return false;
}

// --- Rendering -------------------------------------------------------------

function render() {
  statusEl.hidden = true;
  results.hidden = false;

  const doClean = cleanJunk.checked;
  const useLabels = showLabels.checked;
  const mineIsRight = mySideSel.value === 'right';
  const meLabel   = (myNameEl.value.trim() || 'Me');
  const themLabel = (theirNameEl.value.trim() || 'Them');

  // 1) Filter + clean each line.
  const cleaned = [];
  for (const ln of lastLines) {
    if (doClean && isJunkLine(ln.text, ln.x0, ln.x1, lastImageWidth)) continue;
    const text = doClean ? cleanLine(ln.text) : ln.text;
    if (!text) continue;
    // Drop residue left after stripping timestamps (e.g. a lone "v" checkmark).
    if (doClean) {
      const letters = text.replace(/[^a-z]/gi, '');
      if (letters.length <= 1 && text.length <= 3) continue;
    }
    cleaned.push({ ...ln, text });
  }

  // 2) Group into messages by which side the bubble is aligned to.
  const messages = groupIntoMessages(cleaned, lastImageWidth);

  // 3) Build output.
  const blocks = messages.map((msg) => {
    if (!useLabels) return msg.text;
    const isMine = mineIsRight ? (msg.side === 'right') : (msg.side === 'left');
    return `${isMine ? meLabel : themLabel}: ${msg.text}`;
  });

  output.value = blocks.join('\n\n');
}

// Group lines into messages.
//
// Speaker detection uses where each bubble SITS on screen, not per-line text
// alignment. Left-side bubbles (Them) start hard against the screen's left
// edge; right-side bubbles (Me) are pushed inward, so their text starts
// noticeably indented from the left — even the short last line of a wrapped
// message. So we find the leftmost text position in the image (the left
// bubbles' margin) and call anything clearly indented past it the other side.
//
// We also split same-side bubbles apart when there's a big vertical gap between
// them, so two separate messages from the same person don't get glued together.
function groupIntoMessages(lines, imageWidth) {
  if (!lines.length) return [];

  // Find where to split "left column" (Them) from "right column" (Me). Text
  // sits in two vertical columns; we detect the biggest horizontal gap between
  // where lines start (x0) and split there. This adapts to each app's layout
  // instead of assuming a fixed indent.
  const leftEdge = Math.min(...lines.map((l) => l.x0));
  const starts = lines
    .filter((l) => (l.x1 - l.x0) <= imageWidth * 0.82)
    .map((l) => l.x0)
    .sort((a, b) => a - b);
  let indentThreshold = leftEdge + imageWidth * 0.06;
  let maxGap = 0;
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap > maxGap) { maxGap = gap; indentThreshold = (starts[i] + starts[i - 1]) / 2; }
  }
  // If there's no clear two-column gap (e.g. all one speaker), use a default.
  if (maxGap < imageWidth * 0.04) indentThreshold = leftEdge + imageWidth * 0.06;

  // Typical line height, for detecting gaps between separate bubbles.
  const heights = lines.map((l) => l.y1 - l.y0).filter((h) => h > 0).sort((a, b) => a - b);
  const lineH = heights.length ? heights[Math.floor(heights.length / 2)] : 20;

  const messages = [];
  for (const ln of lines) {
    const width = ln.x1 - ln.x0;

    let side;
    if (width > imageWidth * 0.82) {
      // Spans almost the whole width — can't tell a side; attach to previous.
      side = messages.length ? messages[messages.length - 1].side : 'left';
    } else {
      side = ln.x0 <= indentThreshold ? 'left' : 'right';
    }

    const prev = messages[messages.length - 1];
    const bigGap = prev && (ln.y0 - prev.y1) > lineH * 1.6;

    if (prev && prev.side === side && !bigGap) {
      prev.text += ' ' + ln.text;
      prev.y1 = ln.y1;
    } else {
      messages.push({ side, text: ln.text, y1: ln.y1 });
    }
  }

  // Tidy each message's internal spacing.
  messages.forEach((m) => { m.text = m.text.replace(/\s{2,}/g, ' ').trim(); });
  return messages.filter((m) => m.text.length > 0);
}
