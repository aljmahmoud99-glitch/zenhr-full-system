#!/usr/bin/env node
/**
 * TCP-level transparent proxy: listens on port 4200 (Replit externalPort=80)
 * and forwards all traffic to port 5000 (Angular / Vite dev server).
 *
 * Why TCP-level?
 *   - Handles plain HTTP and WebSocket (Vite HMR) transparently with zero overhead.
 *   - No need to parse or rewrite headers.
 *   - Works regardless of protocol version.
 *
 * Usage: node scripts/tcp-proxy.js [srcPort] [dstPort]
 *   Defaults: srcPort=4200, dstPort=5000
 */

'use strict';

const net = require('net');

const SRC_PORT = parseInt(process.argv[2] || '4200', 10);
const DST_PORT = parseInt(process.argv[3] || '5000', 10);
const DST_HOST = 'localhost';

const server = net.createServer((client) => {
  client.on('error', () => {});

  const target = net.createConnection({ host: DST_HOST, port: DST_PORT }, () => {
    client.pipe(target);
    target.pipe(client);
  });

  target.on('error', (err) => {
    const msg = `HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nAngular dev server not ready (${err.code}). Please refresh.\n`;
    try { client.end(msg); } catch (_) {}
  });

  client.on('close', () => target.destroy());
  target.on('close', () => client.destroy());
});

server.listen(SRC_PORT, '0.0.0.0', () => {
  console.log(`[tcp-proxy] 0.0.0.0:${SRC_PORT} → ${DST_HOST}:${DST_PORT}`);
});

server.on('error', (err) => {
  console.error(`[tcp-proxy] Failed to bind port ${SRC_PORT}: ${err.message}`);
  process.exit(1);
});
