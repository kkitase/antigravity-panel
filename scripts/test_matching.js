
const strategyData = {
    "groups": [
        {
            "id": "gemini-flash",
            "label": "Gemini Flash",
            "shortLabel": "Flash",
            "themeColor": "#40C4FF",
            "prefixes": ["gemini-3-flash"],
            "models": [
                { "id": "gemini-3-flash", "modelName": "MODEL_PLACEHOLDER_M18", "displayName": "Gemini 3 Flash" }
            ]
        },
        {
            "id": "gemini-pro",
            "label": "Gemini Pro",
            "shortLabel": "Pro",
            "themeColor": "#69F0AE",
            "prefixes": ["gemini"],
            "models": [
                { "id": "gemini-3-pro-high", "modelName": "MODEL_PLACEHOLDER_M8", "displayName": "Gemini 3 Pro (High)" },
                { "id": "gemini-3-pro-low", "modelName": "MODEL_PLACEHOLDER_M7", "displayName": "Gemini 3 Pro (Low)" }
            ]
        },
        {
            "id": "claude",
            "label": "Claude",
            "shortLabel": "Claude",
            "themeColor": "#FFAB40",
            "prefixes": ["claude"],
            "models": [
                { "id": "claude-4-5-sonnet", "modelName": "MODEL_CLAUDE_4_5_SONNET", "displayName": "Claude Sonnet 4.5" }
            ]
        }
    ]
};

class MockStrategyManager {
    groups = strategyData.groups;

    getGroupForModel(modelId, modelLabel) {
        const def = this.getModelDefinition(modelId, modelLabel);
        if (def) {
            const group = this.groups.find(g => g.models.some(m => m.id === def.id));
            if (group) return group;
        }

        const lowerId = modelId.toLowerCase();
        for (const group of this.groups) {
            if (group.prefixes) {
                for (const prefix of group.prefixes) {
                    if (lowerId.includes(prefix.toLowerCase())) return group;
                }
            }
        }
        return { id: 'other', label: 'Other', themeColor: '#888' };
    }

    getModelDisplayName(modelId, modelLabel) {
        const def = this.getModelDefinition(modelId, modelLabel);
        return def ? def.displayName : (modelLabel || modelId);
    }

    getModelDefinition(modelId, modelLabel) {
        // 1. Exact Match
        for (const group of this.groups) {
            const model = group.models.find(m => m.id === modelId);
            if (model) return model;
        }

        // 2. Normalized Match
        const normalized = modelId.toLowerCase().replace(/^model_/, '').replace(/_/g, '-');
        for (const group of this.groups) {
            const model = group.models.find(m => m.id === normalized);
            if (model) return model;
        }

        return undefined;
    }
}

const testCases = [
    { id: 'gemini-3-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-3-pro-high', label: 'Gemini 2.0 Pro' },
    { id: 'claude-4-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { id: 'gemini-extra-model', label: 'Some New Gemini' },
    { id: 'unknown-id', label: 'Custom Model' }
];

const manager = new MockStrategyManager();

console.log("Matching Analysis:");
console.log("".padEnd(60, '-'));
console.log(`${"Server ID".padEnd(25)} | ${"Display Name".padEnd(20)} | ${"Group"}`);
console.log("".padEnd(60, '-'));

testCases.forEach(tc => {
    const displayName = manager.getModelDisplayName(tc.id, tc.label);
    const group = manager.getGroupForModel(tc.id, tc.label);
    console.log(`${tc.id.padEnd(25)} | ${displayName.padEnd(20)} | ${group.label}`);
});
console.log("".padEnd(60, '-'));
