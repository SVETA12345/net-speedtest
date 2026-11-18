#!/usr/bin/env node

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const DEFAULT_REQUESTS = 10;
const MAX_REDIRECTS = 5;

const KB = 1_000;
const MB = 1_000_000;

function download(url, redirects = 0, startTime = process.hrtime.bigint()) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(new Error(`Некорректный URL: ${err.message}`));
      return;
    }

    const lib = parsed.protocol === 'https:' ? https : http;

    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects >= MAX_REDIRECTS) {
          reject(new Error('Слишком много редиректов'));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        resolve(download(next, redirects + 1, startTime));
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
      });
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - startTime) / 1e6;
        resolve({ bytes, ms });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function formatBytes(bytes) {
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;
  return `${bytes} B`;
}

async function main() {
  const url = process.argv[2];
  const requestsArg = process.argv[3];

  if (!url) {
    console.error('Использование: node index.js <url> [количество-запросов]');
    console.error('Пример:       node index.js https://example.com/heavy-image.jpg');
    process.exit(1);
  }

  const count = requestsArg ? parseInt(requestsArg, 10) : DEFAULT_REQUESTS;
  if (!Number.isInteger(count) || count <= 0) {
    console.error('Количество запросов должно быть положительным целым числом');
    process.exit(1);
  }

  console.log(`Цель: ${url}`);
  console.log(`Запросов: ${count}\n`);

  let totalBytes = 0;
  let totalMs = 0;

  for (let i = 1; i <= count; i++) {
    process.stdout.write(`Запрос ${i}/${count}... `);
    try {
      const { bytes, ms } = await download(url);
      totalBytes += bytes;
      totalMs += ms;
      process.stdout.write(`готово: ${formatBytes(bytes)} за ${ms.toFixed(0)} мс\n`);
    } catch (err) {
      console.error(`\nОшибка на запросе ${i}: ${err.message}`);
      process.exit(1);
    }
  }

  const avgMs = totalMs / count;
  const totalSeconds = totalMs / 1000;
  const bytesPerSecond = totalSeconds > 0 ? totalBytes / totalSeconds : 0;
  const mbPerSecond = bytesPerSecond / MB;
  const mbitPerSecond = (bytesPerSecond * 8) / MB;

  console.log('\n--- Результаты ---');
  console.log(`Среднее время запроса: ${avgMs.toFixed(1)} мс`);
  console.log(`Общий объём:           ${formatBytes(totalBytes)}`);
  console.log(`Скорость:              ${mbPerSecond.toFixed(2)} MB/s (${mbitPerSecond.toFixed(2)} Mbit/s)`);
}

main();
