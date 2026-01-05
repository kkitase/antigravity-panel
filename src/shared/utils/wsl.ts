import * as fs from 'fs';

/**
 * Detects if the current environment is WSL.
 */
export function isWsl(): boolean {
    if (process.platform !== 'linux') {
        return false;
    }
    try {
        const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        return version.includes('microsoft') || version.includes('wsl');
    } catch {
        return false;
    }
}

/**
 * Parses /etc/resolv.conf to find the Windows host IP (nameserver).
 * This is used in NAT mode to reach services on the host.
 */
export function getWslHostIp(): string | null {
    try {
        const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
        const match = resolvConf.match(/^nameserver\s+([0-9.]+)/m);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}
