/**
 * ConfigManager: Handles reading and writing gagp.* configuration settings
 *
 * Note: pollingInterval has a minimum value of 60 seconds
 */

import * as vscode from "vscode";
import { GagpConfig } from "../utils/types";

// Re-export types for backward compatibility
export type { GagpConfig };

/** Minimum polling interval in seconds */
const MIN_POLLING_INTERVAL = 60;

export class ConfigManager implements vscode.Disposable {
  private readonly section = "gagp";
  private disposables: vscode.Disposable[] = [];

  getConfig(): GagpConfig {
    const config = vscode.workspace.getConfiguration(this.section);

    // Ensure polling interval is not below minimum value
    const rawPollingInterval = config.get<number>("pollingInterval", 120);
    const pollingInterval = Math.max(rawPollingInterval, MIN_POLLING_INTERVAL);

    return {
      // Status Bar Settings
      statusBarShowQuota: config.get<boolean>("statusBarShowQuota", true),
      statusBarShowCache: config.get<boolean>("statusBarShowCache", true),
      statusBarStyle: config.get<"percentage" | "resetTime" | "used" | "remaining">("statusBarStyle", "percentage"),
      statusBarThresholdWarning: config.get<number>("statusBarThresholdWarning", 30),
      statusBarThresholdCritical: config.get<number>("statusBarThresholdCritical", 10),
      // Quota Settings
      pollingInterval,
      visualizationMode: config.get<"groups" | "models">("visualizationMode", "groups"),
      showGptQuota: config.get<boolean>("showGptQuota", false),
      historyDisplayMinutes: config.get<number>("historyDisplayMinutes", 60),
      // Cache Settings
      cacheCheckInterval: Math.max(config.get<number>("cacheCheckInterval", 120), 30),
      cacheWarningThreshold: config.get<number>("cacheWarningThreshold", 500),
      cacheHideEmptyFolders: config.get<boolean>("cacheHideEmptyFolders", false),
      autoCleanCache: config.get<boolean>("autoCleanCache", false),
      // Debug Settings
      debugMode: config.get<boolean>("debugMode", false),
    };
  }

  get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.section);
    return config.get<T>(key, defaultValue) as T;
  }

  async update<T>(key: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.section);
    await config.update(key, value, vscode.ConfigurationTarget.Global);
  }

  onConfigChange(callback: (config: GagpConfig) => void): vscode.Disposable {
    const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.section)) {
        callback(this.getConfig());
      }
    });
    this.disposables.push(disposable);
    return disposable;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

