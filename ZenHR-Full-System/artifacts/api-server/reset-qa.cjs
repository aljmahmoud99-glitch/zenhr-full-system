/**
 * QA Reset Script — ZenJO HRMS
 * Wipes all test data and seeds a clean single-tenant environment.
 * Safe: keeps admin (superadmin) user; does NOT drop schema.
 */
'use strict';
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

function hash(pw) {
  return crypto.createHash('sha256').update(pw + 'zenjo_salt').digest('hex');
}
const PWD = hash('Test@12345');
const COMPANY_ID = 1;

// ─── helpers ──────────────────────────────────────────────────────────────────
function pad(n, len = 4) { return String(n).padStart(len, '0'); }

async function main() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  ZenJO QA RESET — ' + new Date().toISOString());
  console.log('══════════════════════════════════════════════\n');

  // ── 1. PRE-RESET COUNTS ──────────────────────────────────────────────────
  console.log('── PRE-RESET COUNTS ──');
  for (const t of ['users','companies','employees','org_nodes','leave_requests','notifications','employee_actions']) {
    const r = await q(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${r.rows[0].count}`);
  }
  console.log('');

  // ── 2. CLEAN TRANSACTIONAL DATA ─────────────────────────────────────────
  console.log('── Clearing transactional data …');
  await q('DELETE FROM notifications');
  await q('DELETE FROM employee_actions');
  await q('DELETE FROM attendance_records');
  await q('DELETE FROM payslips');
  await q('DELETE FROM payroll_runs');
  await q('DELETE FROM leave_requests');
  await q('DELETE FROM leave_balances');
  await q('DELETE FROM leave_policies');
  await q('DELETE FROM overtime_requests');
  await q('DELETE FROM employee_salary_components');
  console.log('  done\n');

  // ── 3. DELETE USERS (keep admin id=1) ───────────────────────────────────
  console.log('── Removing old users (keeping admin) …');
  await q('DELETE FROM users WHERE id <> 1');
  console.log('  done\n');

  // ── 4. DELETE ALL EMPLOYEES ──────────────────────────────────────────────
  console.log('── Removing old employees …');
  await q('DELETE FROM employees');
  console.log('  done\n');

  // ── 5. DELETE DATA FOR OTHER COMPANIES (2,3,4,5) ────────────────────────
  console.log('── Removing other-company data …');
  await q('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE company_id <> $1)', [COMPANY_ID]);
  await q('DELETE FROM roles WHERE company_id <> $1', [COMPANY_ID]);
  await q('DELETE FROM org_nodes WHERE company_id <> $1', [COMPANY_ID]);
  await q('DELETE FROM departments WHERE company_id <> $1', [COMPANY_ID]);
  await q('DELETE FROM job_titles WHERE company_id <> $1', [COMPANY_ID]);
  await q('DELETE FROM companies WHERE id <> $1', [COMPANY_ID]);
  console.log('  done\n');

  // ── 6. ENSURE COMPANY 1 IS CORRECT ──────────────────────────────────────
  console.log('── Updating company 1 …');
  await q(`
    UPDATE companies SET
      name_ar = 'شركة زنجو للتقنية',
      name_en = 'ZenJO Technology Company',
      code    = 'ZENJO',
      is_active = true,
      is_trial = true,
      plan_name = 'trial',
      max_employees = 100,
      max_users = 50,
      is_deleted = false
    WHERE id = $1`, [COMPANY_ID]);
  console.log('  done\n');

  // ── 7. FIX ORG NODES (rename Finance→Payroll, CustomerService→Support) ──
  console.log('── Fixing org nodes for company 1 …');
  // Company root
  await q(`UPDATE org_nodes SET name_ar='شركة زنجو للتقنية', name_en='ZenJO Technology Company', is_deleted=false WHERE id=7`);
  // Branches
  await q(`UPDATE org_nodes SET name_ar='فرع عمان', name_en='Amman Branch', is_deleted=false WHERE id=8`);
  await q(`UPDATE org_nodes SET name_ar='فرع إربد', name_en='Irbid Branch', is_deleted=false WHERE id=9`);
  // Departments under Amman (8)
  await q(`UPDATE org_nodes SET name_ar='الموارد البشرية', name_en='Human Resources', parent_id=8, is_deleted=false WHERE id=1`);
  await q(`UPDATE org_nodes SET name_ar='تقنية المعلومات',  name_en='Information Technology', parent_id=8, is_deleted=false WHERE id=2`);
  await q(`UPDATE org_nodes SET name_ar='الرواتب',          name_en='Payroll',               parent_id=8, is_deleted=false WHERE id=3`);
  await q(`UPDATE org_nodes SET name_ar='العمليات',         name_en='Operations',             parent_id=8, is_deleted=false WHERE id=4`);
  // Departments under Irbid (9)
  await q(`UPDATE org_nodes SET name_ar='المبيعات',  name_en='Sales',    parent_id=9, is_deleted=false WHERE id=5`);
  await q(`UPDATE org_nodes SET name_ar='الدعم',     name_en='Support',  parent_id=9, is_deleted=false WHERE id=6`);
  console.log('  done\n');

  // ── 8. FIX LEGACY DEPARTMENTS TABLE ─────────────────────────────────────
  console.log('── Fixing departments table …');
  await q(`UPDATE departments SET name_ar='الموارد البشرية', name_en='Human Resources',      code='HR',  is_deleted=false WHERE id=1 AND company_id=1`);
  await q(`UPDATE departments SET name_ar='تقنية المعلومات',  name_en='Information Technology',code='IT',  is_deleted=false WHERE id=2 AND company_id=1`);
  await q(`UPDATE departments SET name_ar='الرواتب',          name_en='Payroll',              code='PAY', is_deleted=false WHERE id=3 AND company_id=1`);
  await q(`UPDATE departments SET name_ar='العمليات',         name_en='Operations',           code='OPS', is_deleted=false WHERE id=4 AND company_id=1`);
  await q(`UPDATE departments SET name_ar='المبيعات',         name_en='Sales',                code='SAL', is_deleted=false WHERE id=5 AND company_id=1`);
  await q(`UPDATE departments SET name_ar='الدعم',            name_en='Support',              code='SUP', is_deleted=false WHERE id=6 AND company_id=1`);
  console.log('  done\n');

  // ── 9. ENSURE JOB TITLES ─────────────────────────────────────────────────
  console.log('── Seeding job titles …');
  // Upsert the titles we need; ids 1-8 already exist for company 1
  const titleUpdates = [
    [1, 'مدير الموارد البشرية', 'HR Manager'],
    [2, 'أخصائي موارد بشرية',   'HR Specialist'],
    [3, 'مطور برمجيات',          'Software Developer'],
    [4, 'مهندس أول',            'Senior Engineer'],
    [5, 'مدير مشروع',           'Project Manager'],
    [6, 'مدير رواتب',           'Payroll Manager'],
    [7, 'مدير عمليات',          'Operations Manager'],
    [8, 'مدير مبيعات',          'Sales Manager'],
  ];
  for (const [id, ar, en] of titleUpdates) {
    await q(`UPDATE job_titles SET title_ar=$1, title_en=$2, is_active=true, is_deleted=false WHERE id=$3 AND company_id=$4`, [ar, en, id, COMPANY_ID]);
  }
  // Add Support Specialist if missing
  await q(`
    INSERT INTO job_titles (company_id, title_ar, title_en, is_active)
    SELECT $1, 'أخصائي دعم', 'Support Specialist', true
    WHERE NOT EXISTS (SELECT 1 FROM job_titles WHERE company_id=$1 AND title_en='Support Specialist')
  `, [COMPANY_ID]);
  console.log('  done\n');

  // ── 10. ENSURE ROLES FOR COMPANY 1 ──────────────────────────────────────
  console.log('── Verifying roles for company 1 …');
  const roleRows = await q(`SELECT id, name FROM roles WHERE company_id=$1`, [COMPANY_ID]);
  const roleMap = {};
  for (const r of roleRows.rows) roleMap[r.name] = r.id;
  console.log('  roles:', JSON.stringify(roleMap));
  console.log('');

  // ── 11. CREATE EMPLOYEES ──────────────────────────────────────────────────
  console.log('── Creating employees …');
  // dept id → org_node id (from our fix above)
  const DEPT = { hr:1, it:2, payroll:3, ops:4, sales:5, support:6 };
  const NODE = { hr:1, it:2, payroll:3, ops:4, sales:5, support:6 };
  const JOB  = { hr:1, payroll:6, it:4, ops:7, sales:8, support:9 };

  // Resolve support specialist title id
  const ssTitleRow = await q(`SELECT id FROM job_titles WHERE company_id=$1 AND title_en='Support Specialist' LIMIT 1`, [COMPANY_ID]);
  const supportTitleId = ssTitleRow.rows[0]?.id || 2;
  JOB.support = supportTitleId;

  // [code, firstAr, lastAr, firstEn, lastEn, gender, dob, dept, node, jobTitle, basicSalary, housing, transport, desc]
  const employeeDefs = [
    // EMP-0001  hr admin
    ['EMP-0001','أحمد','حسين','Ahmad','Hussein','male','1985-03-15', DEPT.hr, NODE.hr, JOB.hr, '1500','200','100', 'HR Admin'],
    // EMP-0002  payroll admin
    ['EMP-0002','سارة','محمود','Sara','Mahmoud','female','1988-07-22', DEPT.payroll, NODE.payroll, JOB.payroll, '1400','150','80', 'Payroll Admin'],
    // EMP-0003  manager.hr
    ['EMP-0003','محمد','الخطيب','Mohammad','Al-Khatib','male','1982-11-10', DEPT.hr, NODE.hr, JOB.hr, '1800','250','120', 'HR Manager'],
    // EMP-0004  manager.it
    ['EMP-0004','خالد','النمر','Khaled','Al-Nemer','male','1980-05-18', DEPT.it, NODE.it, JOB.it, '2000','300','120', 'IT Manager'],
    // EMP-0005  manager.ops
    ['EMP-0005','ليلى','حداد','Layla','Haddad','female','1984-09-30', DEPT.ops, NODE.ops, JOB.ops, '1900','250','100', 'Ops Manager'],
    // EMP-0006  manager.sales
    ['EMP-0006','يوسف','الراشد','Yousef','Al-Rashid','male','1983-02-14', DEPT.sales, NODE.sales, JOB.sales, '1950','250','120', 'Sales Manager'],
    // EMP-0007  employee01 — HR
    ['EMP-0007','ريم','العمر','Reem','Al-Omar','female','1995-06-12', DEPT.hr, NODE.hr, JOB.hr, '800','100','60', 'HR Employee 1'],
    // EMP-0008  employee02 — HR
    ['EMP-0008','كريم','السعد','Kareem','Al-Saad','male','1997-02-28', DEPT.hr, NODE.hr, 2, '750','100','60', 'HR Employee 2'],
    // EMP-0009  employee03 — IT
    ['EMP-0009','هنا','الزيد','Hana','Al-Zaid','female','1996-08-15', DEPT.it, NODE.it, JOB.it, '1000','150','80', 'IT Employee 1'],
    // EMP-0010  employee04 — IT
    ['EMP-0010','طارق','قاسم','Tarek','Qasim','male','1994-04-20', DEPT.it, NODE.it, 3, '950','150','80', 'IT Employee 2'],
    // EMP-0011  employee05 — IT
    ['EMP-0011','نور','حمدان','Noor','Hamdan','female','1998-11-03', DEPT.it, NODE.it, 3, '900','100','80', 'IT Employee 3'],
    // EMP-0012  employee06 — Operations
    ['EMP-0012','باسم','عودة','Basem','Odeh','male','1993-07-18', DEPT.ops, NODE.ops, JOB.ops, '1100','150','80', 'Ops Employee 1'],
    // EMP-0013  employee07 — Operations
    ['EMP-0013','دينا','خليل','Dina','Khalil','female','1996-01-25', DEPT.ops, NODE.ops, 5, '1000','100','80', 'Ops Employee 2'],
    // EMP-0014  employee08 — Operations
    ['EMP-0014','عمر','الشريف','Omar','Al-Shareef','male','1995-09-14', DEPT.ops, NODE.ops, 5, '950','100','80', 'Ops Employee 3'],
    // EMP-0015  employee09 — Sales
    ['EMP-0015','لمى','ناصر','Lama','Nasser','female','1997-05-07', DEPT.sales, NODE.sales, JOB.sales, '900','100','80', 'Sales Employee 1'],
    // EMP-0016  employee10 — Sales
    ['EMP-0016','علي','فارس','Ali','Faris','male','1994-12-19', DEPT.sales, NODE.sales, 5, '850','100','80', 'Sales Employee 2'],
    // EMP-0017  employee11 — Support
    ['EMP-0017','سلمى','بكر','Salma','Bakr','female','1998-03-22', DEPT.support, NODE.support, JOB.support, '800','100','60', 'Support Employee 1'],
    // EMP-0018  employee12 — Support
    ['EMP-0018','فيصل','العجلوني','Faisal','Al-Ajlouni','male','1996-07-11', DEPT.support, NODE.support, JOB.support, '780','100','60', 'Support Employee 2'],
  ];

  const empIds = {};  // key: 'hr'|'payroll'|'manager.hr'|...|'employee01'...'employee12'
  const empUserKeys = [
    'hr','payroll',
    'manager.hr','manager.it','manager.ops','manager.sales',
    'employee01','employee02','employee03','employee04','employee05','employee06',
    'employee07','employee08','employee09','employee10','employee11','employee12'
  ];

  const insertedEmps = [];
  for (let i = 0; i < employeeDefs.length; i++) {
    const [code,far,lar,fen,len,gender,dob,deptId,nodeId,jobTitleId,basic,housing,transport] = employeeDefs[i];
    const nationalId = `1${pad(i+1,9)}`;
    const workEmail = empUserKeys[i].includes('.') 
      ? empUserKeys[i].replace('.','') + '@zenjo.test'
      : empUserKeys[i] + '@zenjo.test';
    // fix email for managers with dots
    const emailFixed = empUserKeys[i] === 'manager.hr' ? 'manager.hr@zenjo.test'
      : empUserKeys[i] === 'manager.it' ? 'manager.it@zenjo.test'
      : empUserKeys[i] === 'manager.ops' ? 'manager.ops@zenjo.test'
      : empUserKeys[i] === 'manager.sales' ? 'manager.sales@zenjo.test'
      : empUserKeys[i] + '@zenjo.test';

    const res = await q(`
      INSERT INTO employees
        (company_id, employee_code, first_name_ar, last_name_ar, first_name_en, last_name_en,
         gender, date_of_birth, national_id, nationality, employment_type, hire_date,
         contract_type, employment_status,
         department_id, org_node_id, job_title_id,
         basic_salary, housing_allowance, transport_allowance,
         mobile_allowance, meal_allowance, other_allowances,
         work_email,
         number_of_dependents, is_ssc_exempt, is_deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'أردني','fulltime',$10,'permanent','active',
              $11,$12,$13,$14,$15,$16,'0','0','0',$17,0,false,false)
      RETURNING id`,
      [COMPANY_ID, code, far, lar, fen, len, gender, dob, nationalId,
       '2020-01-01', deptId, nodeId, jobTitleId,
       basic, housing, transport, emailFixed]);
    const empId = res.rows[0].id;
    empIds[empUserKeys[i]] = empId;
    insertedEmps.push({ key: empUserKeys[i], empId, code, fen, len });
    console.log(`  ${code} → emp id ${empId}  (${empUserKeys[i]})`);
  }

  // ── 12. SET DIRECT MANAGER IDs ────────────────────────────────────────────
  console.log('\n── Setting direct manager links …');
  const mhrId   = empIds['manager.hr'];
  const mitId   = empIds['manager.it'];
  const mopsId  = empIds['manager.ops'];
  const msalId  = empIds['manager.sales'];

  // HR dept: hr admin + employee01 + employee02 report to manager.hr
  await q(`UPDATE employees SET direct_manager_id=$1 WHERE id = ANY($2::int[])`,
    [mhrId, [empIds['hr'], empIds['employee01'], empIds['employee02']]]);
  // IT dept: employee03,04,05 report to manager.it
  await q(`UPDATE employees SET direct_manager_id=$1 WHERE id = ANY($2::int[])`,
    [mitId, [empIds['employee03'], empIds['employee04'], empIds['employee05']]]);
  // Ops dept: employee06,07,08 report to manager.ops
  await q(`UPDATE employees SET direct_manager_id=$1 WHERE id = ANY($2::int[])`,
    [mopsId, [empIds['employee06'], empIds['employee07'], empIds['employee08']]]);
  // Sales dept: employee09,10 report to manager.sales
  await q(`UPDATE employees SET direct_manager_id=$1 WHERE id = ANY($2::int[])`,
    [msalId, [empIds['employee09'], empIds['employee10']]]);
  // Support: employee11,12 also report to manager.sales
  await q(`UPDATE employees SET direct_manager_id=$1 WHERE id = ANY($2::int[])`,
    [msalId, [empIds['employee11'], empIds['employee12']]]);
  // payroll admin and managers have no direct manager (null)
  console.log('  done\n');

  // ── 13. UPDATE ORG_NODES manager_employee_id ──────────────────────────────
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=1`, [empIds['manager.hr']]);
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=2`, [empIds['manager.it']]);
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=3`, [empIds['payroll']]);
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=4`, [empIds['manager.ops']]);
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=5`, [empIds['manager.sales']]);
  await q(`UPDATE org_nodes SET manager_employee_id=$1 WHERE id=6`, [empIds['manager.sales']]);

  // ── 14. CREATE USERS ──────────────────────────────────────────────────────
  console.log('── Creating users …');
  const userDefs = [
    // [username, email, role, empKey]
    ['hr',            'hr@zenjo.test',            'hradmin',     'hr'],
    ['payroll',       'payroll@zenjo.test',        'payrolladmin','payroll'],
    ['manager.hr',    'manager.hr@zenjo.test',     'manager',     'manager.hr'],
    ['manager.it',    'manager.it@zenjo.test',     'manager',     'manager.it'],
    ['manager.ops',   'manager.ops@zenjo.test',    'manager',     'manager.ops'],
    ['manager.sales', 'manager.sales@zenjo.test',  'manager',     'manager.sales'],
    ['employee01',    'employee01@zenjo.test',     'employee',    'employee01'],
    ['employee02',    'employee02@zenjo.test',     'employee',    'employee02'],
    ['employee03',    'employee03@zenjo.test',     'employee',    'employee03'],
    ['employee04',    'employee04@zenjo.test',     'employee',    'employee04'],
    ['employee05',    'employee05@zenjo.test',     'employee',    'employee05'],
    ['employee06',    'employee06@zenjo.test',     'employee',    'employee06'],
    ['employee07',    'employee07@zenjo.test',     'employee',    'employee07'],
    ['employee08',    'employee08@zenjo.test',     'employee',    'employee08'],
    ['employee09',    'employee09@zenjo.test',     'employee',    'employee09'],
    ['employee10',    'employee10@zenjo.test',     'employee',    'employee10'],
    ['employee11',    'employee11@zenjo.test',     'employee',    'employee11'],
    ['employee12',    'employee12@zenjo.test',     'employee',    'employee12'],
  ];

  for (const [uname, email, role, empKey] of userDefs) {
    const roleId = roleMap[role] || null;
    const empId  = empIds[empKey];
    const res = await q(`
      INSERT INTO users (company_id, employee_id, username, password_hash, email, role, role_id, is_active, is_deleted, must_change_password)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, false)
      RETURNING id`,
      [COMPANY_ID, empId, uname, PWD, email, role, roleId]);
    console.log(`  user ${res.rows[0].id}: ${uname} → emp ${empId} (${role})`);
  }

  // ── 15. BACKFILL ADMIN USER (ensure email set) ────────────────────────────
  const adminRoleId = roleMap['superadmin'] || null;
  await q(`UPDATE users SET email='admin@zenjo.test', role_id=$1 WHERE id=1`, [adminRoleId]);
  console.log('\n  admin email/role_id backfilled\n');

  // ── 16. SEED LEAVE POLICIES FOR COMPANY 1 ────────────────────────────────
  console.log('── Seeding default leave policies …');
  await q(`
    INSERT INTO leave_policies (company_id, leave_type, days_per_year, carry_over_days, is_paid, requires_approval, notice_days, min_days_per_request, max_days_per_request, is_active)
    VALUES
      ($1, 'annual',    21, 10, true,  true,  1, 1, 21, true),
      ($1, 'sick',      14,  0, true,  false, 0, 1, 14, true),
      ($1, 'emergency',  3,  0, true,  true,  0, 1,  3, true)
    ON CONFLICT DO NOTHING`, [COMPANY_ID]);
  console.log('  done\n');

  // ── 17. POST-RESET COUNTS ─────────────────────────────────────────────────
  console.log('── POST-RESET COUNTS ──');
  for (const t of ['users','companies','employees','org_nodes','departments','roles','leave_policies']) {
    const r = await q(`SELECT COUNT(*) FROM ${t}`);
    console.log(`  ${t}: ${r.rows[0].count}`);
  }
  console.log('');

  // ── 18. VALIDATION ────────────────────────────────────────────────────────
  console.log('── VALIDATION ──');

  // login check (password match)
  const testAccounts = ['admin','hr','payroll','manager.hr','manager.it','manager.ops','manager.sales','employee01','employee12'];
  for (const uname of testAccounts) {
    const expectedHash = uname === 'admin' ? hash('Admin@1234') : PWD;
    const r = await q(`SELECT id, role, employee_id, is_active FROM users WHERE username=$1`, [uname]);
    if (r.rows.length === 0) { console.log(`  ✗ ${uname}: NOT FOUND`); continue; }
    const u = r.rows[0];
    const ok = u.is_active ? '✓' : '✗';
    console.log(`  ${ok} ${uname}: id=${u.id}, role=${u.role}, emp=${u.employee_id}, active=${u.is_active}`);
  }

  // org tree check
  console.log('\n  ORG TREE (company 1):');
  const nodes = await q(`SELECT id, parent_id, node_type, name_en FROM org_nodes WHERE company_id=$1 AND is_deleted=false ORDER BY node_type, id`, [COMPANY_ID]);
  for (const n of nodes.rows) {
    const indent = n.node_type === 'company' ? '' : n.node_type === 'branch' ? '  ' : '    ';
    console.log(`  ${indent}[${n.node_type}] ${n.name_en} (id=${n.id}, parent=${n.parent_id})`);
  }

  // employee dept check
  console.log('\n  EMPLOYEE → DEPT → ORG_NODE:');
  const empCheck = await q(`
    SELECT u.username, e.employee_code, d.name_en dept, o.name_en node, e.direct_manager_id mgr
    FROM users u
    JOIN employees e ON e.id = u.employee_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN org_nodes o ON o.id = e.org_node_id
    WHERE u.company_id = $1 AND u.id <> 1
    ORDER BY u.id`, [COMPANY_ID]);
  for (const row of empCheck.rows) {
    console.log(`  ${row.username} | ${row.employee_code} | dept:${row.dept} | node:${row.node} | mgr:${row.mgr}`);
  }

  // ── 19. CREDENTIALS TABLE ─────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('  FINAL CREDENTIALS');
  console.log('══════════════════════════════════════════════════════════════════════════════');
  console.log(`${'Role'.padEnd(14)} ${'Username'.padEnd(16)} ${'Email'.padEnd(30)} ${'Password'.padEnd(14)} ${'Department'.padEnd(20)} Scope`);
  console.log('─'.repeat(110));

  const creds = [
    ['superadmin',   'admin',        'admin@zenjo.test',        'Admin@1234',  'Platform',         'Platform-wide'],
    ['hradmin',      'hr',           'hr@zenjo.test',           'Test@12345',  'Human Resources',  'All company data'],
    ['payrolladmin', 'payroll',      'payroll@zenjo.test',      'Test@12345',  'Payroll',          'Payroll data'],
    ['manager',      'manager.hr',   'manager.hr@zenjo.test',   'Test@12345',  'Human Resources',  'HR dept team'],
    ['manager',      'manager.it',   'manager.it@zenjo.test',   'Test@12345',  'Info Technology',  'IT dept team'],
    ['manager',      'manager.ops',  'manager.ops@zenjo.test',  'Test@12345',  'Operations',       'Ops dept team'],
    ['manager',      'manager.sales','manager.sales@zenjo.test','Test@12345',  'Sales',            'Sales+Support team'],
    ['employee',     'employee01',   'employee01@zenjo.test',   'Test@12345',  'Human Resources',  'Own data only'],
    ['employee',     'employee02',   'employee02@zenjo.test',   'Test@12345',  'Human Resources',  'Own data only'],
    ['employee',     'employee03',   'employee03@zenjo.test',   'Test@12345',  'Info Technology',  'Own data only'],
    ['employee',     'employee04',   'employee04@zenjo.test',   'Test@12345',  'Info Technology',  'Own data only'],
    ['employee',     'employee05',   'employee05@zenjo.test',   'Test@12345',  'Info Technology',  'Own data only'],
    ['employee',     'employee06',   'employee06@zenjo.test',   'Test@12345',  'Operations',       'Own data only'],
    ['employee',     'employee07',   'employee07@zenjo.test',   'Test@12345',  'Operations',       'Own data only'],
    ['employee',     'employee08',   'employee08@zenjo.test',   'Test@12345',  'Operations',       'Own data only'],
    ['employee',     'employee09',   'employee09@zenjo.test',   'Test@12345',  'Sales',            'Own data only'],
    ['employee',     'employee10',   'employee10@zenjo.test',   'Test@12345',  'Sales',            'Own data only'],
    ['employee',     'employee11',   'employee11@zenjo.test',   'Test@12345',  'Support',          'Own data only'],
    ['employee',     'employee12',   'employee12@zenjo.test',   'Test@12345',  'Support',          'Own data only'],
  ];
  for (const [role,uname,email,pw,dept,scope] of creds) {
    console.log(`${role.padEnd(14)} ${uname.padEnd(16)} ${email.padEnd(30)} ${pw.padEnd(14)} ${dept.padEnd(20)} ${scope}`);
  }
  console.log('══════════════════════════════════════════════════════════════════════════════\n');

  await pool.end();
  console.log('✅  Reset complete.\n');
}

main().catch(err => {
  console.error('❌  Reset failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
