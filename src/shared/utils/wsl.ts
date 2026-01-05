import * as fs from 'fs';

/**
 * Detects if the current environment is WSL.
 * @param platformOverride Optional platform string for testing
 * @param versionReader Optional function to read /proc/version for testing
 */
export function isWsl(
    platformOverride?: string,
    versionReader?: () => string
): boolean {
    const platform = platformOverride || process.platform;
    if (platform !== 'linux') {
        return false;
    }
    try {
        const reader = versionReader || (() => fs.readFileSync('/proc/version', 'utf8'));
        const version = reader().toLowerCase();
        return version.includes('microsoft') || version.includes('wsl');
    } catch {
        return false;
    }
}

/**
 * Parses /etc/resolv.conf to find the Windows host IP (nameserver).
 * This is used in NAT mode to reach services on the host.
 * @param resolvReader Optional function to read /etc/resolv.conf for testing
 */
export function getWslHostIp(resolvReader?: () => string): string | null {
    try {
        const reader = resolvReader || (() => fs.readFileSync('/etc/resolv.conf', 'utf8'));
        const resolvConf = reader();
        const match = resolvConf.match(/^nameserver\s+([0-9.]+)/m);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}
