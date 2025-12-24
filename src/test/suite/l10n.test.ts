
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Localization Alignment Test Suite', () => {
    let baseKeys: string[];
    let l10nDir: string;

    setup(() => {
        // Adjust path based on execution context (out/test/suite vs src/test/suite)
        // We need to find the project root from the built test file location
        // Usually: [project]/out/test/suite/l10n.test.js -> up 3 levels -> [project]
        // But source is: [project]/src/test/suite/l10n.test.ts

        // Let's try to find l10n directory relative to this file
        // Since tests run from 'out', __dirname will be .../out/test/suite
        const projectRoot = path.resolve(__dirname, '../../../');
        l10nDir = path.join(projectRoot, 'l10n');

        const baseFile = path.join(l10nDir, 'bundle.l10n.json');

        if (!fs.existsSync(baseFile)) {
            // Fallback for dev environment structure if needed
            throw new Error(`Base l10n file not found at ${baseFile}`);
        }

        const baseContent = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
        baseKeys = Object.keys(baseContent);
    });

    test('All language files should have exactly matching keys with base bundle (1:1 alignment)', () => {
        const files = fs.readdirSync(l10nDir).filter(f => f.endsWith('.json') && f !== 'bundle.l10n.json');

        assert.ok(files.length > 0, 'Should have language files to check');

        files.forEach(file => {
            const filePath = path.join(l10nDir, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const fileKeys = Object.keys(content);

            // Check for missing keys (present in base but missing in translation)
            const missingKeys = baseKeys.filter(k => !fileKeys.includes(k));

            // Check for extra keys (present in translation but missing in base)
            const extraKeys = fileKeys.filter(k => !baseKeys.includes(k));

            assert.strictEqual(
                missingKeys.length,
                0,
                `[${file}] Missing keys found (should be translated): \n${missingKeys.join('\n')}`
            );

            assert.strictEqual(
                extraKeys.length,
                0,
                `[${file}] Extra keys found (not in base bundle): \n${extraKeys.join('\n')}`
            );
        });
    });

    test('Technical AI terminology should remain in English across all languages', () => {
        const technicalTerms = ['Tokens', 'Prompt', 'Flow', 'max', 'Rules', 'MCP'];
        const files = fs.readdirSync(l10nDir).filter(f => f.endsWith('.json') && f !== 'bundle.l10n.json');

        files.forEach(file => {
            const filePath = path.join(l10nDir, file);
            const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            technicalTerms.forEach(term => {
                if (content[term] !== undefined) {
                    assert.strictEqual(
                        content[term],
                        term,
                        `[${file}] Technical term "${term}" should remain in English, but found: "${content[term]}"`
                    );
                }
            });
        });
    });
});
