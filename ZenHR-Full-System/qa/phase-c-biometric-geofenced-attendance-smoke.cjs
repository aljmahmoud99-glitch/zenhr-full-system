const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const WebSocket = global.WebSocket || require('ws');
const root = path.resolve(__dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const backend = process.env.BACKEND_URL || 'http://localhost:3001';
const password = process.env.TEST_PASSWORD || 'Admin@1234';
const outputFile = process.env.OUTPUT_FILE || path.join(root, 'qa', 'phase-c-biometric-geofenced-attendance-api-results.json');
const debugPort = 10100 + Math.floor(Math.random() * 300);
const userDataDir = path.join(process.env.TEMP || root, `.chrome-phase-c-${Date.now()}`);

const results = {
  generatedAt: new Date().toISOString(),
  backend,
  browser: { chromePath, virtualAuthenticator: false },
  logins: {},
  checks: {},
  created: {},
  errors: [],
  status: 'PENDING',
};

let chrome;
let ws;
let seq = 0;
const pending = new Map();

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function writeResults() {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
}
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
async function waitForDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const tabs = await httpGetJson(`http://127.0.0.1:${debugPort}/json`);
      const page = tabs.find(t => t.type === 'page') || tabs[0];
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await wait(250);
  }
  throw new Error('Chrome DevTools endpoint did not start');
}
function addSocketListener(socket, event, handler, once = false) {
  if (typeof socket.on === 'function' && !once) return socket.on(event, handler);
  if (typeof socket.once === 'function' && once) return socket.once(event, handler);
  socket.addEventListener(event, ev => handler(ev.data ?? ev), { once });
}
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 45000);
    pending.set(id, { resolve, reject, timer });
  });
}
async function evalJs(expression, awaitPromise = true) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'Runtime exception');
  return res.result?.value;
}
async function navigate(url) {
  await send('Page.navigate', { url });
  await wait(800);
}

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`);
  chrome = spawn(chromePath, [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--disable-popup-blocking',
    `${backend}/api/healthz`,
  ], { stdio: 'ignore', detached: true });

  const wsUrl = await waitForDebugger();
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    addSocketListener(ws, 'open', resolve, true);
    addSocketListener(ws, 'error', reject, true);
  });
  addSocketListener(ws, 'message', raw => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      clearTimeout(p.timer);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result || {});
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('WebAuthn.enable');
  const auth = await send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  results.browser.virtualAuthenticator = true;
  results.browser.authenticatorId = auth.authenticatorId;

  await navigate(`${backend}/api/healthz`);

  const smoke = await evalJs(`
    (async () => {
      const base = ${JSON.stringify(backend)};
      const password = ${JSON.stringify(password)};
      const out = { logins: {}, checks: {}, created: {}, errors: [] };
      const enc = new TextEncoder();
      const b64ToBuf = (value) => {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
      };
      const bufToB64 = (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(byte => binary += String.fromCharCode(byte));
        return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
      };
      const credentialToJSON = (credential) => {
        const response = credential.response;
        const json = {
          id: credential.id,
          rawId: bufToB64(credential.rawId),
          type: credential.type,
          response: { clientDataJSON: bufToB64(response.clientDataJSON) }
        };
        if (response.attestationObject) json.response.attestationObject = bufToB64(response.attestationObject);
        if (response.authenticatorData) json.response.authenticatorData = bufToB64(response.authenticatorData);
        if (response.signature) json.response.signature = bufToB64(response.signature);
        if (response.userHandle) json.response.userHandle = bufToB64(response.userHandle);
        return json;
      };
      const creationOptions = (data) => ({
        ...data,
        challenge: b64ToBuf(data.challenge),
        user: { ...data.user, id: b64ToBuf(data.user.id) },
        excludeCredentials: (data.excludeCredentials || []).map(item => ({ ...item, id: b64ToBuf(item.id) })),
      });
      const requestOptions = (data) => ({
        ...data,
        challenge: b64ToBuf(data.challenge),
        allowCredentials: (data.allowCredentials || []).map(item => ({ ...item, id: b64ToBuf(item.id) })),
      });
      const login = async (username) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const body = await res.json().catch(() => ({}));
        out.logins[username] = { status: res.status, role: body?.data?.user?.role, user: body?.data?.user };
        return body?.data?.accessToken;
      };
      const api = async (token, method, url, body) => {
        const res = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        const json = await res.json().catch(() => ({}));
        return { status: res.status, body: json };
      };

      const tokens = {};
      for (const role of ['hr','employee','manager','payroll','recruiter','admin']) tokens[role] = await login(role);
      out.checks.health = await api(tokens.hr, 'GET', '/api/healthz');

      const employeeId = out.logins.employee.user.employeeId;
      out.created.employeeId = employeeId;

      const hrDevicesBefore = await api(tokens.hr, 'GET', '/api/attendance/biometric/devices');
      out.checks.hrDeviceListBefore = { status: hrDevicesBefore.status, count: hrDevicesBefore.body?.data?.length ?? 0 };
      for (const device of (hrDevicesBefore.body?.data || []).filter(d => Number(d.employeeId) === Number(employeeId))) {
        await api(tokens.hr, 'PATCH', '/api/attendance/biometric/devices/' + device.id + '/status', { status: 'revoked' });
      }

      const locationPayload = { nameAr: 'موقع اختبار البصمة', nameEn: 'Biometric Test Site', latitude: 31.95, longitude: 35.93, radiusMeters: 10000, address: 'Amman smoke geofence' };
      out.checks.locationCreate = await api(tokens.hr, 'POST', '/api/attendance/locations', locationPayload);

      out.checks.noTrustedDeviceChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      out.checks.clockInWithoutBiometric = await api(tokens.employee, 'POST', '/api/attendance/clock-in', { attendanceType: 'office', latitude: 31.95, longitude: 35.93 });
      out.checks.clockInOutsideGeofence = await api(tokens.employee, 'POST', '/api/attendance/clock-in', { attendanceType: 'office', latitude: 0, longitude: 0 });

      const regChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/registration/challenge', {});
      out.checks.registrationChallenge = { status: regChallenge.status, hasChallenge: !!regChallenge.body?.data?.challenge };
      const credential = await navigator.credentials.create({ publicKey: creationOptions(regChallenge.body.data) });
      const regVerify = await api(tokens.employee, 'POST', '/api/attendance/biometric/registration/verify', {
        credential: credentialToJSON(credential),
        deviceLabel: 'Chrome CDP Virtual Passkey',
        platform: 'CDP',
        browser: 'Chrome'
      });
      out.checks.registrationVerify = regVerify;
      out.created.deviceId = regVerify.body?.data?.id;

      out.checks.trustedDeviceListEmployee = await api(tokens.employee, 'GET', '/api/attendance/biometric/devices');
      out.checks.trustedDeviceListHr = await api(tokens.hr, 'GET', '/api/attendance/biometric/devices');

      out.checks.managerMutateDevice = await api(tokens.manager, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'blocked' });
      out.checks.payrollMutateDevice = await api(tokens.payroll, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'blocked' });
      out.checks.recruiterDeviceList = await api(tokens.recruiter, 'GET', '/api/attendance/biometric/devices');

      out.checks.hrBlockDevice = await api(tokens.hr, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'blocked' });
      out.checks.blockedDeviceChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      out.checks.hrRevokeDevice = await api(tokens.hr, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'revoked' });
      out.checks.revokedDeviceChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      out.checks.hrForceReenroll = await api(tokens.hr, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'pending_reenroll' });
      out.checks.forceReenrollBlocked = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      out.checks.hrReactivateDevice = await api(tokens.hr, 'PATCH', '/api/attendance/biometric/devices/' + out.created.deviceId + '/status', { status: 'active' });

      const attChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      out.checks.attendanceChallenge = { status: attChallenge.status, hasChallenge: !!attChallenge.body?.data?.challenge };
      const assertion = await navigator.credentials.get({ publicKey: requestOptions(attChallenge.body.data) });
      const badAssertion = JSON.parse(JSON.stringify(credentialToJSON(assertion)));
      badAssertion.response.signature = badAssertion.response.signature.replace(/.$/, badAssertion.response.signature.endsWith('A') ? 'B' : 'A');
      out.checks.failedBiometricClockIn = await api(tokens.employee, 'POST', '/api/attendance/clock-in', { attendanceType: 'office', latitude: 31.95, longitude: 35.93, biometricAssertion: badAssertion });

      const attChallenge2 = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_in' });
      const assertion2 = await navigator.credentials.get({ publicKey: requestOptions(attChallenge2.body.data) });
      out.checks.clockInSuccess = await api(tokens.employee, 'POST', '/api/attendance/clock-in', { attendanceType: 'office', latitude: 31.95, longitude: 35.93, biometricAssertion: credentialToJSON(assertion2) });

      const outChallenge = await api(tokens.employee, 'POST', '/api/attendance/biometric/attendance/challenge', { action: 'clock_out' });
      const outAssertion = await navigator.credentials.get({ publicKey: requestOptions(outChallenge.body.data) });
      out.checks.clockOutSuccess = await api(tokens.employee, 'POST', '/api/attendance/clock-out', { latitude: 31.95, longitude: 35.93, biometricAssertion: credentialToJSON(outAssertion) });

      out.checks.todayRecord = await api(tokens.employee, 'GET', '/api/attendance/my-today');
      out.checks.auditLogs = await api(tokens.hr, 'GET', '/api/attendance/biometric/audit');
      out.checks.attendanceSummary = await api(tokens.employee, 'GET', '/api/attendance/summary');
      out.checks.payrollAttendanceImpact = await api(tokens.payroll, 'GET', '/api/attendance-intelligence/analytics');
      out.checks.adminDeviceRead = await api(tokens.admin, 'GET', '/api/attendance/biometric/devices');

      return out;
    })()
  `);

  Object.assign(results.logins, smoke.logins);
  Object.assign(results.checks, smoke.checks);
  Object.assign(results.created, smoke.created);
  results.errors.push(...(smoke.errors || []));

  const c = results.checks;
  const expected = [
    c.health?.status === 200,
    c.registrationChallenge?.status === 200 && c.registrationChallenge?.hasChallenge,
    c.registrationVerify?.status === 201,
    c.trustedDeviceListEmployee?.status === 200,
    c.hrBlockDevice?.status === 200,
    c.blockedDeviceChallenge?.status === 403,
    c.hrRevokeDevice?.status === 200,
    c.revokedDeviceChallenge?.status === 403,
    c.hrForceReenroll?.status === 200,
    c.forceReenrollBlocked?.status === 403,
    c.attendanceChallenge?.status === 200 && c.attendanceChallenge?.hasChallenge,
    c.clockInWithoutBiometric?.status === 400,
    c.clockInOutsideGeofence?.status === 400,
    c.failedBiometricClockIn?.status === 403,
    [201, 409].includes(c.clockInSuccess?.status),
    [200, 400, 409].includes(c.clockOutSuccess?.status),
    c.todayRecord?.status === 200,
    c.auditLogs?.status === 200,
    c.managerMutateDevice?.status === 403,
    c.payrollMutateDevice?.status === 403,
    c.recruiterDeviceList?.status === 403,
    c.payrollAttendanceImpact?.status === 200,
  ];
  results.status = expected.every(Boolean) ? 'PASS' : 'FAIL';
  results.finishedAt = new Date().toISOString();
}

main().catch(error => {
  results.status = 'FAIL';
  results.fatal = String(error?.stack || error);
}).finally(() => {
  writeResults();
  try { if (chrome?.pid) chrome.kill(); } catch {}
  if (ws) try { ws.close(); } catch {}
  process.exit(results.status === 'PASS' ? 0 : 1);
});
