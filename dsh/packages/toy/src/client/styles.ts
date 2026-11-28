/**
 * The panel's stylesheet, injected once per page from `useToyStyles()`.
 *
 * Only DSH theme aliases are used for color so light and dark mode both stay
 * readable; there is no CSS framework and no build-time CSS pipeline.
 */

import { useEffect } from 'react'

const STYLE_ID = 'dsh-toy-publisher-styles'

const CSS = `
.toy-root{box-sizing:border-box;height:100%;overflow:auto;padding:30px 36px 56px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.toy-root *,.toy-root *::before,.toy-root *::after{box-sizing:border-box}
.toy-shell{max-width:1160px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
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
.toy-tab:focus-visible,.toy-btn:focus-visible,.toy-icon-btn:focus-visible,.toy-card:focus-visible,.toy-input:focus-visible,.toy-select:focus-visible,.toy-textarea:focus-visible,.toy-check input:focus-visible,.toy-link:focus-visible,.toy-square-card:focus-visible,.toy-video-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
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
.toy-link svg{vertical-align:-2px;margin-right:4px}
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
.toy-chart-col:hover,.toy-chart-col[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.toy-chart-bar{width:45%;min-width:2px;border-radius:2px 2px 0 0;background:var(--dsw-alias-brand-primary);opacity:.35;min-height:1px}
.toy-chart-line{position:absolute;left:4px;right:4px;top:8px;bottom:0;width:auto;height:auto;pointer-events:none;overflow:visible}
.toy-chart-line polyline{stroke:var(--dsw-alias-brand-primary);stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.toy-chart-legend{display:flex;gap:14px;align-items:center;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.toy-legend-dot{display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--dsw-alias-brand-primary);margin-right:4px;vertical-align:middle}
.toy-legend-dot[data-series="uv"]{opacity:.35}
.toy-legend-line{display:inline-block;width:14px;height:2px;border-radius:1px;background:var(--dsw-alias-brand-primary);margin-right:4px;vertical-align:middle}
.toy-chart-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--dsw-alias-label-caption)}
.toy-table-wrap{overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1)}
.toy-table{width:100%;border-collapse:collapse;font-size:12px}
.toy-table th{position:sticky;top:0;text-align:left;padding:12px 16px;font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l2);white-space:nowrap}
.toy-table td{padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2);vertical-align:top}
.toy-table tr:last-child td{border-bottom:none}
.toy-table .toy-col-path{min-width:220px;max-width:420px}
.toy-dialog{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:var(--dsw-alias-bg-mask-1)}
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

/* ===== app shell: sticky top bar, tab bar, toast ===== */
.toy-header { position: relative; display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0 0 16px; background: transparent; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.toy-topbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.toy-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.toy-brand-mark { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: transparent; color: var(--dsw-alias-label-primary); flex: 0 0 auto; }
.toy-brand-text { display: flex; flex-direction: column; min-width: 0; }
.toy-brand-text .toy-title { font-size: 17px; line-height: 1.2; }
.toy-topbar-sub { margin: 1px 0 0; max-width: 520px; color: var(--dsw-alias-label-tertiary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toy-topbar-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.toy-account-chip { appearance: none; display: inline-flex; align-items: center; gap: 8px; padding: 3px 10px 3px 3px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: inherit; font: inherit; cursor: pointer; max-width: 240px; }
.toy-account-chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
.toy-account-chip .toy-avatar { width: 26px; height: 26px; font-size: 12px; }
.toy-account-chip-text { display: flex; flex-direction: column; line-height: 1.2; text-align: left; min-width: 0; }
.toy-account-chip-name { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toy-account-chip-meta { font-size: 10px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; }
.toy-tabbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.toy-tabbar .toy-tabs { align-self: auto; }
.toy-tab { display: inline-flex; align-items: center; gap: 6px; }
.toy-tab-count { display: inline-flex; align-items: center; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 16px; }
.toy-tab-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; margin-left: 2px; border-radius: 999px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted); font-size: 10px; font-weight: 650; line-height: 1; }
.toy-tab[aria-selected="true"] .toy-tab-count { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.toy-body { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.toy-toast { position: fixed; right: 24px; bottom: 88px; z-index: 1300; display: flex; align-items: flex-start; gap: 8px; max-width: min(440px, calc(100vw - 48px)); padding: 10px 14px; border-radius: var(--dsw-radius-lg); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: var(--dsw-shadow-lv3); font-size: 12px; line-height: 1.5; animation: toy-toast-in .16s ease; }
.toy-toast[data-tone="success"] { border-color: var(--dsw-alias-state-success-primary); }
.toy-toast[data-tone="error"] { border-color: var(--dsw-alias-state-error-primary); }
@keyframes toy-toast-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* ===== loading skeletons ===== */
.toy-skeleton { display: block; border-radius: 5px; background: linear-gradient(90deg, var(--dsw-alias-bg-layer-2) 25%, var(--dsw-alias-bg-layer-3) 37%, var(--dsw-alias-bg-layer-2) 63%); background-size: 400% 100%; animation: toy-shimmer 1.3s ease infinite; }
@keyframes toy-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
.toy-skeleton-lines { display: flex; flex-direction: column; gap: 7px; padding: 10px 2px; }
.toy-skeleton-line { height: 10px; }
.toy-skeleton-poster { width: 64px; height: 48px; flex: 0 0 auto; }
.toy-skeleton-card { cursor: default; }
.toy-skeleton-card:hover { background: var(--dsw-alias-bg-layer-1); }
.toy-chart-skeleton { display: flex; align-items: flex-end; gap: 4px; height: 170px; padding: 8px 4px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.toy-chart-skeleton-col { flex: 1 1 0; border-radius: 2px 2px 0 0; background: var(--dsw-alias-bg-layer-2); animation: toy-shimmer 1.3s ease infinite; }

/* ===== toys workspace: compact view bar, filters, detail ===== */
.toy-viewbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 30px; }
.toy-viewbar-spacer { flex: 1 1 auto; }

.toy-workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 16px; align-items: start; }
.toy-workspace[data-selected="false"] { grid-template-columns: 1fr; }
.toy-workspace-main { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.toy-workspace-side { position: static; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.toy-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toy-search { position: relative; flex: 1 1 240px; min-width: 180px; }
.toy-search .toy-input { padding-left: 30px; }
.toy-search-icon { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); display: flex; color: var(--dsw-alias-label-caption); pointer-events: none; }
.toy-filter-select { width: auto; min-width: 118px; flex: 0 0 auto; }
.toy-result-count { margin-left: auto; }
.toy-card:hover { transform: translateY(-1px); box-shadow: var(--dsw-shadow-lv2); }
.toy-card { transition: border-color .12s ease, background .12s ease, transform .12s ease, box-shadow .12s ease; }
.toy-detail-card { display: flex; flex-direction: column; gap: 10px; }
.toy-detail-card .toy-detail-poster { width: 100%; height: auto; aspect-ratio: 4 / 3; }
.toy-detail-actions-row { display: flex; flex-wrap: wrap; gap: 6px; }
.toy-password { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-2); }
.toy-password-error { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.toy-detail-fields-compact { display: flex; flex-direction: column; gap: 6px; }

/* ===== searchable Toy picker ===== */
.toy-picker { position: relative; flex: 1 1 220px; min-width: 0; }
.toy-picker-trigger { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 9px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
.toy-picker-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.toy-picker-trigger:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.toy-picker-value { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.toy-picker-placeholder { flex: 1 1 auto; color: var(--dsw-alias-label-caption); }
.toy-picker-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 800; display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-shadow-lv3); max-height: 340px; }
.toy-picker-search { flex: 0 0 auto; }
.toy-picker-list { list-style: none; margin: 0; padding: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; max-height: 250px; }
.toy-picker-option-active { background: var(--dsw-alias-interactive-bg-hover); }
.toy-picker-option { appearance: none; display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: none; border-radius: var(--dsw-radius-md); background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.toy-picker-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.toy-picker-option[aria-selected="true"] { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
.toy-picker-option-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toy-picker-option-meta { flex: 0 0 auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.toy-picker-empty { padding: 8px; font-size: 12px; color: var(--dsw-alias-label-tertiary); }

/* ===== stats: axis, gridlines, hovered day ===== */
.toy-stats-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toy-chart-frame { display: flex; gap: 8px; min-width: 0; }
.toy-chart-y { display: flex; flex-direction: column; justify-content: space-between; height: 170px; padding: 8px 0 0; font-size: 10px; color: var(--dsw-alias-label-caption); text-align: right; min-width: 36px; flex: 0 0 auto; }
.toy-chart-plot { position: relative; flex: 1 1 auto; min-width: 0; }
.toy-chart-grid { position: absolute; inset: 8px 0 0; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.toy-chart-gridline { height: 1px; background: var(--dsw-alias-border-l1); }
.toy-chart { position: relative; z-index: 1; border-bottom: none; background: transparent; }
.toy-chart-plot { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.toy-chart-day { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 2px 0; font-size: 12px; min-height: 20px; }
.toy-chart-day-label { font-weight: 600; }
.toy-chart-day-value { color: var(--dsw-alias-label-secondary); }
.toy-chart-day-empty { color: var(--dsw-alias-label-caption); }

/* ===== stats: ranked overview ===== */
.toy-overview-list { display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); overflow: hidden; }
.toy-overview-row { appearance: none; display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; border: none; border-bottom: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.toy-overview-row:last-child { border-bottom: none; }
.toy-overview-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.toy-overview-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.toy-overview-rank { flex: 0 0 26px; font-size: 11px; color: var(--dsw-alias-label-caption); text-align: right; font-variant-numeric: tabular-nums; }
.toy-overview-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 260px; }
.toy-overview-title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toy-overview-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-tertiary); flex-wrap: wrap; }
.toy-spark { display: block; height: 28px; width: 132px; flex: 0 0 auto; border-bottom: 1px solid var(--dsw-alias-border-l1); overflow: visible; }
.toy-spark-bar { fill: var(--dsw-alias-brand-primary); opacity: .35; }
.toy-spark-line { stroke: var(--dsw-alias-brand-primary); stroke-width: 1.4; stroke-linejoin: round; stroke-linecap: round; }
.toy-spark-empty { flex: 0 0 auto; width: 132px; text-align: center; color: var(--dsw-alias-label-caption); font-size: 11px; }
.toy-overview-numbers { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
.toy-overview-cell { display: flex; flex-direction: column; gap: 1px; min-width: 56px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; }
.toy-overview-skeleton { cursor: default; min-height: 52px; }
.toy-overview-skeleton:hover { background: transparent; }
.toy-overview-progress { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.toy-overview-progress span { display: block; height: 100%; border-radius: 999px; background: var(--dsw-alias-brand-primary); transition: width .2s ease; }
@media (max-width: 760px) {
  .toy-overview-numbers .toy-overview-cell:nth-child(3) { display: none; }
  .toy-spark { width: 88px; }
  .toy-overview-row { gap: 8px; padding: 9px 10px; }
}

/* ===== publish: sectioned panels + sticky action bar ===== */
.toy-panels { display: flex; flex-direction: column; gap: 14px; }
.toy-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.toy-step-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.toy-step-badge { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground); font-size: 11px; font-weight: 700; flex: 0 0 auto; }
.toy-actionbar { position: sticky; bottom: 0; z-index: 40; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px; padding: 10px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-shadow-lv3); }
.toy-actionbar-status { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 220px; }
.toy-actionbar-title { font-size: 12px; font-weight: 600; }
.toy-actionbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* ===== history ===== */
.toy-history-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toy-copy-cell { display: flex; align-items: center; gap: 6px; min-width: 0; }

/* ===== maintenance dialog ===== */
.toy-maintenance { display: flex; flex-direction: column; gap: 12px; }
.toy-maintenance-section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-maintenance-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.toy-maintenance-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }

/* ===== home ===== */
.toy-brand { appearance: none; border: none; background: transparent; color: inherit; font: inherit; cursor: pointer; padding: 0; text-align: left; }
.toy-brand:hover .toy-title { color: var(--dsw-alias-brand-primary); }
.toy-home { display: flex; flex-direction: column; gap: 18px; }
.toy-hero { display: flex; flex-direction: column; gap: 10px; padding: 26px 28px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-hero-kicker { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--dsw-alias-brand-primary); font-weight: 600; }
.toy-hero-title { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: .2px; }
.toy-hero-sub { margin: 0; max-width: 680px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.65; }
.toy-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.toy-onboarding { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-onboarding-head { display: flex; align-items: flex-start; gap: 12px; }
.toy-onboarding-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.toy-onboarding-title { margin: 0; font-size: 15px; font-weight: 650; }
.toy-onboarding-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 5px; color: var(--dsw-alias-label-secondary); font-size: 12.5px; line-height: 1.6; }
.toy-onboarding-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.toy-permission-hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-2); }
.toy-hero-cta { padding: 11px 22px; font-size: 14px; border-radius: var(--dsw-radius-lg); gap: 8px; }
.toy-hero-secondary { padding: 11px 16px; font-size: 13px; border-radius: var(--dsw-radius-lg); }
.toy-home-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.toy-home-card { appearance: none; display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.toy-home-card:hover { background: var(--dsw-alias-interactive-bg-hover); }
.toy-home-card-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-brand-primary); flex: 0 0 auto; }
.toy-home-card-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.toy-home-card-title { font-size: 13px; font-weight: 600; }
.toy-home-docs { display: flex; flex-direction: column; gap: 8px; }
.toy-dashboard { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-dashboard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toy-consumer { display: flex; flex-direction: column; gap: 18px; }
.toy-consumer-hero { display: flex; flex-direction: column; gap: 10px; padding: 28px 30px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: radial-gradient(120% 140% at 80% 10%, color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent), transparent 60%), var(--dsw-alias-bg-layer-1); }
.toy-consumer-permission { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-consumer-permission-copy { display: flex; flex-direction: column; gap: 4px; max-width: 700px; }
.toy-consumer-permission-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.toy-consumer-section { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-consumer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toy-weekly-scroller { display: flex; gap: 12px; overflow-x: auto; padding: 2px 2px 8px; scroll-snap-type: x proximity; }
.toy-square-card { flex: 0 0 218px; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); overflow: hidden; color: inherit; text-decoration: none; background: var(--dsw-alias-bg-layer-1); scroll-snap-align: start; transition: border-color .14s ease, transform .14s ease; }
.toy-square-card:hover { border-color: var(--dsw-alias-brand-primary); transform: translateY(-2px); }
.toy-square-cover { display: block; aspect-ratio: 4 / 3; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.toy-square-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.toy-square-info { position: relative; display: flex; flex-direction: column; justify-content: center; aspect-ratio: 4 / 1; overflow: hidden; border-top: 1px solid var(--dsw-alias-border-l1); }
.toy-square-bg { position: absolute; inset: -40%; width: 180%; height: 180%; object-fit: cover; object-position: center; filter: blur(14px) saturate(1.3); opacity: .55; transform: scale(1.2); }
.toy-square-tint { position: absolute; inset: 0; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent); }
.toy-square-body { position: relative; z-index: 1; display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; min-width: 0; }
.toy-square-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toy-square-meta { font-size: 10px; color: var(--dsw-alias-label-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toy-video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.toy-video-card { display: flex; flex-direction: column; gap: 5px; color: inherit; text-decoration: none; min-width: 0; }
.toy-video-cover { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: var(--dsw-radius-md); overflow: hidden; background: var(--dsw-alias-bg-layer-2); }
.toy-video-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.toy-video-duration { position: absolute; right: 5px; bottom: 5px; padding: 1px 4px; border-radius: 4px; background: rgba(0, 0, 0, .66); color: #fff; font-size: 10px; }
.toy-video-title { font-size: 12px; font-weight: 600; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.toy-video-meta { font-size: 10.5px; color: var(--dsw-alias-label-tertiary); }
.toy-follow-cta { background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-inverted); border-color: transparent; }
.toy-follow-cta:hover { filter: brightness(1.08); }
.toy-dash-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.toy-dash-card { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1); }
.toy-dash-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.toy-dash-value { font-size: 24px; font-weight: 650; letter-spacing: .2px; font-variant-numeric: tabular-nums; }
.toy-dash-sub { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.toy-works { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-works-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.toy-wall-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.toy-wall-card { position: relative; display: flex; flex-direction: column; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); overflow: hidden; transition: border-color .14s ease, transform .14s ease, box-shadow .14s ease; }
.toy-wall-card:hover { border-color: var(--dsw-alias-brand-primary); transform: translateY(-2px); box-shadow: var(--dsw-shadow-lv2); }
.toy-wall-cover { appearance: none; display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: none; background: var(--dsw-alias-bg-layer-2); cursor: pointer; overflow: hidden; }
.toy-wall-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.toy-wall-cover:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.toy-wall-cover-fallback { display: grid; place-items: center; width: 100%; height: 100%; color: var(--dsw-alias-label-caption); }
.toy-wall-info { position: relative; display: flex; flex-direction: column; justify-content: center; gap: 3px; aspect-ratio: 4 / 1; padding: 5px 8px; overflow: hidden; border-top: 1px solid var(--dsw-alias-border-l1); }
.toy-wall-info-bg { position: absolute; inset: -40%; width: 180%; height: 180%; object-fit: cover; object-position: center; filter: blur(16px) saturate(1.35); opacity: .55; transform: scale(1.3); }
.toy-wall-info-tint { position: absolute; inset: 0; background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 74%, transparent); }
.toy-wall-app { position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.toy-wall-app-icon { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.toy-wall-app-icon-fallback { display: grid; place-items: center; font-size: 11px; font-weight: 650; color: var(--dsw-alias-label-secondary); }
.toy-wall-app-text { display: flex; flex-direction: column; min-width: 0; }
.toy-wall-app-name { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.toy-wall-actions { position: relative; z-index: 1; display: flex; align-items: center; gap: 2px; }
.toy-wall-action { appearance: none; display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px; border: none; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 10px; line-height: 1.3; cursor: pointer; }
.toy-wall-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.toy-wall-action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.toy-wall-skeleton { cursor: default; }
.toy-wall-skeleton:hover { border-color: var(--dsw-alias-border-l2); transform: none; box-shadow: none; }
.toy-skeleton-cover { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 0; }
.toy-wall-skeleton .toy-skeleton-line { margin: 8px; }
/* ===== more info: external links ===== */
.toy-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.toy-info-card { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); color: inherit; text-decoration: none; transition: border-color .14s ease, transform .14s ease; }
.toy-info-card:hover { border-color: var(--dsw-alias-brand-primary); transform: translateY(-1px); }
.toy-info-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.toy-info-nav-title { font-size: 13px; font-weight: 600; }

/* ===== notifications ===== */
.toy-notify-list { display: flex; flex-direction: column; gap: 10px; }
.toy-notify-item { display: flex; flex-direction: column; gap: 6px; padding: 14px 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-notify-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toy-notify-title { margin: 0; font-size: 13px; font-weight: 600; flex: 1 1 240px; }
.toy-notify-body { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }

/* ===== external landing ===== */
.toy-external { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 26px 28px; border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1); }
.toy-external-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-brand-primary); }
.toy-external-title { margin: 0; font-size: 18px; font-weight: 650; }
.toy-external-sub { margin: 0; max-width: 640px; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.6; }
.toy-external-url { color: var(--dsw-alias-label-tertiary); }

/* command/output blocks shared by the dialogs */
.toy-output { margin: 0; padding: 8px 10px; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 11px; line-height: 1.55; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); }


@media (max-width: 1100px) {
  .toy-workspace { grid-template-columns: 1fr; }
  .toy-workspace-side { order: -1; }
}
@media (max-width: 860px) {
  .toy-root { padding: 22px 18px 44px; }
  .toy-header { padding: 0 0 14px; }
  .toy-topbar-sub { display: none; }
  .toy-chart-y { min-width: 28px; }
}
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
