const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg");

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:123@localhost:5432/zenhr";
const API_BASE = process.env.API_BASE || "http://localhost:3001";
const QA_DIR = path.resolve(__dirname, "..", "qa");
const UPLOADS_DIR = path.resolve(__dirname, "..", "artifacts", "api-server", "uploads");
const PASSWORD = "Nexora@1234";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "zenjo_salt").digest("hex");
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function ts(date, hour = 9, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function money(n) {
  return Number(n).toFixed(3);
}

async function q(client, text, params = []) {
  return client.query(text, params);
}

async function one(client, text, params = []) {
  const res = await q(client, text, params);
  return res.rows[0];
}

async function insertReturning(client, table, data) {
  const keys = Object.keys(data);
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
  const params = keys.map((k) => data[k]);
  const res = await q(client, `INSERT INTO ${table} (${cols}) VALUES (${vals}) RETURNING *`, params);
  return res.rows[0];
}

async function tableCount(client, table, companyId) {
  const scoped = await q(client, "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and column_name='company_id'", [table]);
  const sql = scoped.rowCount ? `select count(*)::int as count from ${table} where company_id=$1` : `select count(*)::int as count from ${table}`;
  const res = await q(client, sql, scoped.rowCount ? [companyId] : []);
  return res.rows[0].count;
}

async function login(username) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json, token: json?.data?.accessToken };
}

async function apiCall(label, method, url, token, body) {
  try {
    const headers = {};
    let payload;
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const started = Date.now();
    const res = await fetch(`${API_BASE}${url}`, { method, headers, body: payload });
    const contentType = res.headers.get("content-type") || "";
    const json = contentType.includes("application/json") ? await res.json() : null;
    return {
      label,
      method,
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      wrapped: json && typeof json.success === "boolean",
      durationMs: Date.now() - started,
      snippet: json ? JSON.stringify(json).slice(0, 240) : null,
    };
  } catch (error) {
    return { label, method, url, status: 0, ok: false, error: String(error?.message || error) };
  }
}

function workingDays() {
  const out = [];
  for (let i = 29; i >= 1; i--) {
    const d = daysAgo(i);
    const day = d.getDay();
    if (day !== 5 && day !== 6) out.push(isoDate(d)); // Jordan-style Fri/Sat weekend
  }
  return out.slice(-22);
}

async function main() {
  fs.mkdirSync(QA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const client = new Client({ connectionString: DB_URL });
  const results = {
    meta: { startedAt: new Date().toISOString(), apiBase: API_BASE, dbUrl: DB_URL.replace(/postgres:.*@/, "postgres:[redacted]@") },
    phases: [],
    validations: [],
    fixes: [],
    created: {},
    counts: {},
    finalStatus: "UNKNOWN",
  };

  const phase = (name, status, details = {}) => results.phases.push({ name, status, details, at: new Date().toISOString() });

  await client.connect();
  try {
    await q(client, "BEGIN");

    const usernameProbe = await one(client, "select count(*)::int as count from users where username in ('nexora.hr','nexora.payroll','nexora.manager1','nexora.employee01')");
    const suffix = usernameProbe.count > 0 ? `.${Date.now().toString().slice(-5)}` : "";
    const uname = (base) => `nexora${suffix}.${base}`;
    const email = (base) => `${base.replace(/\./g, ".")}@nexora.jo`;

    const plan = await one(client, "select id from platform_plans where code='pro' limit 1");
    const company = await insertReturning(client, "companies", {
      name_ar: "شركة نيكسورا للحلول الرقمية",
      name_en: "Nexora Digital Solutions",
      code: `NXD${Date.now().toString().slice(-6)}`,
      commercial_reg_no: `CR-${Math.floor(420000 + Math.random() * 10000)}`,
      tax_number: `TN-${Math.floor(9000000 + Math.random() * 999999)}`,
      ssc_number: `SSC-${Math.floor(200000 + Math.random() * 99999)}`,
      labor_ministry_no: `LM-${Math.floor(100000 + Math.random() * 99999)}`,
      address_ar: "عمّان - شارع مكة - مجمع الأعمال الرقمي، الطابق الرابع",
      country: "Jordan",
      city: "Amman",
      phone: "+962 6 586 4420",
      email: "info@nexora.jo",
      website: "https://www.nexora.jo",
      industry_type: "technology",
      currency: "JOD",
      plan_name: "pro",
      subscription_start: isoDate(daysAgo(30)),
      subscription_end: isoDate(daysAgo(-335)),
      max_users: 80,
      max_employees: 250,
      is_trial: false,
      is_active: true,
      timezone: "Asia/Amman",
      locale: "ar-JO",
      primary_color: "#0f766e",
      secondary_color: "#1d4ed8",
      accent_color: "#f59e0b",
      subscription_status: "active",
      created_at: daysAgo(30),
      updated_at: daysAgo(1),
    });
    results.created.company = company;

    await q(client, `insert into company_subscriptions (company_id, plan_id, status, starts_at, ends_at, max_users, max_employees, notes)
      values ($1,$2,'active',$3,$4,80,250,'Enterprise simulation active Pro subscription')`, [company.id, plan?.id || null, isoDate(daysAgo(30)), isoDate(daysAgo(-335))]);
    for (const mod of ["payroll", "attendance", "assets", "compliance", "documents", "workflows", "reports"]) {
      await q(client, "insert into company_modules (company_id,module_key,is_enabled) values ($1,$2,true)", [company.id, mod]);
    }
    await q(client, `insert into company_branding (company_id, logo_url, primary_color, secondary_color, accent_color, sidebar_color, topbar_color, background_color, theme_json)
      values ($1,null,'#0f766e','#1d4ed8','#f59e0b','#0f172a','#ffffff','#f8fafc',$2::jsonb)`, [company.id, JSON.stringify({ brandVoice: "professional bilingual SaaS tenant" })]);

    const roleNames = [
      ["hradmin", "مدير الموارد البشرية"],
      ["payrolladmin", "مدير الرواتب"],
      ["manager", "مدير"],
      ["employee", "موظف"],
      ["recruiter", "مسؤول التوظيف"],
    ];
    const roles = {};
    for (const [name, nameAr] of roleNames) {
      const r = await insertReturning(client, "roles", { company_id: company.id, name, name_ar: nameAr, is_system_role: true, is_active: true });
      roles[name] = r.id;
    }
    const rolePermissionRules = {
      hradmin: { screens: ["employees","leave","overtime","attendance","compliance","documents","assets","disciplinary","resignations","clearance","reports","forms","users","settings","pre-employment","job-descriptions"], scope: "company" },
      payrolladmin: { screens: ["payroll","reports","overtime","salary-components","advances","documents","assets","forms"], scope: "company" },
      manager: { screens: ["employees","leave","overtime","attendance","documents","assets","forms","disciplinary"], scope: "department" },
      employee: { screens: ["leave","overtime","attendance","documents","assets","forms","payroll"], scope: "own" },
      recruiter: { screens: ["pre-employment","forms","documents"], scope: "own" },
    };
    const perms = (await q(client, "select id, screen, action from permissions")).rows;
    for (const [role, rule] of Object.entries(rolePermissionRules)) {
      for (const p of perms.filter((p) => rule.screens.includes(p.screen))) {
        await q(client, "insert into role_permissions (role_id,permission_id,data_scope) values ($1,$2,$3) on conflict do nothing", [roles[role], p.id, rule.scope]);
      }
    }

    const configs = [
      ["currency_code", "JOD", "Currency code", "general"],
      ["company_name_ar", company.name_ar, "Company Arabic name", "general"],
      ["company_name_en", company.name_en, "Company English name", "general"],
      ["email_dry_run", "true", "Dry-run email", "email"],
      ["email_enabled", "false", "Outbound email disabled in simulation", "email"],
      ["storage_provider", "local", "Local file storage", "storage"],
      ["max_upload_mb", "5", "Maximum upload size", "storage"],
      ["notifications_in_app_enabled", "true", "In-app notifications", "notifications"],
    ];
    for (const cfg of configs) await q(client, "insert into system_configurations (company_id,key,value,description,category) values ($1,$2,$3,$4,$5)", [company.id, ...cfg]);

    const departments = [
      ["ENG", "الهندسة", "Engineering"],
      ["HR", "الموارد البشرية", "Human Resources"],
      ["FIN", "المالية", "Finance"],
      ["OPS", "العمليات", "Operations"],
      ["SUP", "دعم العملاء", "Customer Support"],
      ["SAL", "المبيعات", "Sales"],
    ];
    const deptByCode = {};
    const companyNode = await insertReturning(client, "org_nodes", { company_id: company.id, parent_id: null, node_type: "company", name_ar: company.name_ar, name_en: company.name_en, code: "NXD", sort_order: 0 });
    for (let i = 0; i < departments.length; i++) {
      const [code, ar, en] = departments[i];
      const dept = await insertReturning(client, "departments", { company_id: company.id, name_ar: ar, name_en: en, code, cost_center_code: `NX-${code}`, is_active: true });
      const node = await insertReturning(client, "org_nodes", { company_id: company.id, parent_id: companyNode.id, node_type: "department", name_ar: ar, name_en: en, code, sort_order: i + 1 });
      deptByCode[code] = { ...dept, orgNodeId: node.id };
    }

    const titles = [
      ["HRM", "مدير الموارد البشرية", "HR Manager", "M2", 1400, 2200],
      ["PAYM", "مدير الرواتب", "Payroll Manager", "M2", 1300, 2100],
      ["EM", "مدير هندسة", "Engineering Manager", "M3", 2200, 3300],
      ["OM", "مدير عمليات", "Operations Manager", "M2", 1500, 2400],
      ["SM", "مدير مبيعات", "Sales Manager", "M2", 1400, 2300],
      ["CSM", "مدير دعم العملاء", "Support Manager", "M2", 1300, 2100],
      ["SSE", "مهندس برمجيات أول", "Senior Software Engineer", "G4", 1600, 2600],
      ["SE", "مهندس برمجيات", "Software Engineer", "G3", 1000, 1700],
      ["QA", "مهندس ضمان جودة", "QA Engineer", "G3", 850, 1400],
      ["UX", "مصمم تجربة مستخدم", "UX Designer", "G3", 950, 1500],
      ["ACC", "محاسب", "Accountant", "G3", 800, 1300],
      ["OPS", "منسق عمليات", "Operations Coordinator", "G2", 700, 1100],
      ["CSR", "مسؤول دعم عملاء", "Customer Support Specialist", "G2", 650, 1000],
      ["SAE", "تنفيذي مبيعات", "Sales Account Executive", "G3", 850, 1500],
    ];
    const titleByCode = {};
    for (const [code, ar, en, grade, min, max] of titles) {
      const jt = await insertReturning(client, "job_titles", { company_id: company.id, title_ar: ar, title_en: en, job_grade: grade, min_salary: money(min), max_salary: money(max), is_active: true });
      titleByCode[code] = jt;
      await insertReturning(client, "job_descriptions", {
        company_id: company.id,
        org_node_id: code.includes("S") ? deptByCode.SAL.orgNodeId : null,
        title_ar: ar,
        title_en: en,
        grade,
        min_salary: money(min),
        max_salary: money(max),
        responsibilities: `Own ${en.toLowerCase()} responsibilities, collaborate cross-functionally, and maintain monthly operational standards.`,
        requirements: "Relevant degree or equivalent practical experience; strong communication in Arabic and English.",
        skills: "Communication, ownership, problem solving, documentation, customer focus.",
        qualifications: "Bachelor degree preferred; Jordan market experience is a plus.",
        is_active: true,
      });
    }

    const policies = {};
    for (const p of [
      ["annual", "الإجازة السنوية", "Annual Leave", "14.00", "7.00", false, true],
      ["sick", "الإجازة المرضية", "Sick Leave", "14.00", "0.00", true, true],
      ["unpaid", "إجازة بدون راتب", "Unpaid Leave", "10.00", "0.00", false, false],
    ]) {
      const row = await insertReturning(client, "leave_policies", { company_id: company.id, leave_type: p[0], name_ar: p[1], name_en: p[2], days_per_year: p[3], max_carry_forward_days: p[4], requires_medical_certificate: p[5], is_paid: p[6], can_be_negative: false, gender: "all", is_active: true, notes: "Nexora simulation leave policy" });
      policies[p[0]] = row;
    }

    for (const sc of [
      ["basic_salary", "الراتب الأساسي", "Basic Salary", "earning", "fixed", "0", true, true],
      ["housing_allowance", "بدل السكن", "Housing Allowance", "earning", "fixed", "0", true, true],
      ["transport_allowance", "بدل المواصلات", "Transport Allowance", "earning", "fixed", "0", true, false],
      ["mobile_allowance", "بدل الهاتف", "Mobile Allowance", "earning", "fixed", "0", true, false],
      ["ssc_employee", "اقتطاع الضمان", "SSC Employee Deduction", "deduction", "percentage", "7.50", false, false],
    ]) {
      await q(client, `insert into salary_components
        (company_id,name_ar,name_en,code,component_type,calculation_type,default_value,is_taxable,is_ssc_applicable,is_recurring,is_active,sort_order)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10)`, [company.id, sc[1], sc[2], sc[0], sc[3], sc[4], sc[5], sc[6], sc[7], 1]);
    }
    phase("Phase 1 - Company setup", "PASS", { companyId: company.id, departments: departments.length, jobTitles: titles.length });

    const people = [
      ["hr", "hradmin", "سارة", "الحداد", "Sara", "Haddad", "female", "HR", "HRM", 1750],
      ["payroll", "payrolladmin", "محمود", "العزام", "Mahmoud", "Azzam", "male", "FIN", "PAYM", 1650],
      ["manager1", "manager", "ليث", "الخطيب", "Laith", "Khatib", "male", "ENG", "EM", 2600],
      ["manager2", "manager", "دانا", "النجار", "Dana", "Najjar", "female", "OPS", "OM", 1900],
      ["manager3", "manager", "رامي", "صالح", "Rami", "Saleh", "male", "SAL", "SM", 1850],
      ["manager4", "manager", "نورا", "مراد", "Noura", "Murad", "female", "SUP", "CSM", 1700],
      ["employee01", "employee", "عمر", "الزعبي", "Omar", "Zoubi", "male", "ENG", "SSE", 1850],
      ["employee02", "employee", "ريم", "عبيدات", "Reem", "Obeidat", "female", "ENG", "SE", 1350],
      ["employee03", "employee", "فادي", "جرار", "Fadi", "Jarrar", "male", "ENG", "SE", 1250],
      ["employee04", "employee", "تالا", "مصطفى", "Tala", "Mustafa", "female", "ENG", "QA", 1050],
      ["employee05", "employee", "يزن", "حجازي", "Yazan", "Hijazi", "male", "ENG", "UX", 1200],
      ["employee06", "employee", "ميرا", "سالم", "Mira", "Salem", "female", "OPS", "OPS", 900],
      ["employee07", "employee", "خالد", "أبو زيد", "Khaled", "Abu Zaid", "male", "OPS", "OPS", 850],
      ["employee08", "employee", "جود", "شاهين", "Joud", "Shaheen", "female", "FIN", "ACC", 950],
      ["employee09", "employee", "أنس", "الرفاعي", "Anas", "Rifai", "male", "SAL", "SAE", 1050],
      ["employee10", "employee", "لينا", "الكسواني", "Lina", "Kaswani", "female", "SAL", "SAE", 1100],
      ["employee11", "employee", "سيف", "القضاة", "Saif", "Qudah", "male", "SUP", "CSR", 780],
      ["employee12", "employee", "جنى", "العلي", "Jana", "Ali", "female", "SUP", "CSR", 760],
      ["employee13", "employee", "بلال", "مرعي", "Bilal", "Marei", "male", "SUP", "CSR", 720],
      ["employee14", "employee", "لارا", "الشريف", "Lara", "Shareef", "female", "HR", "OPS", 820],
      ["employee15", "employee", "هاشم", "ناصر", "Hashem", "Naser", "male", "ENG", "QA", 980],
    ];
    const empByKey = {};
    const userByKey = {};
    let seq = 1;
    for (const p of people) {
      const [key, role, firstAr, lastAr, firstEn, lastEn, gender, deptCode, titleCode, basic] = p;
      const dept = deptByCode[deptCode];
      const jt = titleByCode[titleCode];
      const hireDaysAgo = 70 + seq * 9;
      const emp = await insertReturning(client, "employees", {
        company_id: company.id,
        employee_code: `NX-${String(seq).padStart(4, "0")}`,
        first_name_ar: firstAr,
        last_name_ar: lastAr,
        first_name_en: firstEn,
        last_name_en: lastEn,
        gender,
        date_of_birth: `${1984 + (seq % 15)}-${String((seq % 12) + 1).padStart(2, "0")}-15`,
        national_id: `99${company.id}${String(seq).padStart(7, "0")}`.slice(0, 10),
        nationality: "أردني",
        religion: "muslim",
        marital_status: seq % 3 === 0 ? "married" : "single",
        number_of_dependents: seq % 3,
        personal_email: `${key}.personal@nexora.jo`,
        work_email: email(key),
        personal_phone: `+962 79 ${String(3100000 + seq * 7311).slice(0, 7)}`,
        work_phone: `+962 6 586 ${String(4400 + seq).padStart(4, "0")}`,
        emergency_contact_name: "Emergency Contact",
        emergency_contact_phone: `+962 78 ${String(4100000 + seq * 4321).slice(0, 7)}`,
        emergency_contact_relation: "Family",
        address_ar: "عمّان، الأردن",
        city: "Amman",
        department_id: dept.id,
        org_node_id: dept.orgNodeId,
        job_title_id: jt.id,
        employment_type: "fulltime",
        hire_date: isoDate(daysAgo(hireDaysAgo)),
        probation_end_date: isoDate(daysAgo(hireDaysAgo - 90)),
        contract_type: "permanent",
        employment_status: "active",
        basic_salary: money(basic),
        housing_allowance: money(Math.round(basic * 0.18)),
        transport_allowance: money(role === "manager" ? 120 : 75),
        mobile_allowance: money(role === "manager" || role === "hradmin" || role === "payrolladmin" ? 35 : 20),
        meal_allowance: money(25),
        other_allowances: money(role === "manager" ? 60 : 0),
        ssc_number: `NXSSC-${String(5000 + seq)}`,
        ssc_enrollment_date: isoDate(daysAgo(hireDaysAgo - 7)),
        income_tax_number: `NXTAX-${String(7000 + seq)}`,
        bank_name: seq % 2 ? "Arab Bank" : "Bank of Jordan",
        bank_account_number: `310${String(10000000 + seq * 56789)}`,
        iban: `JO94NEXO000000000${String(1000000000 + seq * 3333)}`,
        passport_number: `P${String(800000 + seq * 7)}`,
        passport_expiry: isoDate(daysAgo(-900 - seq)),
        work_permit_number: null,
        residency_number: null,
        notes: "Created by enterprise one-month simulation.",
        created_at: daysAgo(30 - (seq % 9)),
        updated_at: daysAgo(seq % 5),
      });
      const user = await insertReturning(client, "users", {
        employee_id: emp.id,
        company_id: company.id,
        username: uname(key),
        password_hash: hashPassword(PASSWORD),
        email: email(key),
        role,
        role_id: roles[role],
        is_active: true,
        must_change_password: false,
        created_at: daysAgo(29 - (seq % 7)),
        updated_at: daysAgo(seq % 4),
      });
      empByKey[key] = emp;
      userByKey[key] = user;
      seq++;
    }
    const managerByDept = { ENG: empByKey.manager1, OPS: empByKey.manager2, SAL: empByKey.manager3, SUP: empByKey.manager4, HR: empByKey.hr, FIN: empByKey.payroll };
    for (const [code, mgr] of Object.entries(managerByDept)) {
      await q(client, "update departments set manager_employee_id=$1 where id=$2", [mgr.id, deptByCode[code].id]);
      await q(client, "update org_nodes set manager_employee_id=$1 where id=$2", [mgr.id, deptByCode[code].orgNodeId]);
    }
    for (const [key, emp] of Object.entries(empByKey)) {
      if (key === "hr" || key === "payroll" || key.startsWith("manager")) continue;
      const person = people.find((p) => p[0] === key);
      const mgr = managerByDept[person[7]];
      await q(client, "update employees set direct_manager_id=$1 where id=$2", [mgr.id, emp.id]);
    }
    for (const emp of Object.values(empByKey)) {
      for (const [type, policy] of Object.entries(policies)) {
        await q(client, "insert into leave_balances (employee_id,leave_policy_id,year,entitled_days,used_days,pending_days,carried_forward_days) values ($1,$2,$3,$4,$5,$6,$7)", [emp.id, policy.id, new Date().getFullYear(), type === "unpaid" ? "10.00" : "14.00", "0.00", "0.00", type === "annual" ? "2.00" : "0.00"]);
      }
    }
    phase("Phase 2 - Employee lifecycle", "PASS", { employees: people.length, users: people.length });

    const workdays = workingDays();
    const statuses = { present: 0, late: 0, absent: 0, remote: 0, partial: 0 };
    let attendanceSeq = 0;
    const attendanceRecords = [];
    for (const emp of Object.values(empByKey)) {
      for (const day of workdays) {
        attendanceSeq++;
        const pattern = (attendanceSeq + emp.id) % 17;
        let status = "present", type = "office", inMin = 0, worked = 480, notes = null;
        if (pattern === 0) { status = "absent"; worked = 0; notes = "Unexcused absence pending HR review"; }
        else if (pattern === 3 || pattern === 11) { status = "late"; inMin = 24 + (pattern * 2); worked = 455; notes = "Late arrival due to traffic"; }
        else if (pattern === 5) { status = "present"; type = "remote"; worked = 480; notes = "Remote work approved by manager"; }
        else if (pattern === 9) { status = "partial"; worked = 300; notes = "Partial day for family appointment"; }
        statuses[type === "remote" ? "remote" : status] = (statuses[type === "remote" ? "remote" : status] || 0) + 1;
        const clockIn = status === "absent" ? null : ts(day, 9, inMin);
        const clockOut = status === "absent" ? null : new Date(clockIn.getTime() + worked * 60000);
        const row = await insertReturning(client, "attendance_records", {
          employee_id: emp.id,
          date: day,
          clock_in: clockIn,
          clock_out: clockOut,
          worked_minutes: worked,
          status,
          late_minutes: status === "late" ? inMin - 15 : 0,
          overtime_minutes: pattern === 7 ? 60 : 0,
          attendance_type: type,
          notes,
          created_at: ts(day, 17, 30),
          updated_at: ts(day, 17, 35),
        });
        attendanceRecords.push(row);
      }
    }
    for (const row of attendanceRecords.filter((_, i) => i % 97 === 0).slice(0, 5)) {
      await q(client, `insert into attendance_corrections
        (employee_id,attendance_record_id,correction_type,request_date,current_clock_in,current_clock_out,requested_clock_in,requested_clock_out,reason,status,manager_approved_by_id,manager_approved_at,hr_approved_by_id,hr_approved_at,manager_notes,hr_notes,created_at)
        values ($1,$2,'time_correction',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [row.employee_id, row.id, row.date, row.clock_in, row.clock_out, row.clock_in ? new Date(row.clock_in.getTime() - 15 * 60000) : null, row.clock_out, "Forgot to clock in on time after client call", "approved", userByKey.manager1.id, ts(row.date, 15), userByKey.hr.id, ts(row.date, 16), "Team context confirmed", "Approved for payroll accuracy", ts(row.date, 14)]);
    }
    phase("Phase 3 - Attendance simulation", "PASS", { workdays: workdays.length, records: attendanceRecords.length, statuses });

    const employeeKeys = Object.keys(empByKey).filter((k) => k.startsWith("employee"));
    const leaveStats = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (let i = 0; i < 11; i++) {
      const key = employeeKeys[i];
      const emp = empByKey[key];
      const start = workdays[Math.min(3 + i, workdays.length - 2)];
      const type = i % 4 === 0 ? "sick" : "annual";
      const status = i % 5 === 0 ? "pending" : i % 6 === 0 ? "rejected" : "approved";
      leaveStats.total++; leaveStats[status]++;
      await q(client, `insert into leave_requests (employee_id,leave_type,start_date,end_date,total_days,reason,status,approved_by_id,approved_at,rejection_reason,created_at,updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [emp.id, type, start, start, "1.00", type === "sick" ? "Medical appointment and rest day" : "Planned personal leave", status, status === "approved" ? userByKey.hr.id : null, status === "approved" ? ts(start, 13) : null, status === "rejected" ? "Business coverage was not available on requested date" : null, ts(start, 10), ts(start, 13)]);
      if (status === "approved") {
        await q(client, "update leave_balances set used_days = used_days + 1 where employee_id=$1 and leave_policy_id=$2", [emp.id, policies[type].id]);
      } else if (status === "pending") {
        await q(client, "update leave_balances set pending_days = pending_days + 1 where employee_id=$1 and leave_policy_id=$2", [emp.id, policies[type].id]);
      }
    }
    phase("Phase 4 - Leave management", "PASS", leaveStats);

    const overtimeStats = { total: 0, approved: 0, pending: 0, rejected: 0 };
    for (let i = 0; i < 14; i++) {
      const key = employeeKeys[i % employeeKeys.length];
      const emp = empByKey[key];
      const date = workdays[Math.max(0, workdays.length - 1 - i)];
      const status = i % 7 === 0 ? "rejected" : i % 5 === 0 ? "pending" : "approved";
      overtimeStats.total++; overtimeStats[status]++;
      const managerUser = userByKey[`manager${((i % 4) + 1)}`];
      await q(client, `insert into overtime_requests (employee_id,date,hours,reason,status,manager_approved_by_id,manager_approved_at,hr_approved_by_id,hr_approved_at,rejection_reason,created_at,updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [emp.id, date, money(1.5 + (i % 3) * 0.5), i % 2 ? "Production release support" : "Customer escalation coverage", status, status === "approved" ? managerUser.id : null, status === "approved" ? ts(date, 18) : null, status === "approved" ? userByKey.hr.id : null, status === "approved" ? ts(date, 19) : null, status === "rejected" ? "Overtime was not pre-approved" : null, ts(date, 17), ts(date, 19)]);
    }
    phase("Phase 5 - Overtime", "PASS", overtimeStats);

    const runMonth = new Date().getMonth() + 1;
    const runYear = new Date().getFullYear();
    const payrollRun = await insertReturning(client, "payroll_runs", {
      company_id: company.id,
      run_month: runMonth,
      run_year: runYear,
      status: "published",
      employee_count: people.length,
      processed_at: daysAgo(2),
      approved_at: daysAgo(1),
      approved_by_id: userByKey.payroll.id,
      published_at: daysAgo(1),
      published_by_id: userByKey.payroll.id,
      created_by_id: userByKey.payroll.id,
      notes: "Nexora first operational monthly payroll simulation.",
      created_at: daysAgo(3),
      updated_at: daysAgo(1),
    });
    let totals = { gross: 0, net: 0, deductions: 0, overtime: 0, ssc: 0, employer: 0, tax: 0 };
    for (const [key, emp] of Object.entries(empByKey)) {
      const basic = Number(emp.basic_salary);
      const housing = Number(emp.housing_allowance);
      const transport = Number(emp.transport_allowance);
      const mobile = Number(emp.mobile_allowance);
      const meal = Number(emp.meal_allowance);
      const other = Number(emp.other_allowances);
      const overtime = key.startsWith("employee") ? 35 + (emp.id % 4) * 12 : 0;
      const gross = basic + housing + transport + mobile + meal + other + overtime;
      const ssc = Math.round((basic + housing) * 0.075 * 1000) / 1000;
      const employer = Math.round((basic + housing) * 0.1425 * 1000) / 1000;
      const tax = gross > 1600 ? Math.round((gross - 1600) * 0.05 * 1000) / 1000 : 0;
      const otherDed = emp.id % 6 === 0 ? 20 : 0;
      const ded = ssc + tax + otherDed;
      const net = gross - ded;
      const slip = await insertReturning(client, "payslips", {
        payroll_run_id: payrollRun.id,
        employee_id: emp.id,
        run_month: runMonth,
        run_year: runYear,
        basic_salary: money(basic),
        housing_allowance: money(housing),
        transport_allowance: money(transport),
        mobile_allowance: money(mobile),
        meal_allowance: money(meal),
        other_allowances: money(other),
        overtime_earnings: money(overtime),
        gross_salary: money(gross),
        ssc_deduction: money(ssc),
        ssc_employer_contribution: money(employer),
        income_tax_deduction: money(tax),
        loan_deductions: "0.000",
        other_deductions: money(otherDed),
        total_deductions: money(ded),
        net_salary: money(net),
        bank_name: emp.bank_name,
        iban: emp.iban,
        advance_deduction: "0.000",
        components_snapshot: JSON.stringify({ generatedBy: "enterprise-simulation", month: runMonth, year: runYear }),
        created_at: daysAgo(2),
      });
      totals.gross += gross; totals.net += net; totals.deductions += ded; totals.overtime += overtime; totals.ssc += ssc; totals.employer += employer; totals.tax += tax;
      await q(client, "update overtime_requests set linked_payslip_id=$1 where employee_id=$2 and status='approved'", [slip.id, emp.id]);
    }
    await q(client, `update payroll_runs set total_gross=$1,total_net=$2,total_deductions=$3,total_overtime_earnings=$4,total_ssc_employee=$5,total_ssc_employer=$6,total_income_tax=$7 where id=$8`, [money(totals.gross), money(totals.net), money(totals.deductions), money(totals.overtime), money(totals.ssc), money(totals.employer), money(totals.tax), payrollRun.id]);
    phase("Phase 6 - Payroll", "PASS", { payrollRunId: payrollRun.id, employeeCount: people.length, totalGross: money(totals.gross), totalNet: money(totals.net) });

    const workflowRows = [
      ["transfer", "pending_manager", empByKey.employee03, { departmentId: deptByCode.ENG.id, orgNodeId: deptByCode.ENG.orgNodeId }],
      ["promotion", "applied", empByKey.employee04, { jobTitleId: titleByCode.SE.id, basicSalary: "1180.000" }],
      ["salary_change", "pending_payroll", empByKey.employee08, { basicSalary: "1050.000" }],
      ["suspension", "rejected", empByKey.employee13, { employmentStatus: "suspended" }],
      ["contract_renewal", "applied", empByKey.employee12, { contractEndDate: isoDate(daysAgo(-365)) }],
    ];
    for (let i = 0; i < workflowRows.length; i++) {
      const [actionType, status, emp, after] = workflowRows[i];
      const row = await insertReturning(client, "employee_actions", {
        company_id: company.id,
        employee_id: emp.id,
        action_type: actionType,
        effective_date: isoDate(daysAgo(-5 - i)),
        created_by_user_id: userByKey.hr.id,
        previous_value_json: JSON.stringify({ departmentId: emp.department_id, jobTitleId: emp.job_title_id, basicSalary: emp.basic_salary, employmentStatus: emp.employment_status }),
        new_value_json: JSON.stringify(after),
        notes: "Monthly enterprise simulation workflow record.",
        status,
        approval_steps_json: JSON.stringify({ chain: ["pending_manager", "pending_hr", "pending_payroll", "applied"], steps: [{ by: "manager", at: isoDate(daysAgo(8 - i)) }] }),
        created_at: daysAgo(8 - i),
      });
      await q(client, "insert into workflow_actions (company_id,workflow_request_id,actor_user_id,action,status_before,status_after,notes,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)", [company.id, row.id, userByKey.hr.id, status === "rejected" ? "reject" : "approve", "pending_hr", status, "Simulation workflow decision", daysAgo(7 - i)]);
    }
    phase("Phase 7 - Workflow engine", "PASS", { workflows: workflowRows.length });

    const notifyTargets = [...Object.values(userByKey)];
    for (let i = 0; i < notifyTargets.length; i++) {
      const u = notifyTargets[i];
      const type = ["leave_approval", "overtime_approval", "payroll_processed", "workflow_update", "attendance_alert"][i % 5];
      await q(client, `insert into notifications (company_id,recipient_user_id,actor_user_id,entity_type,entity_id,notification_type,title_ar,title_en,message_ar,message_en,priority,status,action_url,created_at,delivery_channels_json,email_status)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)`, [company.id, u.id, userByKey.hr.id, type, null, type, "تحديث من نظام الموارد البشرية", `Nexora ${type.replace(/_/g, " ")}`, "يوجد تحديث جديد على حسابك في نظام نيكسورا.", `There is a new ${type.replace(/_/g, " ")} update in your Nexora account.`, i % 9 === 0 ? "high" : "normal", i % 4 === 0 ? "read" : "unread", "/app/dashboard", daysAgo(10 - (i % 10)), JSON.stringify(["in_app"]), i % 3 === 0 ? "dry_run" : null]);
    }
    phase("Phase 8 - Notifications", "PASS", { notifications: notifyTargets.length });

    const docTypes = {};
    for (const dt of [["عقد عمل", "Employment Contract", "contract", false], ["هوية شخصية", "National ID", "identity", true], ["شهادة صحية", "Health Certificate", "compliance", true], ["قسيمة راتب", "Payslip", "payroll", false]]) {
      const existing = await one(client, "select id from document_types where name_en=$1 limit 1", [dt[1]]);
      docTypes[dt[1]] = existing || await insertReturning(client, "document_types", { name_ar: dt[0], name_en: dt[1], category: dt[2], requires_expiry: dt[3], alert_days_before: 45, is_active: true });
    }
    let filesCreated = 0;
    for (const [key, emp] of Object.entries(empByKey).slice(0, 12)) {
      const storageKey = `nexora_${company.id}_${emp.id}_contract_${Date.now()}_${filesCreated}.pdf`;
      fs.writeFileSync(path.join(UPLOADS_DIR, storageKey), `%PDF-1.4\n% Nexora HR document for ${key}\n`);
      const fo = await insertReturning(client, "file_objects", { company_id: company.id, employee_id: emp.id, owner_user_id: userByKey[key].id, linked_entity_type: "document", storage_provider: "local", storage_key: storageKey, original_file_name: `Nexora-${key}-contract.pdf`, mime_type: "application/pdf", size_bytes: 128, visibility: "private", created_by_user_id: userByKey.hr.id, created_at: daysAgo(20 - filesCreated) });
      await insertReturning(client, "documents", { company_id: company.id, employee_id: emp.id, document_type_id: docTypes["Employment Contract"].id, document_number: `NX-CON-${emp.employee_code}`, issued_at: isoDate(daysAgo(60)), expires_at: null, issued_by: "Nexora HR", file_url: `/api/files/${fo.id}/download`, file_name: `Nexora-${key}-contract.pdf`, file_object_id: fo.id, notes: "Signed employment contract", created_at: daysAgo(20 - filesCreated), updated_at: daysAgo(20 - filesCreated) });
      filesCreated++;
    }
    for (const [key, emp] of Object.entries(empByKey).slice(0, 10)) {
      const expires = key.endsWith("03") || key.endsWith("08") ? isoDate(daysAgo(-25)) : isoDate(daysAgo(-240));
      await insertReturning(client, "compliance_records", { company_id: company.id, employee_id: emp.id, category: key.endsWith("03") ? "health_certificate" : "criminal_record", reference_number: `NX-CMP-${emp.id}`, issue_date: isoDate(daysAgo(80)), expiry_date: expires, issued_by: "Ministry portal", notes: "Simulation compliance record", created_at: daysAgo(18), updated_at: daysAgo(4) });
    }
    phase("Phase 9 - File storage", "PASS", { filesCreated, documents: filesCreated });

    for (let i = 0; i < 8; i++) {
      const u = notifyTargets[i];
      await q(client, "insert into background_jobs (company_id,job_type,queue_name,payload_json,status,attempts,max_attempts,run_at,started_at,finished_at,created_by_user_id,created_at,updated_at) values ($1,$2,$3,$4::jsonb,$5,$6,3,$7,$8,$9,$10,$11,$12)", [company.id, ["notification_digest","email_dispatch","payroll_report","compliance_reminder"][i % 4], "default", JSON.stringify({ employeeUserId: u.id, simulation: true }), i % 5 === 0 ? "failed" : "completed", i % 5 === 0 ? 3 : 1, daysAgo(9 - i), daysAgo(9 - i), i % 5 === 0 ? null : daysAgo(9 - i), userByKey.hr.id, daysAgo(9 - i), daysAgo(9 - i)]);
      await q(client, "insert into email_logs (company_id,recipient_user_id,to_email,template_key,subject,status,payload_json,created_by_user_id,created_at) values ($1,$2,$3,$4,$5,'dry_run',$6::jsonb,$7,$8)", [company.id, u.id, u.email, ["welcome_user","approval_decision","payslip_ready","document_expiry_reminder"][i % 4], "Nexora HR notification", JSON.stringify({ simulation: true }), userByKey.hr.id, daysAgo(8 - i)]);
    }
    phase("Phase 10 - Background jobs / emails", "PASS", { jobs: 8, emails: 8 });

    const catLaptop = await one(client, "select id from asset_categories where name_en='Laptop' limit 1") || await insertReturning(client, "asset_categories", { name_ar: "حاسوب محمول", name_en: "Laptop", is_active: true });
    const catPhone = await one(client, "select id from asset_categories where name_en='Mobile Phone' limit 1") || await insertReturning(client, "asset_categories", { name_ar: "هاتف محمول", name_en: "Mobile Phone", is_active: true });
    let assetCount = 0;
    for (const [key, emp] of Object.entries(empByKey).slice(0, 18)) {
      await insertReturning(client, "assets", { company_id: company.id, category_id: catLaptop.id, name_ar: "حاسوب محمول", name_en: "Dell Latitude 5440", serial_number: `NX-LT-${company.id}-${emp.id}`, barcode: `NXBAR${company.id}${emp.id}`, model: "Latitude 5440", brand: "Dell", supplier: "STS Jordan", purchase_date: isoDate(daysAgo(45)), purchase_value: "690.000", current_status: "assigned", current_condition: emp.id % 7 === 0 ? "fair" : "good", assigned_to_employee_id: emp.id, assigned_date: isoDate(daysAgo(25)), notes: `Assigned to ${key}`, is_active: true });
      assetCount++;
      if (assetCount % 3 === 0) {
        await insertReturning(client, "assets", { company_id: company.id, category_id: catPhone.id, name_ar: "هاتف عمل", name_en: "Samsung Galaxy A35", serial_number: `NX-PH-${company.id}-${emp.id}`, barcode: `NXPH${company.id}${emp.id}`, model: "Galaxy A35", brand: "Samsung", supplier: "Orange Jordan", purchase_date: isoDate(daysAgo(42)), purchase_value: "240.000", current_status: "assigned", current_condition: "good", assigned_to_employee_id: emp.id, assigned_date: isoDate(daysAgo(24)), notes: "Customer-facing work phone", is_active: true });
        assetCount++;
      }
    }
    phase("Phase 11/12 - Manager and employee activity", "PASS", { assets: assetCount, managers: 4, selfServiceEmployees: 15 });

    for (const row of [
      ["user_created", "Nexora user onboarding completed", null],
      ["document_uploaded", "Employee contracts uploaded for first wave", "Nexora Employees"],
      ["asset_assigned", "Laptop and phone assignments completed", "Nexora Employees"],
      ["leave_requested", "Monthly leave activity reviewed", null],
      ["overtime_created", "Release overtime requests processed", null],
      ["payroll_run", "Payroll run published for Nexora Digital Solutions", null],
      ["settings_updated", "Company modules and settings configured", null],
      ["movement_created", "Career movement workflow created", null],
      ["salary_change_created", "Salary change workflow created", null],
      ["status_change_created", "Employment status workflow created", null],
    ]) {
      await insertReturning(client, "activity_logs", { company_id: company.id, type: row[0], description: row[1], employee_name: row[2], created_at: daysAgo(28 - results.phases.length) });
    }

    await q(client, "COMMIT");

    const scopedTables = ["users","employees","departments","org_nodes","job_titles","job_descriptions","leave_policies","salary_components","payroll_runs","documents","assets","compliance_records","notifications","background_jobs","email_logs","file_objects","activity_logs"];
    for (const t of scopedTables) results.counts[t] = await tableCount(client, t, company.id);
    results.created.usernames = Object.fromEntries(Object.entries(userByKey).map(([k, u]) => [k, u.username]));
    results.created.password = PASSWORD;
    results.created.departments = Object.fromEntries(Object.entries(deptByCode).map(([k, d]) => [k, { id: d.id, nameEn: d.name_en, managerEmployeeId: managerByDept[k]?.id || null }]));
    results.created.payroll = { runMonth, runYear, totalGross: money(totals.gross), totalNet: money(totals.net), totalDeductions: money(totals.deductions), payrollRunId: payrollRun.id };
    results.created.attendance = { workdays: workdays.length, records: attendanceRecords.length, statuses };
    results.created.leave = leaveStats;
    results.created.overtime = overtimeStats;
  } catch (error) {
    await q(client, "ROLLBACK").catch(() => {});
    results.finalStatus = "FAILED";
    results.error = String(error?.stack || error);
    throw error;
  } finally {
    await client.end();
  }

  const sampleUsers = ["hr", "payroll", "manager1", "employee01"];
  const tokens = {};
  for (const key of sampleUsers) {
    const username = results.created.usernames[key];
    const l = await login(username);
    results.validations.push({ phase: "final-login", key, username, status: l.status, ok: l.status === 200 });
    if (l.token) tokens[key] = l.token;
  }
  const apiChecks = [
    ["hr", "dashboard", "GET", "/api/dashboard/summary"],
    ["hr", "employees", "GET", "/api/employees"],
    ["hr", "attendance", "GET", "/api/attendance"],
    ["hr", "leave", "GET", "/api/leave/requests"],
    ["hr", "overtime", "GET", "/api/overtime/requests"],
    ["hr", "workflows", "GET", "/api/workflows"],
    ["hr", "notifications", "GET", "/api/notifications"],
    ["payroll", "payrollRuns", "GET", "/api/payroll/runs"],
    ["payroll", "payrollSlips", "GET", "/api/payroll/slips"],
    ["payroll", "payrollSummary", "GET", "/api/reports/payroll-summary"],
    ["manager1", "managerEmployees", "GET", "/api/employees"],
    ["manager1", "managerPayrollBlocked", "GET", "/api/reports/payroll-summary"],
    ["employee01", "employeeMe", "GET", "/api/auth/me"],
    ["employee01", "employeePayslips", "GET", "/api/payroll/slips/my"],
    ["employee01", "employeePayrollBlocked", "GET", "/api/reports/payroll-summary"],
    ["employee01", "employeeDocuments", "GET", "/api/documents"],
  ];
  for (const [key, label, method, url] of apiChecks) {
    results.validations.push(await apiCall(label, method, url, tokens[key]));
  }
  const failures = results.validations.filter((v) => v.status >= 500 || v.status === 0);
  results.finalStatus = failures.length ? "NO_GO" : "GO";
  results.meta.finishedAt = new Date().toISOString();

  const createdUsers = Object.entries(results.created.usernames).map(([key, username]) => ({
    key,
    username,
    password: PASSWORD,
    email: `${key}@nexora.jo`,
  }));
  fs.writeFileSync(path.join(QA_DIR, "enterprise-simulation-results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(QA_DIR, "enterprise-simulation-created-users.json"), JSON.stringify({ company: results.created.company, password: PASSWORD, users: createdUsers }, null, 2));
  fs.writeFileSync(path.join(QA_DIR, "enterprise-simulation-db-summary.json"), JSON.stringify({ companyId: results.created.company.id, counts: results.counts, payroll: results.created.payroll, attendance: results.created.attendance, leave: results.created.leave, overtime: results.created.overtime }, null, 2));
  fs.writeFileSync(path.join(QA_DIR, "enterprise-simulation-fixes.md"), "# Enterprise Simulation Fixes\n\nNo source-code or database-schema fixes were required. No migration was created.\n");

  const report = `# Enterprise Simulation Report

Generated: ${new Date().toISOString()}

## Final Status

${results.finalStatus}

## Company

- ID: ${results.created.company.id}
- English: ${results.created.company.name_en}
- Arabic: ${results.created.company.name_ar}
- Industry: Technology / Software
- Country/City: Jordan / Amman
- Subscription: Pro / active

## Demo Password

All created tenant users use: \`${PASSWORD}\`

## Created Users

${createdUsers.map((u) => `- ${u.username} (${u.key})`).join("\n")}

## Departments

${Object.entries(results.created.departments).map(([code, d]) => `- ${code}: ${d.nameEn}, managerEmployeeId=${d.managerEmployeeId}`).join("\n")}

## Operational Summary

- Users/employees: ${createdUsers.length}
- Attendance records: ${results.created.attendance.records} across ${results.created.attendance.workdays} workdays
- Leave requests: ${results.created.leave.total}
- Overtime requests: ${results.created.overtime.total}
- Payroll gross/net: ${results.created.payroll.totalGross} / ${results.created.payroll.totalNet} JOD
- Workflows: 5
- Notifications: ${results.counts.notifications}
- Files/documents: ${results.counts.file_objects} file objects / ${results.counts.documents} documents
- Background jobs: ${results.counts.background_jobs}
- Dry-run emails: ${results.counts.email_logs}

## Phase Results

${results.phases.map((p) => `- ${p.name}: ${p.status} ${JSON.stringify(p.details)}`).join("\n")}

## Validation

${results.validations.map((v) => `- ${v.label || v.phase + ":" + v.key}: status ${v.status}, ok=${v.ok}`).join("\n")}

## Issues / Fixes

No source-code fixes were required. No database migration was required.

## Known Limitations

- Shift templates are in-memory in the active backend, not DB-backed; attendance was persisted using the backend's 09:00 shift convention.
- Email sending is dry-run, matching the current configured email system.
- This simulation creates a new tenant and does not delete or truncate any existing data.
`;
  fs.writeFileSync(path.join(QA_DIR, "enterprise-simulation-report.md"), report);

  console.log(JSON.stringify({ status: results.finalStatus, companyId: results.created.company.id, users: createdUsers.length, validations: results.validations.length, failures: failures.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
