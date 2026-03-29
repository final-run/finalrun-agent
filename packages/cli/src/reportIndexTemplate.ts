import type { RunIndexEntryRecord } from '@finalrun/common';

const TEST_ICON_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABHCAYAAAC6cjEhAAAACXBIWXMAACxLAAAsSwGlPZapAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAARRSURBVHgB7ZxbbtNAFIbPJKroA0J9bMUDWQLdQXpB4g26goYVlK6gzQpoV0BYAelbJdLWrKDZAeYBmjcqARIoTYbzj+M0F9vxZcYek35SldSOlfjz8Zy5nITogfKyuy6Pdjbkj511+WV7Q76lHBBkOSylLomuZjY3LnriAxmkQpbDV64WsLnF0bNPBrFeTH+V2vzgBuwyKsd6MY4rbgdEW5SzHOvFAKcnXCFU5ARhRE4pxCArSUlR2Ui7nDJkpSPOSscxX64tW1kdMRFScPJuwHZtkWOtmCgpHBWNqAYZfR/KiJViFknBEzTIgyrtcWNwO/siKejji6fyOWXAujYmTApnpW7nRmzObq+zgOqQe8aS1qYPoNtKhbY+fRNdSoFVERMl5e6RunXmcPjEByxgLnJY1JCFpY0cayJmkRR09KKO1x05VojJKsVHp5zCxeiS4qNLTqFidEvx0SGnMDGmpPhEyVmRtHnO6T7q+EKykmkpANmKx1eHcztYVJ8nvl6uy1rU8blHTETnzUVv1llwJZOyvS4bfJLvg95vhd8vLHJyFcPztgd8xU4CdhmR4pNGTm5iRoO7VsAuo1J8ksrJRUzRUnySyDEuxhYpPnHlGM1KtkkBlz3R4tH3YcCu2mS2MhYxEVKAy38OZ6fPT3gVoK0hPcfldU2u/fpLV5zKwwaXKnKMiFkgZRqMiiW1+cM0zw1HUAwpPq52MYmkzNMyJSiBFIVWMSHLqWnQLmh3Q14HSeHP26x4j0eT27WJwYTQMGhskh6XU8PhxXfRpoxwFCMLNWa3Qwo3xsd4zhf1mP/fZyNrLKWpRYwBKWMwfOAP36SUxJESRGYxJqVM4OJEkmawtFJAJjE5SbnHm9dVab4iqft4lbqzotDI/u5TbTigA0opxXurlOQuRQNxpYBUYv53KSCxmGWQAhKJwTiiL+i6TFL4DE8vbkTiur3YYpQUr/NWo/IwXtJNSiwxyyYFLBSzjFJApJhllQJCxSyzFBAoZtmlgDkx6FL//MMpeYmlgLk5X5byjkokBauXuqWAKTGj2rUGlYSogqKsTEeMUNFSCnSucwcxFqOmJWPOhxaNaSlgLEZN65WAPKSAyVupTpaTlxSgxIwqG2tkMXlKAUrMUD5ImUWJkXaLcfOWApSYir0TT97if85SgHcrBdTjW0BhFRFAialK68QUKgV46bpKsSumc6BwKUCJ6a8Efu+nCKyQApQYNG48/+BQsVgjBYx7vtwAn1FxWCUF3It5RC0qJjtZJwWMxajbSdIp5YuVUsDUfMzdqqradikfrJUCpsSMGuE3ZB6rpYC5Od9OTzghdbC6sF4KCCyAvrwRJ6hDI/2UQgoIrQzvoGyiQnukqc1BP6ksUsDCtes6L75Vve8XpZv65C4Aoq/DUUglInYZyFiQoFdx6mMwucSvO0OmK2LaICupSs1G608odn7m/1SS9DqHX1E0yMu7TllumTD+AWEyp4L85hdWAAAAAElFTkSuQmCC';
const TEST_SUITE_ICON_SRC =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAEYAAABCCAYAAADqv6CSAAAACXBIWXMAACxLAAAsSwGlPZapAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAQ8SURBVHgB7ZvfVdswFMavVN7rEdwNwgZhAkjTd8gENe8tODAA7gSE97YJE5ROAJ0Ad4MM0Fi9kgXYjhX8R9d1Gv3O4Rwndkz0+eqTdK/CgIjg09cj4PwaDz2gIQbO9qNwtAQCOF' +
  'DB+RDoRJH4QMgeUMFZBEmy/jQZ+wiipmBMLPAzv3LvJeIhuvhAEi3qX0LHBGffH6Hu0xZiEl2OZ9AhdF1py3HCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGHDCGOhUmCCcD6FJrlamQzumM2FQFB/ztNfQjEFwPr+CDukuYgTIhvnQFCECHXGd0Ikwwdn8HBt2BG1JxFxFXgeQC5M2RIRgBw8Fbtoda0Eq' +
  'jPaVH2ATAUMVgcTQRowA2QAfrCNCar8hE0b7yglQgSMcpd+QCGPZV0z4lH5jXRgUxbPuKyak33z+FgAB9iNmfb4SZ/7sw9gVhd9YLerjFxzIp4h3jfHlQxSO4pJr5E4Hed0AVTxU17fH+l6Zznc7FNEGOkS/QLNuMYIxsYim4xFYgkQY1dhVIiPHB8bfwtMGIpH8lvtaYO9NjE/3oeRzJ60EEuI0uhxHYAErwmS6x7Ge+lfZGLREf1jgN7' +
  'hBke4K90OB4BBbOnx1kxED2X1QZHaLxzNb3am1MJb22sUo6LRsc5DyLTU0y79ERx5e/4YrQcp8zAathNFT/nuwt9dOCYSNXtR98i9Ri10RRIx+M4EWtBOmybaxqjC4w0b+xGi8A1DdJX4SS4vgwZ/VALujjyPSYTrKZR5QS79pLIxKHGGOJHMn6RlyVGiTkLLJEgU7KDP5KjQSBmebJyhCvvGcTfBLzNR5ykiqR+P5Te2Zr/IVxvLLfgz7' +
  'Z1GkaP0QReLrFX5takeMIRpk2O6ro3Sd5EOfaOA3tYRJE0Tkq2YKlrpLxVU/ULkrqflKURQ5cjCixaFdPJ0vrjytqCSM8hXOi+WLL9H0/QH6zb6effadQR2/qRYxqDZkfYMptw/1K6/2bwP+FTi9OJ3eHle59FVhdOJ5kHuTqflBGiWpaFuDWK2iKinRjcKkCaCCr0iH1yZWKlr/8ao8TOOolCl9+C9Xs1k0HU30+WFnKUwKGIuwLaem0+' +
  'aIKaYopa8wmMrDlnXofvBKybdUmNKSauorcXrTlnXovrCh5LsmTJr/KE7iMFeS9RUbdeh+YCz55jymgq8MdP7l/6LEb/IRUyyprvvKVg3NlSnxm2dhSkuqmF/J+ApRHbonFEq+SpjykqryFZXkIa9D94NcyZfpkuo9FLoQroPeyUPdhR5hV9ApCr6pi3Rah+4LacnXYxvSkDGkyeXtWCDaBKNG/lLfN5z2YVfByoM03xgceYSIURhxA448' +
  'WPDjmJmLtiQ92RHp8oerhBMuEPGd3Y4cmZ6VQ/XFOExfZtDJYh92bySKixWEv9WO6wd2HDlsAAAAAElFTkSuQmCC';
const LOCAL_ICON_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIIAAABgCAYAAADRj6p0AAAACXBIWXMAABYlAAAWJQFJUiTwAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAATESURBVHgB7d1PTttYHAfw7zMwsKASs8toNuYETU/QpMxI3RVO0HACOicATjBwAsIJGnZdlOKeoMwJxrMYNcuqtBKUJq+/3y+G2i9OQ6TSEPf7kSIS+9ldvK/fP7uyw4QaNR9HDuvO477+hMMKvHxoehzeOSD1g8/rXzw6L7ounewUN/So5ltS+Cm08unOcw6nfY/9V13XvlH5cQX+qPmGpOxAvsagWaStxO64QIwMwnrsV95fYFu6gGegmSctxN7yInY7qXtXur9s42MZB3x2eO496iMOSvoOR/0ICRaQJiNOTj9GQy7a+XPUpU7qkccTP7r7TheAZtn4YSgIGoJL4ATlXUG7J81MMuFAhH4sHdDPATsYjOlCpWEoBEG7g7NzvMFwCNLeHDaS/90paGZkgRi6qHUgKd1EM99NRPkCOibAcAgOe0t4wBDMHm25te7kcu/kt2uX/2FQ19euW4RseniA4t7O8Vu3AZp5azXfRtBVSH03X3Zdot+j3Mbt4Ni0t4hNUCVIy6CzvzS/zecufAuCtgYIugQZFDY5G6gOrUsd5wWb46zuB0GQJeOtoECbM4PqycZ5h/lt2WoxXDZd/De/U1qDVQahmrKZxFB9R5/kBlJQNmEIqkvrVhcE89vmJQPSK+BhfqPMMY9AldYP6limk/c1CHGhlAfXCypuLiq2CKIhS9PFICwvMQhVd7lQnEbqMyVR+FBJh1PGyhtaFvAaBCIE9xro58UgkGEQyDAIZBgEMgwCGQaBDINAhkEgwyCQYRDIMAhkGAQyDAIZBoEMg0CGQSDDIJBhEMgwCGQYBDIMAhkGgQyDQIZBIMMgkGEQyDAIZBgEMgwCGQaBDINAhkEgwyCQYRDIMAhkGAQyDAIZBoEMg0CGQSDDIJBhEMgwCGQYBDIMAhkGgQyDQIZBIMMgkGEQyDAIZCI4FN74tR77FVClNcI6lgzo6/4KQfh4GbwQlCpn/hz1/G8HpNo1vM5v9H00QJXWd8UgeOC/yLvim1+9xxNQpUVBHetLw13Za+QXgNUXfGN8JT2W+r4M6rsn9R2VvUZeCm6DKimsWyc9gmbApo994DAo3/rzd18HVYq2BvKnld/W99jXv+5qw1rNa3MR58qk95bwgC8NrwZdFjg7xxsEdXzcdav65XpBSRKxGRwby4F/gyrh7AIHKIZAZwu7V99dfsfab35P9m4VzuDQubeITbYMsylrCfSCbhV2OOwfv3XPvv7M0RWnuQucSBjC8UEqM4kmZxKzRcd5/R6eA0OLhGlPuv0kd3G78OBsOnlScrBqSyB2GYi7LZsi6uygVbI7leliMwnq0JWdaEwYVCILUUeyMHG6vIRTdhvTpc2/3hroyaqwGywWNcrK6VTxs8dGUnIhu1Enz7qJnaExA80mGRP0FrGTjLho3bjjH9V8yw2amRg0i3TBcPNl1yXfKjQ2CFc0EJHDlh8eSNIdpKvFulD4quvaNyw/GR0/SCDW5cCH8om9thQefIZhmvSZksHjBDp2+0dWCzsJB/RERET0HUw8WPxe5G7nU/nX9zjQHCuVz47cJTzELZpmEMLb3jSKzArkBtGvuEXT+38Nji3BjQVPmt+GqQVBFqb+wqDZo2+R1iD/3MBt+QKr3Hldh+U7lAAAAABJRU5ErkJggg==';

export interface ReportIndexRunRecord extends RunIndexEntryRecord {
  displayName: string;
  displayKind: 'suite' | 'single_spec' | 'multi_spec' | 'fallback';
  triggeredFrom: 'Suite' | 'Direct';
  selectedSpecCount: number;
}

export interface ReportIndexViewModel {
  generatedAt: string;
  summary: {
    totalRuns: number;
    totalSuccessRate: number;
    totalDurationMs: number;
  };
  runs: ReportIndexRunRecord[];
}

export function renderRunIndexHtml(index: ReportIndexViewModel): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinalRun Reports</title>
  ${renderFontLinks()}
  <style>
    ${renderSharedCss()}

    .history-list-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .history-page-header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .history-page-header h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: -0.04em;
    }

    .history-page-header p {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .summary-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    .summary-card-icon {
      width: 46px;
      height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      flex: 0 0 auto;
    }

    .summary-card-icon svg {
      width: 22px;
      height: 22px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .summary-card-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    .summary-card-value {
      margin-top: 4px;
      color: var(--text);
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }

    .runs-shell {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .runs-shell-header {
      padding: 24px 26px 18px;
      border-bottom: 1px solid var(--border-light);
    }

    .runs-shell-header h2 {
      margin: 0;
      font-size: 18px;
    }

    .runs-shell-header p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      text-align: left;
      vertical-align: middle;
      padding: 18px 20px;
      border-top: 1px solid var(--border-light);
      font-size: 14px;
    }

    th {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    .history-row {
      cursor: pointer;
      transition: background 0.18s ease;
    }

    .history-row:hover {
      background: var(--selected);
    }

    .run-name-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 260px;
    }

    .png-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      flex: 0 0 auto;
    }

    .tinted-png-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      display: inline-block;
      background-color: #707EAE;
      -webkit-mask-image: var(--icon-mask);
      mask-image: var(--icon-mask);
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
    }

    .run-name-copy {
      min-width: 0;
    }

    .run-name-link {
      color: var(--text);
      font-weight: 700;
      text-decoration: none;
    }

    .run-name-link:hover {
      text-decoration: underline;
    }

    .run-secondary {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .run-on-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-weight: 600;
    }

    .empty-state {
      padding: 36px 28px;
      color: var(--muted);
      font-size: 15px;
    }

    @media (max-width: 1100px) {
      .runs-shell {
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <main class="page history-list-page">
    <section class="history-page-header">
      <div>
        <h1>Test Runs</h1>
        <p>Local FinalRun run history for the current workspace.</p>
      </div>
    </section>

    <section class="summary-grid">
      ${renderSummaryCard('Total Runs', String(index.summary.totalRuns), 'accent', renderPlayCircleIconSvg())}
      ${renderSummaryCard('Test Success Rate', `${index.summary.totalSuccessRate.toFixed(1)}%`, successRateTone(index.summary.totalSuccessRate), renderCheckCircleIconSvg())}
      ${renderSummaryCard('Total time saved', formatLongDuration(index.summary.totalDurationMs), 'neutral', renderTimerIconSvg())}
    </section>

    <section class="runs-shell">
      <div class="runs-shell-header">
        <h2>Run history</h2>
        <p>Open a completed run to inspect the suite or individual test report.</p>
      </div>
      ${index.runs.length === 0
        ? '<div class="empty-state">No FinalRun reports found.</div>'
        : `
      <table>
        <thead>
          <tr>
            <th>TEST NAME</th>
            <th>APPS</th>
            <th>DURATION</th>
            <th>STATUS</th>
            <th>RESULT</th>
            <th>RAN ON</th>
            <th>Triggered From</th>
          </tr>
        </thead>
        <tbody>
          ${index.runs.map((run) => renderRunIndexRow(run)).join('')}
        </tbody>
      </table>
      `}
    </section>
  </main>
</body>
</html>`;
}

function renderRunIndexRow(run: ReportIndexRunRecord): string {
  const resultLabel = run.passedCount + run.failedCount === 0
    ? 'NA'
    : `${run.passedCount} / ${run.selectedSpecCount}`;
  const href = buildRunRoute(run.runId);

  return `
    <tr class="history-row" onclick="window.location.href='${escapeJs(href)}'">
      <td>
        <div class="run-name-cell">
          ${renderTintedPngIcon(run.displayKind === 'suite' ? TEST_SUITE_ICON_SRC : TEST_ICON_SRC)}
          <div class="run-name-copy">
            <a class="run-name-link" href="${escapeHtml(href)}">${escapeHtml(run.displayName)}</a>
            <div class="run-secondary">${escapeHtml(run.runId)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(run.appLabel)}</td>
      <td>${run.durationMs > 0 ? escapeHtml(formatLongDuration(run.durationMs)) : 'NA'}</td>
      <td>${renderStatusPill(run.success ? 'success' : 'failure')}</td>
      <td>${escapeHtml(resultLabel)}</td>
      <td>
        <span class="run-on-badge">
          <img class="png-icon" src="${LOCAL_ICON_SRC}" alt="" />
          <span>Local</span>
        </span>
      </td>
      <td>${escapeHtml(run.triggeredFrom)}</td>
    </tr>
  `;
}

function buildRunRoute(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

function renderTintedPngIcon(src: string): string {
  return `<span class="tinted-png-icon" style="--icon-mask:url('${escapeHtml(src)}');" aria-hidden="true"></span>`;
}

function renderStatusPill(status: 'success' | 'failure'): string {
  return `<span class="status-pill ${escapeHtml(status)}">${status === 'success' ? 'Passed' : 'Failed'}</span>`;
}

function renderSummaryCard(
  label: string,
  value: string,
  tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral',
  iconSvg: string,
): string {
  const iconStyle = tone === 'accent'
    ? 'color: var(--accent); background: rgba(67, 24, 255, 0.1);'
    : tone === 'success'
      ? 'color: var(--success); background: rgba(5, 205, 153, 0.12);'
      : tone === 'warning'
        ? 'color: var(--warning); background: rgba(255, 146, 12, 0.12);'
        : tone === 'danger'
          ? 'color: var(--failure); background: rgba(238, 93, 80, 0.12);'
          : 'color: var(--text); background: var(--panel-alt);';
  return `
    <div class="summary-card">
      <span class="summary-card-icon" style="${iconStyle}">${iconSvg}</span>
      <span>
        <div class="summary-card-label">${escapeHtml(label)}</div>
        <div class="summary-card-value">${escapeHtml(value)}</div>
      </span>
    </div>
  `;
}

function formatLongDuration(durationMs: number | undefined): string {
  const ms = Number(durationMs || 0);
  if (ms <= 0) {
    return '0s';
  }

  const duration = Math.round(ms / 1000);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function successRateTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 80) {
    return 'success';
  }
  if (rate >= 50) {
    return 'warning';
  }
  return 'danger';
}

function renderFontLinks(): string {
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  `;
}

function renderSharedCss(): string {
  return `
    :root {
      --bg: #F4F7FE;
      --panel: #FFFFFF;
      --panel-alt: #F4F7FE;
      --text: #2B3674;
      --muted: #707EAE;
      --icon: #8E9AB9;
      --accent: #4318FF;
      --success: #05CD99;
      --warning: #FF920C;
      --failure: #EE5D50;
      --border: #E0E5F2;
      --border-light: #E9EDF7;
      --selected: #F0F2F7;
      --shadow: 0 18px 40px rgba(112, 126, 174, 0.12);
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "DM Sans", "Helvetica Neue", Arial, sans-serif;
    }

    body {
      background:
        radial-gradient(circle at top right, rgba(67, 24, 255, 0.08), transparent 32%),
        linear-gradient(180deg, #fbfcff 0%, var(--bg) 100%);
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .page {
      max-width: 1360px;
      margin: 0 auto;
      padding: 28px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-pill.success {
      background: rgba(5, 205, 153, 0.14);
      color: var(--success);
    }

    .status-pill.failure {
      background: rgba(238, 93, 80, 0.14);
      color: var(--failure);
    }

    @media (max-width: 900px) {
      .page {
        padding: 20px;
      }
    }
  `;
}

function renderPlayCircleIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M10.4 8.8l5.2 3.2-5.2 3.2z" fill="currentColor" stroke="none"></path></svg>';
}

function renderCheckCircleIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M8.8 12.2l2.1 2.1 4.3-4.6"></path></svg>';
}

function renderTimerIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"></circle><path d="M12 13V9.5"></path><path d="M15 5h-6"></path></svg>';
}
