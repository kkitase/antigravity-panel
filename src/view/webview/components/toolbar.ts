/**
 * Toolbar - 工具栏组件 (Light DOM)
 */

import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import type { WindowWithVsCode } from '../types.js';

@customElement('app-toolbar')
export class AppToolbar extends LitElement {
  // Light DOM mode
  createRenderRoot() { return this; }

  private _postMessage(type: string): void {
    const vscode = (window as unknown as WindowWithVsCode).vscodeApi;
    vscode?.postMessage({ type });
  }

  protected render() {
    const t = (window as unknown as WindowWithVsCode).__TRANSLATIONS__;
    return html`
      <div class="toolbar">
        <button class="toolbar-btn primary" 
                @click=${() => this._postMessage('openRules')}>
          <i class="codicon codicon-symbol-ruler"></i>
          ${t?.rules || 'Rules'}
        </button>
        <button class="toolbar-btn primary" 
                @click=${() => this._postMessage('openMcp')}>
          <i class="codicon codicon-plug"></i>
          ${t?.mcp || 'MCP'}
        </button>
        <button class="toolbar-btn primary" 
                @click=${() => this._postMessage('openBrowserAllowlist')}>
          <i class="codicon codicon-globe"></i>
          ${t?.allowlist || 'Allowlist'}
        </button>
      </div>
    `;
  }
}
