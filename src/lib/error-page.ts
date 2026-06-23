export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Preview is warming up — HIVE</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0d112b" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; height: 100%; }
      body {
        font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background:
          radial-gradient(1200px 600px at 10% -10%, rgba(245,165,36,0.10), transparent 60%),
          radial-gradient(900px 500px at 110% 110%, rgba(13,17,43,0.08), transparent 60%),
          #f4f5f9;
        color: #0d112b;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }
      .card {
        max-width: 34rem;
        width: 100%;
        background: #fff;
        border-radius: 18px;
        box-shadow: 0 24px 60px -30px rgba(13, 17, 43, 0.4), 0 1px 2px rgba(13, 17, 43, 0.06);
        overflow: hidden;
      }
      .band {
        background: linear-gradient(135deg, #0d112b 0%, #1a2050 100%);
        color: #fff;
        padding: 1.25rem 1.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px; height: 28px;
        border-radius: 8px;
        background: #f5a524;
        color: #0d112b;
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 0.04em;
      }
      .band small {
        margin-left: auto;
        font-weight: 500;
        opacity: 0.7;
        font-size: 12px;
      }
      .body { padding: 1.75rem; }
      h1 { font-size: 1.45rem; margin: 0 0 0.5rem; letter-spacing: -0.01em; }
      p { color: #4b5168; margin: 0 0 1rem; }
      ul {
        margin: 0; padding: 0; list-style: none;
        background: #f4f5f9;
        border-radius: 12px;
        padding: 0.85rem 1rem;
        font-size: 13.5px;
        color: #4b5168;
      }
      li { padding: 0.2rem 0 0.2rem 1.2rem; position: relative; }
      li::before {
        content: ""; position: absolute; left: 0; top: 0.7em;
        width: 6px; height: 6px; border-radius: 999px; background: #f5a524;
      }
      .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1.5rem; align-items: center; }
      a, button {
        appearance: none;
        font: inherit;
        cursor: pointer;
        padding: 0.65rem 1.15rem;
        border-radius: 10px;
        border: 1px solid transparent;
        text-decoration: none;
        font-weight: 600;
        transition: transform 0.05s ease, background 0.15s ease, box-shadow 0.15s ease;
      }
      .primary {
        background: #0d112b; color: #fff;
        box-shadow: 0 8px 18px -10px rgba(13,17,43,0.6);
      }
      .primary:hover { background: #1a2050; }
      .secondary { background: #fff; color: #0d112b; border-color: #d8dbe7; }
      .secondary:hover { background: #f4f5f9; }
      button:active, a:active { transform: translateY(1px); }
      .status {
        margin-left: auto;
        font-size: 12.5px;
        color: #7a8099;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        min-height: 1em;
      }
      .spinner {
        width: 12px; height: 12px;
        border: 2px solid #d8dbe7;
        border-top-color: #0d112b;
        border-radius: 999px;
        animation: spin 0.8s linear infinite;
        display: none;
      }
      .status.loading .spinner { display: inline-block; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .foot {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #eceef5;
        font-size: 12.5px;
        color: #7a8099;
      }
      .foot a { color: #0d112b; padding: 0; border: 0; background: transparent; font-weight: 600; }
      .foot a:hover { text-decoration: underline; }
      @media (max-width: 480px) {
        .body { padding: 1.35rem; }
        .actions { flex-direction: column; align-items: stretch; }
        .status { margin-left: 0; justify-content: center; }
        .primary, .secondary { width: 100%; text-align: center; }
      }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="polite">
      <div class="band">
        <span class="logo" aria-hidden="true">H</span>
        <span>HIVE preview</span>
        <small>Status: warming up</small>
      </div>
      <div class="body">
        <h1>Hang tight — the preview is warming up</h1>
        <p>The latest build is still deploying, or it ran into an error before the page could render. This usually clears itself within a few seconds.</p>
        <ul>
          <li>A recent change may still be building</li>
          <li>The preview server may be cold-starting</li>
          <li>The last build may have failed — try again, then check the build log</li>
        </ul>
        <div class="actions">
          <button class="primary" id="retry" type="button">Try again</button>
          <a class="secondary" href="/">Go to home</a>
          <span class="status" id="status"><span class="spinner" aria-hidden="true"></span><span id="status-text"></span></span>
        </div>
        <div class="foot">
          Still stuck after a minute? Reload the editor and rebuild, or contact your HIVE admin.
        </div>
      </div>
    </main>
    <script>
      (function () {
        var GUARD = 'hive-error-page:autoreloaded';
        var btn = document.getElementById('retry');
        var status = document.getElementById('status');
        var statusText = document.getElementById('status-text');
        function setStatus(text, loading) {
          statusText.textContent = text || '';
          status.classList.toggle('loading', !!loading);
        }
        if (btn) btn.addEventListener('click', function () {
          setStatus('Reloading…', true);
          location.reload();
        });
        try {
          var already = sessionStorage.getItem(GUARD);
          if (!already) {
            sessionStorage.setItem(GUARD, String(Date.now()));
            var seconds = 4;
            setStatus('Retrying in ' + seconds + 's…', true);
            var tick = setInterval(function () {
              seconds -= 1;
              if (seconds <= 0) { clearInterval(tick); location.reload(); return; }
              setStatus('Retrying in ' + seconds + 's…', true);
            }, 1000);
          } else {
            sessionStorage.removeItem(GUARD);
            setStatus('Auto-retry already tried — use Try again.', false);
          }
        } catch (_) { /* sessionStorage unavailable — manual retry only */ }
      })();
    </script>
  </body>
</html>`;
}
