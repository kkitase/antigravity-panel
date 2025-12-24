/**
 * StatusBarManager: Encapsulates status bar UI
 * 
 * Subscribes to AppViewModel for updates.
 */

import * as vscode from "vscode";
import { AppViewModel } from "../view-model/app.vm";
import { StatusBarData, StatusBarGroupItem } from "../view-model/types";
import { ConfigManager } from "../shared/config/config_manager";
import { formatBytes } from "../shared/utils/format";
import { TfaConfig } from "../shared/utils/types";

export class StatusBarManager implements vscode.Disposable {
    private item: vscode.StatusBarItem;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly viewModel: AppViewModel,
        private readonly configManager: ConfigManager
    ) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.item.command = "tfa.openPanel";

        // Subscribe to state changes
        this._disposables.push(
            this.viewModel.onStateChange(() => this.update()),
            this.viewModel.onQuotaChange(() => this.update()),
            this.viewModel.onCacheChange(() => this.update())
        );
    }

    showLoading(): void {
        this.item.text = "$(sync~spin) TFA";
        this.item.tooltip = "Toolkit: Detecting...";
        this.item.show();
    }

    showError(message: string): void {
        this.item.text = "$(warning) TFA";
        this.item.tooltip = `Toolkit: ${message}`;
        this.item.show();
    }

    /**
     * Update StatusBar from ViewModel data
     */
    update(): void {
        const config = this.configManager.getConfig();
        const appState = this.viewModel.getState();
        const statusData = this.viewModel.getStatusBarData();
        const cache = appState.cache;

        // Show if either quota or cache is enabled
        if (config["status.showQuota"] || config["status.showCache"]) {
            this.render(
                statusData,
                cache,
                config["status.showQuota"],
                config["status.showCache"],
                config["status.displayFormat"],
                config["status.warningThreshold"],
                config["status.criticalThreshold"]
            );
        } else {
            this.item.hide();
        }
    }

    private render(
        statusData: StatusBarData,
        cache: { totalSize: number } | null,
        showQuota: boolean,
        showCache: boolean,
        statusBarStyle: TfaConfig['status.displayFormat'],
        warningThreshold: number,
        criticalThreshold: number
    ): void {
        const parts: string[] = [];
        const tooltipRows: string[] = [];

        if (showQuota) {
            const primary = statusData.primary;
            const statusEmoji = this.getStatusEmoji(
                primary.percentage,
                warningThreshold,
                criticalThreshold
            );
            const displayText = this.formatQuotaDisplay(primary, statusBarStyle);
            parts.push(`${statusEmoji} ${displayText}`);

            // Build markdown table rows for each group
            statusData.allGroups.forEach(g => {
                const emoji = this.getStatusEmoji(g.percentage, warningThreshold, criticalThreshold);
                tooltipRows.push(`| ${emoji} ${g.label} | ${g.percentage}% |  | ⏱ ${g.resetTime} |`);
            });
        }

        if (showCache && cache) {
            parts.push(formatBytes(cache.totalSize));
            tooltipRows.push(`| 💿 Cache | ${formatBytes(cache.totalSize)} |  | |`);
        }

        if (parts.length === 0) {
            this.item.text = "TFA";
        } else {
            this.item.text = parts.join(" | ");
        }

        // Use MarkdownString with table for perfect alignment (no header)
        if (tooltipRows.length > 0) {
            const md = new vscode.MarkdownString();
            // Hidden header row (required for markdown table) + spacer column
            md.appendMarkdown('|  |  |  |  |\n');
            md.appendMarkdown('|:--|--:|:--:|:--|\n');
            md.appendMarkdown(tooltipRows.join('\n'));
            this.item.tooltip = md;
        } else {
            this.item.tooltip = "Toolkit for Antigravity";
        }
        this.item.show();
    }

    private formatQuotaDisplay(
        group: StatusBarGroupItem,
        style: TfaConfig['status.displayFormat']
    ): string {
        switch (style) {
            case 'resetTime':
                // Display time until reset, e.g., "Flash 2h 30m" or "Flash Ready"
                return `${group.shortLabel} ${group.resetTime}`;

            case 'used':
                // Display used amount formatted as fraction (e.g., "25/100")
                // Since API provides percentage, we map 1% to 1 unit of 100
                return `${group.shortLabel} ${100 - group.percentage}/100`;

            case 'remaining':
                // Display remaining amount formatted as fraction (e.g., "75/100")
                return `${group.shortLabel} ${group.percentage}/100`;

            case 'percentage':
            default:
                // Default: display remaining percentage
                return `${group.shortLabel} ${group.percentage}%`;
        }
    }

    private getStatusEmoji(
        percentage: number,
        warningThreshold: number,
        criticalThreshold: number
    ): string {
        if (percentage <= criticalThreshold) {
            return '🔴';
        } else if (percentage <= warningThreshold) {
            return '🟡';
        }
        return '🟢';
    }

    dispose(): void {
        this.item.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}
