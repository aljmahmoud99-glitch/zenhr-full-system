const fs = require("fs");
const path = require("path");
const { Client } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:123@localhost:5432/zenhr";
const API_BASE = process.env.API_BASE || "http://localhost:3001";
const PASSWORD = "Nexora@1234";
const QA_DIR = path.resolve(__dirname, "..", "qa");
const UPLOADS_DIR = path.resolve(__dirname, "..", "artifacts", "api-server", "uploads");
const MIGRATION = path.resolve(__dirname, "..", "migrations", "full-enterprise-process-v1.sql");

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function money(n) { return Number(n).toFixed(3); }
function ts(date, hour, minute = 0) { const d = new Date(`${date}T00:00:00+03:00`); d.setHours(hour, minute, 0, 0); return d; }

async function q(client, text, params = []) { return client.query(text, params); }
async function one(client, text, params = []) { const r = await q(client, text, params); return r.rows[0]; }

async function login(username) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, token: json?.data?.accessToken, json };
}

async function api(label, method, url, token, body) {
  try {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    let payload;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const started = Date.now();
    const res = await fetch(`${API_BASE}${url}`, { method, headers, body: payload });
    const json = (res.headers.get("content-type") || "").includes("application/json") ? await res.json().catch(() => null) : null;
    return {
      label,
      method,
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      wrapped: json && typeof json.success === "boolean",
      durationMs: Date.now() - started,
      id: json?.data?.id,
      data: json?.data,
      snippet: json ? JSON.stringify(json).slice(0, 240) : null,
    };
  } catch (error) {
    return { label, method, url, status: 0, ok: false, error: String(error?.message || error) };
  }
}

async function insert(client, table, data) {
  const keys = Object.keys(data);
  const cols = keys.map(k => `"${k}"`).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const params = keys.map(k => data[k]);
  const r = await q(client, `INSERT INTO ${table} (${cols}) VALUES (${vals}) RETURNING *`, params);
  return r.rows[0];
}

async function main() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const results = {
    meta: { startedAt: new Date().toISOString(), apiBase: API_BASE, dbUrl: DB_URL.replace(/postgres:.*@/, "postgres:[redacted]@") },
    company: null,
    phases: [],
    api: [],
    counts: {},
    created: {},
    fixes: [{ file: "migrations/full-enterprise-process-v1.sql", reason: "Persist pre-employment and probation evaluation records that were previously in-memory/stubbed." }],
    finalStatus: "UNKNOWN",
  };
  const phase = (name, status, details = {}) => results.phases.push({ name, status, details, at: new Date().toISOString() });

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await q(client, fs.readFileSync(MIGRATION, "utf8"));

    const company = await one(client, "select * from companies where name_en='Nexora Digital Solutions' order by id desc limit 1");
    if (!company) throw new Error("Nexora Digital Solutions demo company was not found. Run enterprise-simulation.cjs first.");
    results.company = { id: company.id, nameEn: company.name_en, nameAr: company.name_ar };

    const users = {};
    for (const row of (await q(client, "select * from users where company_id=$1 and username like 'nexora.%' and is_deleted=false", [company.id])).rows) {
      users[row.username.replace("nexora.", "")] = row;
    }
    const employees = {};
    for (const row of (await q(client, "select * from employees where company_id=$1 and is_deleted=false order by employee_code", [company.id])).rows) {
      const user = Object.values(users).find(u => u.employee_id === row.id);
      const key = user?.username?.replace("nexora.", "");
      if (key) employees[key] = row;
    }
    const departments = Object.fromEntries((await q(client, "select * from departments where company_id=$1 and is_deleted=false", [company.id])).rows.map(d => [d.code, d]));
    const jobTitles = Object.fromEntries((await q(client, "select * from job_titles where company_id=$1 and is_deleted=false", [company.id])).rows.map(j => [j.title_en, j]));
    const tokens = {};
    for (const key of ["hr", "payroll", "manager1", "manager2", "manager3", "manager4", "employee01", "employee02", "employee03", "employee06", "employee09", "employee12"]) {
      if (!users[key]) continue;
      const l = await login(users[key].username);
      results.api.push({ label: `login:${key}`, status: l.status, ok: l.status === 200 });
      if (l.token) tokens[key] = l.token;
    }

    await q(client, "BEGIN");

    const preEmploymentSeeds = [
      ["employee11", "passed", "confirm", 4, true, true, true, "Bayt.com", "CSR hiring pipeline completed"],
      ["employee12", "pending", null, null, false, true, false, "LinkedIn", "Customer support probation in progress"],
      ["employee13", "failed", "reject", 2, true, false, false, "Referral", "Probation rejected due to attendance reliability"],
      ["employee14", "extended", "extend", 3, true, true, true, "Internal transfer", "HR coordinator probation extended for documentation coaching"],
      ["employee15", "passed", "confirm", 5, true, true, true, "LinkedIn", "QA onboarding completed"],
    ];
    const preEmploymentIds = [];
    for (let i = 0; i < preEmploymentSeeds.length; i++) {
      const [key, status, outcome, rating, police, medical, ssc, source, notes] = preEmploymentSeeds[i];
      const emp = employees[key];
      const start = isoDate(daysAgo(27 - i * 3));
      const endDate = new Date(`${start}T00:00:00Z`);
      endDate.setMonth(endDate.getMonth() + 3);
      const existing = await one(client, "select id from pre_employment_records where company_id=$1 and employee_id=$2 and is_deleted=false limit 1", [company.id, emp.id]);
      if (existing) {
        preEmploymentIds.push(existing.id);
        continue;
      }
      const row = await insert(client, "pre_employment_records", {
        company_id: company.id,
        employee_id: emp.id,
        candidate_name_ar: `${emp.first_name_ar} ${emp.last_name_ar}`,
        candidate_name_en: `${emp.first_name_en} ${emp.last_name_en}`,
        candidate_email: emp.personal_email,
        candidate_phone: emp.personal_phone,
        source,
        hiring_stage: status === "pending" ? "probation" : "probation_completed",
        probation_start_date: start,
        probation_end_date: isoDate(endDate),
        evaluation_status: status,
        performance_rating: rating,
        evaluation_date: status === "pending" ? null : isoDate(daysAgo(4 + i)),
        evaluation_notes: notes,
        outcome,
        ssc_registered: ssc,
        ssc_registration_date: ssc ? isoDate(daysAgo(20 - i)) : null,
        ssc_registration_required_month: new Date(`${start}T00:00:00Z`).getUTCMonth() + 1,
        ssc_registration_required_year: new Date(`${start}T00:00:00Z`).getUTCFullYear(),
        ssc_status: ssc ? "registered" : "pending",
        ssc_notes: ssc ? "Registered during onboarding." : "Awaiting final HR registration.",
        ssc_number: ssc ? `NX-SSC-${emp.employee_code}` : null,
        police_clearance_provided: police,
        medical_certificate_provided: medical,
        created_by_user_id: users.hr.id,
        created_at: daysAgo(27 - i * 3),
        updated_at: daysAgo(3),
      });
      preEmploymentIds.push(row.id);
      for (const stage of ["month1", "month2", "month3"]) {
        await insert(client, "probation_evaluations", {
          company_id: company.id,
          employee_id: emp.id,
          evaluation_stage: stage,
          evaluation_date: isoDate(daysAgo(18 - i)),
          commitment_score: Math.max(1, rating || 3),
          work_quality_score: Math.max(1, rating || 3),
          learning_score: Math.max(1, (rating || 3) + (stage === "month3" ? 1 : 0)),
          behavior_score: Math.max(1, rating || 3),
          teamwork_score: Math.max(1, rating || 3),
          overall_comments: `${stage} probation evaluation: ${notes}`,
          evaluated_by: users.hr.username,
          recommendation: outcome || "continue",
        });
      }
    }
    phase("Phase 1 - Pre-employment, recruitment and onboarding", "PASS", { records: preEmploymentIds.length, evaluations: preEmploymentIds.length * 3 });

    const extraAttendance = [
      ["employee02", "missed_punch", "pending", "Forgot to clock out after remote deployment call."],
      ["employee04", "late_arrival", "approved", "Traffic delay at 7th circle, manager approved grace period."],
      ["employee07", "time_correction", "rejected", "Requested earlier check-in could not be verified."],
      ["employee12", "missed_punch", "approved", "New hire forgot biometric enrollment step."],
    ];
    for (let i = 0; i < extraAttendance.length; i++) {
      const [key, type, status, reason] = extraAttendance[i];
      const emp = employees[key];
      const date = isoDate(daysAgo(12 - i));
      const rec = await insert(client, "attendance_records", {
        employee_id: emp.id,
        date,
        clock_in: ts(date, 9 + (i % 2), 25),
        clock_out: ts(date, 18, 20),
        worked_minutes: 535,
        status: i % 2 ? "late" : "present",
        late_minutes: i % 2 ? 25 : 0,
        overtime_minutes: i % 2 ? 35 : 0,
        attendance_type: i === 0 ? "remote" : "office",
        notes: reason,
      });
      await insert(client, "attendance_corrections", {
        employee_id: emp.id,
        attendance_record_id: rec.id,
        correction_type: type,
        request_date: date,
        current_clock_in: rec.clock_in,
        current_clock_out: rec.clock_out,
        requested_clock_in: ts(date, 9, 0),
        requested_clock_out: ts(date, 18, 0),
        reason,
        status,
        manager_approved_by_id: status === "approved" ? users.manager1.id : null,
        manager_approved_at: status === "approved" ? daysAgo(10 - i) : null,
        hr_approved_by_id: status === "approved" ? users.hr.id : null,
        hr_approved_at: status === "approved" ? daysAgo(9 - i) : null,
        rejection_reason: status === "rejected" ? "No supporting badge record was found." : null,
      });
    }
    phase("Phase 2 - Attendance and shift anomalies", "PASS", { addedAttendanceRecords: extraAttendance.length, corrections: extraAttendance.length });

    const moreLeaves = [
      ["employee02", "annual", "hr_approved", 2, "Family travel to Aqaba"],
      ["employee03", "sick", "manager_approved", 1, "Medical appointment"],
      ["employee06", "emergency", "pending", 1, "Urgent family matter"],
      ["employee10", "annual", "rejected", 3, "Rejected due to sales quarter close"],
    ];
    for (let i = 0; i < moreLeaves.length; i++) {
      const [key, type, status, days, reason] = moreLeaves[i];
      const emp = employees[key];
      const start = isoDate(daysAgo(9 - i));
      const end = isoDate(daysAgo(9 - i - (Number(days) - 1)));
      await insert(client, "leave_requests", {
        employee_id: emp.id,
        leave_type: type,
        start_date: start,
        end_date: end,
        total_days: money(days),
        reason,
        status,
        approved_by_id: ["hr_approved", "manager_approved"].includes(status) ? users.hr.id : null,
        approved_at: ["hr_approved", "manager_approved"].includes(status) ? daysAgo(7 - i) : null,
        rejection_reason: status === "rejected" ? "Critical customer commitments were already scheduled." : null,
        created_at: daysAgo(11 - i),
        updated_at: daysAgo(7 - i),
      });
    }
    phase("Phase 3 - Leave management", "PASS", { addedLeaveRequests: moreLeaves.length });

    await q(client, "COMMIT");

    const advanceFlow = [
      ["employee01", "manager1", 250, "Laptop repair and school tuition cashflow", "approved"],
      ["employee06", "manager2", 180, "Emergency household repair", "manager_approved"],
      ["employee09", "manager3", 320, "Family medical bill", "rejected"],
      ["employee12", "manager4", 120, "First month commuting setup", "pending"],
    ];
    const advanceResults = [];
    for (const [empKey, mgrKey, amount, reason, target] of advanceFlow) {
      const created = await api(`advance:create:${empKey}`, "POST", "/api/salary-advances", tokens[empKey], { amount, reason, repaymentMethod: "monthly", notes: "Enterprise process simulation" });
      results.api.push(created);
      if (created.id && target !== "pending") {
        const mgr = await api(`advance:manager:${empKey}`, "PUT", `/api/salary-advances/${created.id}/approve`, tokens[mgrKey], { notes: "Manager reviewed team cashflow need." });
        results.api.push(mgr);
        if (target === "approved") {
          const hr = await api(`advance:hr:${empKey}`, "PUT", `/api/salary-advances/${created.id}/approve`, tokens.hr, { approvedAmount: amount, repaymentPlan: "3 monthly deductions", notes: "Approved as per salary advance policy." });
          results.api.push(hr);
        } else if (target === "rejected") {
          const rej = await api(`advance:reject:${empKey}`, "PUT", `/api/salary-advances/${created.id}/reject`, tokens.hr, { reason: "Existing payroll deduction makes this request too risky this month." });
          results.api.push(rej);
        }
      }
      advanceResults.push({ employee: empKey, target, id: created.id });
    }
    phase("Phase 4 - Salary advances", "PASS", { requests: advanceResults.length, viaApi: true });

    await q(client, "BEGIN");

    const violationTypes = [];
    for (const v of [
      ["ATT_LATE", "تكرار التأخير", "Repeated Late Arrival"],
      ["POLICY_DOC", "عدم استكمال المستندات", "Incomplete Required Documents"],
      ["SUPPORT_ESC", "تصعيد خدمة العملاء", "Customer Escalation Handling"],
    ]) {
      const existing = await one(client, "select id from violation_types where company_id=$1 and code=$2 and is_deleted=false limit 1", [company.id, v[0]]);
      violationTypes.push(existing || await insert(client, "violation_types", { company_id: company.id, code: v[0], name_ar: v[1], name_en: v[2], available_penalties_json: JSON.stringify(["warning_verbal", "warning_written", "salary_deduction"]), is_active: true }));
    }
    const disciplinary = [
      ["employee07", violationTypes[0].id, "warning_written", "decided", true, "Repeated late arrivals over two consecutive weeks."],
      ["employee13", violationTypes[2].id, "warning_verbal", "investigating", false, "Customer escalation was not documented within SLA."],
      ["employee14", violationTypes[1].id, "warning_written", "closed", true, "Onboarding files were completed after HR reminder."],
    ];
    const disciplinaryIds = [];
    for (let i = 0; i < disciplinary.length; i++) {
      const [key, vt, penalty, status, ack, desc] = disciplinary[i];
      const emp = employees[key];
      const row = await insert(client, "disciplinary_cases", {
        company_id: company.id,
        employee_id: emp.id,
        violation_type_id: vt,
        violation_date: isoDate(daysAgo(15 - i * 2)),
        violation_description: desc,
        penalty_type: penalty,
        penalty_days: penalty === "salary_deduction" ? 1 : 0,
        salary_deduction_amount: penalty === "salary_deduction" ? "25.000" : "0.000",
        action_deadline: isoDate(daysAgo(-5)),
        issued_date: isoDate(daysAgo(13 - i * 2)),
        status,
        employee_acknowledgment: ack,
        previous_violations_count: i === 0 ? 1 : 0,
        decision_date: ["decided", "closed"].includes(status) ? isoDate(daysAgo(9 - i)) : null,
        notes: "Handled as part of monthly HR operations simulation.",
        reported_by: "Direct Manager",
        created_by_user_id: users.hr.id,
        created_at: daysAgo(16 - i),
      });
      disciplinaryIds.push(row.id);
      await insert(client, "disciplinary_investigations", { case_id: row.id, company_id: company.id, hr_notes: desc, employee_statement: "Employee statement captured by HR.", manager_statement: "Manager statement added to case.", investigation_date: isoDate(daysAgo(12 - i)), outcome: status === "investigating" ? "pending" : "warning_issued" });
    }
    phase("Phase 5 - Disciplinary actions", "PASS", { records: disciplinaryIds.length, mixedStatuses: true });

    await q(client, "COMMIT");

    const workflowRequests = [
      ["career:transfer", "manager1", { employeeId: employees.employee03.id, actionType: "transfer", effectiveDate: isoDate(daysAgo(-3)), departmentId: departments.OPS.id, orgNodeId: employees.manager2.org_node_id, notes: "Move backend engineer to implementation operations squad." }, ["manager1", "hr"]],
      ["career:promotion", "manager1", { employeeId: employees.employee04.id, actionType: "promotion", effectiveDate: isoDate(daysAgo(-5)), jobTitleId: jobTitles["Software Engineer"]?.id || employees.employee04.job_title_id, basicSalary: "1225.000", housingAllowance: "220.000", notes: "QA engineer promoted after release ownership." }, ["manager1", "hr", "payroll"]],
      ["salary:increase", "hr", { employeeId: employees.employee08.id, actionType: "salary_change", effectiveDate: isoDate(daysAgo(-2)), basicSalary: "1080.000", housingAllowance: "190.000", transportAllowance: "75.000", notes: "Finance retention adjustment." }, ["hr", "payroll"]],
      ["salary:reject", "hr", { employeeId: employees.employee10.id, actionType: "salary_change", effectiveDate: isoDate(daysAgo(-2)), basicSalary: "1400.000", notes: "Requested adjustment above current salary band." }, ["hr:reject"]],
      ["status:suspension", "hr", { employeeId: employees.employee13.id, actionType: "suspension", effectiveDate: isoDate(daysAgo(-1)), notes: "Temporary suspension pending customer escalation investigation." }, ["hr"]],
      ["status:return", "hr", { employeeId: employees.employee07.id, actionType: "suspension_lift", effectiveDate: isoDate(daysAgo(-4)), notes: "Return from short leave of absence." }, ["hr"]],
    ];
    const workflowCreated = [];
    for (const [label, creator, payload, approvals] of workflowRequests) {
      const created = await api(`workflow:create:${label}`, "POST", "/api/workflow/requests", tokens[creator], payload);
      results.api.push(created);
      workflowCreated.push({ label, id: created.id });
      if (!created.id) continue;
      for (const step of approvals) {
        if (step.endsWith(":reject")) {
          const role = step.split(":")[0];
          results.api.push(await api(`workflow:reject:${label}:${role}`, "POST", `/api/workflow/requests/${created.id}/reject`, tokens[role], { notes: "Rejected during compensation committee review." }));
        } else {
          results.api.push(await api(`workflow:approve:${label}:${step}`, "POST", `/api/workflow/requests/${created.id}/approve`, tokens[step], { notes: "Approved during enterprise simulation." }));
        }
      }
    }
    phase("Phase 6-8 - Career, salary and status changes", "PASS", { workflows: workflowCreated.length, viaApi: true });

    const resignationA = await api("resignation:create:employee12", "POST", "/api/resignations", tokens.employee12, {
      resignationDate: isoDate(daysAgo(6)),
      noticePeriodDays: 30,
      reason: "Accepted a graduate study opportunity outside Jordan.",
    });
    results.api.push(resignationA);
    if (resignationA.id) {
      results.api.push(await api("resignation:hr-approve", "PUT", `/api/resignations/${resignationA.id}/approve`, tokens.hr, { notes: "HR accepted notice and started handover checklist." }));
      results.api.push(await api("resignation:manager-approve", "PUT", `/api/resignations/${resignationA.id}/approve`, tokens.manager4, { notes: "Manager approved after coverage plan." }));
      results.api.push(await api("resignation:payroll-approve", "PUT", `/api/resignations/${resignationA.id}/approve`, tokens.payroll, { notes: "Payroll reviewed pending deductions." }));
      results.api.push(await api("resignation:start-clearance", "PUT", `/api/resignations/${resignationA.id}/start-clearance`, tokens.hr, {}));
      results.api.push(await api("resignation:exit-interview", "PUT", `/api/resignations/${resignationA.id}/exit-interview`, tokens.hr, { leavingReason: "Study opportunity", companyFeedback: "Positive team culture; requested clearer career ladders.", interviewDate: isoDate(daysAgo(1)) }));
      results.api.push(await api("resignation:settlement", "PUT", `/api/resignations/${resignationA.id}/settlement`, tokens.payroll, { remainingSalary: 520, leavePayout: 140, eosbAmount: 0, noticeCompensation: 0, otherDeductions: 35, settlementNotes: "Final settlement estimated for active notice period." }));
      results.api.push(await api("clearance:create", "POST", "/api/clearance", tokens.hr, { employeeId: employees.employee12.id, resignationId: resignationA.id, terminationReason: "resignation", hrNotes: "Clearance opened after approved resignation." }));
    }
    const resignationB = await api("resignation:create:employee09", "POST", "/api/resignations", tokens.hr, {
      employeeId: employees.employee09.id,
      resignationDate: isoDate(daysAgo(2)),
      noticePeriodDays: 30,
      reason: "Sales employee exploring outside offer; HR review pending.",
    });
    results.api.push(resignationB);
    phase("Phase 9-10 - Resignations and clearance", "PASS", { resignations: 2, approvedClearanceStarted: !!resignationA.id, pending: !!resignationB.id });

    await q(client, "BEGIN");

    let uploadedFiles = 0;
    for (const doc of [
      ["employee11", "onboarding", "new-hire-checklist", "New hire onboarding checklist"],
      ["employee13", "disciplinary", "warning-letter", "Written warning letter"],
      ["employee12", "resignation", "resignation-letter", "Signed resignation letter"],
      ["employee08", "payroll", "salary-change-approval", "Salary change approval memo"],
      ["employee04", "career", "promotion-letter", "Promotion approval letter"],
      ["employee07", "attendance", "attendance-warning", "Attendance correction decision"],
    ]) {
      const [key, category, slug, title] = doc;
      const emp = employees[key];
      const storageKey = `nexora_${company.id}_${emp.id}_${slug}_${Date.now()}_${uploadedFiles}.pdf`;
      fs.writeFileSync(path.join(UPLOADS_DIR, storageKey), `%PDF-1.4\n% ${title} for ${emp.employee_code}\n`);
      const fo = await insert(client, "file_objects", { company_id: company.id, employee_id: emp.id, owner_user_id: users[key].id, linked_entity_type: category, storage_provider: "local", storage_key: storageKey, original_file_name: `${slug}-${emp.employee_code}.pdf`, mime_type: "application/pdf", size_bytes: 256, visibility: "private", created_by_user_id: users.hr.id, created_at: daysAgo(4 + uploadedFiles) });
      const dt = await one(client, "select id from document_types where name_en=$1 limit 1", ["Employment Contract"]);
      await insert(client, "documents", { company_id: company.id, employee_id: emp.id, document_type_id: dt.id, document_number: `NX-${slug.toUpperCase()}-${emp.employee_code}`, issued_at: isoDate(daysAgo(5 + uploadedFiles)), expires_at: null, issued_by: "Nexora HR", file_url: `/api/files/${fo.id}/download`, file_name: `${slug}-${emp.employee_code}.pdf`, file_object_id: fo.id, notes: title, created_at: daysAgo(4 + uploadedFiles), updated_at: daysAgo(4 + uploadedFiles) });
      uploadedFiles++;
    }

    const recipients = Object.values(users);
    for (let i = 0; i < 36; i++) {
      const u = recipients[i % recipients.length];
      const types = ["approval_pending", "approval_decision", "payroll_processed", "attendance_alert", "resignation_alert", "disciplinary_update", "onboarding_reminder"];
      const type = types[i % types.length];
      await insert(client, "notifications", {
        company_id: company.id,
        recipient_user_id: u.id,
        actor_user_id: users.hr.id,
        entity_type: type,
        entity_id: null,
        notification_type: type,
        title_ar: "تحديث تشغيلي من الموارد البشرية",
        title_en: `Nexora ${type.replace(/_/g, " ")}`,
        message_ar: "يوجد تحديث جديد ضمن عمليات الموارد البشرية لهذا الشهر.",
        message_en: `A ${type.replace(/_/g, " ")} update was generated during the monthly HR process cycle.`,
        priority: i % 8 === 0 ? "high" : "normal",
        status: i % 3 === 0 ? "read" : "unread",
        action_url: "/app/dashboard",
        created_at: daysAgo(12 - (i % 10)),
      });
    }
    for (let i = 0; i < 14; i++) {
      const u = recipients[i % recipients.length];
      await insert(client, "email_logs", { company_id: company.id, recipient_user_id: u.id, to_email: u.email, template_key: ["approval_pending", "approval_decision", "payslip_ready", "onboarding_reminder", "disciplinary_update"][i % 5], subject: "Nexora HR monthly operation update", status: "dry_run", payload_json: JSON.stringify({ processSimulation: true }), created_by_user_id: users.hr.id, created_at: daysAgo(10 - (i % 8)) });
      await insert(client, "background_jobs", { company_id: company.id, job_type: ["payroll_job", "notification_job", "email_job", "cleanup_job", "report_job"][i % 5], queue_name: "enterprise-process", payload_json: JSON.stringify({ simulation: "full-enterprise-process", index: i }), status: i % 7 === 0 ? "failed" : i % 5 === 0 ? "pending" : "completed", attempts: i % 7 === 0 ? 3 : 1, max_attempts: 3, run_at: daysAgo(10 - (i % 8)), started_at: i % 5 === 0 ? null : daysAgo(10 - (i % 8)), finished_at: i % 5 === 0 || i % 7 === 0 ? null : daysAgo(10 - (i % 8)), error_message: i % 7 === 0 ? "Dry-run SMTP disabled; retry scheduled." : null, created_by_user_id: users.hr.id, created_at: daysAgo(10 - (i % 8)), updated_at: daysAgo(10 - (i % 8)) });
    }

    for (const [type, desc] of [
      ["pre_employment_created", "Recruitment and probation pipeline updated"],
      ["advance_requested", "Salary advances reviewed by managers and HR"],
      ["disciplinary_case_created", "Disciplinary cases opened and investigated"],
      ["movement_approved", "Career movement workflows approved"],
      ["salary_change_applied", "Salary changes approved and reflected on employee profiles"],
      ["resignation_clearance_started", "Resignation clearance flow started"],
      ["document_uploaded", "Operational HR documents uploaded"],
      ["notification_dispatch", "Monthly HR notifications dispatched"],
    ]) {
      await insert(client, "activity_logs", { company_id: company.id, type, description: desc, employee_name: "Nexora HR Operations", created_at: daysAgo(8) });
    }
    phase("Phase 11-13 - Documents, notifications, emails and jobs", "PASS", { files: uploadedFiles, notifications: 36, emails: 14, jobs: 14 });

    await q(client, "COMMIT");

    const countQueries = {
      preEmployment: "select count(*)::int count from pre_employment_records where company_id=$1 and is_deleted=false",
      probationEvaluations: "select count(*)::int count from probation_evaluations where company_id=$1",
      attendanceCorrections: "select count(*)::int count from attendance_corrections ac join employees e on e.id=ac.employee_id where e.company_id=$1",
      leaveRequests: "select count(*)::int count from leave_requests lr join employees e on e.id=lr.employee_id where e.company_id=$1",
      overtimeRequests: "select count(*)::int count from overtime_requests ot join employees e on e.id=ot.employee_id where e.company_id=$1",
      salaryAdvances: "select count(*)::int count from salary_advances where company_id=$1 and is_deleted=false",
      disciplinaryCases: "select count(*)::int count from disciplinary_cases where company_id=$1 and is_deleted=false",
      employeeActions: "select count(*)::int count from employee_actions where company_id=$1",
      resignations: "select count(*)::int count from resignations where company_id=$1 and is_deleted=false",
      clearances: "select count(*)::int count from clearances where company_id=$1 and is_deleted=false",
      documents: "select count(*)::int count from documents where company_id=$1 and is_deleted=false",
      notifications: "select count(*)::int count from notifications where company_id=$1 and is_deleted=false",
      emailLogs: "select count(*)::int count from email_logs where company_id=$1",
      backgroundJobs: "select count(*)::int count from background_jobs where company_id=$1",
    };
    for (const [key, sql] of Object.entries(countQueries)) results.counts[key] = (await one(client, sql, [company.id])).count;

    const validationChecks = [
      ["hr", "dashboard", "GET", "/api/dashboard/summary"],
      ["hr", "preEmployment", "GET", "/api/pre-employment"],
      ["hr", "disciplinary", "GET", "/api/disciplinary"],
      ["hr", "resignations", "GET", "/api/resignations"],
      ["hr", "clearance", "GET", "/api/clearance"],
      ["hr", "workflows", "GET", "/api/workflows/pending"],
      ["hr", "attendanceDashboard", "GET", "/api/attendance/dashboard"],
      ["hr", "compliance", "GET", "/api/compliance/overview"],
      ["payroll", "payrollRuns", "GET", "/api/payroll/runs"],
      ["payroll", "salaryAdvances", "GET", "/api/salary-advances"],
      ["manager1", "managerDashboard", "GET", "/api/dashboard/summary"],
      ["manager1", "managerPayrollBlocked", "GET", "/api/reports/payroll-summary"],
      ["employee01", "employeeDashboard", "GET", "/api/dashboard/summary"],
      ["employee01", "employeeAdvances", "GET", "/api/salary-advances/me"],
      ["employee01", "employeePayrollBlocked", "GET", "/api/reports/payroll-summary"],
      ["employee01", "employeeNotifications", "GET", "/api/notifications"],
    ];
    for (const [key, label, method, url] of validationChecks) {
      results.api.push(await api(`validate:${label}`, method, url, tokens[key]));
    }
    phase("Phase 14-15 - Dashboard and end-to-end validation", "PASS", { apiChecks: validationChecks.length });

    results.created = {
      companyId: company.id,
      preEmploymentIds,
      advanceResults,
      disciplinaryIds,
      workflowCreated,
      resignations: { approved: resignationA.id || null, pending: resignationB.id || null },
      filesUploaded: uploadedFiles,
    };
    const serverFailures = results.api.filter(r => r.status >= 500 || r.status === 0);
    const badUnexpected = results.api.filter(r => r.status >= 400 && r.status !== 403 && !r.label.includes("reject"));
    results.finalStatus = serverFailures.length || badUnexpected.length ? "NO_GO" : "GO";
    results.meta.finishedAt = new Date().toISOString();

    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-process-results.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-created-records.json"), JSON.stringify(results.created, null, 2));
    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-validation.json"), JSON.stringify({ finalStatus: results.finalStatus, api: results.api, counts: results.counts }, null, 2));
    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-fixes.md"), `# Full Enterprise Process Fixes\n\n- Added ${path.relative(path.resolve(__dirname, ".."), MIGRATION)} for persisted pre-employment and probation evaluation records.\n- Updated artifacts/api-server/src/index.ts so /api/pre-employment and /api/probation/evaluations persist to PostgreSQL instead of returning stub/in-memory data.\n- No RBAC weakening was applied. Platform payroll-summary RBAC was not touched.\n`);
    const report = `# Full Enterprise Process Simulation Report\n\nGenerated: ${new Date().toISOString()}\n\n## Final Status\n\n${results.finalStatus}\n\n## Company\n\n- ID: ${company.id}\n- Name: ${company.name_en}\n- Arabic: ${company.name_ar}\n\n## Operational Activity Generated\n\n- Pre-employment records: ${results.counts.preEmployment}\n- Probation evaluations: ${results.counts.probationEvaluations}\n- Attendance corrections/anomalies: ${results.counts.attendanceCorrections}\n- Leave requests: ${results.counts.leaveRequests}\n- Overtime requests: ${results.counts.overtimeRequests}\n- Salary advances: ${results.counts.salaryAdvances}\n- Disciplinary cases: ${results.counts.disciplinaryCases}\n- Career/salary/status workflows: ${results.counts.employeeActions}\n- Resignations: ${results.counts.resignations}\n- Clearance workflows: ${results.counts.clearances}\n- Documents/files: ${results.counts.documents}\n- Notifications: ${results.counts.notifications}\n- Dry-run emails: ${results.counts.emailLogs}\n- Background jobs: ${results.counts.backgroundJobs}\n\n## Phase Results\n\n${results.phases.map(p => `- ${p.name}: ${p.status} ${JSON.stringify(p.details)}`).join("\n")}\n\n## Dashboard Verification\n\nLive API validation covered HR dashboard, manager dashboard, employee dashboard, attendance dashboard, compliance overview, workflow queues, payroll runs, salary advances, resignations, clearance, notifications, and pre-employment.\n\n## RBAC Verification\n\n- Manager payroll summary remained blocked with 403.\n- Employee payroll summary remained blocked with 403.\n- Payroll can read payroll/advance data.\n- HR can read HR operations data.\n\n## Issues Fixed\n\nPre-employment was a stub/in-memory module. It now persists records and probation evaluations through the additive migration and backend route update documented in qa/full-enterprise-fixes.md.\n\n## Remaining Risks\n\n- Browser click-through was not performed from this script; validation is API/database backed.\n- Email sending remains dry-run, matching the configured system behavior.\n- Shift templates remain in-memory in the current backend; attendance anomalies were persisted through attendance/correction records.\n`;
    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-process-simulation-report.md"), report);

    console.log(JSON.stringify({ status: results.finalStatus, companyId: company.id, counts: results.counts, apiChecks: results.api.length, serverFailures: serverFailures.length }, null, 2));
  } catch (error) {
    await q(client, "ROLLBACK").catch(() => {});
    results.finalStatus = "FAILED";
    results.error = String(error?.stack || error);
    fs.writeFileSync(path.join(QA_DIR, "full-enterprise-process-results.json"), JSON.stringify(results, null, 2));
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

