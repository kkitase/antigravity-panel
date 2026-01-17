
const http = require('http');

const body = JSON.stringify({
    metadata: {
        ideName: 'antigravity',
        extensionName: 'antigravity',
        locale: 'en',
    },
});

const ports = [44833, 45683, 45905, 44697];

async function tryPort(port) {
    return new Promise((resolve) => {
        console.log(`\nTrying Port: ${port}...`);
        const options = {
            hostname: '127.0.0.1',
            port: port,
            path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
            method: 'POST',
            headers: {
                'X-Codeium-Csrf-Token': '3359564e-c314-41ee-b610-6902aff18f3c',
                'Connect-Protocol-Version': '1',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 2000
        };

        const req = http.request(options, (res) => {
            console.log(`STATUS: ${res.statusCode}`);
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200 && rawData) {
                    try {
                        const parsedData = JSON.parse(rawData);
                        console.log('--- RAW REAL QUOTA RESPONSE ---');
                        console.log(JSON.stringify(parsedData, null, 2));
                        console.log('-------------------------------');
                        resolve(true);
                    } catch (e) {
                        console.log('JSON Parse failed');
                        resolve(false);
                    }
                } else {
                    resolve(false);
                }
            });
        });

        req.on('error', (e) => {
            console.log(`Error: ${e.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            console.log('Timeout');
            resolve(false);
        });

        req.write(body);
        req.end();
    });
}

async function main() {
    for (const port of ports) {
        const success = await tryPort(port);
        if (success) break;
    }
}

main();
