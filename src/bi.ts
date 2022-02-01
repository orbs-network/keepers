import fetch from 'node-fetch';
import * as Logger from './logger';

export async function biSend(url: string, bi: any) {
    bi.procName = process.env.npm_config_name;
    bi.procVersion = process.env.npm_config_version;

    const prom = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bi)
    }).catch((e) => {
        Logger.error('biSend: ' + e.message)
    });

    return prom;
}
