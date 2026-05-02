/*
 * Phase 2 Seed — Multi-Tenant Hierarchy + Company B
 *
 * 1. Backfills subscription metadata + code on Company A.
 * 2. Adds proper org hierarchy for Company A:
 *      Company root (org_node)
 *        └─ Amman Branch ────┬─ HR / IT / Finance / Operations
 *        └─ Irbid Branch ────┴─ Sales / Customer Service
 *    Existing department org_nodes are reparented (no IDs change → employee links intact).
 * 3. Creates Company B "Acme Corporation Jordan" with full structure:
 *      Main Branch ──── HR / Engineering / Sales
 *      Remote Branch ── Customer Support
 *    + 3 employees + 3 users (b_hradmin, b_manager, b_employee).
 *
 * Idempotent — safe to run multiple times.
 * Re-run seed-phase1 afterwards so Company B gets roles/permissions/role_id backfilled.
 */

import { db } from "./index.js";
import {
  companiesTable, departmentsTable, jobTitlesTable, leavePoliciesTable,
  employeesTable, usersTable, orgNodesTable,
} from "./schema/index.js";
import { eq, and, isNull } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "zenjo_salt").digest("hex");
}

async function ensureOrgNode(opts: {
  companyId: number; nodeType: string; nameEn: string; nameAr: string;
  code?: string | null; parentId?: number | null; managerEmployeeId?: number | null; sortOrder?: number;
}): Promise<number> {
  const existing = await db.select({ id: orgNodesTable.id })
    .from(orgNodesTable)
    .where(and(
      eq(orgNodesTable.companyId, opts.companyId),
      eq(orgNodesTable.nodeType, opts.nodeType),
      eq(orgNodesTable.nameEn, opts.nameEn),
      eq(orgNodesTable.isDeleted, false),
    ))
    .limit(1);
  if (existing[0]) {
    // keep parent / manager in sync if provided
    const updates: any = {};
    if (opts.parentId !== undefined) updates.parentId = opts.parentId;
    if (opts.managerEmployeeId !== undefined) updates.managerEmployeeId = opts.managerEmployeeId;
    if (opts.code !== undefined) updates.code = opts.code;
    if (Object.keys(updates).length) {
      await db.update(orgNodesTable).set(updates).where(eq(orgNodesTable.id, existing[0].id));
    }
    return existing[0].id;
  }
  const [node] = await db.insert(orgNodesTable).values({
    companyId: opts.companyId, nodeType: opts.nodeType,
    nameAr: opts.nameAr, nameEn: opts.nameEn,
    code: opts.code ?? null, parentId: opts.parentId ?? null,
    managerEmployeeId: opts.managerEmployeeId ?? null,
    sortOrder: opts.sortOrder ?? 0,
  }).returning({ id: orgNodesTable.id });
  return node!.id;
}

async function run() {
  console.log("═══════════════════════════════════════");
  console.log("Phase 2 Seed — Multi-tenant hierarchy");
  console.log("═══════════════════════════════════════\n");

  // ────────── COMPANY A — backfill plan + build hierarchy ───────────
  const [companyA] = await db.select().from(companiesTable).where(eq(companiesTable.id, 1));
  if (!companyA) throw new Error("Company A (id=1) missing — run base seed first.");

  console.log("Updating Company A subscription metadata…");
  await db.update(companiesTable).set({
    code: "ZENJO",
    country: "Jordan",
    planName: "pro",
    subscriptionStart: "2025-01-01",
    subscriptionEnd: "2026-12-31",
    maxUsers: 50,
    maxEmployees: 200,
    isTrial: false,
  }).where(eq(companiesTable.id, 1));

  console.log("Building Company A hierarchy…");
  const aRoot = await ensureOrgNode({
    companyId: 1, nodeType: "company", nameEn: companyA.nameEn, nameAr: companyA.nameAr,
    code: "ZENJO", parentId: null, sortOrder: 0,
  });
  const aAmman = await ensureOrgNode({
    companyId: 1, nodeType: "branch", nameEn: "Amman Branch", nameAr: "فرع عمان",
    code: "AMM", parentId: aRoot, sortOrder: 1,
  });
  const aIrbid = await ensureOrgNode({
    companyId: 1, nodeType: "branch", nameEn: "Irbid Branch", nameAr: "فرع إربد",
    code: "IRB", parentId: aRoot, sortOrder: 2,
  });

  // Reparent existing department org_nodes onto branches.
  const deptToBranch: Record<string, number> = {
    "Human Resources": aAmman, "Information Technology": aAmman,
    "Finance": aAmman, "Operations": aAmman,
    "Sales": aIrbid, "Customer Service": aIrbid,
  };
  for (const [name, branchId] of Object.entries(deptToBranch)) {
    const r = await db.update(orgNodesTable)
      .set({ parentId: branchId })
      .where(and(
        eq(orgNodesTable.companyId, 1),
        eq(orgNodesTable.nameEn, name),
        eq(orgNodesTable.nodeType, "department"),
      )).returning({ id: orgNodesTable.id });
    if (r[0]) console.log(`  ↳ ${name} → branch ${branchId}`);
  }

  // Set IT department's manager to Khaled (emp 4 = manager user).
  const [emp4] = await db.select({ id: employeesTable.id }).from(employeesTable).where(eq(employeesTable.id, 4));
  if (emp4) {
    await db.update(orgNodesTable)
      .set({ managerEmployeeId: emp4.id })
      .where(and(eq(orgNodesTable.companyId, 1), eq(orgNodesTable.nameEn, "Information Technology")));
    console.log("  ↳ Khaled set as IT department manager");
  }

  // ────────── COMPANY B — create from scratch ───────────
  console.log("\nCreating Company B (Acme Corporation Jordan)…");

  let [companyB] = await db.select().from(companiesTable).where(eq(companiesTable.code, "ACME"));
  if (!companyB) {
    [companyB] = await db.insert(companiesTable).values({
      nameAr: "شركة أكمي الأردنية",
      nameEn: "Acme Corporation Jordan",
      code: "ACME",
      commercialRegNo: "67890",
      taxNumber: "1234567",
      country: "Jordan",
      city: "Amman",
      phone: "+962 6 4444444",
      email: "info@acme.jo",
      currency: "JOD",
      industryType: "services",
      planName: "trial",
      subscriptionStart: "2026-01-01",
      subscriptionEnd: "2026-04-01",
      maxUsers: 10,
      maxEmployees: 25,
      isTrial: true,
      isActive: true,
    }).returning();
    console.log(`  ↳ Company B created: id=${companyB!.id}`);
  } else {
    console.log(`  ↳ Company B already exists: id=${companyB.id}`);
  }
  const companyBId = companyB!.id;

  // Departments table for Company B (employee.departmentId references this)
  console.log("  Creating Company B departments…");
  const bDeptDefs = [
    { code: "B-HR",   nameEn: "Human Resources", nameAr: "الموارد البشرية" },
    { code: "B-ENG",  nameEn: "Engineering",     nameAr: "الهندسة" },
    { code: "B-SAL",  nameEn: "Sales",           nameAr: "المبيعات" },
    { code: "B-CS",   nameEn: "Customer Support",nameAr: "دعم العملاء" },
  ];
  const bDeptIds: Record<string, number> = {};
  for (const d of bDeptDefs) {
    const ex = await db.select({ id: departmentsTable.id }).from(departmentsTable)
      .where(and(eq(departmentsTable.companyId, companyBId), eq(departmentsTable.code, d.code))).limit(1);
    if (ex[0]) { bDeptIds[d.code] = ex[0].id; }
    else {
      const [row] = await db.insert(departmentsTable).values({
        companyId: companyBId, nameAr: d.nameAr, nameEn: d.nameEn, code: d.code,
      }).returning();
      bDeptIds[d.code] = row!.id;
    }
  }

  // Job titles for Company B
  console.log("  Creating Company B job titles…");
  const bJobDefs = [
    { code: "B-HRM",  titleEn: "HR Manager",     titleAr: "مدير موارد بشرية", grade: "G6" },
    { code: "B-ENGM", titleEn: "Engineering Manager", titleAr: "مدير هندسة", grade: "G6" },
    { code: "B-DEV",  titleEn: "Software Engineer", titleAr: "مهندس برمجيات", grade: "G4" },
    { code: "B-SUP",  titleEn: "Support Specialist", titleAr: "أخصائي دعم", grade: "G3" },
  ];
  const bJobIds: Record<string, number> = {};
  for (const j of bJobDefs) {
    const ex = await db.select({ id: jobTitlesTable.id }).from(jobTitlesTable)
      .where(and(eq(jobTitlesTable.companyId, companyBId), eq(jobTitlesTable.titleEn, j.titleEn))).limit(1);
    if (ex[0]) { bJobIds[j.code] = ex[0].id; }
    else {
      const [row] = await db.insert(jobTitlesTable).values({
        companyId: companyBId, titleAr: j.titleAr, titleEn: j.titleEn, jobGrade: j.grade,
      }).returning();
      bJobIds[j.code] = row!.id;
    }
  }

  // Org tree for Company B
  console.log("  Building Company B hierarchy…");
  const bRoot = await ensureOrgNode({
    companyId: companyBId, nodeType: "company", nameEn: companyB!.nameEn, nameAr: companyB!.nameAr,
    code: "ACME", parentId: null, sortOrder: 0,
  });
  const bMain = await ensureOrgNode({
    companyId: companyBId, nodeType: "branch", nameEn: "Main Branch", nameAr: "الفرع الرئيسي",
    code: "MAIN", parentId: bRoot, sortOrder: 1,
  });
  const bRemote = await ensureOrgNode({
    companyId: companyBId, nodeType: "branch", nameEn: "Remote Branch", nameAr: "الفرع عن بعد",
    code: "REMO", parentId: bRoot, sortOrder: 2,
  });
  const bHR = await ensureOrgNode({
    companyId: companyBId, nodeType: "department", nameEn: "Human Resources", nameAr: "الموارد البشرية",
    code: "B-HR", parentId: bMain, sortOrder: 1,
  });
  const bEng = await ensureOrgNode({
    companyId: companyBId, nodeType: "department", nameEn: "Engineering", nameAr: "الهندسة",
    code: "B-ENG", parentId: bMain, sortOrder: 2,
  });
  const bSales = await ensureOrgNode({
    companyId: companyBId, nodeType: "department", nameEn: "Sales", nameAr: "المبيعات",
    code: "B-SAL", parentId: bMain, sortOrder: 3,
  });
  const bCS = await ensureOrgNode({
    companyId: companyBId, nodeType: "department", nameEn: "Customer Support", nameAr: "دعم العملاء",
    code: "B-CS", parentId: bRemote, sortOrder: 1,
  });

  // Leave policies for Company B (minimum so balances/leave work)
  console.log("  Creating Company B leave policies…");
  const lpExisting = await db.select({ id: leavePoliciesTable.id }).from(leavePoliciesTable)
    .where(eq(leavePoliciesTable.companyId, companyBId)).limit(1);
  if (!lpExisting[0]) {
    await db.insert(leavePoliciesTable).values([
      { companyId: companyBId, leaveType: "annual", nameAr: "Annual Leave", nameEn: "Annual Leave",
        daysPerYear: "14", maxCarryForwardDays: "14", minServiceMonths: 0, isPaid: true, gender: "all" },
      { companyId: companyBId, leaveType: "sick", nameAr: "Sick Leave", nameEn: "Sick Leave",
        daysPerYear: "14", maxCarryForwardDays: "0", minServiceMonths: 0, isPaid: true, gender: "all" },
    ]);
  }

  // Employees for Company B
  console.log("  Creating Company B employees…");
  const bEmpDefs = [
    {
      employeeCode: "B-EMP-0001",
      firstNameAr: "Nora", lastNameAr: "Saleh", firstNameEn: "Nora", lastNameEn: "Saleh",
      gender: "female", dateOfBirth: "1985-03-12", hireDate: "2023-02-01",
      basicSalary: "1800.000", housingAllowance: "300.000", transportAllowance: "100.000",
      departmentId: bDeptIds["B-HR"], jobTitleId: bJobIds["B-HRM"], orgNodeId: bHR,
      workEmail: "nora@acme.jo", nationalId: "8503127654",
      bankName: "Arab Bank", iban: "JO94ARAB0210000000000999111111",
    },
    {
      employeeCode: "B-EMP-0002",
      firstNameAr: "Tamer", lastNameAr: "Hamdan", firstNameEn: "Tamer", lastNameEn: "Hamdan",
      gender: "male", dateOfBirth: "1982-07-22", hireDate: "2023-03-01",
      basicSalary: "2200.000", housingAllowance: "400.000", transportAllowance: "150.000",
      departmentId: bDeptIds["B-ENG"], jobTitleId: bJobIds["B-ENGM"], orgNodeId: bEng,
      workEmail: "tamer@acme.jo", nationalId: "8207221111",
      bankName: "Housing Bank", iban: "JO66HBJO3800000000001999222222",
    },
    {
      employeeCode: "B-EMP-0003",
      firstNameAr: "Rana", lastNameAr: "Odeh", firstNameEn: "Rana", lastNameEn: "Odeh",
      gender: "female", dateOfBirth: "1995-11-05", hireDate: "2024-01-15",
      basicSalary: "1100.000", housingAllowance: "180.000", transportAllowance: "60.000",
      departmentId: bDeptIds["B-ENG"], jobTitleId: bJobIds["B-DEV"], orgNodeId: bEng,
      workEmail: "rana@acme.jo", nationalId: "9511052222",
      bankName: "Jordan Bank", iban: "JO71JRJB3200000000001999333333",
    },
    {
      employeeCode: "B-EMP-0004",
      firstNameAr: "Omar", lastNameAr: "Khalil", firstNameEn: "Omar", lastNameEn: "Khalil",
      gender: "male", dateOfBirth: "1993-09-18", hireDate: "2024-05-10",
      basicSalary: "950.000", housingAllowance: "150.000", transportAllowance: "50.000",
      departmentId: bDeptIds["B-CS"], jobTitleId: bJobIds["B-SUP"], orgNodeId: bCS,
      workEmail: "omar@acme.jo", nationalId: "9309183333",
      bankName: "Arab Bank", iban: "JO94ARAB0210000000000999444444",
    },
  ];

  const bEmpIds: Record<string, number> = {};
  for (const e of bEmpDefs) {
    const ex = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(eq(employeesTable.employeeCode, e.employeeCode)).limit(1);
    if (ex[0]) { bEmpIds[e.employeeCode] = ex[0].id; }
    else {
      const [row] = await db.insert(employeesTable).values({
        companyId: companyBId,
        employmentStatus: "active",
        ...e,
      }).returning();
      bEmpIds[e.employeeCode] = row!.id;
      console.log(`    ↳ ${e.employeeCode} ${e.firstNameEn} ${e.lastNameEn}`);
    }
  }

  // Tamer manages Rana (both in Engineering)
  if (bEmpIds["B-EMP-0002"] && bEmpIds["B-EMP-0003"]) {
    await db.update(employeesTable)
      .set({ directManagerId: bEmpIds["B-EMP-0002"] })
      .where(eq(employeesTable.id, bEmpIds["B-EMP-0003"]!));
    // Tamer = manager of Engineering org_node
    await db.update(orgNodesTable)
      .set({ managerEmployeeId: bEmpIds["B-EMP-0002"] })
      .where(eq(orgNodesTable.id, bEng));
  }

  // Users for Company B
  console.log("  Creating Company B users…");
  const bUserDefs = [
    { username: "b_hradmin",  role: "hradmin",  password: "Hr@1234",       email: "hr@acme.jo",       employeeId: bEmpIds["B-EMP-0001"] },
    { username: "b_manager",  role: "manager",  password: "Manager@1234",  email: "manager@acme.jo",  employeeId: bEmpIds["B-EMP-0002"] },
    { username: "b_employee", role: "employee", password: "Employee@1234", email: "employee@acme.jo", employeeId: bEmpIds["B-EMP-0003"] },
  ];
  for (const u of bUserDefs) {
    const ex = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.username, u.username)).limit(1);
    if (ex[0]) { console.log(`    ↳ ${u.username} already exists`); continue; }
    await db.insert(usersTable).values({
      companyId: companyBId,
      username: u.username,
      email: u.email,
      role: u.role,
      passwordHash: hashPassword(u.password),
      employeeId: u.employeeId ?? null,
      isActive: true,
    });
    console.log(`    ↳ ${u.username} / ${u.password}`);
  }

  // ────────── Company A: pin manager (Khaled) to IT org_node ──────
  // (employee.org_node_id was already set by phase1 — re-affirm for emp4)
  const [it] = await db.select({ id: orgNodesTable.id }).from(orgNodesTable)
    .where(and(eq(orgNodesTable.companyId, 1), eq(orgNodesTable.nameEn, "Information Technology"))).limit(1);
  if (it) {
    await db.update(employeesTable).set({ orgNodeId: it.id }).where(eq(employeesTable.id, 4));
  }

  console.log("\n═══════════════════════════════════════");
  console.log("Phase 2 Seed — Complete");
  console.log("═══════════════════════════════════════");
  console.log("\nCompany B test logins:");
  console.log("  hradmin:   b_hradmin  / Hr@1234");
  console.log("  manager:   b_manager  / Manager@1234");
  console.log("  employee:  b_employee / Employee@1234");
  console.log("\nNow re-run seed-phase1 to backfill roles/permissions for Company B.");
}

run().then(() => process.exit(0)).catch(e => {
  console.error("Phase 2 seed failed:", e);
  process.exit(1);
});
