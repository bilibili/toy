/**
 * The panel's stylesheet, injected once per page from `useToyStyles()`.
 *
 * Only DSH theme aliases are used for color so light and dark mode both stay
 * readable; there is no CSS framework and no build-time CSS pipeline.
 */

import { useEffect } from 'react'

const STYLE_ID = 'dsh-toy-publisher-styles'

const CSS = `
.toy-root{box-sizing:border-box;height:100%;overflow:auto;padding:24px 28px 48px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.toy-root *,.toy-root *::before,.toy-root *::after{box-sizing:border-box}
.toy-shell{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.toy-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.toy-title{margin:0;font-size:20px;font-weight:650;letter-spacing:.2px}
.toy-subtitle{margin:4px 0 0;max-width:760px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.toy-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.toy-section-title{margin:0;font-size:14px;font-weight:600}
.toy-section-sub{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.toy-panel{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:16px 18px}
.toy-account{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.toy-avatar{flex:0 0 auto;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-size:17px;font-weight:600;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}
.toy-avatar[data-state="out"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-tertiary)}
.toy-identity{display:flex;flex-direction:column;gap:2px;min-width:0}
.toy-identity-name{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px}
.toy-meta-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px}
.toy-spacer{flex:1 1 auto}
.toy-mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:11px;word-break:break-all}
.toy-muted{color:var(--dsw-alias-label-tertiary)}
.toy-caption{color:var(--dsw-alias-label-caption);font-size:11px}
.toy-strong{font-weight:600}
.toy-install-tabs{display:flex;flex-direction:column;gap:16px}
.toy-tabs{display:flex;gap:2px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-2);align-self:flex-start;flex-wrap:wrap}
.toy-tab{appearance:none;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:6px 14px;border-radius:var(--dsw-radius-md);cursor:pointer}
.toy-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.toy-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 0 0 1px var(--dsw-alias-border-l2)}
.toy-tab:focus-visible,.toy-btn:focus-visible,.toy-icon-btn:focus-visible,.toy-card:focus-visible,.toy-input:focus-visible,.toy-select:focus-visible,.toy-textarea:focus-visible,.toy-check input:focus-visible,.toy-link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.toy-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer;text-decoration:none;line-height:1.4;white-space:nowrap}
.toy-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.toy-btn:disabled{opacity:.45;cursor:not-allowed}
.toy-btn[data-variant="primary"]{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground);font-weight:600}
.toy-btn[data-variant="danger"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary);background:transparent}
.toy-btn[data-size="sm"]{padding:3px 9px;font-size:11px}
.toy-btn[data-pressed="true"]{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:600}
.toy-icon-btn{appearance:none;display:inline-grid;place-items:center;width:28px;height:28px;padding:0;border-radius:var(--dsw-radius-md);border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.toy-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.toy-icon-btn:disabled{opacity:.4;cursor:not-allowed}
.toy-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.toy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.toy-card{appearance:none;display:flex;gap:12px;align-items:flex-start;width:100%;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;text-align:left;cursor:pointer;transition:border-color .12s ease,background .12s ease}
.toy-card:hover{background:var(--dsw-alias-interactive-bg-hover)}
.toy-card[data-selected="true"]{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary) inset}
.toy-poster{flex:0 0 auto;width:64px;height:48px;border-radius:var(--dsw-radius-md);object-fit:cover;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1)}
.toy-poster[data-fallback="true"]{display:grid;place-items:center;color:var(--dsw-alias-label-tertiary)}
.toy-card-body{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 auto}
.toy-card-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toy-card-sub{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toy-badges{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
.toy-badge{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:17px;white-space:nowrap}
.toy-badge[data-tone="ok"]{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.toy-badge[data-tone="warn"]{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.toy-badge[data-tone="error"]{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.toy-badge[data-tone="info"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.toy-banner{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:1.55}
.toy-banner[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.toy-banner[data-tone="warn"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.toy-banner[data-tone="success"]{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}
.toy-banner[data-tone="info"]{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.toy-banner-title{font-weight:600}
.toy-banner-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
.toy-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:22px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);color:var(--dsw-alias-label-tertiary);font-size:12px;background:var(--dsw-alias-bg-layer-1)}
.toy-loading{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;padding:8px 0}
.toy-spinner{display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:toy-spin .8s linear infinite;flex:0 0 auto}
@keyframes toy-spin{to{transform:rotate(360deg)}}
.toy-detail{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:16px;align-items:start}
.toy-detail-main{display:flex;gap:16px;min-width:0}
.toy-detail-poster{flex:0 0 auto;width:168px;height:126px;border-radius:var(--dsw-radius-lg);object-fit:cover;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l1)}
.toy-detail-poster[data-fallback="true"]{display:grid;place-items:center;color:var(--dsw-alias-label-tertiary)}
.toy-detail-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 18px;min-width:0;flex:1 1 auto}
.toy-field-line{display:flex;flex-direction:column;gap:1px;min-width:0}
.toy-field-line-label{font-size:11px;color:var(--dsw-alias-label-caption)}
.toy-field-line-value{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toy-detail-actions{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.toy-link{color:var(--dsw-alias-link);text-decoration:none;cursor:pointer}
.toy-link:hover{text-decoration:underline}
.toy-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}
.toy-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.toy-field>label,.toy-field-label{font-size:12px;color:var(--dsw-alias-label-secondary);font-weight:500}
.toy-field-hint{font-size:11px;color:var(--dsw-alias-label-caption);line-height:1.5}
.toy-field-error{font-size:11px;color:var(--dsw-alias-state-error-primary)}
.toy-span-2{grid-column:1/-1}
.toy-input,.toy-select,.toy-textarea{width:100%;font:inherit;font-size:12px;padding:6px 9px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);min-width:0}
.toy-input::placeholder,.toy-textarea::placeholder{color:var(--dsw-alias-label-caption)}
.toy-input:disabled,.toy-select:disabled{opacity:.55;cursor:not-allowed}
.toy-input[readonly]{background:transparent;border-style:dashed}
.toy-select{appearance:auto}
.toy-check{display:flex;align-items:flex-start;gap:8px;font-size:12px;cursor:pointer;user-select:none}
.toy-check input{margin-top:2px;accent-color:var(--dsw-alias-brand-primary)}
.toy-segmented{display:inline-flex;gap:4px;flex-wrap:wrap}
.toy-findings{display:flex;flex-direction:column;gap:8px;max-height:260px;overflow:auto;padding:2px 2px 2px 0}
.toy-finding{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12px}
.toy-finding[data-severity="ERROR"]{border-color:var(--dsw-alias-state-error-primary)}
.toy-finding[data-severity="WARN"]{border-color:var(--dsw-alias-state-warn-primary)}
.toy-finding-body{display:flex;flex-direction:column;gap:2px;min-width:0}
.toy-finding-file{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);word-break:break-all}
.toy-finding-group-title{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;margin:4px 0 0}
.toy-preview{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.toy-preview[data-expired="true"]{border-color:var(--dsw-alias-state-warn-primary)}
.toy-kv{display:flex;flex-direction:column;gap:2px;min-width:0}
.toy-kv-label{font-size:11px;color:var(--dsw-alias-label-caption)}
.toy-kv-value{font-size:12px;word-break:break-word}
.toy-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.toy-kpi{padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:2px;min-width:0}
.toy-kpi-label{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.toy-kpi-value{font-size:18px;font-weight:600;letter-spacing:.2px}
.toy-kpi-sub{font-size:11px;color:var(--dsw-alias-label-caption)}
.toy-chart-wrap{display:flex;flex-direction:column;gap:6px}
.toy-chart{display:flex;align-items:flex-end;gap:3px;height:170px;padding:8px 4px 0;border-bottom:1px solid var(--dsw-alias-border-l2);overflow-x:auto;overflow-y:hidden}
.toy-chart-col{flex:1 1 0;min-width:5px;height:100%;display:flex;align-items:flex-end;justify-content:center;gap:1px;position:relative;border-radius:3px 3px 0 0}
.toy-chart-col:hover{background:var(--dsw-alias-interactive-bg-hover)}
.toy-chart-bar{width:45%;min-width:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);min-height:1px}
.toy-chart-bar[data-series="uv"]{opacity:.45}
.toy-chart-legend{display:flex;gap:14px;align-items:center;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.toy-legend-dot{display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--dsw-alias-brand-primary);margin-right:4px;vertical-align:middle}
.toy-legend-dot[data-series="uv"]{opacity:.45}
.toy-chart-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--dsw-alias-label-caption)}
.toy-table-wrap{overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.toy-table{width:100%;border-collapse:collapse;font-size:12px}
.toy-table th{position:sticky;top:0;text-align:left;padding:12px 16px;font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
.toy-table td{padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top}
.toy-table tr:last-child td{border-bottom:none}
.toy-table .toy-col-path{min-width:220px;max-width:420px}
.toy-dialog{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.38)}
.toy-dialog-card{width:min(600px,100%);max-height:82vh;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:18px 20px;border-radius:var(--dsw-radius-lg);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}
.toy-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.toy-dialog-head strong{font-size:15px}
.toy-dialog-body{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6;display:flex;flex-direction:column;gap:10px}
.toy-dialog-foot{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding-top:4px}
.toy-list{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;list-style:none}
.toy-list li{display:flex;gap:8px;align-items:baseline;font-size:12px}
.toy-list-key{color:var(--dsw-alias-label-tertiary);min-width:88px;flex:0 0 auto}
.toy-list-value{word-break:break-word}
.toy-divider{height:1px;background:var(--dsw-alias-border-l1);margin:2px 0}
.toy-hidden{display:none!important}
.toy-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.toy-summary-line{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.toy-summary-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.toy-summary-dot[data-state="out"]{background:var(--dsw-alias-state-warn-primary)}
.toy-bundle-card{display:flex;flex-direction:column;gap:12px;padding:16px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.toy-bundle-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
@media (max-width:860px){
  .toy-root{padding:18px 16px 40px}
  .toy-form{grid-template-columns:1fr}
  .toy-detail{grid-template-columns:1fr}
  .toy-detail-poster{width:120px;height:90px}
  .toy-identity-name{max-width:220px}
}
@media (max-width:700px){
  .toy-detail-main{flex-direction:column}
  .toy-chart{height:140px}
  .toy-tabs{width:100%}
  .toy-tab{flex:1 1 auto;text-align:center}
}

/* ===== missing CLI install prompt ===== */
.toy-install {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.toy-install-head { display: flex; align-items: center; gap: 10px; color: var(--dsw-alias-label-primary); }
.toy-install-title { margin: 0; font-size: 16px; font-weight: 600; }
.toy-install-body { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.6; }
.toy-install-platform { flex: 0 0 132px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.toy-code-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toy-code {
  flex: 1 1 420px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--dsw-radius-md);
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  overflow-x: auto;
  white-space: nowrap;
  user-select: all;
}
.toy-install-actions { display: flex; gap: 8px; }

/* ===== skill card ===== */
.toy-skill {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1);
}
.toy-skill-head { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-primary); }
.toy-skill-title { font-size: 14px; font-weight: 600; }
.toy-skill-body { display: flex; flex-direction: column; gap: 8px; }
.toy-skill-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toy-skill-source { min-width: 52px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
.toy-skill-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.toy-skill-command {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.toy-skill-output { margin: 0; }
.toy-skill-output summary { cursor: pointer; font-size: 12px; color: var(--dsw-alias-label-secondary); }
`

let styleUsers = 0

function ensureStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const element = document.createElement('style')
  element.id = STYLE_ID
  element.textContent = CSS
  document.head.appendChild(element)
}

/**
 * Inject the panel CSS once for the lifetime of the mounted components.
 * A module-level refcount keeps the sheet alive while more than one Toy root
 * is mounted (the panel and the Plugins page summary can coexist).
 */
export function useToyStyles(): void {
  useEffect(() => {
    styleUsers += 1
    ensureStyle()
    return () => {
      styleUsers -= 1
      if (styleUsers <= 0 && typeof document !== 'undefined') {
        styleUsers = 0
        document.getElementById(STYLE_ID)?.remove()
      }
    }
  }, [])
}
