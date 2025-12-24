import * as assert from 'assert';
import * as os from 'os';
import { getDetailedOSVersion } from '../../shared/utils/platform';

suite('Platform Utils Test Suite', () => {
    test('getDetailedOSVersion should return a string containing platform and arch', () => {
        const version = getDetailedOSVersion();
        assert.strictEqual(typeof version, 'string');
        assert.ok(version.includes(process.arch), 'Should include architecture');
    });

    test('getDetailedOSVersion format check', () => {
        const version = getDetailedOSVersion();
        if (process.platform === 'win32') {
            assert.ok(version.includes('Windows'), 'Should identify as Windows');
        } else if (process.platform === 'darwin') {
            assert.ok(version.includes('macOS'), 'Should identify as macOS');
        } else if (process.platform === 'linux') {
            assert.ok(version.includes('Linux') || version.includes('Ubuntu') || version.includes('Debian') || version.includes('CentOS') || version.includes('Fedora'), 'Should identify as Linux or a Distribution');
        }
    });
});
