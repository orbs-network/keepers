import { Transaction } from 'ethereumjs-tx';
import { TransactionConfig } from 'web3-core';
import { readFileSync } from 'fs';

var Common = require('ethereumjs-common').default;

const { keccak256 } = require("web3-utils");
import Web3 from "web3";

let account: any;

let pkstr: string = '';
function dbgLoad() {
    const txt = String(readFileSync('./src/debug.json'));
    const dbg = JSON.parse(txt);
    pkstr = dbg.key1 + dbg.key2;
}

export function setAccount(web3: Web3) {
    if (account)
        return;

    dbgLoad();

    account = web3.eth.accounts.privateKeyToAccount(pkstr);
    web3.eth.accounts.wallet.add(account);
}

var BSC_FORK = Common.forCustomChain(
    'mainnet',
    {
        name: 'Binance Smart Chain Mainnet',
        networkId: 56,
        chainId: 56,
        url: 'https://bsc-dataseed.binance.org/'
    },
    'istanbul',
);

export async function debugSignAccount(txConfig: TransactionConfig) {
    try {
        const tx = new Transaction(txConfig, { 'common': BSC_FORK });
        await account.signTransaction(txConfig);
        const rlpEncoded = tx.serialize().toString('hex');
        const rawTransaction = '0x' + rlpEncoded;
        const transactionHash = keccak256(rawTransaction);

        return {
            rawTransaction,
            transactionHash
        };
    } catch (e) {
        console.error(e);
    }
    return {};
}
export function debugSign(txConfig: any): any {
    dbgLoad();
    const pk = Buffer.from(
        pkstr,
        'hex'
    )
    try {
        const tx = new Transaction(txConfig, { 'common': BSC_FORK });
        tx.sign(pk);
        const rlpEncoded = tx.serialize().toString('hex');
        const rawTransaction = '0x' + rlpEncoded;
        const transactionHash = keccak256(rawTransaction);

        return {
            rawTransaction,
            transactionHash
        };
    } catch (e) {
        console.error(e);
    }
    return null;
}