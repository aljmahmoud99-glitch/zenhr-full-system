const fs = require("node:fs");
const path = require("node:path");

const backend = process.env.BACKEND_URL || "http://127.0.0.1:3001";
const password = process.env.TEST_PASSWORD || "Admin@1234";
const tag = `ui21-${Date.now()}`;

const out = (name) => path.join(__dirname, name);
const tokens = {};
const users = {};

async function raw(method, url, body, token) {
  const response = await fetch(`${backend}${url}`, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: response.status, ok: response.ok, body: json, text: text.slice(0, 800) };
}

async function login(role) {
  const res = await raw("POST", "/api/auth/login", { username: role, password });
  tokens[role] = res.body?.data?.accessToken;
  users[role] = res.body?.data?.user;
  return { status: res.status, user: users[role] };
}

async function api(role, method, url, body) {
  return raw(method, url, body, tokens[role]);
}

async function main() {
  const results = {
    generatedAt: new Date().toISOString(),
    backend,
    tag,
    status: "RUNNING",
    health: await raw("GET", "/api/healthz"),
    logins: {},
    map: {},
    shifts: {},
    jobProfile: {},
    rbac: {},
    issues: [],
  };

  for (const role of ["hr", "employee", "manager", "payroll", "recruiter", "admin"]) {
    results.logins[role] = await login(role);
  }

  const employeeId = users.employee?.employeeId;
  const locationPayload = {
    nameAr: `موقع اختبار ${tag}`,
    nameEn: `Test Location ${tag}`,
    latitude: 31.9537,
    longitude: 35.9106,
    radiusMeters: 250,
    address: `QA ${tag}`,
  };
  const createLocation = await api("hr", "POST", "/api/attendance/locations", locationPayload);
  const locations = await api("hr", "GET", "/api/attendance/locations");
  const savedLocation = (locations.body?.data || []).find((item) => item.nameEn === locationPayload.nameEn);
  results.map = {
    createStatus: createLocation.status,
    listStatus: locations.status,
    savedLocation,
    persisted: !!savedLocation && Number(savedLocation.latitude).toFixed(4) === Number(locationPayload.latitude).toFixed(4),
    googleMapsUrl: savedLocation ? `https://www.google.com/maps?q=${savedLocation.latitude},${savedLocation.longitude}` : null,
  };

  const shiftPayload = {
    code: tag.toUpperCase(),
    nameAr: `وردية اختبار ${tag}`,
    nameEn: `Test Shift ${tag}`,
    startTime: "09:00",
    endTime: "17:00",
    breakMinutes: 45,
    isOvernight: false,
    isFlexible: false,
    workingDaysJson: JSON.stringify(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
    gracePeriodMinutes: 10,
    earlyLeaveThresholdMinutes: 10,
    overtimeStartAfterMinutes: 30,
  };
  const createShift = await api("hr", "POST", "/api/shifts", shiftPayload);
  const shift = createShift.body?.data;
  const assign = shift?.id && employeeId ? await api("hr", "POST", "/api/shifts/assignments", {
    shiftId: shift.id,
    employeeId,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    recurrence: "daily",
    locationId: savedLocation?.id ?? null,
    notes: `QA assignment ${tag}`,
  }) : { status: 0, body: null };
  const mySchedule = await api("employee", "GET", "/api/shifts/my-schedule?days=7");
  const managerProbe = employeeId ? await api("manager", "GET", `/api/shifts/my-schedule?employeeId=${employeeId}&days=7`) : { status: 0 };
  results.shifts = {
    createStatus: createShift.status,
    shift,
    assignmentStatus: assign.status,
    employeeScheduleStatus: mySchedule.status,
    todayShift: mySchedule.body?.data?.todayShift,
    upcomingCount: mySchedule.body?.data?.upcoming?.length ?? 0,
    persistsToEmployee: mySchedule.status === 200 && !!mySchedule.body?.data?.upcoming?.find((item) => item.shift?.id === shift?.id),
    locationReflected: !!mySchedule.body?.data?.upcoming?.find((item) => item.location?.id === savedLocation?.id),
    managerProbeStatus: managerProbe.status,
  };

  const respGroup = await api("hr", "POST", "/api/responsibility-groups", {
    code: `RG-${tag}`,
    nameAr: `مجموعة ${tag}`,
    nameEn: `Group ${tag}`,
    isActive: true,
  });
  const skill = await api("hr", "POST", "/api/skills", {
    code: `SK-${tag}`,
    nameAr: `مهارة ${tag}`,
    nameEn: `Skill ${tag}`,
    category: "technical",
    isActive: true,
  });
  results.jobProfile = {
    responsibilityGroupStatus: respGroup.status,
    skillStatus: skill.status,
    createsSelectableMasterData: [200, 201].includes(respGroup.status) && [200, 201].includes(skill.status),
    responsibilityGroupId: respGroup.body?.data?.id,
    skillId: skill.body?.data?.id,
  };

  const employeeShiftCreate = await api("employee", "POST", "/api/shifts", shiftPayload);
  const recruiterShiftAssign = await api("recruiter", "POST", "/api/shifts/assignments", { shiftId: shift?.id, employeeId });
  results.rbac = {
    employeeCannotCreateShift: [403, 404].includes(employeeShiftCreate.status),
    recruiterCannotAssignShift: [403, 404].includes(recruiterShiftAssign.status),
    employeeShiftCreateStatus: employeeShiftCreate.status,
    recruiterShiftAssignStatus: recruiterShiftAssign.status,
  };

  const pass = results.health.status === 200
    && Object.values(results.logins).every((entry) => entry.status === 200)
    && results.map.persisted
    && results.shifts.persistsToEmployee
    && results.shifts.locationReflected
    && results.jobProfile.createsSelectableMasterData
    && results.rbac.employeeCannotCreateShift
    && results.rbac.recruiterCannotAssignShift;

  if (!results.map.persisted) results.issues.push({ severity: "HIGH", area: "attendance-map", detail: results.map });
  if (!results.shifts.persistsToEmployee) results.issues.push({ severity: "BLOCKER", area: "shift-reflection", detail: results.shifts });
  if (!results.shifts.locationReflected) results.issues.push({ severity: "HIGH", area: "shift-location-reflection", detail: results.shifts });
  if (!results.jobProfile.createsSelectableMasterData) results.issues.push({ severity: "HIGH", area: "job-profile-add", detail: results.jobProfile });
  if (!results.rbac.employeeCannotCreateShift || !results.rbac.recruiterCannotAssignShift) results.issues.push({ severity: "BLOCKER", area: "rbac-regression", detail: results.rbac });

  results.status = pass ? "PASS" : "FAIL";

  fs.writeFileSync(out("enterprise-ui-2-1-results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(out("enterprise-ui-2-1-map-results.json"), JSON.stringify({ generatedAt: results.generatedAt, status: results.map.persisted ? "PASS" : "FAIL", ...results.map }, null, 2));
  fs.writeFileSync(out("enterprise-ui-2-1-shift-results.json"), JSON.stringify({ generatedAt: results.generatedAt, status: results.shifts.persistsToEmployee && results.shifts.locationReflected ? "PASS" : "FAIL", ...results.shifts }, null, 2));
  fs.writeFileSync(out("enterprise-ui-2-1-job-profile-results.json"), JSON.stringify({ generatedAt: results.generatedAt, status: results.jobProfile.createsSelectableMasterData ? "PASS" : "FAIL", ...results.jobProfile }, null, 2));
  fs.writeFileSync(out("enterprise-ui-2-1-rbac-regression-results.json"), JSON.stringify({ generatedAt: results.generatedAt, status: results.rbac.employeeCannotCreateShift && results.rbac.recruiterCannotAssignShift ? "PASS" : "FAIL", ...results.rbac }, null, 2));

  console.log(JSON.stringify({ status: results.status, issues: results.issues }, null, 2));
  if (!pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
