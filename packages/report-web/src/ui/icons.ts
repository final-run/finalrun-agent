// Icon SVG strings copied verbatim from the legacy renderer. Exported as
// plain strings so React components can embed them via dangerouslySetInnerHTML
// (matching the existing DOM output).

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const TEST_ICON_SRC = svgDataUri(
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.023 6.44581L10.7376 0.160415C10.6334 0.0562284 10.4916 -0.00178609 10.3433 -0.000865207C10.195 5.56883e-05 10.0525 0.0598365 9.94698 0.165326C9.84149 0.270815 9.78171 0.413371 9.78079 0.561635C9.77987 0.709898 9.83788 0.851723 9.94207 0.95591L10.2838 1.29768L1.18337 10.3981C0.432289 11.1492 0.00665178 12.1642 9.49964e-05 13.2199C-0.00646187 14.2755 0.4066 15.2853 1.14841 16.0271C1.89022 16.7689 2.90002 17.182 3.95565 17.1754C5.01129 17.1689 6.02629 16.7432 6.77737 15.9921L15.8778 6.89168L16.2275 7.2413C16.3316 7.34549 16.4735 7.40351 16.6217 7.40258C16.77 7.40166 16.9126 7.34188 17.018 7.23639C17.1235 7.1309 17.1833 6.98835 17.1842 6.84008C17.1852 6.69182 17.1271 6.55 17.023 6.44581ZM13.1471 8.0589C12.6386 8.15099 10.8743 8.36749 9.64093 7.43637C8.84698 6.83875 7.93683 6.41188 6.96677 6.18217L11.0675 2.08139L15.0961 6.10993L13.1471 8.0589Z" fill="#707EAE"/></svg>',
);

export const TEST_SUITE_ICON_SRC = svgDataUri(
  '<svg width="18" height="17" viewBox="0 0 18 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.978 0.621055H11.4888C11.6596 0.621055 11.7993 0.484423 11.7993 0.310527C11.7993 0.139736 11.6596 0 11.4888 0H5.90248C5.72858 0 5.59195 0.139736 5.59195 0.310527C5.59195 0.484423 5.72858 0.621055 5.90248 0.621055H7.03434V5.14551C7.03434 5.21383 7.01261 5.27904 6.97224 5.33183L4.85449 8.18868C5.80782 7.92162 7.30771 7.75394 8.84156 8.58616C10.5402 9.50842 12.2449 9.01157 12.9405 8.73521L10.4189 5.33183C10.3786 5.27904 10.3568 5.21383 10.3568 5.14551V0.621055H10.978Z" fill="#707EAE"/><path d="M13.3226 9.24894C12.9189 9.42905 12.0526 9.74889 10.9843 9.74889C10.239 9.74889 9.39748 9.59362 8.54656 9.13403C6.52818 8.04098 4.51895 8.9353 4.17434 9.10609L4.17123 9.10919L0.233844 14.4254C-0.0363199 14.7887 -0.0735832 15.2483 0.128265 15.652C0.333203 16.0557 0.724477 16.2979 1.17474 16.2979H16.2168C16.667 16.2979 17.0583 16.0557 17.2633 15.652C17.4651 15.2483 17.4278 14.7887 17.1577 14.4254L13.3226 9.24894ZM4.22104 11.6555L1.98524 14.6739C1.92624 14.7546 1.83309 14.7981 1.73682 14.7981C1.67161 14.7981 1.6064 14.7795 1.55051 14.736C1.41387 14.6335 1.38593 14.441 1.4884 14.3012L3.7242 11.286C3.82667 11.1463 4.0192 11.1183 4.15894 11.2208C4.29557 11.3233 4.32351 11.5157 4.22104 11.6555ZM5.23337 10.286L4.98185 10.6307C4.91974 10.7146 4.82658 10.758 4.73033 10.758C4.66512 10.758 4.60301 10.7394 4.54711 10.6959C4.40738 10.5966 4.37943 10.4009 4.4819 10.2643L4.73653 9.91961C4.83589 9.77987 5.03153 9.75192 5.16816 9.8544C5.3079 9.95377 5.33584 10.1494 5.23337 10.286Z" fill="#707EAE"/></svg>',
);

export const LOCAL_ICON_SRC = svgDataUri(
  '<svg width="65" height="48" viewBox="0 0 65 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="63" height="42" rx="8" stroke="#707EAE" stroke-width="2"/><line x1="16" y1="47" x2="52" y2="47" stroke="#707EAE" stroke-width="2" stroke-linecap="round"/></svg>',
);

// Inline stroke-based SVGs used inside summary cards and buttons.

export const PLAY_CIRCLE_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M10.4 8.8l5.2 3.2-5.2 3.2z" fill="currentColor" stroke="none"></path></svg>';

export const CHECK_CIRCLE_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M8.8 12.2l2.1 2.1 4.3-4.6"></path></svg>';

export const TIMER_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"></circle><path d="M12 13V9.5"></path><path d="M15 5h-6"></path></svg>';

export const BACK_ARROW_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5"></path></svg>';

export const PLAY_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5-9-5.5z"></path></svg>';

export const PAUSE_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6.5h3.5v11H7zm6.5 0H17v11h-3.5z"></path></svg>';

export const FULLSCREEN_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V6h3V4H4v5zm9-5v2h3v3h2V4zm3 11v3h-3v2h5v-5zM6 15H4v5h5v-2H6z"></path></svg>';
