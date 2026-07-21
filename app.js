// Chat Screenshot → Text
// Runs entirely in the browser. Uses Tesseract.js for OCR, then uses the
// horizontal position of each line of text to guess who said it (Me vs Them).

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

// Re-run if the user changes options after a result is already shown
mySideSel.addEventListener('change', reRenderIfPossible);
showLabels.addEventListener('change', reRenderIfPossible);

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

// --- OCR + processing ------------------------------------------------------

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
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          statusText.textContent = `Reading your screenshot… ${Math.round(m.progress * 100)}%`;
        }
      },
    });

    // Prefer full image width from the recognized page; fall back to the image element.
    lastImageWidth = data?.imageWidth || preview.naturalWidth || 1000;
    lastLines = (data.lines || [])
      .map((ln) => ({
        text: (ln.text || '').trim(),
        x0: ln.bbox?.x0 ?? 0,
        x1: ln.bbox?.x1 ?? 0,
      }))
      .filter((ln) => ln.text.length > 0);

    render();
  } catch (err) {
    statusText.textContent = 'Something went wrong reading that image. Try another screenshot.';
    console.error(err);
    return;
  } finally {
    // keep status visible only until render() shows results
  }
}

function reRenderIfPossible() {
  if (lastLines) render();
}

function render() {
  statusEl.hidden = true;
  results.hidden = false;

  const messages = groupIntoMessages(lastLines, lastImageWidth);
  const useLabels = showLabels.checked;
  const mineIsRight = mySideSel.value === 'right';

  const blocks = messages.map((msg) => {
    if (!useLabels) return msg.text;
    const isMine = mineIsRight ? (msg.side === 'right') : (msg.side === 'left');
    const label = isMine ? 'Me' : 'Them';
    return `${label}: ${msg.text}`;
  });

  output.value = blocks.join('\n\n');
}

// Group lines into messages by which side of the image they sit on,
// merging consecutive lines from the same side into one bubble.
function groupIntoMessages(lines, imageWidth) {
  const mid = imageWidth / 2;
  const messages = [];

  for (const ln of lines) {
    const center = (ln.x0 + ln.x1) / 2;
    const width  = ln.x1 - ln.x0;

    // A line spanning most of the image is likely a header/timestamp, not a
    // one-sided bubble — treat it as "center" and attach to whatever came before.
    const isFullWidth = width > imageWidth * 0.72;
    let side;
    if (isFullWidth) {
      side = messages.length ? messages[messages.length - 1].side : 'left';
    } else {
      side = center >= mid ? 'right' : 'left';
    }

    const prev = messages[messages.length - 1];
    if (prev && prev.side === side) {
      prev.text += ' ' + ln.text;
    } else {
      messages.push({ side, text: ln.text });
    }
  }

  return messages;
}
