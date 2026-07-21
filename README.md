# 📸 Chat Screenshot → Text

Upload a screenshot of a chat (e.g. from a dating app) and get clean, copyable
text — automatically labeled **Me** vs **Them** — so you can paste it to your
wingman or dating coach.

## What it does

1. You drop in / paste / choose a screenshot of a conversation.
2. It reads all the text out of the image using OCR (optical character recognition).
3. It figures out who said what based on which side of the screen each message
   bubble is on (your messages are usually on the right, theirs on the left).
4. It gives you clean text you can edit and copy with one click.

## Privacy

Everything runs **100% in your browser**. Your screenshots are never uploaded to
any server — the OCR happens on your own device. Good, because dating chats are
private.

## How to use it

### Option A — just open it locally
Open `index.html` in a modern browser (Chrome, Edge, Safari, Firefox). Done.
The OCR engine loads from a CDN the first time, so you need internet the first run.

### Option B — host it for free on GitHub Pages
1. Push this repo to GitHub.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**.
3. Pick your branch and the root folder, save.
4. Visit the URL GitHub gives you — now you can use it from your phone too.

## Tips

- **If "Me" and "Them" look flipped**, change the "My messages are on the…"
  dropdown and re-upload (or the result re-renders automatically).
- **OCR isn't perfect.** The extracted text is fully editable before you copy —
  fix any typos the reader gets wrong.
- Clearer, higher-resolution screenshots read better. Crop out the keyboard /
  status bar if you can.
- You can **paste an image directly** with Ctrl/Cmd + V.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The page layout |
| `styles.css` | Styling |
| `app.js` | Upload handling, OCR, and Me/Them detection |

## Tech

- [Tesseract.js](https://github.com/naptha/tesseract.js) for in-browser OCR.
- No build step, no framework, no backend.
