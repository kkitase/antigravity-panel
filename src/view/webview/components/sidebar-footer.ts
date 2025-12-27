/**
 * SidebarFooter - Footer component with recovery actions and links (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { VsCodeApi, WindowWithVsCode } from '../types.js';

/** GitHub repository URLs */
const GITHUB_ISSUES_URL = 'https://github.com/n2ns/antigravity-panel/issues';
const GITHUB_HOME_URL = 'https://github.com/n2ns/antigravity-panel';

@customElement('sidebar-footer')
export class SidebarFooter extends LitElement {
  @property({ type: Boolean })
  autoAcceptEnabled = false;

  // Light DOM mode
  createRenderRoot() { return this; }

  private get _vscode(): VsCodeApi | undefined {
    return (window as unknown as WindowWithVsCode).vscodeApi;
  }

  private get _t() {
    return (window as unknown as WindowWithVsCode).__TRANSLATIONS__ || {};
  }

  private _postMessage(type: string): void {
    this._vscode?.postMessage({ type });
  }

  private _toggleAutoAccept(): void {
    this._vscode?.postMessage({ type: 'toggleAutoAccept' });
  }

  private _openUrl(url: string): void {
    this._vscode?.postMessage({ type: 'openUrl', path: url });
  }

  protected render() {
    return html`
      <!-- Main Action Card -->
      <div class="action-card">
        <!-- Auto-Accept Toggle Row -->
        <div class="action-row auto-accept-row" 
             data-tooltip="${this._t.autoAcceptTooltip || 'Hands-free Mode: Automatically accept agent suggested edits and terminal commands'}">
          <span class="action-label">
            <i class="codicon codicon-rocket"></i>
            ${this._t.autoAcceptLabel || 'Auto-Accept'}
          </span>
          <label class="toggle-switch" @click=${() => this._toggleAutoAccept()}>
            <input type="checkbox" ?checked=${this.autoAcceptEnabled} @click=${(e: Event) => e.stopPropagation()}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Quick Tools -->
        <div class="action-row action-buttons">
          <button class="action-btn primary" @click=${() => this._postMessage('openRules')}>
            <i class="codicon codicon-symbol-ruler"></i>
            <span>${this._t.rules || 'Rules'}</span>
          </button>
          <button class="action-btn primary" @click=${() => this._postMessage('openMcp')}>
            <i class="codicon codicon-plug"></i>
            <span>${this._t.mcp || 'MCP'}</span>
          </button>
          <button class="action-btn primary" @click=${() => this._postMessage('openBrowserAllowlist')}>
            <i class="codicon codicon-globe"></i>
            <span>${this._t.allowlist || 'Allowlist'}</span>
          </button>
        </div>

        <!-- Recovery Actions -->
        <div class="action-row action-buttons">
          <button class="action-btn primary" 
                  @click=${() => this._postMessage('restartLanguageServer')} 
                  data-tooltip="${this._t.restartServiceTooltip || 'Restart the background Agent language server'}">
            <i class="codicon codicon-sync"></i>
            <span>Restart</span>
          </button>
          <button class="action-btn primary" 
                  @click=${() => this._postMessage('restartUserStatusUpdater')} 
                  data-tooltip="${this._t.resetStatusTooltip || 'Reset user subscription and quota refresh status'}">
            <i class="codicon codicon-refresh"></i>
            <span>Reset</span>
          </button>
          <button class="action-btn primary" 
                  @click=${() => this._postMessage('reloadWindow')} 
                  data-tooltip="${this._t.reloadWindowTooltip || 'Reload the entire window'}">
            <i class="codicon codicon-window"></i>
            <span>Reload</span>
          </button>
        </div>
      </div>

      <!-- External Links (outside card) -->
      <div class="footer-links">
        <button class="link-btn" @click=${() => this._openUrl(GITHUB_ISSUES_URL)}>
          <i class="codicon codicon-bug"></i>
          <span>${this._t.reportIssue || 'Feedback'}</span>
        </button>
        <button class="link-btn" @click=${() => this._openUrl(GITHUB_HOME_URL)}>
          <i class="codicon codicon-star-full" style="color: #e3b341;"></i>
          <span>${this._t.giveStar || 'Star'}</span>
        </button>
      </div>

      <div class="sidebar-tagline">For Antigravity. By Antigravity.</div>
    `;
  }
}

