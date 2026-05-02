#!/usr/bin/env node
/**
 * Postinstall patch: forces @angular/build dev-server to pass allowedHosts: true
 * to Vite, allowing Replit's proxied external domain to reach the dev server.
 *
 * This runs automatically after `npm install` via the postinstall hook.
 */

const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@angular',
  'build',
  'src',
  'builders',
  'dev-server',
  'options.js'
);

if (!fs.existsSync(file)) {
  console.log('[patch-allowed-hosts] options.js not found — skipping');
  process.exit(0);
}

let content = fs.readFileSync(file, 'utf8');

if (content.includes('allowedHosts: true,')) {
  console.log('[patch-allowed-hosts] Already patched — skipping');
  process.exit(0);
}

let changed = false;

if (content.includes('allowedHosts: allowedHosts ? allowedHosts : []')) {
  content = content.replace(
    'allowedHosts: allowedHosts ? allowedHosts : []',
    'allowedHosts: true'
  );
  changed = true;
}

if (content.includes('allowedHosts: allowedHosts,')) {
  content = content.replace('allowedHosts: allowedHosts,', 'allowedHosts: true,');
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('[patch-allowed-hosts] Applied allowedHosts: true patch to @angular/build dev-server');
} else {
  console.log('[patch-allowed-hosts] No known patch target found — check if @angular/build was updated');
}
