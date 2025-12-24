
import * as assert from 'assert';
import * as vscode from 'vscode';
import { StatusBarManager } from '../../view/status-bar';
import { AppViewModel } from '../../view-model/app.vm';
import { ConfigManager } from '../../shared/config/config_manager';
import { StatusBarData, StatusBarGroupItem } from '../../view-model/types';

suite('StatusBarManager Test Suite', () => {
    let statusBarManager: StatusBarManager;
    let mockViewModel: any;
    let mockConfigManager: any;
    let mockStatusBarItem: any;

    const mockGroupItem: StatusBarGroupItem = {
        id: 'gemini',
        label: 'Gemini',
        shortLabel: 'Fls',
        percentage: 75,
        resetTime: '2h 30m',
        color: '#ff0000',
        usageRate: 10,
        runway: '5h'
    };

    const mockStatusBarData: StatusBarData = {
        primary: mockGroupItem,
        allGroups: [mockGroupItem]
    };

    const mockCacheState = {
        totalSize: 1024 * 1024 * 10, // 10MB
        brainSize: 0,
        conversationsSize: 0,
        brainCount: 0,
        formattedTotal: '10 MB',
        formattedBrain: '0 B',
        formattedConversations: '0 B'
    };

    setup(() => {
        // Mock StatusBarItem
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            show: () => { },
            hide: () => { },
            dispose: () => { },
            backgroundColor: undefined
        };

        // Mock vscode.MarkdownString
        (vscode as any).MarkdownString = class MockMarkdownString {
            value: string = '';
            isTrusted = true;
            supportHtml = true;
            constructor(value?: string) {
                this.value = value || '';
            }
            appendMarkdown(value: string) {
                this.value += value;
                return this;
            }
        };

        // Stub vscode.window.createStatusBarItem
        const createStub = (vscode.window.createStatusBarItem as unknown) = () => mockStatusBarItem;

        // Mock ViewModel
        mockViewModel = {
            onStateChange: () => ({ dispose: () => { } }),
            onQuotaChange: () => ({ dispose: () => { } }),
            onCacheChange: () => ({ dispose: () => { } }),
            getState: () => ({
                cache: mockCacheState
            }),
            getStatusBarData: () => mockStatusBarData
        };

        // Mock ConfigManager
        mockConfigManager = {
            getConfig: () => ({
                "status.showQuota": true,
                "status.showCache": false,
                "status.displayFormat": "percentage",
                "status.warningThreshold": 30,
                "status.criticalThreshold": 10
            })
        };

        statusBarManager = new StatusBarManager(
            mockViewModel as AppViewModel,
            mockConfigManager as ConfigManager
        );

        // Inject mock item directly if construction created a different one (not needed if stub works, but for safety)
        (statusBarManager as any).item = mockStatusBarItem;
    });

    teardown(() => {
        statusBarManager.dispose();
    });

    test('should format correctly for "percentage"', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.displayFormat": "percentage"
        });

        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('Fls 75%'), `Expected "Fls 75%", got "${mockStatusBarItem.text}"`);
    });

    test('should format correctly for "used"', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.displayFormat": "used"
        });

        statusBarManager.update();
        // Used = 100 - 75 = 25/100
        assert.ok(mockStatusBarItem.text.includes('Fls 25/100'), `Expected "Fls 25/100", got "${mockStatusBarItem.text}"`);
    });

    test('should format correctly for "resetTime"', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.displayFormat": "resetTime"
        });

        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('Fls 2h 30m'), `Expected "Fls 2h 30m", got "${mockStatusBarItem.text}"`);
    });

    test('should format correctly for "remaining"', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.displayFormat": "remaining"
        });

        statusBarManager.update();
        // Remainig = 75/100
        assert.ok(mockStatusBarItem.text.includes('Fls 75/100'), `Expected "Fls 75/100", got "${mockStatusBarItem.text}"`);
    });

    test('should fallback to percentage for unknown format', () => {
        mockConfigManager.getConfig = () => ({
            "status.showQuota": true,
            "status.displayFormat": "unknown_format" as any
        });

        statusBarManager.update();
        assert.ok(mockStatusBarItem.text.includes('Fls 75%'), `Expected fallback to "Fls 75%", got "${mockStatusBarItem.text}"`);
    });
});
