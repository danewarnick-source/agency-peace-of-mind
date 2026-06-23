export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Preview didn't load — HIVE</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0d112b" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; }
      body {
        font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f4f5f9;
        color: #0d112b;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }
      .card {
        max-width: 32rem;
        width: 100%;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 20px 50px -30px rgba(13, 17, 43, 0.35), 0 1px 2px rgba(13, 17, 43, 0.06);
        overflow: hidden;
      }
      .band {
        background: #0d112b;
        color: #fff;
        padding: 1.25rem 1.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .dot {
        width: 10px; height: 10px; border-radius: 999px;
        background: #f5a524;
        box-shadow: 0 0 0 4px rgba(245, 165, 36, 0.18);
      }
      .body { padding: 1.75rem; }
      h1 { font-size: 1.35rem; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
      p { color: #4b5168; margin: 0 0 1rem; }
      .hint {
        margin-top: 1.25rem;
        padding: 0.75rem 0.9rem;
        background: #f4f5f9;
        border-radius: 10px;
        font-size: 13px;
        color: #4b5168;
      }
      .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1.5rem; }
      a, button {
        appearance: none;
        font: inherit;
        cursor: pointer;
        padding: 0.6rem 1.1rem;
        border-radius: 10px;
        border: 1px solid transparent;
        text-decoration: none;
        font-weight: 600;
        transition: transform 0.05s ease, background 0.15s ease;
      }
      .primary { background: #0d112b; color: #fff; }
      .primary:hover { background: #1a2050; }
      .secondary { background: #fff; color: #0d112b; border-color: #d8dbe7; }
      .secondary:hover { background: #f4f5f9; }
      button:active, a:active { transform: translateY(1px); }
      .status { margin-top: 0.75rem; font-size: 12px; color: #7a8099; min-height: 1em; }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="polite">
      <div class="band">
        <span class="dot" aria-hidden="true"></span>
        <span>HIVE preview</span>
      </div>
      <div class="body">
        <h1>This preview didn't load</h1>
        <p>The latest build may still be deploying, or it hit an error before the page could render. Retrying usually resolves it within a few seconds.</p>
        <div class="hint">If this keeps happening, the most recent change may have failed to build. Try again in a moment, or head back to the home page.</div>
        <div class="actions">
          <button class="primary" id="retry" type="button">Try again</button>
          <a class="secondary" href="/">Go home</a>
        </div>
        <div class="status" id="status"></div>
      </div>
    </main>
    <script>
      (function () {
        var GUARD = 'hive-error-page:autoreloaded';
        var btn = document.getElementById('retry');
        var status = document.getElementById('status');
        if (btn) btn.addEventListener('click', function () { location.reload(); });
        try {
          var already = sessionStorage.getItem(GUARD);
          if (!already) {
            sessionStorage.setItem(GUARD, String(Date.now()));
            var seconds = 4;
            status.textContent = 'Retrying automatically in ' + seconds + 's…';
            var tick = setInterval(function () {
              seconds -= 1;
              if (seconds <= 0) { clearInterval(tick); location.reload(); return; }
              status.textContent = 'Retrying automatically in ' + seconds + 's…';
            }, 1000);
          } else {
            sessionStorage.removeItem(GUARD);
            status.textContent = 'Automatic retry already attempted. Use Try again when ready.';
          }
        } catch (_) { /* sessionStorage unavailable — manual retry only */ }
      })();
    </script>
  </body>
</html>`;
}
