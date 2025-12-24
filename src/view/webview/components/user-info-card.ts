/**
 * UserInfoCard - 用户信息卡片组件
 * 只显示用户邮箱和订阅级别
 */

import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { UserInfoData } from '../types.js';

@customElement('user-info-card')
export class UserInfoCard extends LitElement {
  @property({ type: Object })
  user: UserInfoData | null = null;

  // Light DOM mode for consistent styling
  createRenderRoot() { return this; }

  render() {
    if (!this.user) {
      return html``;
    }

    const email = this.user.email || '';
    const tier = this.user.tier || '';

    return html`
      <div class="user-info-card">
        <div class="user-header">
          <div class="user-profile-info">
            <i class="codicon codicon-account"></i>
            <span class="user-email">${email || 'User'}</span>
          </div>
          ${tier ? html`<span class="tier-badge">${tier}</span>` : ''}
        </div>
      </div>
    `;
  }
}
