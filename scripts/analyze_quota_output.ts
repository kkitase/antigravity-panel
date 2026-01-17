
import Module from 'module';

// 1. Mock vscode module
const originalRequire = (Module.prototype as any).require;
(Module.prototype as any).require = function (id: string, ...args: any[]) {
    if (id === 'vscode') {
        return {
            window: {
                createOutputChannel: () => ({
                    appendLine: (val: string) => console.log(`[OUTPUT] ${val}`),
                    show: () => { },
                    dispose: () => { }
                }),
            },
            workspace: {
                getConfiguration: () => ({
                    get: () => undefined,
                })
            },
            l10n: { t: (s: string) => s },
            EventEmitter: class { fire() { } event = {} },
            Disposable: class { dispose() { } }
        };
    }
    return originalRequire.apply(this, [id, ...args]);
};

import { QuotaService } from '../model/services/quota.service';
import { ConfigManager } from '../shared/config/config_manager';

// Mock Config Reader
class MockConfigReader {
    get<T>(key: string, defaultValue: T): T { return defaultValue; }
    update() { return Promise.resolve(); }
    onConfigChange() { return { dispose: () => { } }; }
}

const validResponse = {
    userStatus: {
        name: "Test User",
        email: "test@example.com",
        userTier: { name: "Pro" },
        planStatus: {
            planInfo: {
                monthlyPromptCredits: 5000000,
                monthlyFlowCredits: 1000000,
                planName: "Pro Plan"
            },
            availablePromptCredits: 4200000,
            availableFlowCredits: 800000
        },
        cascadeModelConfigData: {
            clientModelConfigs: [
                {
                    label: 'Gemini 2.0 Flash',
                    modelOrAlias: { model: 'gemini-2.0-flash' },
                    quotaInfo: {
                        remainingFraction: 0.854,
                        resetTime: new Date(Date.now() + 3600000).toISOString()
                    }
                },
                {
                    label: 'Claude 3.5 Sonnet',
                    modelOrAlias: { model: 'claude-3-5-sonnet' },
                    quotaInfo: {
                        remainingFraction: 0.12,
                        resetTime: new Date(Date.now() + 8100000).toISOString()
                    }
                }
            ]
        }
    }
};

function formatQuotaSnapshot(snapshot: any) {
    const lines: string[] = [];
    lines.push(`📊 Quota Report [${snapshot.timestamp.toISOString()}]`);
    lines.push(`--------------------------------------------------`);

    // User Info
    if (snapshot.userInfo) {
        lines.push(`User: ${snapshot.userInfo.name} (${snapshot.userInfo.tier})`);
    }

    // Credits
    if (snapshot.tokenUsage) {
        const tu = snapshot.tokenUsage;
        lines.push(`Prompt Credits: ${(tu.promptCredits.available / 1000000).toFixed(1)}M / ${(tu.promptCredits.monthly / 1000000).toFixed(1)}M (${tu.promptCredits.remainingPercentage.toFixed(1)}% left)`);
        lines.push(`Flow Credits:   ${(tu.flowCredits.available / 1000).toFixed(0)}K / ${(tu.flowCredits.monthly / 1000).toFixed(0)}K (${tu.flowCredits.remainingPercentage.toFixed(1)}% left)`);
    }

    lines.push(`--------------------------------------------------`);

    // Models
    snapshot.models.forEach((m: any) => {
        lines.push(`${m.label.padEnd(20)}: ${m.remainingPercentage.toFixed(1).padStart(5)}% | Reset in: ${m.timeUntilReset}`);
    });

    lines.push(`--------------------------------------------------`);
    return lines.join('\n');
}

async function analyze() {
    console.log("Analyzing Quota Parsing and Output Format...");

    const configManager = new ConfigManager(new MockConfigReader() as any);
    const service = new QuotaService(configManager);

    // @ts-expect-error: Accessing private method for analysis
    const snapshot = service.parseResponse(validResponse);

    console.log("\n--- Internal Snapshot Data ---");
    console.log(JSON.stringify(snapshot, null, 2));

    console.log("\n--- Formatted Output Suggestion ---");
    console.log(formatQuotaSnapshot(snapshot));
}

analyze().catch(console.error);
