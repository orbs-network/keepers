import _ from 'lodash';
import fs from 'fs';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import * as Logger from './logger';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ensureFileDirectoryExists(filePath: string) {
  mkdirSync(dirname(filePath), { recursive: true });
}

// returns UTC clock time in seconds (similar to unix timestamp / Ethereum block time / RefTime)
export function getCurrentClockTime() {
  return Math.round(new Date().getTime() / 1000);
}

export function getCurrentVersion() {
  try {
    return fs.readFileSync('./version').toString().trim();
  } catch (err) {
    Logger.log(`Cound not find version: ${err.message}`);
  }
  return '';
}

export function getToday(): string {
  return new Date().toISOString().substr(0, 10);
}

// returns the ten days group of the month
export function getTenDayPeriod(): string {
  const iso = new Date().toISOString();
  const prefix = iso.substr(0, 8);
  const day = parseInt(iso.substr(8, 2));
  if (day <= 10) return prefix + '1:10';
  if (day <= 20) return prefix + '11:20';
  return prefix + '21:31';
}

export function toNumber(val: number | string) {
  if (typeof val == 'string') {
    return parseInt(val);
  } else return val;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonResponse = any;

export function jsonStringifyComplexTypes(obj: unknown): string {
  return JSON.stringify(
    obj,
    (key, value) => {
      if (key == 'privateKey') return '<redacted>';
      if (typeof value === 'bigint') return `BigInt(${value.toString()})`;
      if (typeof value == 'object') {
        if (value.constructor === Uint8Array) return `Uint8Array(${Buffer.from(value).toString('hex')})`;
      }
      return value; // return everything else unchanged
    },
    2
  );
}
