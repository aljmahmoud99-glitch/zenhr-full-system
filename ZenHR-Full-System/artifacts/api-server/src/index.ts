import express from "express";
import cors from "cors";
import ExcelJS from "exceljs";
import { generateExcelBuffer, type ExportColumn } from "./export.service.js";
import { authMiddleware, authMiddleware as auth, hashPassword, signAccessToken, signRefreshToken, verifyToken } from "./auth.js";
import { runPayroll } from "./payroll-run.service.js";
import { applyBrackets, calculateComponentValueM } from "./salary-calculation.service.js";
import { db } from "@workspace/db";
import {
  usersTable, employeesTable, departmentsTable, jobTitlesTable,
  leaveRequestsTable, leavePoliciesTable, leaveBalancesTable,
  payrollRunsTable, payslipsTable, attendanceRecordsTable,
  documentsTable, documentTypesTable, assetsTable, assetCategoriesTable,
  nationalitiesTable, citiesTable, banksTable, leaveTypesTable,
  companiesTable, activityLogsTable, systemConfigurationsTable,
  overtimeRequestsTable,
  orgNodesTable, rolesTable, permissionsTable, rolePermissionsTable,
  jobDescriptionsTable, careerPathsTable,
  employeeQualificationsTable,
  employeeActionsTable,
  employeeSalaryComponentsTable,
  salaryComponentsTable,
  salaryComponentDefinitionsTable,
  notificationsTable,
} from "@workspace/db/schema";
import {
  notifyUsers, notifyRole, notifyDirectManager, notifyEmployee, fmtDateRange,
} from "./notification.service.js";
import { eq, and, ilike, desc, asc, isNull, isNotNull, sql, gte, lte, ne, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  getPermissionMap,
  hasPermission,
  getDataScope,
  getDescendantNodeIds,
  getEmployeeScopeConditions,
} from "./permission-service.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

type AuthReq = express.Request & { user: { userId: number; username: string; role: string; companyId: number; employeeId: number | null } };

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString(), version: "1.0.0" });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string };
    if (!username || !password) {
      res.status(400).json({ success: false, message: "Username and password required" });
      return;
    }
    const [user] = await db.select().from(usersTable)
      .where(and(eq(usersTable.username, username), eq(usersTable.isDeleted, false)));
    if (!user || user.passwordHash !== hashPassword(password)) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }
    if (!user.isActive) {
      res.status(401).json({ success: false, message: "Account is disabled" });
      return;
    }
    const tokenPayload = {
      userId: user.id, username: user.username, role: user.role,
      companyId: user.companyId, employeeId: user.employeeId,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ userId: user.id });
    await db.update(usersTable).set({ lastLoginAt: new Date(), refreshToken }).where(eq(usersTable.id, user.id));
    res.json({
      success: true,
      data: {
        accessToken, refreshToken,
        user: {
          id: user.id, username: user.username, email: user.email,
          role: user.role, companyId: user.companyId, employeeId: user.employeeId,
          mustChangePassword: user.mustChangePassword,
        },
      },
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/auth/logout", auth, (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    if (!u) { res.status(404).json({ success: false, message: "User not found" }); return; }
    res.json({ success: true, data: { id: u.id, username: u.username, email: u.email, role: u.role, companyId: u.companyId, employeeId: u.employeeId } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/auth/context — tenant scope for the current user (company name + employee org context)
app.get("/api/auth/context", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId));
    let branchId: number | null = null;
    let branchNameAr: string | null = null;
    let branchNameEn: string | null = null;
    let deptId: number | null = null;
    let deptNameAr: string | null = null;
    let deptNameEn: string | null = null;
    let orgNodeId: number | null = null;
    let orgNodeNameAr: string | null = null;
    let orgNodeNameEn: string | null = null;
    let orgNodeType: string | null = null;

    if (user.employeeId) {
      const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, user.employeeId));
      if (emp) {
        deptId = emp.departmentId ?? null;
        orgNodeId = emp.orgNodeId ?? null;

        if (emp.departmentId) {
          const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId));
          if (dept) { deptNameAr = dept.nameAr; deptNameEn = dept.nameEn; }
        }

        if (emp.orgNodeId) {
          const allNodes = await db.select().from(orgNodesTable)
            .where(and(eq(orgNodesTable.companyId, user.companyId), eq(orgNodesTable.isDeleted, false)));
          const nodeMap: Record<number, any> = {};
          allNodes.forEach(n => { nodeMap[n.id] = n; });
          const node = nodeMap[emp.orgNodeId];
          if (node) {
            orgNodeNameAr = node.nameAr;
            orgNodeNameEn = node.nameEn;
            orgNodeType = node.nodeType;
          }
          const branch = findAncestorBranch(emp.orgNodeId, nodeMap);
          if (branch) { branchId = branch.id; branchNameAr = branch.nameAr; branchNameEn = branch.nameEn; }
        }
      }
    }

    res.json({
      success: true,
      data: {
        companyId: user.companyId,
        companyNameAr: company?.nameAr ?? '',
        companyNameEn: company?.nameEn ?? '',
        branchId, branchNameAr, branchNameEn,
        deptId, deptNameAr, deptNameEn,
        orgNodeId, orgNodeNameAr, orgNodeNameEn, orgNodeType,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/auth/change-password", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.userId));
    if (!u || u.passwordHash !== hashPassword(currentPassword)) {
      res.status(400).json({ success: false, message: "Current password is incorrect" });
      return;
    }
    await db.update(usersTable).set({ passwordHash: hashPassword(newPassword), mustChangePassword: false }).where(eq(usersTable.id, user.userId));
    res.json({ success: true, data: { user: { id: u.id, username: u.username, mustChangePassword: false } } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get("/api/dashboard/summary", auth, async (req, res) => {
  try {
    const authReq = req as AuthReq;
    const user = authReq.user;
    const cId = user.companyId;
    const today = new Date().toISOString().split("T")[0]!;
    const in30 = new Date(); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split("T")[0]!;

    // Scope employees by role (own / department subtree / company).
    // Manager → only their org_node subtree; HR admin → whole company; employee → just self.
    const scope = await getEmployeeScopeConditions(authReq);
    const empConds = [...scope, eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")];

    const scopedEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...empConds));
    const scopedIds = scopedEmps.map(e => e.id);
    const totalEmployees = scopedIds.length;

    // Helpers — when scope is empty, every "in scope" filter must short-circuit to false
    const inLeave = scopedIds.length ? inArray(leaveRequestsTable.employeeId, scopedIds) : sql`false`;
    const inOT    = scopedIds.length ? inArray(overtimeRequestsTable.employeeId, scopedIds) : sql`false`;
    const inAtt   = scopedIds.length ? inArray(attendanceRecordsTable.employeeId, scopedIds) : sql`false`;

    const [pendingLeave] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.status, "pending"), eq(leaveRequestsTable.isDeleted, false), inLeave));

    const [pendingOT] = await db.select({ count: sql<number>`count(*)::int` })
      .from(overtimeRequestsTable)
      .where(and(eq(overtimeRequestsTable.status, "pending"), eq(overtimeRequestsTable.isDeleted, false), inOT));

    const [presentToday] = await db.select({ count: sql<number>`count(*)::int` })
      .from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.date, today), inAtt, isNotNull(attendanceRecordsTable.clockIn)));

    const [onLeaveToday] = await db.select({ count: sql<number>`count(*)::int` })
      .from(leaveRequestsTable)
      .where(and(
        eq(leaveRequestsTable.status, "approved"),
        eq(leaveRequestsTable.isDeleted, false),
        inLeave,
        lte(leaveRequestsTable.startDate, today),
        gte(leaveRequestsTable.endDate, today),
      ));

    const presentCount = presentToday?.count ?? 0;
    const onLeaveCount = onLeaveToday?.count ?? 0;
    const absentToday = Math.max(0, totalEmployees - presentCount - onLeaveCount);

    // Compliance — scoped employees only
    const [sscNotEnrolled] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(and(...empConds, eq(employeesTable.isSSCExempt, false), isNull(employeesTable.sscEnrollmentDate)));

    const [wpExpiringSoon] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(and(...empConds, isNotNull(employeesTable.workPermitExpiry), lte(employeesTable.workPermitExpiry, in30Str)));

    // Use residency expiry as a proxy for "health" expiring soon (no health column in schema)
    const [healthExpiringSoon] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(and(...empConds, isNotNull(employeesTable.residencyExpiry), lte(employeesTable.residencyExpiry, in30Str)));

    let assetsAssigned = 0;
    if (scopedIds.length) {
      const [a] = await db.select({ count: sql<number>`count(*)::int` })
        .from(assetsTable)
        .where(and(eq(assetsTable.companyId, cId), inArray(assetsTable.assignedToEmployeeId, scopedIds)));
      assetsAssigned = a?.count ?? 0;
    }

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday: presentCount,
        onLeaveToday: onLeaveCount,
        absentToday,
        pendingLeaves: pendingLeave?.count ?? 0,
        pendingOvertimes: pendingOT?.count ?? 0,
        pendingAdvances: 0,
        pendingPreEmployment: 0,
        pendingDisciplinary: 0,
        activeResignations: 0,
        pendingClearances: 0,
        sscNotEnrolled: sscNotEnrolled?.count ?? 0,
        wpExpiringSoon: wpExpiringSoon?.count ?? 0,
        healthExpiringSoon: healthExpiringSoon?.count ?? 0,
        assetsAssigned,
      },
    });
  } catch (e) {
    console.error("[/api/dashboard/summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/dashboard/recent-activity", auth, async (req, res) => {
  try {
    const authReq = req as AuthReq;
    const user = authReq.user;
    const limit = parseInt(String(req.query["limit"] ?? "10"));
    // Manager/employee data scope: filter to activity referencing the visible employees
    // by name. (activity_logs has no employee_id FK, so we narrow via employee_name.)
    const scope = await getEmployeeScopeConditions(authReq);
    let scopedNames: string[] | null = null;
    if (user.role === "manager" || user.role === "employee") {
      const empConds = [...scope, eq(employeesTable.isDeleted, false)];
      const emps = await db.select({
        firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn,
        firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr,
      }).from(employeesTable).where(and(...empConds));
      scopedNames = emps.flatMap(e => [
        `${e.firstNameEn} ${e.lastNameEn}`,
        `${e.firstNameAr} ${e.lastNameAr}`,
      ]);
    }
    const logs = await db.select().from(activityLogsTable)
      .where(eq(activityLogsTable.companyId, user.companyId))
      .orderBy(desc(activityLogsTable.createdAt)).limit(limit * 3);
    const filtered = scopedNames
      ? logs.filter(l => !l.employeeName || scopedNames!.includes(l.employeeName))
      : logs;
    res.json({
      success: true,
      data: filtered.slice(0, limit).map(l => ({
        id: l.id,
        actionType: l.type,
        entityType: l.type,
        descriptionAr: l.description,
        descriptionEn: l.description,
        employeeName: l.employeeName,
        createdAt: l.createdAt,
      })),
    });
  } catch (e) {
    console.error("[/api/dashboard/recent-activity]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/dashboard/leave-stats", auth, async (_req, res) => {
  res.json({ success: true, data: { annual: 0, sick: 0, emergency: 0, maternity: 0, paternity: 0, other: 0 } });
});

app.get("/api/dashboard/headcount-by-department", auth, async (req, res) => {
  try {
    const authReq = req as AuthReq;
    const user = authReq.user;
    const scope = await getEmployeeScopeConditions(authReq);
    const conditions = [
      ...scope,
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, "active"),
      isNotNull(employeesTable.departmentId),
    ];
    const rows = await db.select({
      departmentId: employeesTable.departmentId,
      count: sql<number>`count(*)::int`,
    }).from(employeesTable).where(and(...conditions))
      .groupBy(employeesTable.departmentId);
    const depts = await db.select().from(departmentsTable)
      .where(and(eq(departmentsTable.companyId, user.companyId), eq(departmentsTable.isDeleted, false)));
    const result = rows.map(r => {
      const dept = depts.find(d => d.id === r.departmentId);
      return {
        departmentId: r.departmentId,
        nameAr: dept?.nameAr ?? "غير محدد",
        nameEn: dept?.nameEn ?? "Unknown",
        count: r.count,
      };
    }).sort((a, b) => b.count - a.count);
    res.json({ success: true, data: result });
  } catch (e) {
    console.error("[/api/dashboard/headcount-by-department]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/dashboard/payroll-trend", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

// ─── Employee enrichment helper ───────────────────────────────────────────────
async function loadOrgEnrichmentMaps(companyId: number) {
  const [allDepts, allJobs, allOrgNodes] = await Promise.all([
    db.select().from(departmentsTable).where(and(eq(departmentsTable.companyId, companyId), eq(departmentsTable.isDeleted, false))),
    db.select({ id: jobDescriptionsTable.id, titleAr: jobDescriptionsTable.titleAr, titleEn: jobDescriptionsTable.titleEn }).from(jobDescriptionsTable).where(and(eq(jobDescriptionsTable.companyId, companyId), eq(jobDescriptionsTable.isActive, true))),
    db.select().from(orgNodesTable).where(and(eq(orgNodesTable.companyId, companyId), eq(orgNodesTable.isDeleted, false))),
  ]);
  const deptMap: Record<number, typeof allDepts[0]> = {};
  const jtMap: Record<number, typeof allJobs[0]> = {};
  const nodeMap: Record<number, typeof allOrgNodes[0]> = {};
  allDepts.forEach(d => { deptMap[d.id] = d; });
  allJobs.forEach(j => { jtMap[j.id] = j; });
  allOrgNodes.forEach(n => { nodeMap[n.id] = n; });
  return { deptMap, jtMap, nodeMap, allOrgNodes };
}

function findAncestorBranch(orgNodeId: number | null | undefined, nodeMap: Record<number, any>): any | null {
  if (!orgNodeId) return null;
  let current = nodeMap[orgNodeId];
  while (current) {
    if (current.nodeType === 'branch') return current;
    if (!current.parentId) break;
    current = nodeMap[current.parentId];
  }
  return null;
}

function buildOrgBreadcrumb(orgNodeId: number | null | undefined, nodeMap: Record<number, any>): string {
  if (!orgNodeId) return '';
  const path: string[] = [];
  let current = nodeMap[orgNodeId];
  while (current) {
    path.unshift(current.nameEn);
    if (!current.parentId) break;
    current = nodeMap[current.parentId];
  }
  return path.join(' › ');
}

function enrichEmployee(emp: any, maps: { deptMap: Record<number, any>; jtMap: Record<number, any>; nodeMap: Record<number, any> }, managerMap?: Record<number, any>) {
  const dept = emp.departmentId ? maps.deptMap[emp.departmentId] : null;
  const jt = emp.jobTitleId ? maps.jtMap[emp.jobTitleId] : null;
  const node = emp.orgNodeId ? maps.nodeMap[emp.orgNodeId] : null;
  const branch = findAncestorBranch(emp.orgNodeId, maps.nodeMap);
  const orgBreadcrumb = buildOrgBreadcrumb(emp.orgNodeId, maps.nodeMap);
  const manager = emp.directManagerId && managerMap ? managerMap[emp.directManagerId] : null;

  const mid = (v?: string | null) => (v ? ` ${v}` : '');
  return {
    ...emp,
    fullNameAr: `${emp.firstNameAr}${mid(emp.middleNameAr)} ${emp.lastNameAr}`.trim(),
    fullNameEn: `${emp.firstNameEn}${mid(emp.middleNameEn)} ${emp.lastNameEn}`.trim(),
    departmentNameAr: dept?.nameAr ?? null,
    departmentNameEn: dept?.nameEn ?? null,
    jobTitleAr: jt?.titleAr ?? null,
    jobTitleEn: jt?.titleEn ?? null,
    orgNodeNameAr: node?.nameAr ?? null,
    orgNodeNameEn: node?.nameEn ?? null,
    orgNodeType: node?.nodeType ?? null,
    branchId: branch?.id ?? null,
    branchNameAr: branch?.nameAr ?? null,
    branchNameEn: branch?.nameEn ?? null,
    orgBreadcrumb,
    directManagerName: manager ? `${manager.firstNameEn}${mid(manager.middleNameEn)} ${manager.lastNameEn}`.trim() : null,
    directManagerNameAr: manager ? `${manager.firstNameAr}${mid(manager.middleNameAr)} ${manager.lastNameAr}`.trim() : null,
  };
}

// ─── Employees ────────────────────────────────────────────────────────────────
app.get("/api/employees", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { search, departmentId, orgNodeId, branchId, status, jobDescriptionId, page = "1", pageSize = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const size = parseInt(pageSize);
    const offset = (pageNum - 1) * size;

    // Phase 1: apply data scope (own / department / org_node / company)
    const scopeConditions = await getEmployeeScopeConditions(req as AuthReq);
    const conditions = [...scopeConditions, eq(employeesTable.isDeleted, false)];

    if (status) conditions.push(eq(employeesTable.employmentStatus, status));
    if (jobDescriptionId) conditions.push(eq(employeesTable.jobDescriptionId as any, parseInt(jobDescriptionId)));
    if (departmentId) conditions.push(eq(employeesTable.departmentId, parseInt(departmentId)));
    if (orgNodeId) {
      const nodeIds = await getDescendantNodeIds(parseInt(orgNodeId));
      if (nodeIds.length > 0) conditions.push(inArray(employeesTable.orgNodeId, nodeIds));
    }
    if (branchId) {
      const nodeIds = await getDescendantNodeIds(parseInt(branchId));
      if (nodeIds.length > 0) conditions.push(inArray(employeesTable.orgNodeId, nodeIds));
    }

    const rows = await db.select().from(employeesTable).where(and(...conditions))
      .orderBy(asc(employeesTable.employeeCode)).limit(size).offset(offset);
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable).where(and(...conditions));

    const filtered = search
      ? rows.filter(e => e.firstNameEn.toLowerCase().includes(search.toLowerCase()) || e.lastNameEn.toLowerCase().includes(search.toLowerCase()) || e.employeeCode.toLowerCase().includes(search.toLowerCase()))
      : rows;

    const maps = await loadOrgEnrichmentMaps(user.companyId);

    // Build manager lookup for the result set
    const managerIds = [...new Set(filtered.map(e => e.directManagerId).filter(Boolean))] as number[];
    let managerMap: Record<number, any> = {};
    if (managerIds.length > 0) {
      const managers = await db.select().from(employeesTable).where(inArray(employeesTable.id, managerIds));
      managers.forEach(m => { managerMap[m.id] = m; });
    }

    const enriched = filtered.map(e => enrichEmployee(e, maps, managerMap));

    res.json({ success: true, data: enriched, total: total?.count ?? 0, page: pageNum, pageSize: size });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/employees", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const body = req.body;
    const [emp] = await db.insert(employeesTable).values({ ...body, companyId: user.companyId }).returning();
    await logActivity(user.companyId, "employee_created", `New employee added: ${emp.firstNameEn} ${emp.lastNameEn}`, `${emp.firstNameEn} ${emp.lastNameEn}`);
    res.status(201).json({ success: true, data: emp });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);

    const [[emp], quals, maps] = await Promise.all([
      db.select().from(employeesTable)
        .where(and(eq(employeesTable.id, empId), eq(employeesTable.isDeleted, false))),
      db.select().from(employeeQualificationsTable)
        .where(eq(employeeQualificationsTable.employeeId, empId))
        .orderBy(asc(employeeQualificationsTable.createdAt)),
      loadOrgEnrichmentMaps(user.companyId),
    ]);

    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    let managerMap: Record<number, any> = {};
    if (emp.directManagerId) {
      const [mgr] = await db.select().from(employeesTable)
        .where(eq(employeesTable.id, emp.directManagerId));
      if (mgr) managerMap[mgr.id] = mgr;
    }

    const enriched = enrichEmployee(emp, maps, managerMap);

    // ── Role-based financial masking ─────────────────────────────────────────
    const canSeeFinancial = ["superadmin", "hradmin", "payrolladmin"].includes(user.role);
    const msk = <T>(v: T): T | null => canSeeFinancial ? v : null;

    // ── Parse qualification data_json ─────────────────────────────────────────
    const parsedQuals = quals.map(q => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(q.dataJson); } catch { /* keep empty */ }
      return { ...q, data };
    });

    // ── Structured sections ───────────────────────────────────────────────────
    const sections = {
      personal: {
        employeeCode:    enriched.employeeCode,
        fullNameAr:      enriched.fullNameAr,
        fullNameEn:      enriched.fullNameEn,
        gender:          enriched.gender,
        dateOfBirth:     enriched.dateOfBirth,
        nationalId:      enriched.nationalId,
        nationality:     enriched.nationality,
        bloodType:       null,
        maritalStatus:   enriched.maritalStatus,
        dependents:      enriched.numberOfDependents,
        religion:        enriched.religion,
      },
      contact: {
        personalPhone:              enriched.personalPhone,
        workPhone:                  enriched.workPhone,
        personalEmail:              enriched.personalEmail,
        workEmail:                  enriched.workEmail,
        emergencyContactName:       enriched.emergencyContactName,
        emergencyContactPhone:      enriched.emergencyContactPhone,
        emergencyContactRelation:   enriched.emergencyContactRelation,
      },
      address: {
        governorate: null,
        city:        enriched.city,
        addressAr:   enriched.addressAr,
      },
      employment: {
        departmentId:      enriched.departmentId,
        departmentName:    enriched.departmentNameEn,
        orgNodeId:         enriched.orgNodeId,
        orgNodePath:       enriched.orgBreadcrumb,
        jobTitleId:        enriched.jobTitleId,
        jobTitle:          enriched.jobTitleEn,
        directManagerId:   enriched.directManagerId,
        directManagerName: enriched.directManagerName,
        employmentType:    enriched.employmentType,
        contractType:      enriched.contractType,
        hireDate:          enriched.hireDate,
        probationEndDate:  enriched.probationEndDate,
        contractEndDate:   enriched.contractEndDate,
        employmentStatus:  enriched.employmentStatus,
      },
      financial: {
        basicSalary:        msk(enriched.basicSalary),
        housingAllowance:   msk(enriched.housingAllowance),
        transportAllowance: msk(enriched.transportAllowance),
        mobileAllowance:    msk(enriched.mobileAllowance),
        mealAllowance:      msk(enriched.mealAllowance),
        otherAllowances:    msk(enriched.otherAllowances),
        bankName:           msk(enriched.bankName),
        bankAccount:        msk(enriched.bankAccountNumber),
        iban:               msk(enriched.iban),
        sscNumber:          msk(enriched.sscNumber),
        sscEnrollmentDate:  msk(enriched.sscEnrollmentDate),
      },
      compliance: {
        workPermitNumber:         enriched.workPermitNumber,
        workPermitExpiry:         enriched.workPermitExpiry,
        residencyNumber:          enriched.residencyNumber,
        residencyExpiry:          enriched.residencyExpiry,
        passportNumber:           enriched.passportNumber,
        passportExpiry:           enriched.passportExpiry,
        healthCertExpiry:         null,
        criminalClearanceExpiry:  null,
      },
      qualifications: parsedQuals,
    };

    // ── Build flat response (backward-compat) + mask financial fields ─────────
    const flatData: any = { ...enriched, sections };
    if (!canSeeFinancial) {
      flatData.basicSalary        = null;
      flatData.housingAllowance   = null;
      flatData.transportAllowance = null;
      flatData.mobileAllowance    = null;
      flatData.mealAllowance      = null;
      flatData.otherAllowances    = null;
      flatData.bankName           = null;
      flatData.bankAccountNumber  = null;
      flatData.iban               = null;
      flatData.sscNumber          = null;
      flatData.sscEnrollmentDate  = null;
    }

    res.json({ success: true, data: flatData });
  } catch (e) {
    console.error("GET /api/employees/:id error:", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/employees/:id", auth, async (req, res) => {
  try {
    const [emp] = await db.update(employeesTable).set(req.body).where(eq(employeesTable.id, parseInt(req.params["id"]!))).returning();
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    res.json({ success: true, data: emp });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/employees/:id", auth, async (req, res) => {
  try {
    const { reason, terminationDate } = req.body as { reason?: string; terminationDate?: string };
    const [emp] = await db.update(employeesTable).set({
      employmentStatus: "terminated",
      terminationDate: terminationDate ?? new Date().toISOString().split("T")[0],
      terminationReason: reason,
      isDeleted: true,
    }).where(eq(employeesTable.id, parseInt(req.params["id"]!))).returning();
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    res.json({ success: true, data: emp });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id/documents", auth, async (req, res) => {
  try {
    const docs = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.employeeId, parseInt(req.params["id"]!)), eq(documentsTable.isDeleted, false)));
    res.json({ success: true, data: docs });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id/qualifications", auth, async (req, res) => {
  try {
    const empId = parseInt(req.params["id"]!);
    const rows = await db.select().from(employeeQualificationsTable)
      .where(eq(employeeQualificationsTable.employeeId, empId))
      .orderBy(asc(employeeQualificationsTable.createdAt));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/employees/:id/qualifications", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params["id"]!);
    const { qualificationType, dataJson } = req.body as { qualificationType: string; dataJson: string };
    if (!qualificationType) { res.status(400).json({ success: false, message: "qualificationType required" }); return; }
    const [row] = await db.insert(employeeQualificationsTable).values({
      employeeId: empId,
      qualificationType,
      dataJson: typeof dataJson === "string" ? dataJson : JSON.stringify(dataJson ?? {}),
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/employees/:id/qualifications/:qualId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const qualId = parseInt(req.params["qualId"]!);
    const { qualificationType, dataJson } = req.body as { qualificationType?: string; dataJson?: string | object };
    const updates: Record<string, unknown> = {};
    if (qualificationType) updates["qualificationType"] = qualificationType;
    if (dataJson !== undefined) updates["dataJson"] = typeof dataJson === "string" ? dataJson : JSON.stringify(dataJson ?? {});
    const [row] = await db.update(employeeQualificationsTable)
      .set(updates)
      .where(eq(employeeQualificationsTable.id, qualId))
      .returning();
    if (!row) { res.status(404).json({ success: false, message: "Qualification not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/employees/:id/qualifications/:qualId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    await db.delete(employeeQualificationsTable)
      .where(eq(employeeQualificationsTable.id, parseInt(req.params["qualId"]!)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id/leave-balances", auth, async (req, res) => {
  try {
    const balances = await db.select().from(leaveBalancesTable)
      .where(eq(leaveBalancesTable.employeeId, parseInt(req.params["id"]!)));
    res.json({ success: true, data: balances });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Employee Actions ─────────────────────────────────────────────────────────

const ACTION_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  hire:                { en: "Hired",                   ar: "تعيين" },
  probation_start:     { en: "Probation Started",       ar: "بدء التجربة" },
  probation_complete:  { en: "Probation Completed",     ar: "اجتياز التجربة" },
  probation_fail:      { en: "Probation Failed",        ar: "فشل التجربة" },
  transfer:            { en: "Transfer",                ar: "نقل" },
  promotion:           { en: "Promotion",               ar: "ترقية" },
  demotion:            { en: "Demotion",                ar: "خفض درجة" },
  salary_change:       { en: "Salary Change",           ar: "تعديل الراتب" },
  suspension:          { en: "Suspension",              ar: "إيقاف" },
  suspension_lift:     { en: "Suspension Lifted",       ar: "رفع الإيقاف" },
  termination:         { en: "Termination",             ar: "إنهاء خدمة" },
  resignation:         { en: "Resignation",             ar: "استقالة" },
  leave_of_absence:    { en: "Leave of Absence",        ar: "إجازة بدون راتب" },
  return_from_leave:   { en: "Returned from Leave",     ar: "عودة من الإجازة" },
  warning_issued:      { en: "Warning Issued",          ar: "إنذار" },
  document_expired:    { en: "Document Expired",        ar: "وثيقة منتهية" },
  contract_renewal:    { en: "Contract Renewal",        ar: "تجديد عقد" },
};

// Shared: join-based query returning actions enriched with creator name
const creatorEmpAlias = alias(employeesTable, "creator_emp");

async function queryActionsWithCreator(where: Parameters<typeof db.select>[0] extends never ? never : any) {
  return db
    .select({
      id: employeeActionsTable.id,
      companyId: employeeActionsTable.companyId,
      employeeId: employeeActionsTable.employeeId,
      actionType: employeeActionsTable.actionType,
      effectiveDate: employeeActionsTable.effectiveDate,
      createdByUserId: employeeActionsTable.createdByUserId,
      previousValueJson: employeeActionsTable.previousValueJson,
      newValueJson: employeeActionsTable.newValueJson,
      notes: employeeActionsTable.notes,
      status: employeeActionsTable.status,
      createdAt: employeeActionsTable.createdAt,
      createdByUsername: usersTable.username,
      createdByFirstName: creatorEmpAlias.firstNameEn,
      createdByLastName: creatorEmpAlias.lastNameEn,
    })
    .from(employeeActionsTable)
    .leftJoin(usersTable, eq(employeeActionsTable.createdByUserId, usersTable.id))
    .leftJoin(creatorEmpAlias, eq(usersTable.employeeId, creatorEmpAlias.id))
    .where(where)
    .orderBy(desc(employeeActionsTable.effectiveDate), desc(employeeActionsTable.createdAt));
}

function enrichActions(actions: any[]) {
  return actions.map(a => {
    const createdByName =
      a.createdByFirstName && a.createdByLastName
        ? `${a.createdByFirstName} ${a.createdByLastName}`
        : (a.createdByUsername ?? null);
    return {
      id: a.id,
      companyId: a.companyId,
      employeeId: a.employeeId,
      actionType: a.actionType,
      effectiveDate: a.effectiveDate,
      createdByUserId: a.createdByUserId,
      createdByName,
      previousValueJson: a.previousValueJson,
      newValueJson: a.newValueJson,
      notes: a.notes,
      status: a.status,
      createdAt: a.createdAt,
      labelEn: ACTION_TYPE_LABELS[a.actionType]?.en ?? a.actionType,
      labelAr: ACTION_TYPE_LABELS[a.actionType]?.ar ?? a.actionType,
    };
  });
}

// GET /api/employee-actions/types — dropdown labels
app.get("/api/employee-actions/types", auth, (_req, res) => {
  const types = Object.entries(ACTION_TYPE_LABELS).map(([value, labels]) => ({
    value,
    labelEn: labels.en,
    labelAr: labels.ar,
  }));
  res.json({ success: true, data: types });
});

// GET /api/employee-actions?employeeId=X
app.get("/api/employee-actions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId } = req.query as Record<string, string>;

    // Employee: can only query own actions
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      if (employeeId && parseInt(employeeId) !== user.employeeId) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      const actions = await queryActionsWithCreator(
        eq(employeeActionsTable.employeeId, user.employeeId)
      );
      return res.json({ success: true, data: enrichActions(actions) });
    }

    // HR / managers: require employeeId param
    if (!employeeId) {
      res.status(400).json({ success: false, message: "employeeId is required" }); return;
    }
    const empId = parseInt(employeeId);
    const [emp] = await db.select({ id: employeesTable.id, companyId: employeesTable.companyId })
      .from(employeesTable).where(eq(employeesTable.id, empId)).limit(1);
    if (!emp || emp.companyId !== user.companyId) {
      res.status(404).json({ success: false, message: "Employee not found" }); return;
    }
    const actions = await queryActionsWithCreator(
      eq(employeeActionsTable.employeeId, empId)
    );
    res.json({ success: true, data: enrichActions(actions) });
  } catch (e) {
    console.error("[GET /api/employee-actions]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Helper: compute "one day before" a YYYY-MM-DD date string
function dayBefore(dateStr: string): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split("T")[0];
}

// POST /api/employee-actions
app.post("/api/employee-actions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "hradmin" && user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Only HR admins can record employee actions" }); return;
    }

    const { employeeId, actionType, effectiveDate, notes, ...extra } = req.body as {
      employeeId: number;
      actionType: string;
      effectiveDate: string;
      notes?: string;
      [k: string]: any;
    };
    if (!employeeId || !actionType || !effectiveDate) {
      res.status(400).json({ success: false, message: "employeeId, actionType and effectiveDate are required" }); return;
    }

    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.companyId, user.companyId))).limit(1);
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    const action = await db.transaction(async (tx) => {
      const beforeFields: Record<string, any> = {};
      const empUpdate: Record<string, any> = {};
      let insertSalaryComponent = false;

      // ── Per-action side effects + before/after capture ────────────────────
      if (actionType === "transfer") {
        beforeFields.orgNodeId = emp.orgNodeId;
        beforeFields.departmentId = emp.departmentId;
        if (extra.orgNodeId != null) empUpdate.orgNodeId = extra.orgNodeId;
        if (extra.departmentId != null) empUpdate.departmentId = extra.departmentId;

      } else if (actionType === "promotion" || actionType === "demotion") {
        beforeFields.jobTitleId = emp.jobTitleId;
        if (extra.jobTitleId != null) empUpdate.jobTitleId = extra.jobTitleId;
        if (extra.basicSalary != null) {
          beforeFields.basicSalary = emp.basicSalary;
          beforeFields.housingAllowance = emp.housingAllowance;
          beforeFields.transportAllowance = emp.transportAllowance;
          beforeFields.mobileAllowance = emp.mobileAllowance;
          beforeFields.mealAllowance = emp.mealAllowance;
          beforeFields.otherAllowances = emp.otherAllowances;
          empUpdate.basicSalary = String(extra.basicSalary);
          if (extra.housingAllowance != null) empUpdate.housingAllowance = String(extra.housingAllowance);
          if (extra.transportAllowance != null) empUpdate.transportAllowance = String(extra.transportAllowance);
          if (extra.mobileAllowance != null) empUpdate.mobileAllowance = String(extra.mobileAllowance);
          if (extra.mealAllowance != null) empUpdate.mealAllowance = String(extra.mealAllowance);
          if (extra.otherAllowances != null) empUpdate.otherAllowances = String(extra.otherAllowances);
          insertSalaryComponent = true;
        }

      } else if (actionType === "salary_change") {
        beforeFields.basicSalary = emp.basicSalary;
        beforeFields.housingAllowance = emp.housingAllowance;
        beforeFields.transportAllowance = emp.transportAllowance;
        beforeFields.mobileAllowance = emp.mobileAllowance;
        beforeFields.mealAllowance = emp.mealAllowance;
        beforeFields.otherAllowances = emp.otherAllowances;
        if (extra.basicSalary != null) empUpdate.basicSalary = String(extra.basicSalary);
        if (extra.housingAllowance != null) empUpdate.housingAllowance = String(extra.housingAllowance);
        if (extra.transportAllowance != null) empUpdate.transportAllowance = String(extra.transportAllowance);
        if (extra.mobileAllowance != null) empUpdate.mobileAllowance = String(extra.mobileAllowance);
        if (extra.mealAllowance != null) empUpdate.mealAllowance = String(extra.mealAllowance);
        if (extra.otherAllowances != null) empUpdate.otherAllowances = String(extra.otherAllowances);
        insertSalaryComponent = true;

      } else if (actionType === "suspension") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "suspended";
      } else if (actionType === "suspension_lift") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "active";
      } else if (actionType === "termination") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "terminated";
        empUpdate.terminationDate = effectiveDate;
        if (extra.terminationReason) empUpdate.terminationReason = extra.terminationReason;
      } else if (actionType === "resignation") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "resigned";
        empUpdate.terminationDate = effectiveDate;
      } else if (actionType === "probation_complete") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "active";
      } else if (actionType === "probation_fail") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "terminated";
        empUpdate.terminationDate = effectiveDate;
      } else if (actionType === "return_from_leave") {
        beforeFields.employmentStatus = emp.employmentStatus;
        empUpdate.employmentStatus = "active";
      } else if (actionType === "leave_of_absence") {
        beforeFields.employmentStatus = emp.employmentStatus;
      }

      // After snapshot = before + applied updates
      const afterFields: Record<string, any> = { ...beforeFields };
      for (const [k, v] of Object.entries(empUpdate)) afterFields[k] = v;

      // ── Insert action record as PENDING (side effects applied only on approve) ──
      const [inserted] = await tx.insert(employeeActionsTable).values({
        companyId: user.companyId,
        employeeId,
        actionType,
        effectiveDate,
        createdByUserId: user.userId,
        previousValueJson: Object.keys(beforeFields).length ? JSON.stringify(beforeFields) : null,
        newValueJson: Object.keys(afterFields).length ? JSON.stringify(afterFields) : null,
        notes: notes ?? null,
        status: "pending",
      }).returning();

      return inserted;
    });

    await logActivity(user.companyId, "employee_action", `${actionType} submitted for employee #${employeeId}`, null);
    // ── Notification ───────────────────────────────────────────────────────
    const actionLabelEn2 = ACTION_TYPE_LABELS[actionType]?.en ?? actionType;
    const actionLabelAr2 = ACTION_TYPE_LABELS[actionType]?.ar ?? actionType;
    await notifyRole(user.companyId, "hradmin", {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "employee_action",
      entityId: action.id,
      notificationType: "employee_action_created",
      titleAr: `طلب إجراء موظف: ${actionLabelAr2}`,
      titleEn: `Employee Action Request: ${actionLabelEn2}`,
      messageAr: `طلب إجراء "${actionLabelAr2}" للموظف #${employeeId} يحتاج إلى موافقة.`,
      messageEn: `A "${actionLabelEn2}" action for employee #${employeeId} requires approval.`,
      priority: "normal",
      actionUrl: "/app/employee-actions",
    });
    res.status(201).json({
      success: true,
      data: {
        ...action,
        labelEn: ACTION_TYPE_LABELS[actionType]?.en,
        labelAr: ACTION_TYPE_LABELS[actionType]?.ar,
      },
    });
  } catch (e) {
    console.error("[POST /api/employee-actions]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/employee-actions/:id/approve — apply side effects and mark applied
app.post("/api/employee-actions/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "hradmin" && user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Only HR admins can approve actions" }); return;
    }
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid action id" }); return; }

    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Action not found" }); return; }
    if (action.status !== "pending") { res.status(400).json({ success: false, message: "Action is not pending" }); return; }

    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, action.employeeId), eq(employeesTable.companyId, user.companyId))).limit(1);
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    const after = action.newValueJson ? JSON.parse(action.newValueJson) : {};
    const empUpdate: Record<string, any> = {};
    let insertSalaryComponent = false;

    if (action.actionType === "transfer") {
      if (after.orgNodeId != null) empUpdate.orgNodeId = after.orgNodeId;
      if (after.departmentId != null) empUpdate.departmentId = after.departmentId;
    } else if (action.actionType === "promotion" || action.actionType === "demotion") {
      if (after.jobTitleId != null) empUpdate.jobTitleId = after.jobTitleId;
      if (after.basicSalary != null) {
        empUpdate.basicSalary = String(after.basicSalary);
        if (after.housingAllowance != null) empUpdate.housingAllowance = String(after.housingAllowance);
        if (after.transportAllowance != null) empUpdate.transportAllowance = String(after.transportAllowance);
        if (after.mobileAllowance != null) empUpdate.mobileAllowance = String(after.mobileAllowance);
        if (after.mealAllowance != null) empUpdate.mealAllowance = String(after.mealAllowance);
        if (after.otherAllowances != null) empUpdate.otherAllowances = String(after.otherAllowances);
        insertSalaryComponent = true;
      }
    } else if (action.actionType === "salary_change") {
      if (after.basicSalary != null) empUpdate.basicSalary = String(after.basicSalary);
      if (after.housingAllowance != null) empUpdate.housingAllowance = String(after.housingAllowance);
      if (after.transportAllowance != null) empUpdate.transportAllowance = String(after.transportAllowance);
      if (after.mobileAllowance != null) empUpdate.mobileAllowance = String(after.mobileAllowance);
      if (after.mealAllowance != null) empUpdate.mealAllowance = String(after.mealAllowance);
      if (after.otherAllowances != null) empUpdate.otherAllowances = String(after.otherAllowances);
      insertSalaryComponent = true;
    } else if (action.actionType === "suspension") {
      empUpdate.employmentStatus = "suspended";
    } else if (action.actionType === "suspension_lift") {
      empUpdate.employmentStatus = "active";
    } else if (action.actionType === "termination") {
      empUpdate.employmentStatus = "terminated";
      empUpdate.terminationDate = action.effectiveDate;
    } else if (action.actionType === "resignation") {
      empUpdate.employmentStatus = "resigned";
      empUpdate.terminationDate = action.effectiveDate;
    } else if (action.actionType === "probation_complete") {
      empUpdate.employmentStatus = "active";
    } else if (action.actionType === "probation_fail") {
      empUpdate.employmentStatus = "terminated";
      empUpdate.terminationDate = action.effectiveDate;
    } else if (action.actionType === "return_from_leave") {
      empUpdate.employmentStatus = "active";
    }

    await db.transaction(async (tx) => {
      if (insertSalaryComponent) {
        await tx.update(employeeSalaryComponentsTable)
          .set({ effectiveTo: dayBefore(action.effectiveDate) })
          .where(and(
            eq(employeeSalaryComponentsTable.employeeId, action.employeeId),
            isNull(employeeSalaryComponentsTable.effectiveTo)
          ));
      }
      if (Object.keys(empUpdate).length > 0) {
        await tx.update(employeesTable).set(empUpdate).where(eq(employeesTable.id, action.employeeId));
      }
      await tx.update(employeeActionsTable)
        .set({ status: "applied" })
        .where(eq(employeeActionsTable.id, actionId));
      if (insertSalaryComponent) {
        const newBasic    = empUpdate.basicSalary         ?? emp.basicSalary         ?? "0";
        const newHousing  = empUpdate.housingAllowance    ?? emp.housingAllowance    ?? "0";
        const newTransport= empUpdate.transportAllowance  ?? emp.transportAllowance  ?? "0";
        const newMobile   = empUpdate.mobileAllowance     ?? emp.mobileAllowance     ?? "0";
        const newMeal     = empUpdate.mealAllowance       ?? emp.mealAllowance       ?? "0";
        const salaryComps = await tx.select()
          .from(salaryComponentsTable)
          .where(and(
            eq(salaryComponentsTable.companyId, user.companyId),
            eq(salaryComponentsTable.isActive, true),
            inArray(salaryComponentsTable.code, ["BASIC","HOUSING","TRANSPORT","MOBILE","MEAL"])
          ));
        const compByCode: Record<string, number> = {};
        for (const sc of salaryComps) compByCode[sc.code] = sc.id;
        const toInsert: { employeeId: number; salaryComponentId: number; overrideValue: string; effectiveFrom: string }[] = [];
        if (parseFloat(String(newBasic))    > 0 && compByCode["BASIC"])     toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode["BASIC"],     overrideValue: String(newBasic),     effectiveFrom: action.effectiveDate });
        if (parseFloat(String(newHousing))  > 0 && compByCode["HOUSING"])   toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode["HOUSING"],   overrideValue: String(newHousing),   effectiveFrom: action.effectiveDate });
        if (parseFloat(String(newTransport))> 0 && compByCode["TRANSPORT"]) toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode["TRANSPORT"], overrideValue: String(newTransport), effectiveFrom: action.effectiveDate });
        if (parseFloat(String(newMobile))   > 0 && compByCode["MOBILE"])    toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode["MOBILE"],    overrideValue: String(newMobile),    effectiveFrom: action.effectiveDate });
        if (parseFloat(String(newMeal))     > 0 && compByCode["MEAL"])      toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode["MEAL"],      overrideValue: String(newMeal),      effectiveFrom: action.effectiveDate });
        if (toInsert.length) await tx.insert(employeeSalaryComponentsTable).values(toInsert);
      }
    });

    await logActivity(user.companyId, "employee_action", `${action.actionType} approved for employee #${action.employeeId}`, null);
    // ── Notification ───────────────────────────────────────────────────────
    const approvedLabelEn = ACTION_TYPE_LABELS[action.actionType]?.en ?? action.actionType;
    const approvedLabelAr = ACTION_TYPE_LABELS[action.actionType]?.ar ?? action.actionType;
    await notifyEmployee(action.employeeId, user.companyId, {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "employee_action",
      entityId: action.id,
      notificationType: "employee_action_approved",
      titleAr: `تمت الموافقة على إجراء: ${approvedLabelAr}`,
      titleEn: `Action Approved: ${approvedLabelEn}`,
      messageAr: `تمت الموافقة على إجراء "${approvedLabelAr}" الخاص بك.`,
      messageEn: `Your "${approvedLabelEn}" action has been approved.`,
      priority: "high",
      actionUrl: "/app/my-profile",
    });
    res.json({ success: true });
  } catch (e) {
    console.error("[POST /api/employee-actions/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/employee-actions/:id/reject — mark rejected, no side effects
app.post("/api/employee-actions/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "hradmin" && user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Only HR admins can reject actions" }); return;
    }
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid action id" }); return; }

    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Action not found" }); return; }
    if (action.status !== "pending") { res.status(400).json({ success: false, message: "Action is not pending" }); return; }

    await db.update(employeeActionsTable)
      .set({ status: "rejected" })
      .where(eq(employeeActionsTable.id, actionId));

    await logActivity(user.companyId, "employee_action", `${action.actionType} rejected for employee #${action.employeeId}`, null);
    // ── Notification ───────────────────────────────────────────────────────
    const rejLabelEn = ACTION_TYPE_LABELS[action.actionType]?.en ?? action.actionType;
    const rejLabelAr = ACTION_TYPE_LABELS[action.actionType]?.ar ?? action.actionType;
    await notifyEmployee(action.employeeId, user.companyId, {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "employee_action",
      entityId: action.id,
      notificationType: "employee_action_rejected",
      titleAr: `تم رفض إجراء: ${rejLabelAr}`,
      titleEn: `Action Rejected: ${rejLabelEn}`,
      messageAr: `تم رفض إجراء "${rejLabelAr}" الخاص بك.`,
      messageEn: `Your "${rejLabelEn}" action was rejected.`,
      priority: "high",
      actionUrl: "/app/my-profile",
    });
    res.json({ success: true });
  } catch (e) {
    console.error("[POST /api/employee-actions/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Org Nodes ────────────────────────────────────────────────────────────────

// GET /api/org-nodes — flat list for current company
app.get("/api/org-nodes", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const nodes = await db.select().from(orgNodesTable)
      .where(and(eq(orgNodesTable.companyId, user.companyId), eq(orgNodesTable.isDeleted, false)))
      .orderBy(asc(orgNodesTable.sortOrder), asc(orgNodesTable.nameEn));
    res.json({ success: true, data: nodes });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/org-nodes/flat — alias for flat list
app.get("/api/org-nodes/flat", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const nodes = await db.select().from(orgNodesTable)
      .where(and(eq(orgNodesTable.companyId, user.companyId), eq(orgNodesTable.isDeleted, false)))
      .orderBy(asc(orgNodesTable.sortOrder), asc(orgNodesTable.nameEn));
    res.json({ success: true, data: nodes });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/org-nodes/tree — nested tree structure (built in-memory from flat list)
app.get("/api/org-nodes/tree", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const nodes = await db.select().from(orgNodesTable)
      .where(and(eq(orgNodesTable.companyId, user.companyId), eq(orgNodesTable.isDeleted, false)))
      .orderBy(asc(orgNodesTable.sortOrder), asc(orgNodesTable.nameEn));

    // Build tree in-memory
    type TreeNode = typeof nodes[number] & { children: TreeNode[] };
    const map = new Map<number, TreeNode>();
    for (const n of nodes) map.set(n.id, { ...n, children: [] });
    const roots: TreeNode[] = [];
    for (const n of map.values()) {
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children.push(n);
      } else {
        roots.push(n);
      }
    }
    res.json({ success: true, data: roots });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/org-nodes/:id/descendants — all descendant node IDs
app.get("/api/org-nodes/:id/descendants", auth, async (req, res) => {
  try {
    const nodeIds = await getDescendantNodeIds(parseInt(req.params["id"]!));
    res.json({ success: true, data: nodeIds });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/org-nodes — create node [hradmin only]
app.post("/api/org-nodes", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const [node] = await db.insert(orgNodesTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json({ success: true, data: node });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/org-nodes/:id — update node [hradmin only]
app.put("/api/org-nodes/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const [node] = await db.update(orgNodesTable).set(req.body).where(
      and(eq(orgNodesTable.id, parseInt(req.params["id"]!)), eq(orgNodesTable.companyId, user.companyId))
    ).returning();
    if (!node) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: node });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/org-nodes/:id — soft delete [hradmin only] — BLOCK if has employees or children
app.delete("/api/org-nodes/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const nodeId = parseInt(req.params["id"]!);
    // Block if has active children
    const [childCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(orgNodesTable).where(and(eq(orgNodesTable.parentId, nodeId), eq(orgNodesTable.isDeleted, false)));
    if ((childCount?.count ?? 0) > 0) {
      res.status(400).json({ success: false, message: "Cannot delete: this node has child units. Remove them first." }); return;
    }
    // Block if has assigned employees
    const [empCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeesTable).where(and(eq(employeesTable.orgNodeId, nodeId), eq(employeesTable.isDeleted, false)));
    if ((empCount?.count ?? 0) > 0) {
      res.status(400).json({ success: false, message: "Cannot delete: employees are assigned to this unit. Reassign them first." }); return;
    }
    await db.update(orgNodesTable).set({ isDeleted: true }).where(eq(orgNodesTable.id, nodeId));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Permissions ──────────────────────────────────────────────────────────────

// GET /api/permissions/my — full permission map for current user
app.get("/api/permissions/my", auth, async (req, res) => {
  try {
    const map = await getPermissionMap(req as AuthReq);
    res.json({ success: true, data: { screens: map.screens, dataScope: map.dataScope } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/permissions/check?screen=&action= — single permission check
app.get("/api/permissions/check", auth, async (req, res) => {
  try {
    const { screen, action } = req.query as { screen: string; action: string };
    if (!screen || !action) {
      res.status(400).json({ success: false, message: "screen and action are required" }); return;
    }
    const allowed = await hasPermission(req as AuthReq, screen, action);
    res.json({ success: true, data: { allowed } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Departments ──────────────────────────────────────────────────────────────
app.get("/api/departments", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const depts = await db.select().from(departmentsTable)
      .where(and(eq(departmentsTable.companyId, user.companyId), eq(departmentsTable.isDeleted, false)))
      .orderBy(asc(departmentsTable.nameEn));
    res.json({ success: true, data: depts });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/departments", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [dept] = await db.insert(departmentsTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json({ success: true, data: dept });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/departments/:id", auth, async (req, res) => {
  try {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, parseInt(req.params["id"]!)));
    if (!dept) { res.status(404).json({ success: false, message: "Department not found" }); return; }
    res.json({ success: true, data: dept });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/departments/:id", auth, async (req, res) => {
  try {
    const [dept] = await db.update(departmentsTable).set(req.body).where(eq(departmentsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: dept });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/departments/:id", auth, async (req, res) => {
  try {
    await db.update(departmentsTable).set({ isDeleted: true }).where(eq(departmentsTable.id, parseInt(req.params["id"]!)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Job Titles ───────────────────────────────────────────────────────────────
app.get("/api/job-titles", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const rows = await db.select({
      id: jobDescriptionsTable.id,
      companyId: jobDescriptionsTable.companyId,
      titleAr: jobDescriptionsTable.titleAr,
      titleEn: jobDescriptionsTable.titleEn,
      grade: jobDescriptionsTable.grade,
      isActive: jobDescriptionsTable.isActive,
    }).from(jobDescriptionsTable)
      .where(and(eq(jobDescriptionsTable.companyId, user.companyId), eq(jobDescriptionsTable.isActive, true)))
      .orderBy(asc(jobDescriptionsTable.titleEn));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/job-titles", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [title] = await db.insert(jobTitlesTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json({ success: true, data: title });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/job-titles/:id", auth, async (req, res) => {
  try {
    const [title] = await db.update(jobTitlesTable).set(req.body).where(eq(jobTitlesTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: title });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/job-titles/:id", auth, async (req, res) => {
  try {
    await db.update(jobTitlesTable).set({ isDeleted: true }).where(eq(jobTitlesTable.id, parseInt(req.params["id"]!)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Leave Requests ───────────────────────────────────────────────────────────
app.get("/api/leave/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, status } = req.query as Record<string, string>;
    const conditions: any[] = [eq(leaveRequestsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(leaveRequestsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(leaveRequestsTable.employeeId, ids));
    } else if (employeeId) {
      conditions.push(eq(leaveRequestsTable.employeeId, parseInt(employeeId)));
    }
    if (status) conditions.push(eq(leaveRequestsTable.status, status));
    const rows = await db.select().from(leaveRequestsTable).where(and(...conditions)).orderBy(desc(leaveRequestsTable.createdAt));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const body = req.body;
    const [req2] = await db.insert(leaveRequestsTable).values({ ...body, status: "pending" }).returning();
    await logActivity(user.companyId, "leave_request", `Leave request submitted`, null);
    // ── Notifications ──────────────────────────────────────────────────────
    const empId = body.employeeId ?? user.employeeId;
    const dateRange = fmtDateRange(body.startDate, body.endDate);
    const empName = user.username;
    const notifPayload = {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "leave_request",
      entityId: req2.id,
      notificationType: "leave_request_created",
      titleAr: "طلب إجازة جديد",
      titleEn: "New Leave Request",
      messageAr: `قدّم ${empName} طلب إجازة من ${dateRange}.`,
      messageEn: `${empName} submitted a leave request from ${dateRange}.`,
      priority: "normal" as const,
      actionUrl: "/app/leave",
    };
    await notifyRole(user.companyId, "hradmin", notifPayload);
    if (empId) await notifyDirectManager(empId, notifPayload);
    res.status(201).json({ success: true, data: req2 });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/leave/requests/:id", auth, async (req, res) => {
  try {
    const [lr] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, parseInt(req.params["id"]!)));
    if (!lr) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: lr });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [lr] = await db.update(leaveRequestsTable).set({
      status: "approved", approvedById: user.userId, approvedAt: new Date(),
    }).where(eq(leaveRequestsTable.id, parseInt(req.params["id"]!))).returning();
    // ── Notification ───────────────────────────────────────────────────────
    if (lr?.employeeId) {
      await notifyEmployee(lr.employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "leave_request",
        entityId: lr.id,
        notificationType: "leave_request_approved",
        titleAr: "تمت الموافقة على طلب الإجازة",
        titleEn: "Leave Request Approved",
        messageAr: `تمت الموافقة على طلب إجازتك من ${fmtDateRange(lr.startDate, lr.endDate)}.`,
        messageEn: `Your leave request from ${fmtDateRange(lr.startDate, lr.endDate)} was approved.`,
        priority: "high",
        actionUrl: "/app/my-leave",
      });
    }
    res.json({ success: true, data: lr });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { reason } = req.body as { reason: string };
    const [lr] = await db.update(leaveRequestsTable).set({
      status: "rejected", rejectionReason: reason,
    }).where(eq(leaveRequestsTable.id, parseInt(req.params["id"]!))).returning();
    // ── Notification ───────────────────────────────────────────────────────
    if (lr?.employeeId) {
      await notifyEmployee(lr.employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "leave_request",
        entityId: lr.id,
        notificationType: "leave_request_rejected",
        titleAr: "تم رفض طلب الإجازة",
        titleEn: "Leave Request Rejected",
        messageAr: `تم رفض طلب إجازتك من ${fmtDateRange(lr.startDate, lr.endDate)}.`,
        messageEn: `Your leave request from ${fmtDateRange(lr.startDate, lr.endDate)} was rejected.`,
        priority: "high",
        actionUrl: "/app/my-leave",
      });
    }
    res.json({ success: true, data: lr });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Leave Policies ───────────────────────────────────────────────────────────
app.get("/api/leave/policies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const policies = await db.select().from(leavePoliciesTable)
      .where(and(eq(leavePoliciesTable.companyId, user.companyId), eq(leavePoliciesTable.isDeleted, false)));
    res.json({ success: true, data: policies });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/policies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [policy] = await db.insert(leavePoliciesTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json({ success: true, data: policy });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/leave/policies/:id", auth, async (req, res) => {
  try {
    const [policy] = await db.update(leavePoliciesTable).set(req.body).where(eq(leavePoliciesTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: policy });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
app.get("/api/payroll/runs", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { year, month } = req.query as Record<string, string>;
    const conditions = [eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.isDeleted, false)];
    if (year) conditions.push(eq(payrollRunsTable.runYear, parseInt(year)));
    if (month) conditions.push(eq(payrollRunsTable.runMonth, parseInt(month)));
    const runs = await db.select().from(payrollRunsTable).where(and(...conditions)).orderBy(desc(payrollRunsTable.createdAt));
    res.json({ success: true, data: runs });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Payroll helpers ─────────────────────────────────────────────────────────
function toM(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.round(n * 1000);
}
function fromM(n: number): string {
  return (Math.round(n) / 1000).toFixed(3);
}
async function enrichPayslips(slips: any[], db: any): Promise<any[]> {
  if (!slips.length) return [];
  const empIds = [...new Set(slips.map(s => s.employeeId))];
  const runIds = [...new Set(slips.map(s => s.payrollRunId))];
  const [emps, runs, nodes] = await Promise.all([
    db.select().from(employeesTable).where(inArray(employeesTable.id, empIds)),
    db.select().from(payrollRunsTable).where(inArray(payrollRunsTable.id, runIds)),
    db.select().from(orgNodesTable),
  ]);
  const mid = (s: string | null) => (s ? ` ${s}` : "");
  return slips.map(slip => {
    const emp = emps.find((e: any) => e.id === slip.employeeId);
    const run = runs.find((r: any) => r.id === slip.payrollRunId);
    const node = emp?.orgNodeId ? nodes.find((n: any) => n.id === emp.orgNodeId) : null;
    const fullNameAr = emp ? `${emp.firstNameAr}${mid(emp.middleNameAr)} ${emp.lastNameAr}`.trim() : "";
    const fullNameEn = emp ? `${emp.firstNameEn}${mid(emp.middleNameEn)} ${emp.lastNameEn}`.trim() : "";
    return {
      ...slip,
      periodMonth: slip.runMonth,
      periodYear: slip.runYear,
      overtimeAmount: slip.overtimeEarnings,
      sscEmployeeDeduction: slip.sscDeduction,
      fullNameAr,
      fullNameEn,
      employeeCode: emp?.employeeCode ?? "",
      jobTitle: emp?.jobTitle ?? "",
      orgNodeNameAr: node?.nameAr ?? null,
      orgNodeNameEn: node?.nameEn ?? null,
      payrollRunStatus: run?.status ?? null,
    };
  });
}

app.post("/api/payroll/runs", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden: payroll admin required" }); return;
    }
    const runMonth = Number(req.body.month ?? req.body.runMonth);
    const runYear = Number(req.body.year ?? req.body.runYear);
    const notes: string | undefined = req.body.notes;
    if (!runMonth || !runYear) {
      res.status(400).json({ success: false, message: "month and year are required" }); return;
    }

    // Immutability guard: block if an approved run exists for this period
    const [existingApproved] = await db.select({ id: payrollRunsTable.id })
      .from(payrollRunsTable)
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.runMonth, runMonth),
        eq(payrollRunsTable.runYear, runYear),
        eq(payrollRunsTable.status, "approved"),
        eq(payrollRunsTable.isDeleted, false),
      ));
    if (existingApproved) {
      res.status(409).json({ success: false, message: "An approved payroll run already exists for this period. It cannot be replaced." }); return;
    }

    const result = await runPayroll(db, { companyId: user.companyId, runMonth, runYear, notes });
    res.status(201).json({ success: true, data: result.run });
  } catch (e) {
    console.error("[POST /api/payroll/runs]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/runs/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const [run] = await db.select().from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.id, parseInt(req.params["id"]!)), eq(payrollRunsTable.companyId, user.companyId)));
    if (!run) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: run });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/runs/:id/payslips", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const runId = parseInt(req.params["id"]!);
    const [run] = await db.select({ id: payrollRunsTable.id }).from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.id, runId), eq(payrollRunsTable.companyId, user.companyId)));
    if (!run) { res.status(404).json({ success: false, message: "Run not found" }); return; }
    const slips = await db.select().from(payslipsTable).where(eq(payslipsTable.payrollRunId, runId));
    const enriched = await enrichPayslips(slips, db);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/payroll/runs/:id/payslips]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/payroll/runs/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden: payroll admin required" }); return;
    }
    const runId = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.id, runId), eq(payrollRunsTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    if (existing.status === "approved") {
      res.status(409).json({ success: false, message: "This payroll run is already approved and immutable." }); return;
    }
    const [run] = await db.update(payrollRunsTable).set({
      status: "approved", approvedAt: new Date(), approvedById: user.userId,
    }).where(eq(payrollRunsTable.id, runId)).returning();
    res.json({ success: true, data: run });
  } catch (e) {
    console.error("[POST /api/payroll/runs/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/slips", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { employeeId, year, month } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (employeeId) conditions.push(eq(payslipsTable.employeeId, parseInt(employeeId)));
    if (year) conditions.push(eq(payslipsTable.runYear, parseInt(year)));
    if (month) conditions.push(eq(payslipsTable.runMonth, parseInt(month)));
    const slips = conditions.length > 0
      ? await db.select().from(payslipsTable).where(and(...conditions)).orderBy(desc(payslipsTable.createdAt))
      : await db.select().from(payslipsTable).orderBy(desc(payslipsTable.createdAt));
    const enriched = await enrichPayslips(slips, db);
    res.json({ success: true, data: enriched });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── /my routes must be registered BEFORE /:id to avoid "my" being caught as an id param ──
app.get("/api/payroll/slips/my", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const slips = await db.select().from(payslipsTable)
      .where(eq(payslipsTable.employeeId, user.employeeId))
      .orderBy(desc(payslipsTable.createdAt));
    const enriched = await enrichPayslips(slips, db);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[/api/payroll/slips/my]", e);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.get("/api/payroll/slips/my/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) {
      res.json({ success: true, data: { totalNetYTD: 0, totalEarnings: 0, totalDeductions: 0, netSalary: 0, lastPayslip: null } }); return;
    }
    const slips = await db.select().from(payslipsTable)
      .where(eq(payslipsTable.employeeId, user.employeeId))
      .orderBy(desc(payslipsTable.createdAt));
    const enriched = await enrichPayslips(slips, db);
    const ytdM = enriched.reduce((s: number, p: any) => s + toM(p.netSalary), 0);
    const latest = enriched[0] ?? null;
    res.json({ success: true, data: {
      totalNetYTD:     ytdM / 1000,
      totalEarnings:   latest ? parseFloat(latest.grossSalary) : 0,
      totalDeductions: latest ? parseFloat(latest.totalDeductions) : 0,
      netSalary:       latest ? parseFloat(latest.netSalary) : 0,
      lastPayslip:     latest,
    }});
  } catch (e) {
    console.error("[/api/payroll/slips/my/summary]", e);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

app.get("/api/payroll/slips/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const idVal = parseInt(req.params["id"]!);
    if (isNaN(idVal)) { res.status(400).json({ success: false, error: "Invalid slip ID" }); return; }
    const [slip] = await db.select().from(payslipsTable).where(eq(payslipsTable.id, idVal));
    if (!slip) { res.status(404).json({ success: false, error: "Not found" }); return; }
    // Employees may only view their own slips
    if (user.role === "employee" && slip.employeeId !== user.employeeId) {
      res.status(403).json({ success: false, error: "Forbidden" }); return;
    }
    const [enriched] = await enrichPayslips([slip], db);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[/api/payroll/slips/:id]", e);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// ─── Salary preview (calculate without creating run) ──────────────────────────
app.get("/api/payroll/preview/:employeeId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params["employeeId"]!);
    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    const configs = await db.select().from(systemConfigurationsTable)
      .where(eq(systemConfigurationsTable.companyId, user.companyId));
    const cfg = (key: string, fallback: string) => configs.find((c: any) => c.key === key)?.value ?? fallback;
    const sscEmployeeRate  = parseFloat(cfg("ssc_employee_rate", "0.075"));
    const sscEmployerRate  = parseFloat(cfg("ssc_employer_rate", "0.1425"));
    const sscInsurableCapM = toM(cfg("ssc_insurable_salary_cap", "3000"));
    let taxBrackets: { from: number; to: number; rate: number }[] = [];
    try { taxBrackets = JSON.parse(cfg("income_tax_brackets", "[]")); } catch {}
    if (!taxBrackets.length) taxBrackets = [
      { from: 0, to: 9000, rate: 0 }, { from: 9000, to: 20000, rate: 0.05 },
      { from: 20000, to: 30000, rate: 0.10 }, { from: 30000, to: 40000, rate: 0.15 },
      { from: 40000, to: 50000, rate: 0.20 }, { from: 50000, to: 999999999, rate: 0.25 },
    ];

    // Load full normalized salary components with catalog data (current as of today)
    const today = new Date().toISOString().slice(0, 10);
    const escRowsPreview = await db
      .select({
        code:              salaryComponentsTable.code,
        calculationType:   salaryComponentsTable.calculationType,
        defaultValue:      salaryComponentsTable.defaultValue,
        percentageBase:    salaryComponentsTable.percentageBase,
        overrideValue:     employeeSalaryComponentsTable.overrideValue,
      })
      .from(employeeSalaryComponentsTable)
      .innerJoin(salaryComponentsTable, eq(salaryComponentsTable.id, employeeSalaryComponentsTable.salaryComponentId))
      .where(and(
        eq(employeeSalaryComponentsTable.employeeId, emp.id),
        lte(employeeSalaryComponentsTable.effectiveFrom, today),
        isNull(employeeSalaryComponentsTable.effectiveTo),
      ));

    // Resolve each component value respecting fixed/percentage/override semantics
    const resolveM = (code: string, fallbackJod: string): number => {
      const row = escRowsPreview.find((r: any) => r.code === code);
      if (!row) return toM(fallbackJod);
      if (row.overrideValue !== null && row.overrideValue !== undefined) {
        // Override is always an absolute JOD amount regardless of calculation type
        return toM(row.overrideValue);
      }
      if (row.calculationType === 'percentage') {
        // Default: percentage of basic (resolved after basic is known)
        return -1; // sentinel — resolved below
      }
      return toM(row.defaultValue ?? "0");
    };

    const basicM     = resolveM("BASIC", String(emp.basicSalary ?? "0"));
    const basicJOD   = basicM / 1000;

    const resolvePercentM = (code: string, fallbackJod: string): number => {
      const row = escRowsPreview.find((r: any) => r.code === code);
      if (!row) return toM(fallbackJod);
      if (row.overrideValue !== null && row.overrideValue !== undefined) return toM(row.overrideValue);
      if (row.calculationType === 'percentage') {
        const pct  = parseFloat(row.defaultValue ?? "0");
        const base = row.percentageBase === 'gross' ? basicJOD : basicJOD;
        return Math.round((pct / 100) * base * 1000);
      }
      return toM(row.defaultValue ?? "0");
    };

    const housingM   = resolvePercentM("HOUSING",   String(emp.housingAllowance   ?? "0"));
    const transportM = resolvePercentM("TRANSPORT",  String(emp.transportAllowance ?? "0"));
    const mealM      = resolvePercentM("MEAL",       String(emp.mealAllowance      ?? "0"));
    const mobileM    = resolvePercentM("MOBILE",     String(emp.mobileAllowance    ?? "0"));
    const otherM     = toM(String(emp.otherAllowances ?? "0"));
    const grossM     = basicM + housingM + transportM + mealM + mobileM + otherM;

    const insurableM   = Math.min(basicM, sscInsurableCapM);
    const sscEmployeeM = emp.isSSCExempt ? 0 : Math.round(insurableM * sscEmployeeRate);
    const sscEmployerM = emp.isSSCExempt ? 0 : Math.round(insurableM * sscEmployerRate);

    const taxExemptionJOD       = parseFloat(String(emp.taxExemptionAmount ?? "0"));
    const personalExemptionJOD  = parseFloat(cfg("income_tax_personal_exemption", "9000"));
    const familyExemptionJOD    = emp.maritalStatus === "married" ? parseFloat(cfg("income_tax_family_exemption", "500")) : 0;
    const annualTaxableJOD      = Math.max(0, (grossM - sscEmployeeM) * 12 / 1000 - personalExemptionJOD - familyExemptionJOD - taxExemptionJOD);
    const annualTaxJOD          = applyBrackets(annualTaxableJOD, taxBrackets);
    const monthlyTaxM           = Math.round(annualTaxJOD * 1000 / 12);
    const totalDeductionsM      = sscEmployeeM + monthlyTaxM;
    const netM                  = grossM - totalDeductionsM;

    res.json({ success: true, data: {
      employeeId: emp.id,
      basicSalary:             fromM(basicM),
      housingAllowance:        fromM(housingM),
      transportAllowance:      fromM(transportM),
      mealAllowance:           fromM(mealM),
      mobileAllowance:         fromM(mobileM),
      otherAllowances:         fromM(otherM),
      grossSalary:             fromM(grossM),
      insurableBase:           fromM(insurableM),
      sscEmployeeDeduction:    fromM(sscEmployeeM),
      sscEmployerContribution: fromM(sscEmployerM),
      annualTaxableIncome:     annualTaxableJOD.toFixed(3),
      incomeTaxDeduction:      fromM(monthlyTaxM),
      totalDeductions:         fromM(totalDeductionsM),
      netSalary:               fromM(netM),
      isSSCExempt:             emp.isSSCExempt,
      components:              escRowsPreview,
    }});
  } catch (e) {
    console.error("[GET /api/payroll/preview/:employeeId]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Salary component definitions ────────────────────────────────────────────
app.get("/api/salary-components/definitions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const rows = await db.select().from(salaryComponentDefinitionsTable)
      .where(eq(salaryComponentDefinitionsTable.companyId, user.companyId))
      .orderBy(asc(salaryComponentDefinitionsTable.sortOrder), asc(salaryComponentDefinitionsTable.id));
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/salary-components/definitions]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/salary-components/definitions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { componentKey, nameAr, nameEn, componentType, percentage, baseRef,
            isBasic, isInsurable, isTaxable, isDeduction, sortOrder } = req.body;
    if (!componentKey || !nameAr || !nameEn) {
      res.status(400).json({ success: false, message: "componentKey, nameAr, nameEn are required" }); return;
    }
    const [row] = await db.insert(salaryComponentDefinitionsTable).values({
      companyId: user.companyId,
      componentKey, nameAr, nameEn,
      componentType: componentType ?? "fixed",
      percentage:   percentage != null ? String(percentage) : null,
      baseRef:      baseRef ?? null,
      isBasic:      isBasic ?? false,
      isInsurable:  isInsurable ?? true,
      isTaxable:    isTaxable ?? true,
      isDeduction:  isDeduction ?? false,
      sortOrder:    sortOrder ?? 0,
      isActive:     true,
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/salary-components/definitions]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/salary-components/definitions/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const allowed = ["nameAr", "nameEn", "componentType", "percentage", "baseRef",
                     "isBasic", "isInsurable", "isTaxable", "isDeduction", "sortOrder", "isActive"];
    const updates: any = {};
    for (const key of allowed) { if (key in req.body) updates[key] = req.body[key]; }
    if (!Object.keys(updates).length) {
      res.status(400).json({ success: false, message: "No valid fields to update" }); return;
    }
    const [row] = await db.update(salaryComponentDefinitionsTable)
      .set(updates)
      .where(and(eq(salaryComponentDefinitionsTable.id, id), eq(salaryComponentDefinitionsTable.companyId, user.companyId)))
      .returning();
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PATCH /api/salary-components/definitions/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/salary-components/definitions/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const [row] = await db.update(salaryComponentDefinitionsTable)
      .set({ isActive: false })
      .where(and(eq(salaryComponentDefinitionsTable.id, id), eq(salaryComponentDefinitionsTable.companyId, user.companyId)))
      .returning();
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[DELETE /api/salary-components/definitions/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Salary Components Catalog ────────────────────────────────────────────────
app.get("/api/salary-components/catalog", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const rows = await db.select().from(salaryComponentsTable)
      .where(eq(salaryComponentsTable.companyId, user.companyId))
      .orderBy(asc(salaryComponentsTable.sortOrder), asc(salaryComponentsTable.id));
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/salary-components/catalog]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/salary-components/catalog", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { nameAr, nameEn, code, componentType, calculationType, defaultValue,
            formulaExpression, percentageBase, isTaxable, isSscApplicable,
            isRecurring, isActive, sortOrder } = req.body;
    if (!nameEn || !code) {
      res.status(400).json({ success: false, message: "nameEn and code are required" }); return;
    }
    const [row] = await db.insert(salaryComponentsTable).values({
      companyId: user.companyId,
      nameAr: nameAr ?? nameEn,
      nameEn,
      code: code.toUpperCase(),
      componentType: componentType ?? "earning",
      calculationType: calculationType ?? "fixed",
      defaultValue: String(defaultValue ?? "0"),
      formulaExpression: formulaExpression ?? null,
      percentageBase: percentageBase ?? null,
      isTaxable: isTaxable ?? true,
      isSscApplicable: isSscApplicable ?? false,
      isRecurring: isRecurring ?? true,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/salary-components/catalog]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/salary-components/catalog/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const { nameAr, nameEn, componentType, calculationType, defaultValue,
            formulaExpression, percentageBase, isTaxable, isSscApplicable,
            isRecurring, isActive, sortOrder } = req.body;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (nameAr !== undefined) update.nameAr = nameAr;
    if (nameEn !== undefined) update.nameEn = nameEn;
    if (componentType !== undefined) update.componentType = componentType;
    if (calculationType !== undefined) update.calculationType = calculationType;
    if (defaultValue !== undefined) update.defaultValue = String(defaultValue);
    if (formulaExpression !== undefined) update.formulaExpression = formulaExpression;
    if (percentageBase !== undefined) update.percentageBase = percentageBase;
    if (isTaxable !== undefined) update.isTaxable = isTaxable;
    if (isSscApplicable !== undefined) update.isSscApplicable = isSscApplicable;
    if (isRecurring !== undefined) update.isRecurring = isRecurring;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;
    const [row] = await db.update(salaryComponentsTable).set(update)
      .where(and(eq(salaryComponentsTable.id, id), eq(salaryComponentsTable.companyId, user.companyId)))
      .returning();
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PATCH /api/salary-components/catalog/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/salary-components/catalog/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const [row] = await db.update(salaryComponentsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(salaryComponentsTable.id, id), eq(salaryComponentsTable.companyId, user.companyId)))
      .returning({ id: salaryComponentsTable.id });
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/salary-components/catalog/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Employee Salary Components ───────────────────────────────────────────────
app.get("/api/employees/:id/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params.id, 10);
    const [emp] = await db.select({ id: employeesTable.id, basicSalary: employeesTable.basicSalary })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    const rows = await db
      .select({
        id: employeeSalaryComponentsTable.id,
        employeeId: employeeSalaryComponentsTable.employeeId,
        salaryComponentId: employeeSalaryComponentsTable.salaryComponentId,
        overrideValue: employeeSalaryComponentsTable.overrideValue,
        effectiveFrom: employeeSalaryComponentsTable.effectiveFrom,
        effectiveTo: employeeSalaryComponentsTable.effectiveTo,
        notes: employeeSalaryComponentsTable.notes,
        createdAt: employeeSalaryComponentsTable.createdAt,
        code: salaryComponentsTable.code,
        nameAr: salaryComponentsTable.nameAr,
        nameEn: salaryComponentsTable.nameEn,
        componentType: salaryComponentsTable.componentType,
        calculationType: salaryComponentsTable.calculationType,
        defaultValue: salaryComponentsTable.defaultValue,
        formulaExpression: salaryComponentsTable.formulaExpression,
        percentageBase: salaryComponentsTable.percentageBase,
        isTaxable: salaryComponentsTable.isTaxable,
        isSscApplicable: salaryComponentsTable.isSscApplicable,
        isRecurring: salaryComponentsTable.isRecurring,
        isActive: salaryComponentsTable.isActive,
        sortOrder: salaryComponentsTable.sortOrder,
      })
      .from(employeeSalaryComponentsTable)
      .innerJoin(salaryComponentsTable, eq(salaryComponentsTable.id, employeeSalaryComponentsTable.salaryComponentId))
      .where(eq(employeeSalaryComponentsTable.employeeId, empId))
      .orderBy(asc(salaryComponentsTable.sortOrder), desc(employeeSalaryComponentsTable.effectiveFrom));
    // Resolve basic salary for percentage calculations
    const basicRow = rows.find(r => r.code === "BASIC");
    const basicJOD = basicRow
      ? (basicRow.overrideValue ? parseFloat(basicRow.overrideValue) : parseFloat(basicRow.defaultValue ?? "0"))
      : parseFloat(String(emp.basicSalary ?? "0"));
    let runningGrossJOD = 0;
    const enriched = rows.map(r => {
      const valM = calculateComponentValueM(
        { calculationType: r.calculationType, defaultValue: r.defaultValue ?? "0",
          formulaExpression: r.formulaExpression ?? null, percentageBase: r.percentageBase ?? null,
          isTaxable: r.isTaxable, isSscApplicable: r.isSscApplicable },
        r.overrideValue,
        basicJOD,
        runningGrossJOD,
      );
      if (r.componentType === "earning") runningGrossJOD += valM / 1000;
      return { ...r, calculatedValueJOD: (valM / 1000).toFixed(3) };
    });
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/employees/:id/salary-components]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/employees/:id/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params.id, 10);
    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    const { salaryComponentId, overrideValue, effectiveFrom, effectiveTo, notes } = req.body;
    if (!salaryComponentId || !effectiveFrom) {
      res.status(400).json({ success: false, message: "salaryComponentId and effectiveFrom are required" }); return;
    }
    const [sc] = await db.select({ id: salaryComponentsTable.id }).from(salaryComponentsTable)
      .where(and(eq(salaryComponentsTable.id, salaryComponentId), eq(salaryComponentsTable.companyId, user.companyId)));
    if (!sc) { res.status(404).json({ success: false, message: "Salary component not found" }); return; }
    const [row] = await db.insert(employeeSalaryComponentsTable).values({
      employeeId: empId,
      salaryComponentId,
      overrideValue: overrideValue != null ? String(overrideValue) : null,
      effectiveFrom,
      effectiveTo: effectiveTo ?? null,
      notes: notes ?? null,
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/employees/:id/salary-components]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/employee-salary-components/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const { overrideValue, effectiveFrom, effectiveTo, notes } = req.body;
    const update: Record<string, any> = {};
    if (overrideValue !== undefined) update.overrideValue = overrideValue != null ? String(overrideValue) : null;
    if (effectiveFrom !== undefined) update.effectiveFrom = effectiveFrom;
    if (effectiveTo !== undefined) update.effectiveTo = effectiveTo;
    if (notes !== undefined) update.notes = notes;
    // Verify ownership via employee → company
    const [existing] = await db
      .select({ employeeId: employeeSalaryComponentsTable.employeeId })
      .from(employeeSalaryComponentsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeSalaryComponentsTable.employeeId))
      .where(and(eq(employeeSalaryComponentsTable.id, id), eq(employeesTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    const [row] = await db.update(employeeSalaryComponentsTable).set(update)
      .where(eq(employeeSalaryComponentsTable.id, id)).returning();
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PATCH /api/employee-salary-components/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/employee-salary-components/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const [existing] = await db
      .select({ id: employeeSalaryComponentsTable.id })
      .from(employeeSalaryComponentsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeSalaryComponentsTable.employeeId))
      .where(and(eq(employeeSalaryComponentsTable.id, id), eq(employeesTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    await db.delete(employeeSalaryComponentsTable).where(eq(employeeSalaryComponentsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/employee-salary-components/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Step 4: Canonical Salary Component API ───────────────────────────────────

// GET /api/salary-components — full catalog with isReferenced flag [all auth]
app.get("/api/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const rows = await db.select().from(salaryComponentsTable)
      .where(eq(salaryComponentsTable.companyId, user.companyId))
      .orderBy(asc(salaryComponentsTable.sortOrder), asc(salaryComponentsTable.id));
    let referencedIds = new Set<number>();
    if (rows.length) {
      const ids = rows.map(r => r.id);
      const refs = await db
        .selectDistinct({ scId: employeeSalaryComponentsTable.salaryComponentId })
        .from(employeeSalaryComponentsTable)
        .where(and(
          inArray(employeeSalaryComponentsTable.salaryComponentId, ids),
          isNull(employeeSalaryComponentsTable.effectiveTo),
        ));
      refs.forEach(r => referencedIds.add(r.scId));
    }
    res.json({ success: true, data: rows.map(r => ({ ...r, isReferenced: referencedIds.has(r.id) })) });
  } catch (e) {
    console.error("[GET /api/salary-components]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/salary-components — create component [hradmin]
app.post("/api/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { nameAr, nameEn, code, componentType, calculationType, defaultValue,
            formulaExpression, percentageBase, isTaxable, isSscApplicable,
            isRecurring, isActive, sortOrder } = req.body;
    if (!nameEn || !code) {
      res.status(400).json({ success: false, message: "nameEn and code are required" }); return;
    }
    const upperCode = (code as string).toUpperCase();
    const [dupe] = await db.select({ id: salaryComponentsTable.id }).from(salaryComponentsTable)
      .where(and(eq(salaryComponentsTable.companyId, user.companyId), eq(salaryComponentsTable.code, upperCode)));
    if (dupe) {
      res.status(409).json({ success: false, message: `Component code '${upperCode}' already exists` }); return;
    }
    const [row] = await db.insert(salaryComponentsTable).values({
      companyId: user.companyId,
      nameAr: nameAr ?? nameEn,
      nameEn,
      code: upperCode,
      componentType: componentType ?? "earning",
      calculationType: calculationType ?? "fixed",
      defaultValue: String(defaultValue ?? "0"),
      formulaExpression: formulaExpression ?? null,
      percentageBase: percentageBase ?? null,
      isTaxable: isTaxable ?? true,
      isSscApplicable: isSscApplicable ?? false,
      isRecurring: isRecurring ?? true,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
    }).returning();
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/salary-components]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/salary-components/:id — update component [hradmin]
app.put("/api/salary-components/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const { nameAr, nameEn, componentType, calculationType, defaultValue,
            formulaExpression, percentageBase, isTaxable, isSscApplicable,
            isRecurring, isActive, sortOrder } = req.body;
    const update: Record<string, any> = { updatedAt: new Date() };
    if (nameAr !== undefined) update.nameAr = nameAr;
    if (nameEn !== undefined) update.nameEn = nameEn;
    if (componentType !== undefined) update.componentType = componentType;
    if (calculationType !== undefined) update.calculationType = calculationType;
    if (defaultValue !== undefined) update.defaultValue = String(defaultValue);
    if (formulaExpression !== undefined) update.formulaExpression = formulaExpression;
    if (percentageBase !== undefined) update.percentageBase = percentageBase;
    if (isTaxable !== undefined) update.isTaxable = isTaxable;
    if (isSscApplicable !== undefined) update.isSscApplicable = isSscApplicable;
    if (isRecurring !== undefined) update.isRecurring = isRecurring;
    if (isActive !== undefined) update.isActive = isActive;
    if (sortOrder !== undefined) update.sortOrder = sortOrder;
    const [row] = await db.update(salaryComponentsTable).set(update)
      .where(and(eq(salaryComponentsTable.id, id), eq(salaryComponentsTable.companyId, user.companyId)))
      .returning();
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PUT /api/salary-components/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/salary-components/:id — soft delete; blocked if any active employee assignments [hradmin]
app.delete("/api/salary-components/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params.id, 10);
    const [ref] = await db
      .select({ id: employeeSalaryComponentsTable.id })
      .from(employeeSalaryComponentsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeSalaryComponentsTable.employeeId))
      .where(and(
        eq(employeeSalaryComponentsTable.salaryComponentId, id),
        isNull(employeeSalaryComponentsTable.effectiveTo),
        eq(employeesTable.companyId, user.companyId),
      ));
    if (ref) {
      res.status(409).json({ success: false, message: "Cannot delete: component is actively assigned to employees. End-date those assignments first." });
      return;
    }
    const [row] = await db.update(salaryComponentsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(salaryComponentsTable.id, id), eq(salaryComponentsTable.companyId, user.companyId)))
      .returning({ id: salaryComponentsTable.id });
    if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/salary-components/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/employees/:id/salary-components/:ecId — update assignment override [hradmin]
app.put("/api/employees/:id/salary-components/:ecId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params.id, 10);
    const ecId  = parseInt(req.params.ecId, 10);
    const { overrideValue, effectiveFrom, effectiveTo, notes } = req.body;
    const update: Record<string, any> = {};
    if (overrideValue !== undefined) update.overrideValue = overrideValue != null ? String(overrideValue) : null;
    if (effectiveFrom !== undefined) update.effectiveFrom = effectiveFrom;
    if (effectiveTo !== undefined) update.effectiveTo = effectiveTo;
    if (notes !== undefined) update.notes = notes;
    const [existing] = await db
      .select({ id: employeeSalaryComponentsTable.id })
      .from(employeeSalaryComponentsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeSalaryComponentsTable.employeeId))
      .where(and(
        eq(employeeSalaryComponentsTable.id, ecId),
        eq(employeeSalaryComponentsTable.employeeId, empId),
        eq(employeesTable.companyId, user.companyId),
      ));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    const [row] = await db.update(employeeSalaryComponentsTable).set(update)
      .where(eq(employeeSalaryComponentsTable.id, ecId)).returning();
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PUT /api/employees/:id/salary-components/:ecId]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/employees/:id/salary-components/:ecId — end-date assignment (effective_to = today) [hradmin]
app.delete("/api/employees/:id/salary-components/:ecId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params.id, 10);
    const ecId  = parseInt(req.params.ecId, 10);
    const [existing] = await db
      .select({ id: employeeSalaryComponentsTable.id })
      .from(employeeSalaryComponentsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, employeeSalaryComponentsTable.employeeId))
      .where(and(
        eq(employeeSalaryComponentsTable.id, ecId),
        eq(employeeSalaryComponentsTable.employeeId, empId),
        eq(employeesTable.companyId, user.companyId),
      ));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const [row] = await db.update(employeeSalaryComponentsTable)
      .set({ effectiveTo: today })
      .where(eq(employeeSalaryComponentsTable.id, ecId))
      .returning();
    res.json({ success: true, data: row });
  } catch (e) {
    console.error("[DELETE /api/employees/:id/salary-components/:ecId]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Step 4: Salary Preview & Config ─────────────────────────────────────────

// GET /api/salary/preview/:employeeId — calculate current month salary (no DB write)
// Returns: { gross, deductions: {ssc, tax, other}, net, breakdown: [...components with values] }
app.get("/api/salary/preview/:employeeId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const empId = parseInt(req.params.employeeId, 10);
    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    // Load config
    const configs = await db.select().from(systemConfigurationsTable)
      .where(eq(systemConfigurationsTable.companyId, user.companyId));
    const cfg = (key: string, fallback: string) => configs.find((c: any) => c.key === key)?.value ?? fallback;
    const sscEmployeeRate  = parseFloat(cfg("ssc_employee_rate",  "0.075"));
    const sscEmployerRate  = parseFloat(cfg("ssc_employer_rate",  "0.1425"));
    const sscInsurableCapM = toM(cfg("ssc_insurable_salary_cap", "3000"));
    let taxBrackets: { from: number; to: number; rate: number }[] = [];
    try { taxBrackets = JSON.parse(cfg("income_tax_brackets", "[]")); } catch {}
    if (!taxBrackets.length) taxBrackets = [
      { from: 0, to: 9000, rate: 0 }, { from: 9000, to: 20000, rate: 0.05 },
      { from: 20000, to: 30000, rate: 0.10 }, { from: 30000, to: 40000, rate: 0.15 },
      { from: 40000, to: 50000, rate: 0.20 }, { from: 50000, to: 999999999, rate: 0.25 },
    ];
    const personalExemptionJOD = parseFloat(cfg("income_tax_personal_exemption", "9000"));
    const familyExemptionJOD   = emp.maritalStatus === "married"
      ? parseFloat(cfg("income_tax_family_exemption", "500")) : 0;
    const taxExemptionJOD      = parseFloat(String(emp.taxExemptionAmount ?? "0"));

    // Load active components as of today
    const today = new Date().toISOString().slice(0, 10);
    const components = await db
      .select({
        code:              salaryComponentsTable.code,
        nameAr:            salaryComponentsTable.nameAr,
        nameEn:            salaryComponentsTable.nameEn,
        componentType:     salaryComponentsTable.componentType,
        calculationType:   salaryComponentsTable.calculationType,
        defaultValue:      salaryComponentsTable.defaultValue,
        formulaExpression: salaryComponentsTable.formulaExpression,
        percentageBase:    salaryComponentsTable.percentageBase,
        isTaxable:         salaryComponentsTable.isTaxable,
        isSscApplicable:   salaryComponentsTable.isSscApplicable,
        overrideValue:     employeeSalaryComponentsTable.overrideValue,
        sortOrder:         salaryComponentsTable.sortOrder,
      })
      .from(employeeSalaryComponentsTable)
      .innerJoin(salaryComponentsTable, eq(salaryComponentsTable.id, employeeSalaryComponentsTable.salaryComponentId))
      .where(and(
        eq(employeeSalaryComponentsTable.employeeId, empId),
        lte(employeeSalaryComponentsTable.effectiveFrom, today),
        isNull(employeeSalaryComponentsTable.effectiveTo),
        eq(salaryComponentsTable.isActive, true),
      ))
      .orderBy(asc(salaryComponentsTable.sortOrder));

    // Compute values using the same engine as the payroll run
    const basicRow = components.find(c => c.code === "BASIC");
    const basicJOD = basicRow
      ? (basicRow.overrideValue ? parseFloat(basicRow.overrideValue) : parseFloat(basicRow.defaultValue ?? "0"))
      : parseFloat(String(emp.basicSalary ?? "0"));

    let runningGrossM = 0;
    const breakdown: any[] = [];
    for (const comp of components) {
      const valM = calculateComponentValueM(
        { calculationType: comp.calculationType, defaultValue: comp.defaultValue ?? "0",
          formulaExpression: comp.formulaExpression ?? null, percentageBase: comp.percentageBase ?? null,
          isTaxable: comp.isTaxable, isSscApplicable: comp.isSscApplicable },
        comp.overrideValue,
        basicJOD,
        runningGrossM / 1000,
      );
      if (comp.componentType === "earning") runningGrossM += valM;
      breakdown.push({
        code:          comp.code,
        nameEn:        comp.nameEn,
        nameAr:        comp.nameAr,
        componentType: comp.componentType,
        valueJOD:      (valM / 1000).toFixed(3),
        calculationType: comp.calculationType,
        isTaxable:     comp.isTaxable,
        isSscApplicable: comp.isSscApplicable,
        isOverride:    comp.overrideValue !== null,
      });
    }

    // Fallback: use flat columns if no normalized components
    const grossM = components.length
      ? runningGrossM
      : toM(String(emp.basicSalary ?? "0"))
        + toM(String(emp.housingAllowance    ?? "0"))
        + toM(String(emp.transportAllowance  ?? "0"))
        + toM(String(emp.mealAllowance       ?? "0"))
        + toM(String(emp.mobileAllowance     ?? "0"))
        + toM(String(emp.otherAllowances     ?? "0"));

    const basicM       = toM(String(emp.basicSalary ?? "0"));
    const insurableM   = Math.min(basicM, sscInsurableCapM);
    const sscEmpM      = emp.isSSCExempt ? 0 : Math.round(insurableM * sscEmployeeRate);
    const sscErM       = emp.isSSCExempt ? 0 : Math.round(insurableM * sscEmployerRate);
    const annualTaxableJOD = Math.max(0, (grossM - sscEmpM) * 12 / 1000 - personalExemptionJOD - familyExemptionJOD - taxExemptionJOD);
    const annualTaxJOD     = applyBrackets(annualTaxableJOD, taxBrackets);
    const monthlyTaxM      = Math.round(annualTaxJOD * 1000 / 12);
    const totalDeductionsM = sscEmpM + monthlyTaxM;
    const netM             = grossM - totalDeductionsM;

    res.json({ success: true, data: {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      gross:      fromM(grossM),
      net:        fromM(netM),
      deductions: {
        ssc:   fromM(sscEmpM),
        tax:   fromM(monthlyTaxM),
        other: "0.000",
        total: fromM(totalDeductionsM),
      },
      employerSscContribution: fromM(sscErM),
      insurableBase:           fromM(insurableM),
      annualTaxableIncome:     annualTaxableJOD.toFixed(3),
      isSSCExempt:             emp.isSSCExempt,
      breakdown,
    }});
  } catch (e) {
    console.error("[GET /api/salary/preview/:employeeId]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/salary/config — salary calculation configuration
app.get("/api/salary/config", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const configs = await db.select().from(systemConfigurationsTable)
      .where(eq(systemConfigurationsTable.companyId, user.companyId));
    const cfg = (key: string, fallback: string) => configs.find((c: any) => c.key === key)?.value ?? fallback;

    let taxBrackets: any[] = [];
    try { taxBrackets = JSON.parse(cfg("income_tax_brackets", "[]")); } catch {}
    if (!taxBrackets.length) taxBrackets = [
      { from: 0,     to: 9000,      rate: 0,    label: "0%" },
      { from: 9000,  to: 20000,     rate: 0.05, label: "5%" },
      { from: 20000, to: 30000,     rate: 0.10, label: "10%" },
      { from: 30000, to: 40000,     rate: 0.15, label: "15%" },
      { from: 40000, to: 50000,     rate: 0.20, label: "20%" },
      { from: 50000, to: 999999999, rate: 0.25, label: "25%" },
    ];

    res.json({ success: true, data: {
      sscEmployeeRate:            parseFloat(cfg("ssc_employee_rate",  "0.075")),
      sscEmployerRate:            parseFloat(cfg("ssc_employer_rate",  "0.1425")),
      sscInsurableCapJOD:         parseFloat(cfg("ssc_insurable_salary_cap", "3000")),
      overtimeWeekdayMultiplier:  parseFloat(cfg("overtime_weekday_multiplier", "1.5")),
      overtimeWeekendMultiplier:  parseFloat(cfg("overtime_weekend_multiplier", "2.0")),
      incomeTaxPersonalExemption: parseFloat(cfg("income_tax_personal_exemption", "9000")),
      incomeTaxFamilyExemption:   parseFloat(cfg("income_tax_family_exemption", "500")),
      incomeTaxBrackets:          taxBrackets,
      rawConfigs:                 configs,
    }});
  } catch (e) {
    console.error("[GET /api/salary/config]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Attendance ───────────────────────────────────────────────────────────────
app.get("/api/attendance", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, from, to } = req.query as Record<string, string>;
    const conditions: any[] = [];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(attendanceRecordsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(attendanceRecordsTable.employeeId, ids));
    } else if (employeeId) {
      conditions.push(eq(attendanceRecordsTable.employeeId, parseInt(employeeId)));
    }
    if (from) conditions.push(gte(attendanceRecordsTable.date, from));
    if (to) conditions.push(lte(attendanceRecordsTable.date, to));
    const rows = conditions.length > 0
      ? await db.select().from(attendanceRecordsTable).where(and(...conditions)).orderBy(desc(attendanceRecordsTable.date))
      : await db.select().from(attendanceRecordsTable).orderBy(desc(attendanceRecordsTable.date)).limit(100);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/clock-in", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, notes } = req.body as { employeeId: number; notes?: string };
    const today = new Date().toISOString().split("T")[0]!;
    const [record] = await db.insert(attendanceRecordsTable).values({
      employeeId: employeeId ?? user.employeeId ?? 0,
      date: today, clockIn: new Date(), status: "present", notes,
    }).returning();
    res.status(201).json({ success: true, data: record });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/clock-out", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId } = req.body as { employeeId: number };
    const today = new Date().toISOString().split("T")[0]!;
    const [existing] = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, employeeId ?? user.employeeId ?? 0), eq(attendanceRecordsTable.date, today)));
    if (!existing) { res.status(404).json({ success: false, message: "No clock-in found for today" }); return; }
    const now = new Date();
    const workedMs = existing.clockIn ? now.getTime() - existing.clockIn.getTime() : 0;
    const workedMinutes = Math.floor(workedMs / 60000);
    const [record] = await db.update(attendanceRecordsTable).set({ clockOut: now, workedMinutes }).where(eq(attendanceRecordsTable.id, existing.id)).returning();
    res.json({ success: true, data: record });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/summary", auth, async (req, res) => {
  try {
    const { employeeId, month, year } = req.query as Record<string, string>;
    const m = parseInt(month ?? String(new Date().getMonth() + 1));
    const y = parseInt(year ?? String(new Date().getFullYear()));
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const to = `${y}-${String(m).padStart(2, "0")}-31`;
    const conditions = [gte(attendanceRecordsTable.date, from), lte(attendanceRecordsTable.date, to)];
    if (employeeId) conditions.push(eq(attendanceRecordsTable.employeeId, parseInt(employeeId)));
    const rows = await db.select().from(attendanceRecordsTable).where(and(...conditions));
    const present = rows.filter(r => r.status === "present").length;
    const absent = rows.filter(r => r.status === "absent").length;
    const late = rows.filter(r => (r.lateMinutes ?? 0) > 0).length;
    const totalWorked = rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);
    res.json({ success: true, data: { present, absent, late, totalWorkedMinutes: totalWorked, month: m, year: y } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────
app.get("/api/documents", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, expiringWithinDays } = req.query as Record<string, string>;
    const conditions: any[] = [eq(documentsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(documentsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(documentsTable.employeeId, ids));
    } else if (employeeId) {
      conditions.push(eq(documentsTable.employeeId, parseInt(employeeId)));
    }
    const docs = await db.select().from(documentsTable).where(and(...conditions)).orderBy(desc(documentsTable.createdAt));
    res.json({ success: true, data: docs });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/documents", auth, async (req, res) => {
  try {
    const [doc] = await db.insert(documentsTable).values(req.body).returning();
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/documents/:id", auth, async (req, res) => {
  try {
    const [doc] = await db.update(documentsTable).set(req.body).where(eq(documentsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/documents/:id", auth, async (req, res) => {
  try {
    await db.update(documentsTable).set({ isDeleted: true }).where(eq(documentsTable.id, parseInt(req.params["id"]!)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Assets ───────────────────────────────────────────────────────────────────
app.get("/api/assets", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, status } = req.query as Record<string, string>;
    const conditions: any[] = [eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(assetsTable.assignedToEmployeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length > 0) conditions.push(inArray(assetsTable.assignedToEmployeeId, ids));
    } else {
      if (employeeId) conditions.push(eq(assetsTable.assignedToEmployeeId, parseInt(employeeId)));
    }
    if (status) conditions.push(eq(assetsTable.currentStatus, status));
    const assets = await db.select().from(assetsTable).where(and(...conditions)).orderBy(desc(assetsTable.createdAt));
    const emps = await db.select({ id: employeesTable.id, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn }).from(employeesTable);
    res.json({ success: true, data: assets.map(a => ({
      ...a,
      assignedToEmployeeName: a.assignedToEmployeeId
        ? (() => { const e = emps.find(e => e.id === a.assignedToEmployeeId); return e ? `${e.firstNameEn} ${e.lastNameEn}` : null; })()
        : null,
    })) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [asset] = await db.insert(assetsTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json({ success: true, data: asset });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/assets/:id", auth, async (req, res) => {
  try {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, parseInt(req.params["id"]!)));
    if (!asset) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: asset });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/assets/:id", auth, async (req, res) => {
  try {
    const [asset] = await db.update(assetsTable).set(req.body).where(eq(assetsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: asset });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/assets/:id", auth, async (req, res) => {
  try {
    await db.update(assetsTable).set({ isDeleted: true }).where(eq(assetsTable.id, parseInt(req.params["id"]!)));
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets/:id/assign", auth, async (req, res) => {
  try {
    const { employeeId } = req.body as { employeeId: number };
    const today = new Date().toISOString().split("T")[0]!;
    const [asset] = await db.update(assetsTable).set({
      assignedToEmployeeId: employeeId, currentStatus: "assigned", assignedDate: today,
    }).where(eq(assetsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: asset });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets/:id/return", auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]!;
    const [asset] = await db.update(assetsTable).set({
      assignedToEmployeeId: null, currentStatus: "available", returnedDate: today,
    }).where(eq(assetsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: asset });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Lookups ──────────────────────────────────────────────────────────────────
app.get("/api/lookups/nationalities", async (_req, res) => {
  const rows = await db.select().from(nationalitiesTable).where(eq(nationalitiesTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/cities", async (_req, res) => {
  const rows = await db.select().from(citiesTable).where(eq(citiesTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/banks", async (_req, res) => {
  const rows = await db.select().from(banksTable).where(eq(banksTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/document-types", async (_req, res) => {
  const rows = await db.select().from(documentTypesTable).where(eq(documentTypesTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/leave-types", async (_req, res) => {
  const rows = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/asset-categories", async (_req, res) => {
  const rows = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.isActive, true));
  res.json({ success: true, data: rows });
});
app.get("/api/lookups/violation-types", async (_req, res) => {
  res.json({ success: true, data: [
    { id: 1, nameAr: "التغيب عن العمل", nameEn: "Absence", code: "absence" },
    { id: 2, nameAr: "التأخر عن العمل", nameEn: "Tardiness", code: "tardiness" },
    { id: 3, nameAr: "سوء السلوك", nameEn: "Misconduct", code: "misconduct" },
    { id: 4, nameAr: "الإهمال في العمل", nameEn: "Negligence", code: "negligence" },
    { id: 5, nameAr: "مخالفة السياسات", nameEn: "Policy Violation", code: "policy_violation" },
  ] });
});

// ─── Config / System Settings ─────────────────────────────────────────────────
const DEFAULT_CONFIGS = [
  { key: "currency_code", value: "JOD", category: "general", description: "Currency code" },
  { key: "company_name_ar", value: "شركة زين الأردن", category: "general", description: "Company name in Arabic" },
  { key: "company_name_en", value: "ZenJO Company", category: "general", description: "Company name in English" },
  { key: "working_hours_per_day", value: "8", category: "attendance", description: "Working hours per day" },
  { key: "working_days_per_week", value: "5", category: "attendance", description: "Working days per week" },
  { key: "overtime_rate_weekday", value: "1.5", category: "payroll", description: "Overtime rate on weekdays" },
  { key: "overtime_rate_weekend", value: "2.0", category: "payroll", description: "Overtime rate on weekends" },
  { key: "income_tax_exempt_annual", value: "10000", category: "payroll", description: "Annual income tax exemption (JOD)" },
  { key: "ssc_employee_rate", value: "0.075", category: "payroll", description: "SSC employee contribution rate" },
  { key: "ssc_employer_rate", value: "0.1425", category: "payroll", description: "SSC employer contribution rate" },
  { key: "ssc_insurable_salary_cap", value: "3000", category: "payroll", description: "Maximum monthly basic salary used as SSC calculation base (JOD)" },
  { key: "income_tax_brackets", value: JSON.stringify([{from:0,to:9000,rate:0},{from:9000,to:20000,rate:0.05},{from:20000,to:30000,rate:0.10},{from:30000,to:40000,rate:0.15},{from:40000,to:50000,rate:0.20},{from:50000,to:999999999,rate:0.25}]), category: "payroll", description: "Jordan progressive income tax brackets (annual JOD, from/to/rate)" },
  { key: "annual_leave_days", value: "14", category: "leave", description: "Annual leave days" },
  { key: "sick_leave_days", value: "14", category: "leave", description: "Sick leave days per year" },
  { key: "probation_period_months", value: "3", category: "hr", description: "Probation period in months" },
  { key: "notice_period_days", value: "30", category: "hr", description: "Notice period in days" },
  { key: "enable_geofencing", value: "false", category: "attendance", description: "Enable geofencing for clock-in" },
  { key: "enable_face_recognition", value: "false", category: "attendance", description: "Enable face recognition" },
  { key: "notify_leave_approval", value: "true", category: "notifications", description: "Notify on leave approval" },
  { key: "notify_payroll_run", value: "true", category: "notifications", description: "Notify on payroll run" },
  { key: "compliance_enabled", value: "true", category: "compliance", description: "Enable compliance tracking" },
  { key: "ssf_compliance", value: "true", category: "compliance", description: "SSF compliance enabled" },
];

app.get("/api/config", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { category } = req.query as Record<string, string>;
    const rows = await db.select().from(systemConfigurationsTable).where(eq(systemConfigurationsTable.companyId, user.companyId));
    const merged = DEFAULT_CONFIGS
      .filter(d => !category || d.category === category)
      .map(d => {
        const override = rows.find(r => r.key === d.key);
        return { key: d.key, value: override?.value ?? d.value, category: d.category, description: override?.description ?? d.description };
      });
    res.json({ success: true, data: merged });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/config/catalog", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const rows = await db.select().from(systemConfigurationsTable).where(eq(systemConfigurationsTable.companyId, user.companyId));
    const categories = ["general", "attendance", "payroll", "hr", "leave", "compliance", "notifications"];
    const groups = categories.map(cat => ({
      category: cat,
      items: DEFAULT_CONFIGS.filter(d => d.category === cat).map(d => {
        const override = rows.find(r => r.key === d.key);
        return {
          key: d.key,
          value: override?.value ?? d.value,
          category: d.category,
          descriptionAr: d.description,
          descriptionEn: d.description,
          dataType: d.value === "true" || d.value === "false" ? "boolean" : "string",
          isEditable: true,
        };
      }),
    }));
    res.json({ success: true, data: groups });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/config/bulk", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { updates } = req.body as { updates: Record<string, string> };
    for (const [key, value] of Object.entries(updates)) {
      const [existing] = await db.select().from(systemConfigurationsTable)
        .where(and(eq(systemConfigurationsTable.companyId, user.companyId), eq(systemConfigurationsTable.key, key)));
      const defCfg = DEFAULT_CONFIGS.find(d => d.key === key);
      if (existing) {
        await db.update(systemConfigurationsTable).set({ value }).where(eq(systemConfigurationsTable.id, existing.id));
      } else {
        await db.insert(systemConfigurationsTable).values({
          companyId: user.companyId, key, value,
          category: defCfg?.category ?? "general",
          updatedByUserId: user.userId,
        });
      }
    }
    res.json({ success: true, message: "Settings saved" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Attendance extra endpoints ────────────────────────────────────────────────
app.get("/api/attendance/dashboard", auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0]!;
    const rows = await db.select().from(attendanceRecordsTable).where(eq(attendanceRecordsTable.date, today));
    const present = rows.filter(r => r.status === "present").length;
    const late = rows.filter(r => (r.lateMinutes ?? 0) > 0).length;
    res.json({ success: true, data: { date: today, present, late, absent: 0, onLeave: 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/my-today", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const today = new Date().toISOString().split("T")[0]!;
    const [record] = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, user.employeeId ?? 0), eq(attendanceRecordsTable.date, today)));
    res.json({ success: true, data: record ?? null });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/map", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

app.get("/api/attendance/locations", auth, async (req, res) => {
  res.json({ success: true, data: [] });
});

app.post("/api/attendance/locations", auth, async (req, res) => {
  res.status(201).json({ success: true, data: { id: 1, ...req.body } });
});

// ─── Documents extra endpoints ─────────────────────────────────────────────────
app.get("/api/documents/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(documentsTable)
      .where(eq(documentsTable.isDeleted, false));
    res.json({ success: true, data: { total: total?.count ?? 0, expiringSoon: 0, expired: 0, missing: 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/documents/expiring", auth, async (req, res) => {
  try {
    const { days = "30" } = req.query as Record<string, string>;
    const future = new Date();
    future.setDate(future.getDate() + parseInt(days));
    const docs = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.isDeleted, false), lte(documentsTable.expiryDate, future.toISOString().split("T")[0]!)));
    res.json({ success: true, data: docs });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/documents/export", auth, async (_req, res) => {
  res.json({ success: true, data: { url: null, message: "Export not available in demo" } });
});

app.post("/api/documents/upload", auth, async (req, res) => {
  try {
    const [doc] = await db.insert(documentsTable).values({ ...req.body, fileUrl: req.body.fileUrl ?? "/placeholder" }).returning();
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Assets extra endpoints ────────────────────────────────────────────────────
app.get("/api/assets/export", auth, async (_req, res) => {
  res.json({ success: true, data: { url: null, message: "Export not available in demo" } });
});

// ─── Overtime ─────────────────────────────────────────────────────────────────
app.get("/api/overtime/dashboard", auth, async (req, res) => {
  try {
    const { period = "month" } = req.query as Record<string, string>;
    const now = new Date();
    const from = period === "week"
      ? new Date(now.setDate(now.getDate() - 7)).toISOString().split("T")[0]!
      : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]!;
    const rows = await db.select().from(overtimeRequestsTable)
      .where(and(eq(overtimeRequestsTable.isDeleted, false), gte(overtimeRequestsTable.date, from)));
    const approved = rows.filter(r => r.status === "approved");
    const totalHours = approved.reduce((s, r) => s + parseFloat(r.hours), 0);
    res.json({ success: true, data: { totalRequests: rows.length, approvedRequests: approved.length, totalHours, pendingRequests: rows.filter(r => r.status === "pending").length } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/reports", auth, async (req, res) => {
  try {
    const rows = await db.select().from(overtimeRequestsTable)
      .where(eq(overtimeRequestsTable.isDeleted, false)).orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/rules", auth, async (_req, res) => {
  res.json({ success: true, data: { weekdayRate: 1.5, weekendRate: 2.0, maxHoursPerDay: 3, maxHoursPerMonth: 30 } });
});

app.put("/api/overtime/rules", auth, async (req, res) => {
  res.json({ success: true, data: req.body });
});

app.post("/api/overtime/calculate", auth, async (req, res) => {
  const { employeeId, hours, rate = 1.5 } = req.body as { employeeId: number; hours: number; rate?: number };
  const [emp] = await db.select({ basicSalary: employeesTable.basicSalary }).from(employeesTable).where(eq(employeesTable.id, employeeId));
  const hourlyRate = emp ? parseFloat(emp.basicSalary) / (8 * 22) : 0;
  res.json({ success: true, data: { amount: (hourlyRate * hours * rate).toFixed(3), hourlyRate: hourlyRate.toFixed(3), hours, rate } });
});

app.get("/api/overtime", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, status } = req.query as Record<string, string>;
    const conditions: any[] = [eq(overtimeRequestsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(overtimeRequestsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(overtimeRequestsTable.employeeId, ids));
    } else if (employeeId) {
      conditions.push(eq(overtimeRequestsTable.employeeId, parseInt(employeeId)));
    }
    if (status) conditions.push(eq(overtimeRequestsTable.status, status));
    const rows = await db.select().from(overtimeRequestsTable).where(and(...conditions)).orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/overtime", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [row] = await db.insert(overtimeRequestsTable).values({ ...req.body, status: "pending" }).returning();
    // ── Notifications ──────────────────────────────────────────────────────
    const otEmpId = req.body.employeeId ?? user.employeeId;
    const otPayload = {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "overtime_request",
      entityId: row.id,
      notificationType: "overtime_request_created",
      titleAr: "طلب عمل إضافي جديد",
      titleEn: "New Overtime Request",
      messageAr: `قدّم ${user.username} طلب عمل إضافي بتاريخ ${row.date} (${row.hours} ساعات).`,
      messageEn: `${user.username} submitted an overtime request on ${row.date} (${row.hours} hrs).`,
      priority: "normal" as const,
      actionUrl: "/app/overtime",
    };
    await notifyRole(user.companyId, "hradmin", otPayload);
    if (otEmpId) await notifyDirectManager(otEmpId, otPayload);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/overtime/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [row] = await db.update(overtimeRequestsTable).set({ status: "approved", managerApprovedById: user.userId, managerApprovedAt: new Date() })
      .where(eq(overtimeRequestsTable.id, parseInt(req.params["id"]!))).returning();
    // ── Notification ───────────────────────────────────────────────────────
    if (row?.employeeId) {
      await notifyEmployee(row.employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "overtime_request",
        entityId: row.id,
        notificationType: "overtime_request_approved",
        titleAr: "تمت الموافقة على طلب العمل الإضافي",
        titleEn: "Overtime Request Approved",
        messageAr: `تمت الموافقة على طلب العمل الإضافي بتاريخ ${row.date}.`,
        messageEn: `Your overtime request on ${row.date} was approved.`,
        priority: "high",
        actionUrl: "/app/my-overtime",
      });
    }
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/overtime/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { reason } = req.body as { reason: string };
    const [row] = await db.update(overtimeRequestsTable).set({ status: "rejected", rejectionReason: reason })
      .where(eq(overtimeRequestsTable.id, parseInt(req.params["id"]!))).returning();
    // ── Notification ───────────────────────────────────────────────────────
    if (row?.employeeId) {
      await notifyEmployee(row.employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "overtime_request",
        entityId: row.id,
        notificationType: "overtime_request_rejected",
        titleAr: "تم رفض طلب العمل الإضافي",
        titleEn: "Overtime Request Rejected",
        messageAr: `تم رفض طلب العمل الإضافي بتاريخ ${row.date}.`,
        messageEn: `Your overtime request on ${row.date} was rejected.`,
        priority: "high",
        actionUrl: "/app/my-overtime",
      });
    }
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Disciplinary ─────────────────────────────────────────────────────────────
const disciplinaryStore: any[] = [];
let disciplinaryIdSeq = 1;

app.get("/api/disciplinary", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!["hradmin", "manager"].includes(user.role)) {
    res.status(403).json({ success: false, message: "Forbidden" }); return;
  }
  const { employeeId } = req.query as Record<string, string>;
  const result = disciplinaryStore.filter(d => !employeeId || String(d.employeeId) === employeeId);
  res.json({ success: true, data: result });
});

app.post("/api/disciplinary", auth, async (req, res) => {
  const record = { id: disciplinaryIdSeq++, ...req.body, createdAt: new Date() };
  disciplinaryStore.push(record);
  res.status(201).json({ success: true, data: record });
});

app.get("/api/disciplinary/stats", auth, async (_req, res) => {
  res.json({ success: true, data: { total: disciplinaryStore.length, pending: 0, resolved: 0, warnings: 0 } });
});

app.get("/api/disciplinary/violations", auth, async (_req, res) => {
  res.json({ success: true, data: disciplinaryStore });
});

app.post("/api/disciplinary/violations", auth, async (req, res) => {
  const record = { id: disciplinaryIdSeq++, ...req.body, createdAt: new Date() };
  disciplinaryStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Resignations ─────────────────────────────────────────────────────────────
const resignationsStore: any[] = [];
let resignationIdSeq = 1;

app.get("/api/resignations", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  let result: any[] = resignationsStore;
  if (user.role === "employee") {
    result = result.filter((r: any) => r.employeeId === user.employeeId);
  }
  res.json({ success: true, data: result });
});

app.post("/api/resignations", auth, async (req, res) => {
  const record = { id: resignationIdSeq++, ...req.body, status: "pending", createdAt: new Date() };
  resignationsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

app.get("/api/resignations/stats", auth, async (_req, res) => {
  res.json({ success: true, data: { total: resignationsStore.length, pending: resignationsStore.filter(r => r.status === "pending").length, approved: 0, rejected: 0 } });
});

// ─── Clearance ────────────────────────────────────────────────────────────────
const clearanceStore: any[] = [];
let clearanceIdSeq = 1;

app.get("/api/clearance", auth, async (_req, res) => {
  res.json({ success: true, data: clearanceStore });
});

app.post("/api/clearance", auth, async (req, res) => {
  const record = { id: clearanceIdSeq++, ...req.body, status: "pending", createdAt: new Date() };
  clearanceStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Salary Advances ──────────────────────────────────────────────────────────
const advancesStore: any[] = [];
let advanceIdSeq = 1;

app.get("/api/salary-advances", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId } = req.query as Record<string, string>;
    let result: any[] = advancesStore;

    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      if (employeeId && parseInt(employeeId) !== user.employeeId) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      result = result.filter((a: any) => a.employeeId === user.employeeId);
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const teamEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = new Set(teamEmps.map(e => e.id));
      if (ids.size === 0) { res.json({ success: true, data: [] }); return; }
      if (employeeId) {
        const reqId = parseInt(employeeId);
        if (!ids.has(reqId)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
        result = result.filter((a: any) => a.employeeId === reqId);
      } else {
        result = result.filter((a: any) => ids.has(a.employeeId));
      }
    } else {
      if (employeeId) result = result.filter((a: any) => String(a.employeeId) === employeeId);
    }

    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/salary-advances", auth, async (req, res) => {
  const record = { id: advanceIdSeq++, ...req.body, status: "pending", createdAt: new Date() };
  advancesStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Public Holidays ──────────────────────────────────────────────────────────
const JORDAN_HOLIDAYS = [
  { id: 1, nameAr: "رأس السنة الميلادية", nameEn: "New Year's Day", date: "2026-01-01", type: "fixed", isRecurring: true },
  { id: 2, nameAr: "عيد العمال", nameEn: "Labor Day", date: "2026-05-01", type: "fixed", isRecurring: true },
  { id: 3, nameAr: "يوم الاستقلال", nameEn: "Independence Day", date: "2026-05-25", type: "fixed", isRecurring: true },
  { id: 4, nameAr: "عيد الجيش", nameEn: "Army Day", date: "2026-06-10", type: "fixed", isRecurring: true },
  { id: 5, nameAr: "عيد الفطر", nameEn: "Eid Al-Fitr", date: "2026-03-20", type: "islamic", isRecurring: false },
  { id: 6, nameAr: "عيد الأضحى", nameEn: "Eid Al-Adha", date: "2026-05-27", type: "islamic", isRecurring: false },
  { id: 7, nameAr: "المولد النبوي", nameEn: "Prophet's Birthday", date: "2026-09-15", type: "islamic", isRecurring: false },
  { id: 8, nameAr: "رأس السنة الهجرية", nameEn: "Islamic New Year", date: "2026-07-17", type: "islamic", isRecurring: false },
];

app.get("/api/public-holidays", auth, async (req, res) => {
  const { type, year } = req.query as Record<string, string>;
  let result = JORDAN_HOLIDAYS;
  if (type) result = result.filter(h => h.type === type);
  if (year) result = result.filter(h => h.date.startsWith(year));
  res.json({ success: true, data: result, total: result.length });
});

app.post("/api/public-holidays", auth, async (req, res) => {
  const h = { id: JORDAN_HOLIDAYS.length + 1, ...req.body };
  JORDAN_HOLIDAYS.push(h);
  res.status(201).json({ success: true, data: h });
});

app.get("/api/public-holidays/upcoming", auth, async (req, res) => {
  const { days = "90" } = req.query as Record<string, string>;
  const future = new Date();
  future.setDate(future.getDate() + parseInt(days));
  const now = new Date();
  const result = JORDAN_HOLIDAYS.filter(h => {
    const d = new Date(h.date);
    return d >= now && d <= future;
  });
  res.json({ success: true, data: result });
});

app.get("/api/public-holidays/reports", auth, async (_req, res) => {
  res.json({ success: true, data: { total: JORDAN_HOLIDAYS.length, byType: { fixed: JORDAN_HOLIDAYS.filter(h => h.type === "fixed").length, islamic: JORDAN_HOLIDAYS.filter(h => h.type === "islamic").length } } });
});

app.post("/api/public-holidays/generate-recurring", auth, async (req, res) => {
  res.json({ success: true, message: "Recurring holidays generated", data: { year: req.body.year, count: 4 } });
});

// ─── Shifts ───────────────────────────────────────────────────────────────────
const shiftsStore: any[] = [
  { id: 1, nameAr: "الوردية الصباحية", nameEn: "Morning Shift", startTime: "08:00", endTime: "16:00", days: ["sun","mon","tue","wed","thu"] },
  { id: 2, nameAr: "الوردية المسائية", nameEn: "Evening Shift", startTime: "14:00", endTime: "22:00", days: ["sun","mon","tue","wed","thu"] },
  { id: 3, nameAr: "وردية الليل", nameEn: "Night Shift", startTime: "22:00", endTime: "06:00", days: ["sun","mon","tue","wed","thu"] },
];
const shiftTemplatesStore: any[] = shiftsStore.slice();
const shiftAssignmentsStore: any[] = [];
const shiftExceptionsStore: any[] = [];
let shiftIdSeq = shiftsStore.length + 1;

app.get("/api/shifts", auth, async (_req, res) => {
  res.json({ success: true, data: shiftsStore });
});

app.post("/api/shifts", auth, async (req, res) => {
  const record = { id: shiftIdSeq++, ...req.body };
  shiftsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

app.get("/api/shifts/templates", auth, async (_req, res) => {
  res.json({ success: true, data: shiftTemplatesStore });
});

app.get("/api/shifts/assignments", auth, async (_req, res) => {
  res.json({ success: true, data: shiftAssignmentsStore });
});

app.post("/api/shifts/assignments", auth, async (req, res) => {
  const record = { id: Date.now(), ...req.body };
  shiftAssignmentsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

app.get("/api/shifts/exceptions", auth, async (_req, res) => {
  res.json({ success: true, data: shiftExceptionsStore });
});

app.post("/api/shifts/exceptions", auth, async (req, res) => {
  const record = { id: Date.now(), ...req.body };
  shiftExceptionsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Compliance ───────────────────────────────────────────────────────────────
app.get("/api/compliance/overview", auth, async (_req, res) => {
  res.json({ success: true, data: { score: 92, items: 24, compliant: 22, nonCompliant: 2, pending: 0 } });
});

app.get("/api/compliance/items", auth, async (_req, res) => {
  res.json({ success: true, data: [
    { id: 1, nameAr: "توثيق العقود", nameEn: "Contract Documentation", status: "compliant", category: "hr" },
    { id: 2, nameAr: "الاشتراك في الضمان الاجتماعي", nameEn: "SSC Registration", status: "compliant", category: "payroll" },
    { id: 3, nameAr: "سجلات الحضور", nameEn: "Attendance Records", status: "pending", category: "attendance" },
  ] });
});

app.get("/api/compliance/badge-status", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const emps = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    const result: Record<number, string> = {};
    emps.forEach(e => { result[e.id] = "compliant"; });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/compliance/export", auth, async (_req, res) => {
  res.json({ success: true, data: { url: null, message: "Export not available in demo" } });
});

// ─── Forms ────────────────────────────────────────────────────────────────────
const FORM_TEMPLATES = [
  { id: 1, nameAr: "طلب إجازة", nameEn: "Leave Request Form", category: "hr", isActive: true },
  { id: 2, nameAr: "طلب سلفة", nameEn: "Advance Request Form", category: "payroll", isActive: true },
  { id: 3, nameAr: "تقييم الأداء", nameEn: "Performance Evaluation", category: "hr", isActive: true },
  { id: 4, nameAr: "طلب تأهيل", nameEn: "Onboarding Form", category: "hr", isActive: true },
];
const formSubmissionsStore: any[] = [];
let formSubmissionIdSeq = 1;

app.get("/api/forms", auth, async (_req, res) => {
  res.json({ success: true, data: FORM_TEMPLATES });
});

app.get("/api/forms-catalog", auth, async (_req, res) => {
  res.json({ success: true, data: FORM_TEMPLATES });
});

app.get("/api/forms/company-info", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId));
    res.json({ success: true, data: company ?? {} });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/form-submissions", auth, async (req, res) => {
  const record = { id: formSubmissionIdSeq++, ...req.body, submittedAt: new Date(), status: "submitted" };
  formSubmissionsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Users management ─────────────────────────────────────────────────────────
// Helper — load a user the caller is allowed to touch (same company, or any if superadmin)
async function loadScopedUser(callerCompanyId: number, callerRole: string, targetId: number) {
  const [target] = await db.select().from(usersTable)
    .where(and(eq(usersTable.id, targetId), eq(usersTable.isDeleted, false)));
  if (!target) return { error: "User not found" as const };
  if (callerRole !== "superadmin" && target.companyId !== callerCompanyId) {
    return { error: "Forbidden — different company" as const };
  }
  return { target };
}

app.get("/api/users", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const conditions = [eq(usersTable.isDeleted, false)];
    // Superadmin sees ALL users across the platform; everyone else only their company.
    if (user.role !== "superadmin") {
      conditions.push(eq(usersTable.companyId, user.companyId));
    } else if (req.query["companyId"]) {
      conditions.push(eq(usersTable.companyId, parseInt(String(req.query["companyId"]))));
    }
    const users = await db.select({
      id: usersTable.id, username: usersTable.username, email: usersTable.email,
      role: usersTable.role, roleId: usersTable.roleId, isActive: usersTable.isActive,
      companyId: usersTable.companyId, employeeId: usersTable.employeeId,
      lastLoginAt: usersTable.lastLoginAt, mustChangePassword: usersTable.mustChangePassword,
    }).from(usersTable).where(and(...conditions)).orderBy(asc(usersTable.companyId), asc(usersTable.id));
    res.json({ success: true, data: users });
  } catch (e) {
    console.error("[GET /api/users]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Employees in the caller's company that DON'T already have a user account
// (used by Users screen "link to employee" dropdown).
app.get("/api/users/employee-options", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const targetCompanyId = (user.role === "superadmin" && req.query["companyId"])
      ? parseInt(String(req.query["companyId"]))
      : user.companyId;

    const linked = await db.select({ employeeId: usersTable.employeeId })
      .from(usersTable)
      .where(and(
        eq(usersTable.companyId, targetCompanyId),
        eq(usersTable.isDeleted, false),
        isNotNull(usersTable.employeeId),
      ));
    const linkedIds = linked.map(r => r.employeeId!).filter(Boolean);

    let baseConds = [
      eq(employeesTable.companyId, targetCompanyId),
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, "active"),
    ];
    const emps = await db.select({
      id: employeesTable.id,
      employeeCode: employeesTable.employeeCode,
      firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn,
      firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr,
      workEmail: employeesTable.workEmail,
    }).from(employeesTable).where(and(...baseConds))
      .orderBy(asc(employeesTable.firstNameEn));
    const filtered = emps.filter(e => !linkedIds.includes(e.id));
    res.json({ success: true, data: filtered });
  } catch (e) {
    console.error("[/api/users/employee-options]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/users", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden — admins only" }); return;
    }
    const { username, email, password, role, employeeId, companyId } = req.body as {
      username: string; email: string; password: string; role: string;
      employeeId?: number; companyId?: number;
    };
    if (!username || !email || !password || !role) {
      res.status(400).json({ success: false, message: "username, email, password, role required" }); return;
    }
    // Block escalation: only superadmin can grant superadmin
    if (role === "superadmin" && user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Cannot assign superadmin role" }); return;
    }
    // Scope: hradmin always to own company; superadmin can target any company via body
    const targetCompanyId = (user.role === "superadmin" && companyId) ? companyId : user.companyId;

    // Cross-tenant guard: validate employeeId belongs to the target company
    if (employeeId !== undefined && employeeId !== null) {
      const [emp] = await db.select({ id: employeesTable.id, companyId: employeesTable.companyId })
        .from(employeesTable).where(eq(employeesTable.id, Number(employeeId))).limit(1);
      if (!emp || emp.companyId !== targetCompanyId) {
        res.status(400).json({ success: false, message: "Employee does not belong to the target company" }); return;
      }
    }

    // Resolve roleId from rolesTable for that company
    const [r] = await db.select({ id: rolesTable.id }).from(rolesTable)
      .where(and(eq(rolesTable.companyId, targetCompanyId), eq(rolesTable.name, role))).limit(1);

    const [newUser] = await db.insert(usersTable).values({
      username, email, role,
      roleId: r?.id ?? null,
      employeeId: employeeId ?? null,
      passwordHash: hashPassword(password),
      companyId: targetCompanyId,
      mustChangePassword: true,
    }).returning();
    res.status(201).json({
      success: true,
      data: { id: newUser!.id, username: newUser!.username, email: newUser!.email, role: newUser!.role },
      tempPassword: password,
    });
  } catch (e: any) {
    console.error("[POST /api/users]", e);
    if (String(e?.message || "").includes("duplicate") || e?.code === "23505") {
      res.status(409).json({ success: false, message: "Username or email already exists" }); return;
    }
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/users/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden — admins only" }); return;
    }
    const targetId = parseInt(req.params["id"]!);
    const loaded = await loadScopedUser(user.companyId, user.role, targetId);
    if ("error" in loaded) {
      res.status(loaded.error === "User not found" ? 404 : 403)
        .json({ success: false, message: loaded.error }); return;
    }

    // Allowlist mutable fields — anything else is silently ignored
    const ALLOWED = ["username","email","isActive","employeeId","mustChangePassword"] as const;
    const updates: any = {};
    for (const k of ALLOWED) if (k in req.body) updates[k] = (req.body as any)[k];

    const { password, role, companyId, employeeId } = req.body as any;
    if (password) { updates.passwordHash = hashPassword(password); updates.mustChangePassword = false; }

    if (role) {
      if (role === "superadmin" && user.role !== "superadmin") {
        res.status(403).json({ success: false, message: "Cannot assign superadmin role" }); return;
      }
      updates.role = role;
      const [r] = await db.select({ id: rolesTable.id }).from(rolesTable)
        .where(and(eq(rolesTable.companyId, loaded.target.companyId), eq(rolesTable.name, role))).limit(1);
      updates.roleId = r?.id ?? null;
    }

    // companyId can only be moved by superadmin
    let effectiveCompanyId = loaded.target.companyId;
    if (companyId && user.role === "superadmin") {
      updates.companyId = companyId;
      effectiveCompanyId = companyId;
    }

    // Cross-tenant guard: if linking to an employee, that employee MUST belong to
    // the user's (effective) company. Without this check, an HR admin could bind
    // their own user to another tenant's employee and read their data via /me/* routes.
    if (employeeId !== undefined && employeeId !== null) {
      const [emp] = await db.select({ id: employeesTable.id, companyId: employeesTable.companyId })
        .from(employeesTable).where(eq(employeesTable.id, Number(employeeId))).limit(1);
      if (!emp || emp.companyId !== effectiveCompanyId) {
        res.status(400).json({ success: false, message: "Employee does not belong to the user's company" }); return;
      }
    }

    const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId)).returning();
    res.json({ success: true, data: u });
  } catch (e) {
    console.error("[PATCH /api/users/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/users/:id/toggle-active", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden — admins only" }); return;
    }
    const targetId = parseInt(req.params["id"]!);
    const loaded = await loadScopedUser(user.companyId, user.role, targetId);
    if ("error" in loaded) {
      res.status(loaded.error === "User not found" ? 404 : 403)
        .json({ success: false, message: loaded.error }); return;
    }
    const [u] = await db.update(usersTable)
      .set({ isActive: !loaded.target.isActive })
      .where(eq(usersTable.id, targetId)).returning();
    res.json({ success: true, data: { id: u!.id, isActive: u!.isActive } });
  } catch (e) {
    console.error("[PATCH /api/users/:id/toggle-active]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/users/:id/reset-password", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden — admins only" }); return;
    }
    const targetId = parseInt(req.params["id"]!);
    const loaded = await loadScopedUser(user.companyId, user.role, targetId);
    if ("error" in loaded) {
      res.status(loaded.error === "User not found" ? 404 : 403)
        .json({ success: false, message: loaded.error }); return;
    }
    // 12-char alphanumeric temp password
    const temp = Array.from({ length: 12 }, () =>
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 62)],
    ).join("");
    await db.update(usersTable).set({
      passwordHash: hashPassword(temp),
      mustChangePassword: true,
    }).where(eq(usersTable.id, targetId));
    res.json({ success: true, tempPassword: temp });
  } catch (e) {
    console.error("[PATCH /api/users/:id/reset-password]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/users/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["superadmin", "hradmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden — admins only" }); return;
    }
    const targetId = parseInt(req.params["id"]!);
    const loaded = await loadScopedUser(user.companyId, user.role, targetId);
    if ("error" in loaded) {
      res.status(loaded.error === "User not found" ? 404 : 403)
        .json({ success: false, message: loaded.error }); return;
    }
    await db.update(usersTable).set({ isDeleted: true, isActive: false }).where(eq(usersTable.id, targetId));
    res.status(204).send();
  } catch (e) {
    console.error("[DELETE /api/users/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Companies ────────────────────────────────────────────────────────────────
app.get("/api/companies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "superadmin") {
      const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, user.companyId));
      res.json({ success: true, data: [company] });
    } else {
      const companies = await db.select().from(companiesTable).where(eq(companiesTable.isActive, true));
      res.json({ success: true, data: companies });
    }
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/companies/:id", auth, async (req, res) => {
  try {
    const [company] = await db.select().from(companiesTable).where(eq(companiesTable.id, parseInt(req.params["id"]!)));
    if (!company) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: company });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/companies/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const targetId = parseInt(req.params["id"]!);
    // Non-superadmin can only edit their own company
    if (user.role !== "superadmin" && targetId !== user.companyId) {
      res.status(403).json({ success: false, message: "Forbidden — different company" }); return;
    }
    const [company] = await db.update(companiesTable).set(req.body).where(eq(companiesTable.id, targetId)).returning();
    res.json({ success: true, data: company });
  } catch (e) {
    console.error("[PATCH /api/companies/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Leave Balances ───────────────────────────────────────────────────────────
app.get("/api/leave/balances", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, year } = req.query as Record<string, string>;
    const conditions = [];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(leaveBalancesTable.employeeId, user.employeeId));
    } else if (employeeId) {
      conditions.push(eq(leaveBalancesTable.employeeId, parseInt(employeeId)));
    }
    if (year) conditions.push(eq(leaveBalancesTable.year, parseInt(year)));
    const rows = conditions.length > 0
      ? await db.select().from(leaveBalancesTable).where(and(...conditions))
      : await db.select().from(leaveBalancesTable);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Dashboard extra endpoints ────────────────────────────────────────────────
app.get("/api/dashboard/upcoming-probations", auth, async (req, res) => {
  try {
    const authReq = req as AuthReq;
    const user = authReq.user;
    const now = new Date();
    const in60 = new Date(); in60.setDate(in60.getDate() + 60);
    // Apply role-based scope so manager only sees their subtree's probations
    const scope = await getEmployeeScopeConditions(authReq);
    const empConds = [...scope, eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")];
    const emps = await db.select().from(employeesTable).where(and(...empConds));
    const depts = await db.select().from(departmentsTable).where(eq(departmentsTable.companyId, user.companyId));
    const result = emps.filter(e => {
      if (!e.probationEndDate) return false;
      const d = new Date(e.probationEndDate);
      return d >= now && d <= in60;
    }).map(e => {
      const dept = depts.find(d => d.id === e.departmentId);
      return {
        id: e.id,
        employeeCode: e.employeeCode,
        nameAr: `${e.firstNameAr} ${e.lastNameAr}`,
        nameEn: `${e.firstNameEn} ${e.lastNameEn}`,
        deptAr: dept?.nameAr,
        deptEn: dept?.nameEn,
        probationEndDate: e.probationEndDate,
        daysRemaining: Math.ceil((new Date(e.probationEndDate!).getTime() - now.getTime()) / 86400000),
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);
    res.json({ success: true, data: result });
  } catch (e) {
    console.error("[/api/dashboard/upcoming-probations]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/dashboard/compliance-alerts", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

// ─── Auth extra endpoints ─────────────────────────────────────────────────────
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) { res.status(400).json({ success: false, message: "Refresh token required" }); return; }
    const payload = verifyToken(refreshToken) as any;
    const [user] = await db.select().from(usersTable).where(and(eq(usersTable.id, payload.userId), eq(usersTable.isDeleted, false)));
    if (!user || user.refreshToken !== refreshToken) { res.status(401).json({ success: false, message: "Invalid refresh token" }); return; }
    const tokenPayload = { userId: user.id, username: user.username, role: user.role, companyId: user.companyId, employeeId: user.employeeId };
    const accessToken = signAccessToken(tokenPayload);
    res.json({ success: true, data: { accessToken } });
  } catch (e) {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

// ─── Admin endpoints (superadmin only — platform level, NOT scoped by company) ─
// Multi-tenancy rule: superadmin operates ABOVE companies; HR admin scopes are
// enforced elsewhere by companyId. These endpoints intentionally bypass company
// filtering, so they MUST require role === 'superadmin'.
app.get("/api/admin/stats", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Forbidden — platform admin only" }); return;
    }

    // NOTE: subscription/plan columns (plan_type, plan_expiry_date, max_employees)
    // are not yet in the companies schema, so trial/expired counts return 0 for now.
    const [totalCompaniesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(companiesTable).where(eq(companiesTable.isDeleted, false));
    const [activeCompaniesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(companiesTable)
      .where(and(eq(companiesTable.isActive, true), eq(companiesTable.isDeleted, false)));
    // totalUsers = all non-deleted users across the platform (matches UI label
    // "إجمالي المستخدمين"). Per-company `userCount` below uses active-only since
    // that's the operationally meaningful number to a platform admin.
    const [totalUsersRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(usersTable).where(eq(usersTable.isDeleted, false));
    const [totalEmployeesRow] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeesTable).where(eq(employeesTable.isDeleted, false));

    res.json({
      success: true,
      data: {
        totalCompanies: totalCompaniesRow?.count ?? 0,
        activeCompanies: activeCompaniesRow?.count ?? 0,
        trialCompanies: 0,
        expiredCompanies: 0,
        pendingRegistrations: 0,
        totalUsers: totalUsersRow?.count ?? 0,
        totalEmployees: totalEmployeesRow?.count ?? 0,
      },
    });
  } catch (e) {
    console.error("[/api/admin/stats]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Returns ALL companies (active + suspended) with per-company counts:
// employeeCount, userCount, branchCount.
app.get("/api/admin/companies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Forbidden — platform admin only" }); return;
    }

    const companies = await db.select().from(companiesTable)
      .where(eq(companiesTable.isDeleted, false))
      .orderBy(asc(companiesTable.id));

    // Aggregate counts in one go to avoid N+1
    const empCounts = await db
      .select({ companyId: employeesTable.companyId, count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(eq(employeesTable.isDeleted, false))
      .groupBy(employeesTable.companyId);
    const userCounts = await db
      .select({ companyId: usersTable.companyId, count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(eq(usersTable.isDeleted, false), eq(usersTable.isActive, true)))
      .groupBy(usersTable.companyId);
    const branchCounts = await db
      .select({ companyId: orgNodesTable.companyId, count: sql<number>`count(*)::int` })
      .from(orgNodesTable)
      .where(and(eq(orgNodesTable.isDeleted, false), eq(orgNodesTable.nodeType, "branch")))
      .groupBy(orgNodesTable.companyId);

    const empMap = new Map(empCounts.map(r => [r.companyId, r.count]));
    const userMap = new Map(userCounts.map(r => [r.companyId, r.count]));
    const branchMap = new Map(branchCounts.map(r => [r.companyId, r.count]));

    const enriched = companies.map(c => ({
      ...c,
      employeeCount: empMap.get(c.id) ?? 0,
      userCount: userMap.get(c.id) ?? 0,
      branchCount: branchMap.get(c.id) ?? 0,
    }));

    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[/api/admin/companies]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── POST /api/admin/companies — create a full tenant in one call ────────────
// Body shape:
// {
//   nameAr, nameEn, code, country?, city?, phone?, email?, website?,
//   commercialRegNo?, taxNumber?,
//   planName?, subscriptionStart?, subscriptionEnd?, maxUsers?, maxEmployees?, isTrial?,
//   branches?: [{ nameEn, nameAr, code?, departments?: [{ nameEn, nameAr, code? }] }],
//   initialAdmin?: { username, email, password, firstNameEn?, firstNameAr?, lastNameEn?, lastNameAr? }
// }
app.post("/api/admin/companies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Forbidden — platform admin only" }); return;
    }
    const b = req.body as any;
    if (!b?.nameEn || !b?.nameAr) {
      res.status(400).json({ success: false, message: "nameAr and nameEn are required" }); return;
    }

    // Catalogue of permission rules used to grant role_permissions for default roles
    const SCREENS = [
      "employees","leave","overtime","attendance","payroll","advances","compliance",
      "documents","assets","disciplinary","resignations","clearance","reports","forms",
      "users","settings","pre-employment","job-descriptions",
    ];
    const ACTIONS = ["view","create","update","delete","approve","export"];
    const ROLE_GRANTS: Record<string, { screens: string[]; actions: string[]; scope: string }[]> = {
      hradmin: [{ screens: SCREENS, actions: ACTIONS, scope: "company" }],
      payrolladmin: [
        { screens: ["payroll","advances","reports","forms"], actions: ACTIONS, scope: "company" },
        { screens: ["employees","documents","assets","attendance"], actions: ["view","export"], scope: "company" },
      ],
      manager: [
        { screens: ["employees"], actions: ["view"], scope: "department" },
        { screens: ["leave","overtime","attendance"], actions: ["view","approve"], scope: "department" },
        { screens: ["disciplinary"], actions: ["view","create","update"], scope: "department" },
        { screens: ["documents","assets","forms"], actions: ["view"], scope: "department" },
      ],
      employee: [
        { screens: ["leave","overtime","advances","attendance"], actions: ["view","create"], scope: "own" },
        { screens: ["documents","assets","payroll","forms"], actions: ["view"], scope: "own" },
      ],
    };
    const ROLE_AR: Record<string, string> = {
      superadmin: "مدير النظام", hradmin: "مدير الموارد البشرية",
      payrolladmin: "مدير الرواتب", manager: "مدير القسم",
      employee: "موظف", recruiter: "موظف تعيين",
    };

    const result = await db.transaction(async (tx) => {
      // 1. Insert company
      const [company] = await tx.insert(companiesTable).values({
        nameAr: b.nameAr, nameEn: b.nameEn,
        code: b.code ?? null, country: b.country ?? "Jordan",
        city: b.city ?? null, phone: b.phone ?? null,
        email: b.email ?? null, website: b.website ?? null,
        commercialRegNo: b.commercialRegNo ?? null, taxNumber: b.taxNumber ?? null,
        currency: b.currency ?? "JOD",
        industryType: b.industryType ?? "other",
        planName: b.planName ?? "trial",
        subscriptionStart: b.subscriptionStart ?? null,
        subscriptionEnd: b.subscriptionEnd ?? null,
        maxUsers: b.maxUsers ?? 10,
        maxEmployees: b.maxEmployees ?? 50,
        isTrial: b.isTrial ?? true,
        isActive: true,
      }).returning();
      const companyId = company!.id;

      // 2. Root org_node
      const [root] = await tx.insert(orgNodesTable).values({
        companyId, parentId: null, nodeType: "company",
        nameAr: company!.nameAr, nameEn: company!.nameEn, code: company!.code ?? null,
        sortOrder: 0,
      }).returning({ id: orgNodesTable.id });

      // 3. Branches + their departments
      const branches = Array.isArray(b.branches) ? b.branches : [];
      for (const [bi, br] of branches.entries()) {
        const [branchNode] = await tx.insert(orgNodesTable).values({
          companyId, parentId: root!.id, nodeType: "branch",
          nameAr: br.nameAr ?? br.nameEn, nameEn: br.nameEn, code: br.code ?? null,
          sortOrder: bi + 1,
        }).returning({ id: orgNodesTable.id });
        const depts = Array.isArray(br.departments) ? br.departments : [];
        for (const [di, d] of depts.entries()) {
          // departments table (used by employee.departmentId)
          const [deptRow] = await tx.insert(departmentsTable).values({
            companyId, nameAr: d.nameAr ?? d.nameEn, nameEn: d.nameEn,
            code: d.code ?? null,
          }).returning({ id: departmentsTable.id });
          // org_nodes mirror for hierarchy
          await tx.insert(orgNodesTable).values({
            companyId, parentId: branchNode!.id, nodeType: "department",
            nameAr: d.nameAr ?? d.nameEn, nameEn: d.nameEn, code: d.code ?? null,
            sortOrder: di + 1,
          });
          void deptRow;
        }
      }

      // 4. Default roles for the company
      const roleNames = ["superadmin","hradmin","payrolladmin","manager","employee","recruiter"];
      const roleIds: Record<string, number> = {};
      for (const rn of roleNames) {
        const [r] = await tx.insert(rolesTable).values({
          companyId, name: rn, nameAr: ROLE_AR[rn] ?? rn,
          isSystemRole: true, isActive: true,
        }).returning({ id: rolesTable.id });
        roleIds[rn] = r!.id;
      }

      // 5. role_permissions (look up global permissions table)
      const allPerms = await tx.select({
        id: permissionsTable.id, screen: permissionsTable.screen, action: permissionsTable.action,
      }).from(permissionsTable);
      const permMap: Record<string, number> = {};
      for (const p of allPerms) permMap[`${p.screen}:${p.action}`] = p.id;

      for (const [roleName, grants] of Object.entries(ROLE_GRANTS)) {
        const roleId = roleIds[roleName]; if (!roleId) continue;
        for (const g of grants) {
          for (const screen of g.screens) {
            for (const action of g.actions) {
              const permId = permMap[`${screen}:${action}`];
              if (!permId) continue;
              await tx.insert(rolePermissionsTable).values({
                roleId, permissionId: permId, dataScope: g.scope,
              });
            }
          }
        }
      }

      // 6. Initial HR admin user (and matching employee record if names provided)
      let initialUser: any = null;
      if (b.initialAdmin?.username && b.initialAdmin?.password && b.initialAdmin?.email) {
        const ia = b.initialAdmin;
        let employeeId: number | null = null;
        if (ia.firstNameEn && ia.lastNameEn) {
          const [emp] = await tx.insert(employeesTable).values({
            companyId,
            employeeCode: `${(company!.code ?? "C") + "-EMP-0001"}`,
            firstNameAr: ia.firstNameAr ?? ia.firstNameEn,
            lastNameAr:  ia.lastNameAr  ?? ia.lastNameEn,
            firstNameEn: ia.firstNameEn,
            lastNameEn:  ia.lastNameEn,
            gender: ia.gender ?? "male",
            dateOfBirth: ia.dateOfBirth ?? "1990-01-01",
            hireDate: ia.hireDate ?? new Date().toISOString().substring(0, 10),
            basicSalary: ia.basicSalary ?? "0.000",
            employmentStatus: "active",
            workEmail: ia.email,
          }).returning({ id: employeesTable.id });
          employeeId = emp!.id;
        }
        const [u] = await tx.insert(usersTable).values({
          companyId, employeeId,
          username: ia.username, email: ia.email,
          passwordHash: hashPassword(ia.password),
          role: "hradmin", roleId: roleIds["hradmin"]!,
          isActive: true, mustChangePassword: true,
        }).returning({ id: usersTable.id, username: usersTable.username });
        initialUser = u;
      }

      return { company, rootOrgNodeId: root!.id, initialUser };
    });

    res.status(201).json({ success: true, data: result });
  } catch (e: any) {
    console.error("[POST /api/admin/companies]", e);
    if (e?.code === "23505") {
      res.status(409).json({ success: false, message: "Duplicate value (code, username, or email already exists)" }); return;
    }
    res.status(500).json({ success: false, message: e?.message || "Internal server error" });
  }
});

// ─── PATCH /api/admin/companies/:id — superadmin edit + suspend/activate ─────
app.patch("/api/admin/companies/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "superadmin") {
      res.status(403).json({ success: false, message: "Forbidden — platform admin only" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const allowed = [
      "nameAr","nameEn","code","country","city","phone","email","website",
      "commercialRegNo","taxNumber","sscNumber","laborMinistryNo","industryType","currency",
      "planName","subscriptionStart","subscriptionEnd","maxUsers","maxEmployees","isTrial","isActive",
    ];
    const updates: any = {};
    for (const k of allowed) if (k in req.body) updates[k] = (req.body as any)[k];
    if (!Object.keys(updates).length) {
      res.status(400).json({ success: false, message: "No allowed fields to update" }); return;
    }
    const [company] = await db.update(companiesTable).set(updates).where(eq(companiesTable.id, id)).returning();
    if (!company) { res.status(404).json({ success: false, message: "Company not found" }); return; }
    res.json({ success: true, data: company });
  } catch (e: any) {
    console.error("[PATCH /api/admin/companies/:id]", e);
    if (e?.code === "23505") {
      res.status(409).json({ success: false, message: "Duplicate code" }); return;
    }
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Company Registrations (self-service signup queue) ────────────────────────
// No registrations table exists yet — return empty list so the UI renders cleanly.
app.get("/api/admin/registrations", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role !== "superadmin") {
    res.status(403).json({ success: false, message: "Forbidden" }); return;
  }
  res.json({ success: true, data: [] });
});

app.post("/api/admin/registrations/:id/approve", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role !== "superadmin") {
    res.status(403).json({ success: false, message: "Forbidden" }); return;
  }
  res.status(404).json({ success: false, message: "Registration not found" });
});

app.post("/api/admin/registrations/:id/reject", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role !== "superadmin") {
    res.status(403).json({ success: false, message: "Forbidden" }); return;
  }
  res.status(404).json({ success: false, message: "Registration not found" });
});

app.post("/api/admin/impersonate/end", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (user.role !== "superadmin") {
    res.status(403).json({ success: false, message: "Forbidden — platform admin only" }); return;
  }
  res.json({ success: true, message: "Impersonation ended" });
});

// ─── Employee self-service endpoints ─────────────────────────────────────────
app.get("/api/attendance/me", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const { from, to } = req.query as Record<string, string>;
    const conditions = [eq(attendanceRecordsTable.employeeId, user.employeeId)];
    if (from) conditions.push(gte(attendanceRecordsTable.date, from));
    if (to) conditions.push(lte(attendanceRecordsTable.date, to));
    const rows = await db.select().from(attendanceRecordsTable).where(and(...conditions)).orderBy(desc(attendanceRecordsTable.date)).limit(50);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/me/requests", auth, async (req, res) => {
  res.json({ success: true, data: [] });
});

app.get("/api/attendance/requests", auth, async (req, res) => {
  res.json({ success: true, data: [] });
});

app.get("/api/leave/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const rows = await db.select().from(leaveRequestsTable)
      .where(and(eq(leaveRequestsTable.employeeId, user.employeeId), eq(leaveRequestsTable.isDeleted, false)))
      .orderBy(desc(leaveRequestsTable.createdAt));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/leave/me/balances", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const year = parseInt(String(req.query["year"] ?? new Date().getFullYear()));
    const balances = await db.select().from(leaveBalancesTable)
      .where(and(eq(leaveBalancesTable.employeeId, user.employeeId), eq(leaveBalancesTable.year, year)));
    res.json({ success: true, data: balances });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/leave/types", auth, async (_req, res) => {
  try {
    const rows = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/salary-advances/me", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  const result = advancesStore.filter(a => a.employeeId === user.employeeId);
  res.json({ success: true, data: result });
});

app.get("/api/salary-advances/me/summary", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  const result = advancesStore.filter(a => a.employeeId === user.employeeId);
  const total = result.reduce((s: number, a: any) => s + (a.amount ?? 0), 0);
  res.json({ success: true, data: { total, count: result.length } });
});

app.get("/api/employee/assets", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const assets = await db.select().from(assetsTable).where(and(eq(assetsTable.assignedToEmployeeId, user.employeeId), eq(assetsTable.isDeleted, false)));
    res.json({ success: true, data: assets });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employee/assets/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: { total: 0 } }); return; }
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable)
      .where(and(eq(assetsTable.assignedToEmployeeId, user.employeeId), eq(assetsTable.isDeleted, false)));
    res.json({ success: true, data: { total: count?.count ?? 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const rows = await db.select().from(overtimeRequestsTable)
      .where(and(eq(overtimeRequestsTable.employeeId, user.employeeId), eq(overtimeRequestsTable.isDeleted, false)))
      .orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/me/log", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const rows = await db.select().from(overtimeRequestsTable)
      .where(and(eq(overtimeRequestsTable.employeeId, user.employeeId), eq(overtimeRequestsTable.status, "approved")))
      .orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/log", auth, async (req, res) => {
  try {
    const rows = await db.select().from(overtimeRequestsTable)
      .where(and(eq(overtimeRequestsTable.isDeleted, false), eq(overtimeRequestsTable.status, "approved")))
      .orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/overtime/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { status, employeeId } = req.query as Record<string, string>;
    const conditions: any[] = [eq(overtimeRequestsTable.isDeleted, false)];

    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      if (employeeId && parseInt(employeeId) !== user.employeeId) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      conditions.push(eq(overtimeRequestsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const teamEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = teamEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(overtimeRequestsTable.employeeId, ids));
      if (employeeId) {
        const reqId = parseInt(employeeId);
        if (!ids.includes(reqId)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
        conditions.push(eq(overtimeRequestsTable.employeeId, reqId));
      }
    } else {
      if (employeeId) conditions.push(eq(overtimeRequestsTable.employeeId, parseInt(employeeId)));
    }

    if (status) conditions.push(eq(overtimeRequestsTable.status, status));
    const rows = await db.select().from(overtimeRequestsTable).where(and(...conditions)).orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/compliance/my-summary", auth, async (req, res) => {
  res.json({ success: true, data: { summary: { valid: 0, expiringSoon: 0, expired: 0, missing: 0 }, alerts: [] } });
});

// ─── Permissions ──────────────────────────────────────────────────────────────
app.get("/api/permissions/check", auth, async (req, res) => {
  res.json({ success: true, data: { allowed: true } });
});

// ─── Assets summary ───────────────────────────────────────────────────────────
app.get("/api/assets/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable)
      .where(and(eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    const [assigned] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable)
      .where(and(eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false), eq(assetsTable.currentStatus, "assigned")));
    res.json({ success: true, data: { total: total?.count ?? 0, assigned: assigned?.count ?? 0, available: (total?.count ?? 0) - (assigned?.count ?? 0) } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Org chart ────────────────────────────────────────────────────────────────
app.get("/api/org-nodes", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const depts = await db.select().from(departmentsTable).where(and(eq(departmentsTable.companyId, user.companyId), eq(departmentsTable.isDeleted, false)));
    const emps = await db.select({ id: employeesTable.id, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn, departmentId: employeesTable.departmentId, jobTitleId: employeesTable.jobTitleId })
      .from(employeesTable).where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));
    const nodes = depts.map(d => ({
      id: `dept-${d.id}`, type: "department", name: d.nameEn, nameAr: d.nameAr,
      children: emps.filter(e => e.departmentId === d.id).map(e => ({ id: `emp-${e.id}`, type: "employee", name: `${e.firstNameEn} ${e.lastNameEn}` })),
    }));
    res.json({ success: true, data: nodes });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/org-nodes/flat", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const emps = await db.select({ id: employeesTable.id, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn, departmentId: employeesTable.departmentId })
      .from(employeesTable).where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    res.json({ success: true, data: emps.map(e => ({ id: e.id, name: `${e.firstNameEn} ${e.lastNameEn}`, departmentId: e.departmentId })) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Reports ──────────────────────────────────────────────────────────────────
function rptSafeDate(v: unknown, fallback: string): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return fallback;
}
function rptSafeInt(v: unknown, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return isNaN(n) ? fallback : n;
}

// ── Report shared helpers ──────────────────────────────────────────────────────
async function rptGetCompany(companyId: number) {
  const [co] = await db
    .select({ nameEn: companiesTable.nameEn, nameAr: companiesTable.nameAr })
    .from(companiesTable).where(eq(companiesTable.id, companyId)).limit(1);
  return co;
}

function addSimpleSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const ws = wb.addWorksheet(name);
  ws.columns = headers.map((_, i) => ({ width: i === 0 ? 30 : 16 }));
  const hr = ws.addRow(headers);
  hr.height = 22;
  hr.eachCell(c => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A6B4A" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = { bottom: { style: "thin", color: { argb: "FF0F3D2B" } } };
  });
  rows.forEach((row, i) => {
    const r = ws.addRow(row);
    if (i % 2 === 1) r.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9F4" } }; });
    r.eachCell(c => {
      c.border = { top: { style: "thin", color: { argb: "FFADD8C0" } }, bottom: { style: "thin", color: { argb: "FFADD8C0" } }, left: { style: "thin", color: { argb: "FFADD8C0" } }, right: { style: "thin", color: { argb: "FFADD8C0" } } };
      if (typeof c.value === "number") c.alignment = { horizontal: "right" }; else c.alignment = { horizontal: "left" };
    });
  });
  const numColIdxs = (rows[0] ?? []).map((_, ci) => rows.every(r => typeof r[ci] === "number") ? ci : -1).filter(ci => ci >= 0);
  if (numColIdxs.length > 0) {
    const tr = ws.addRow(headers.map((_, ci) => ci === 0 ? "TOTAL" : numColIdxs.includes(ci) ? rows.reduce((s, r) => s + (typeof r[ci] === "number" ? r[ci] as number : 0), 0) : ""));
    tr.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5EE" } }; c.font = { bold: true }; c.border = { top: { style: "medium", color: { argb: "FF1A6B4A" } } }; if (typeof c.value === "number") { c.alignment = { horizontal: "right" }; c.numFmt = "#,##0.000"; } });
  }
  return ws;
}

// ── 1. GET /api/reports/headcount ─────────────────────────────────────────────
app.get("/api/reports/headcount", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const cid = user.companyId;
    const { orgNodeId, employmentStatus, nationality, gender, format } = req.query as Record<string, string>;
    const baseWhere: Parameters<typeof and>[0][] = [
      eq(employeesTable.companyId, cid),
      eq(employeesTable.isDeleted, false),
    ];
    if (orgNodeId)        baseWhere.push(eq(employeesTable.orgNodeId, parseInt(orgNodeId)));
    if (employmentStatus) baseWhere.push(eq(employeesTable.employmentStatus, employmentStatus));
    if (nationality)      baseWhere.push(eq(employeesTable.nationality, nationality));
    if (gender)           baseWhere.push(eq(employeesTable.gender, gender));

    const [byStatus, byDept, byGender, byNationality, byContract] = await Promise.all([
      db.select({ status: employeesTable.employmentStatus, count: sql<number>`count(*)::int` })
        .from(employeesTable).where(and(...baseWhere)).groupBy(employeesTable.employmentStatus).orderBy(desc(sql`count(*)`)),
      db.select({ nameEn: orgNodesTable.nameEn, nameAr: orgNodesTable.nameAr, count: sql<number>`count(*)::int` })
        .from(employeesTable).leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(...baseWhere)).groupBy(orgNodesTable.nameEn, orgNodesTable.nameAr).orderBy(desc(sql`count(*)`)),
      db.select({ gender: employeesTable.gender, count: sql<number>`count(*)::int` })
        .from(employeesTable).where(and(...baseWhere)).groupBy(employeesTable.gender).orderBy(desc(sql`count(*)`)),
      db.select({ nationality: employeesTable.nationality, count: sql<number>`count(*)::int` })
        .from(employeesTable).where(and(...baseWhere)).groupBy(employeesTable.nationality).orderBy(desc(sql`count(*)`)),
      db.select({ contractType: employeesTable.contractType, count: sql<number>`count(*)::int` })
        .from(employeesTable).where(and(...baseWhere)).groupBy(employeesTable.contractType).orderBy(desc(sql`count(*)`)),
    ]);

    const total = byStatus.reduce((s, r) => s + r.count, 0);

    if (format === "excel") {
      const co = await rptGetCompany(cid);
      const wb = new ExcelJS.Workbook();
      wb.creator = "ZenJO HRMS";
      const summaryWs = wb.addWorksheet("Summary");
      summaryWs.columns = [{ width: 36 }, { width: 22 }];
      const t1 = summaryWs.addRow([`${co?.nameEn ?? "ZenJO HRMS"} — Headcount Report`]);
      t1.getCell(1).font = { bold: true, size: 14, color: { argb: "FF1A6B4A" } };
      summaryWs.addRow([`Total Employees: ${total}`, `As of: ${new Date().toISOString().slice(0, 10)}`]);
      if (orgNodeId)        summaryWs.addRow(["Filter — Org Unit",        orgNodeId]);
      if (employmentStatus) summaryWs.addRow(["Filter — Employment Status", employmentStatus]);
      if (nationality)      summaryWs.addRow(["Filter — Nationality",       nationality]);
      if (gender)           summaryWs.addRow(["Filter — Gender",            gender]);
      addSimpleSheet(wb, "By Department",  ["Department (EN)", "Department (AR)", "Count"],    byDept.map(r => [r.nameEn ?? "—", r.nameAr ?? "—", r.count]));
      addSimpleSheet(wb, "By Status",      ["Employment Status", "Count"],                     byStatus.map(r => [r.status, r.count]));
      addSimpleSheet(wb, "By Gender",      ["Gender", "Count"],                                byGender.map(r => [r.gender, r.count]));
      addSimpleSheet(wb, "By Nationality", ["Nationality", "Count"],                           byNationality.map(r => [r.nationality ?? "Unknown", r.count]));
      addSimpleSheet(wb, "By Contract",    ["Contract Type", "Count"],                         byContract.map(r => [r.contractType ?? "Unknown", r.count]));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="zenjo-headcount-report.xlsx"');
      await wb.xlsx.write(res); res.end();
      return;
    }

    res.json({
      success: true,
      data: { total, byDepartment: byDept, byStatus, byGender, byNationality, byContractType: byContract, asOfDate: new Date().toISOString() },
    });
  } catch (e) {
    console.error("[/api/reports/headcount]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/reports/leave-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const year = rptSafeInt(req.query["year"], new Date().getFullYear());
    const month = rptSafeInt(req.query["month"], new Date().getMonth() + 1);
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);
    const empIds = (await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)))).map(e => e.id);
    if (empIds.length === 0) { res.json({ success: true, data: [] }); return; }
    const rows = await db
      .select({
        typeEn: sql<string>`coalesce(${leaveRequestsTable.leaveType}, 'unknown')`,
        typeAr: sql<string>`coalesce(${leaveRequestsTable.leaveType}, 'غير محدد')`,
        status: leaveRequestsTable.status,
        count: sql<number>`count(*)::int`,
        totalDays: sql<number>`coalesce(sum(${leaveRequestsTable.totalDays}), 0)::numeric(10,2)`,
      })
      .from(leaveRequestsTable)
      .where(and(inArray(leaveRequestsTable.employeeId, empIds), eq(leaveRequestsTable.isDeleted, false),
        gte(leaveRequestsTable.startDate, startOfMonth), lte(leaveRequestsTable.startDate, endOfMonth)))
      .groupBy(leaveRequestsTable.leaveType, leaveRequestsTable.status)
      .orderBy(desc(sql`count(*)`));
    res.json({ success: true, data: rows });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Internal server error" }); }
});

// ── 2. GET /api/reports/attendance-summary ────────────────────────────────────
app.get("/api/reports/attendance-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, orgNodeId, format } = req.query as Record<string, string>;
    const year        = rptSafeInt(req.query["year"],  new Date().getFullYear());
    const month       = rptSafeInt(req.query["month"], new Date().getMonth() + 1);
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth   = new Date(year, month, 0).toISOString().slice(0, 10);
    const daysInMonth  = new Date(year, month, 0).getDate();
    const isEmployee   = user.role === "employee";
    const empWhere: Parameters<typeof and>[0][] = [
      eq(employeesTable.companyId, user.companyId),
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, "active"),
    ];
    if (isEmployee)    empWhere.push(eq(employeesTable.id, user.userId));
    else if (employeeId) empWhere.push(eq(employeesTable.id, parseInt(employeeId)));
    if (orgNodeId)     empWhere.push(eq(employeesTable.orgNodeId, parseInt(orgNodeId)));

    const summaryRows = await db
      .select({
        employeeId:       employeesTable.id,
        employeeCode:     employeesTable.employeeCode,
        nameAr:           sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        nameEn:           sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        orgNodeNameEn:    orgNodesTable.nameEn,
        presentDays:      sql<number>`count(case when ${attendanceRecordsTable.status} = 'present' then 1 end)::int`,
        absentDays:       sql<number>`count(case when ${attendanceRecordsTable.status} = 'absent'  then 1 end)::int`,
        lateDays:         sql<number>`count(case when ${attendanceRecordsTable.lateMinutes} > 0    then 1 end)::int`,
        totalLateMinutes: sql<number>`coalesce(sum(${attendanceRecordsTable.lateMinutes}), 0)::int`,
      })
      .from(employeesTable)
      .leftJoin(attendanceRecordsTable, and(
        eq(attendanceRecordsTable.employeeId, employeesTable.id),
        gte(attendanceRecordsTable.date, startOfMonth),
        lte(attendanceRecordsTable.date, endOfMonth),
      ))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(...empWhere))
      .groupBy(
        employeesTable.id, employeesTable.employeeCode,
        employeesTable.firstNameAr, employeesTable.lastNameAr,
        employeesTable.firstNameEn, employeesTable.lastNameEn,
        orgNodesTable.nameEn,
      )
      .orderBy(asc(employeesTable.firstNameEn));

    if (format === "excel") {
      const empIds = summaryRows.map(r => r.employeeId);
      const dayRecords = empIds.length === 0 ? [] : await db
        .select({ employeeId: attendanceRecordsTable.employeeId, date: attendanceRecordsTable.date, status: attendanceRecordsTable.status, lateMinutes: attendanceRecordsTable.lateMinutes })
        .from(attendanceRecordsTable)
        .where(and(
          inArray(attendanceRecordsTable.employeeId, empIds),
          gte(attendanceRecordsTable.date, startOfMonth),
          lte(attendanceRecordsTable.date, endOfMonth),
        ));

      const dayGrid: Record<number, Record<number, string>> = {};
      dayRecords.forEach(r => {
        const day = new Date(r.date).getDate();
        if (!dayGrid[r.employeeId]) dayGrid[r.employeeId] = {};
        dayGrid[r.employeeId]![day] = r.status === "present" ? (r.lateMinutes && r.lateMinutes > 0 ? "L" : "P") : r.status === "absent" ? "A" : r.status?.charAt(0).toUpperCase() ?? "";
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = "ZenJO HRMS";
      const ws = wb.addWorksheet("Attendance Grid");
      const dayNums = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      const headers = ["Code", "Name (EN)", "Org Unit", ...dayNums.map(String), "Present", "Absent", "Late(min)"];
      ws.columns = headers.map((_, i) => ({ width: i === 0 ? 12 : i === 1 ? 24 : i === 2 ? 20 : i < 3 + daysInMonth ? 5 : 12 }));
      const hr = ws.addRow(headers);
      hr.height = 22;
      hr.eachCell(c => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A6B4A" } };
        c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        c.alignment = { horizontal: "center", vertical: "middle" };
      });
      summaryRows.forEach((emp, i) => {
        const grid = dayGrid[emp.employeeId] ?? {};
        const dayValues = dayNums.map(d => grid[d] ?? "");
        const row = ws.addRow([emp.employeeCode ?? "", emp.nameEn, emp.orgNodeNameEn ?? "", ...dayValues, emp.presentDays, emp.absentDays, emp.totalLateMinutes]);
        if (i % 2 === 1) row.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9F4" } }; });
        dayNums.forEach((d, di) => {
          const cell = row.getCell(4 + di);
          const code = grid[d] ?? "";
          if      (code === "P") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } }; cell.font = { color: { argb: "FF1A6B4A" }, bold: true, size: 9 }; }
          else if (code === "A") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8D7DA" } }; cell.font = { color: { argb: "FF842029" }, bold: true, size: 9 }; }
          else if (code === "L") { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" } }; cell.font = { color: { argb: "FF664D03" }, bold: true, size: 9 }; }
          cell.alignment = { horizontal: "center" };
        });
        row.eachCell(c => { c.border = { top: { style: "thin", color: { argb: "FFADD8C0" } }, bottom: { style: "thin", color: { argb: "FFADD8C0" } }, left: { style: "thin", color: { argb: "FFADD8C0" } }, right: { style: "thin", color: { argb: "FFADD8C0" } } }; });
      });
      const totals = ws.addRow(["", "TOTAL", "",
        ...dayNums.map(d => summaryRows.filter(r => !!(dayGrid[r.employeeId] ?? {})[d]).length || ""),
        summaryRows.reduce((s, r) => s + r.presentDays, 0),
        summaryRows.reduce((s, r) => s + r.absentDays, 0),
        summaryRows.reduce((s, r) => s + r.totalLateMinutes, 0),
      ]);
      totals.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5EE" } }; c.font = { bold: true }; c.border = { top: { style: "medium", color: { argb: "FF1A6B4A" } } }; });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-attendance-${year}-${month}.xlsx"`);
      await wb.xlsx.write(res); res.end();
      return;
    }

    res.json({ success: true, data: summaryRows });
  } catch (e) {
    console.error("[/api/reports/attendance-summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/reports/overtime-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const from = rptSafeDate(req.query["from"], `${new Date().getFullYear()}-01-01`);
    const to = rptSafeDate(req.query["to"], new Date().toISOString().slice(0, 10));
    const rows = await db
      .select({
        employeeId: employeesTable.id,
        nameAr: sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        nameEn: sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        orgNodeNameAr: orgNodesTable.nameAr,
        orgNodeNameEn: orgNodesTable.nameEn,
        totalHours: sql<number>`coalesce(sum(${overtimeRequestsTable.hours}), 0)::numeric(10,2)`,
        approvedHours: sql<number>`coalesce(sum(case when ${overtimeRequestsTable.status} = 'approved' then ${overtimeRequestsTable.hours} end), 0)::numeric(10,2)`,
        totalCost: sql<number>`coalesce(sum(case when ${overtimeRequestsTable.status} = 'approved' then ${overtimeRequestsTable.hours}::numeric * (${employeesTable.basicSalary}::numeric / 176) * 1.5 end), 0)::numeric(12,3)`,
      })
      .from(employeesTable)
      .leftJoin(overtimeRequestsTable, and(eq(overtimeRequestsTable.employeeId, employeesTable.id),
        gte(overtimeRequestsTable.date, from), lte(overtimeRequestsTable.date, to), eq(overtimeRequestsTable.isDeleted, false)))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")))
      .groupBy(employeesTable.id, employeesTable.firstNameAr, employeesTable.lastNameAr, employeesTable.firstNameEn, employeesTable.lastNameEn, employeesTable.basicSalary, orgNodesTable.nameAr, orgNodesTable.nameEn)
      .orderBy(desc(sql`coalesce(sum(${overtimeRequestsTable.hours}), 0)`));
    res.json({ success: true, data: rows });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Internal server error" }); }
});

// ── 3. GET /api/reports/disciplinary-summary ──────────────────────────────────
app.get("/api/reports/disciplinary-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, violationType, format } = req.query as Record<string, string>;
    const from = rptSafeDate(req.query["from"] ?? req.query["dateFrom"], `${new Date().getFullYear()}-01-01`);
    const to   = rptSafeDate(req.query["to"]   ?? req.query["dateTo"],   new Date().toISOString().slice(0, 10));
    const disciplinaryTypes = ["warning_issued", "suspension", "suspension_lift", "termination"];
    const typeArMap: Record<string, string> = { warning_issued: "إنذار", suspension: "إيقاف", suspension_lift: "رفع الإيقاف", termination: "إنهاء خدمة" };
    const whereConditions: Parameters<typeof and>[0][] = [
      eq(employeeActionsTable.companyId, user.companyId),
      inArray(employeeActionsTable.actionType, violationType ? [violationType] : disciplinaryTypes),
      gte(employeeActionsTable.effectiveDate, from),
      lte(employeeActionsTable.effectiveDate, to),
    ];
    const records = await db
      .select({
        id:             employeeActionsTable.id,
        nameEn:         sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:         sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        employeeCode:   employeesTable.employeeCode,
        orgNodeNameEn:  orgNodesTable.nameEn,
        actionType:     employeeActionsTable.actionType,
        status:         employeeActionsTable.status,
        effectiveDate:  employeeActionsTable.effectiveDate,
        notes:          employeeActionsTable.notes,
      })
      .from(employeeActionsTable)
      .innerJoin(employeesTable, eq(employeeActionsTable.employeeId, employeesTable.id))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(...whereConditions, ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
      .orderBy(desc(employeeActionsTable.effectiveDate));
    const enriched = records.map(r => ({ ...r, actionTypeAr: typeArMap[r.actionType] ?? r.actionType }));

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const buffer = await generateExcelBuffer({
        sheetName: "Disciplinary Summary",
        reportTitle: "Disciplinary Summary Report",
        reportTitleAr: "تقرير الإجراءات التأديبية",
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { From: from, To: to, ...(orgNodeId ? { "Org Unit": orgNodeId } : {}), ...(violationType ? { Type: violationType } : {}) },
        columns: [
          { key: "employeeCode",  header: "Emp. Code",       headerAr: "الكود",            width: 14 },
          { key: "nameEn",        header: "Employee (EN)",    headerAr: "الموظف",           width: 28 },
          { key: "nameAr",        header: "الموظف",           headerAr: "Employee (AR)",    width: 28, isArabic: true },
          { key: "orgNodeNameEn", header: "Org Unit",         headerAr: "الوحدة",           width: 22 },
          { key: "actionType",    header: "Violation Type",   headerAr: "نوع المخالفة",    width: 22 },
          { key: "actionTypeAr",  header: "نوع المخالفة",     headerAr: "Violation (AR)",   width: 22, isArabic: true },
          { key: "status",        header: "Status",           headerAr: "الحالة",           width: 14 },
          { key: "effectiveDate", header: "Effective Date",   headerAr: "التاريخ",          width: 16, isDate: true },
          { key: "notes",         header: "Notes",            headerAr: "ملاحظات",          width: 34 },
        ],
        data: enriched as Record<string, unknown>[],
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="zenjo-disciplinary-report.xlsx"');
      res.send(buffer);
      return;
    }

    const summary = disciplinaryTypes.map(t => ({ type: t, typeAr: typeArMap[t] ?? t, count: enriched.filter(r => r.actionType === t).length }));
    res.json({ success: true, data: { records: enriched, summary, period: { from, to } } });
  } catch (e) {
    console.error("[/api/reports/disciplinary-summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── 4. GET /api/reports/payroll-summary ───────────────────────────────────────
app.get("/api/reports/payroll-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, format } = req.query as Record<string, string>;
    const year  = rptSafeInt(req.query["year"],  new Date().getFullYear());
    const month = rptSafeInt(req.query["month"], 0);
    const runConditions: Parameters<typeof and>[0][] = [
      eq(payrollRunsTable.companyId, user.companyId),
      eq(payrollRunsTable.isDeleted, false),
      eq(payrollRunsTable.runYear, year),
    ];
    if (month > 0) runConditions.push(eq(payrollRunsTable.runMonth, month));
    const runs = await db.select({ id: payrollRunsTable.id, runMonth: payrollRunsTable.runMonth, runYear: payrollRunsTable.runYear, status: payrollRunsTable.status })
      .from(payrollRunsTable).where(and(...runConditions)).orderBy(desc(payrollRunsTable.runMonth));

    if (runs.length === 0) { res.json({ success: true, data: { runs: [], payslips: [], runLevel: [] } }); return; }

    const runIds = runs.map(r => r.id);
    const payslipWhere: Parameters<typeof and>[0][] = [inArray(payslipsTable.payrollRunId, runIds), eq(employeesTable.companyId, user.companyId)];
    if (orgNodeId) payslipWhere.push(eq(employeesTable.orgNodeId, parseInt(orgNodeId)));

    const payslips = await db
      .select({
        employeeId:         employeesTable.id,
        employeeCode:       employeesTable.employeeCode,
        nameEn:             sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:             sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        orgNodeNameEn:      orgNodesTable.nameEn,
        runMonth:           payslipsTable.runMonth,
        runYear:            payslipsTable.runYear,
        basicSalary:        payslipsTable.basicSalary,
        housingAllowance:   payslipsTable.housingAllowance,
        transportAllowance: payslipsTable.transportAllowance,
        mobileAllowance:    payslipsTable.mobileAllowance,
        mealAllowance:      payslipsTable.mealAllowance,
        otherAllowances:    payslipsTable.otherAllowances,
        overtimeEarnings:   payslipsTable.overtimeEarnings,
        grossSalary:        payslipsTable.grossSalary,
        sscDeduction:       payslipsTable.sscDeduction,
        incomeTaxDeduction: payslipsTable.incomeTaxDeduction,
        loanDeductions:     payslipsTable.loanDeductions,
        otherDeductions:    payslipsTable.otherDeductions,
        totalDeductions:    payslipsTable.totalDeductions,
        netSalary:          payslipsTable.netSalary,
        bankName:           payslipsTable.bankName,
        iban:               payslipsTable.iban,
      })
      .from(payslipsTable)
      .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(...payslipWhere))
      .orderBy(asc(employeesTable.firstNameEn), asc(payslipsTable.runYear), asc(payslipsTable.runMonth));

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const monthLabel = month > 0 ? new Date(year, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" }) : String(year);
      const numRow = (p: typeof payslips[0]) => ({
        ...p,
        orgNodeNameEn:      p.orgNodeNameEn ?? "",
        bankName:           p.bankName ?? "",
        iban:               p.iban ?? "",
        basicSalary:        Number(p.basicSalary),
        housingAllowance:   Number(p.housingAllowance),
        transportAllowance: Number(p.transportAllowance),
        mobileAllowance:    Number(p.mobileAllowance),
        mealAllowance:      Number(p.mealAllowance),
        otherAllowances:    Number(p.otherAllowances),
        overtimeEarnings:   Number(p.overtimeEarnings),
        grossSalary:        Number(p.grossSalary),
        sscDeduction:       Number(p.sscDeduction),
        incomeTaxDeduction: Number(p.incomeTaxDeduction),
        loanDeductions:     Number(p.loanDeductions),
        otherDeductions:    Number(p.otherDeductions),
        totalDeductions:    Number(p.totalDeductions),
        netSalary:          Number(p.netSalary),
      });
      const buffer = await generateExcelBuffer({
        sheetName: "Payroll Ledger",
        reportTitle: "Payroll Summary Report",
        reportTitleAr: "تقرير ملخص الرواتب",
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { Period: monthLabel, ...(orgNodeId ? { "Org Unit": orgNodeId } : {}) },
        columns: [
          { key: "employeeCode",      header: "Code",              headerAr: "الكود",                width: 14 },
          { key: "nameEn",            header: "Name (EN)",          headerAr: "الاسم",                width: 26 },
          { key: "nameAr",            header: "الاسم بالعربية",     headerAr: "Name (AR)",            width: 26, isArabic: true },
          { key: "orgNodeNameEn",     header: "Org Unit",           headerAr: "الوحدة",               width: 20 },
          { key: "runMonth",          header: "Month",              headerAr: "الشهر",                width: 10, isNumeric: true },
          { key: "basicSalary",       header: "Basic (JOD)",        headerAr: "الأساسي",             width: 16, isCurrency: true },
          { key: "housingAllowance",  header: "Housing (JOD)",      headerAr: "سكن",                 width: 16, isCurrency: true },
          { key: "transportAllowance", header: "Transport (JOD)",   headerAr: "مواصلات",             width: 16, isCurrency: true },
          { key: "overtimeEarnings",  header: "Overtime (JOD)",     headerAr: "إضافي",               width: 16, isCurrency: true },
          { key: "grossSalary",       header: "Gross (JOD)",        headerAr: "الإجمالي",            width: 18, isCurrency: true },
          { key: "sscDeduction",      header: "SSC (JOD)",          headerAr: "ضمان اجتماعي",       width: 16, isCurrency: true },
          { key: "incomeTaxDeduction", header: "Tax (JOD)",         headerAr: "ضريبة الدخل",        width: 16, isCurrency: true },
          { key: "totalDeductions",   header: "Total Deduct. (JOD)", headerAr: "إجمالي الاستقطاعات", width: 20, isCurrency: true },
          { key: "netSalary",         header: "Net (JOD)",          headerAr: "الصافي",              width: 18, isCurrency: true },
          { key: "bankName",          header: "Bank",               headerAr: "البنك",               width: 18 },
          { key: "iban",              header: "IBAN",               headerAr: "IBAN",                width: 28 },
        ],
        data: payslips.map(numRow) as Record<string, unknown>[],
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-payroll-${year}-${month > 0 ? month : "full"}.xlsx"`);
      res.send(buffer);
      return;
    }

    const runLevel = runs.map(r => ({
      ...r,
      payslipCount: payslips.filter(p => p.runMonth === r.runMonth).length,
      totalGross:   payslips.filter(p => p.runMonth === r.runMonth).reduce((s, p) => s + Number(p.grossSalary), 0),
      totalNet:     payslips.filter(p => p.runMonth === r.runMonth).reduce((s, p) => s + Number(p.netSalary), 0),
    }));
    res.json({ success: true, data: { runs, payslips, runLevel } });
  } catch (e) {
    console.error("[/api/reports/payroll-summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── 5. GET /api/reports/ssc-contributions ────────────────────────────────────
app.get("/api/reports/ssc-contributions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, format } = req.query as Record<string, string>;
    const year  = rptSafeInt(req.query["year"],  new Date().getFullYear());
    const month = rptSafeInt(req.query["month"], new Date().getMonth() + 1);
    const [run] = await db.select({ id: payrollRunsTable.id })
      .from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.runMonth, month), eq(payrollRunsTable.runYear, year), eq(payrollRunsTable.isDeleted, false)))
      .limit(1);

    type SscRow = { nameEn: string; nameAr: string; sscNumber: string | null; nationalId: string | null; orgNodeNameEn: string | null; basicSalary: number; insurableAmount: number; sscDeduction: number; sscEmployerContribution: number };
    let rows: SscRow[];

    if (run) {
      const raw = await db
        .select({
          nameEn:                  sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:                  sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          sscNumber:               employeesTable.sscNumber,
          nationalId:              employeesTable.nationalId,
          orgNodeNameEn:           orgNodesTable.nameEn,
          basicSalary:             payslipsTable.basicSalary,
          insurableAmount:         sql<number>`least(${payslipsTable.basicSalary}::numeric, 3000)`,
          sscDeduction:            payslipsTable.sscDeduction,
          sscEmployerContribution: payslipsTable.sscEmployerContribution,
        })
        .from(payslipsTable)
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(payslipsTable.payrollRunId, run.id), eq(employeesTable.companyId, user.companyId), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .orderBy(asc(employeesTable.firstNameEn));
      rows = raw.map(r => ({ ...r, basicSalary: Number(r.basicSalary), insurableAmount: Number(r.insurableAmount), sscDeduction: Number(r.sscDeduction), sscEmployerContribution: Number(r.sscEmployerContribution) }));
    } else {
      const raw = await db
        .select({
          nameEn:                  sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:                  sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          sscNumber:               employeesTable.sscNumber,
          nationalId:              employeesTable.nationalId,
          orgNodeNameEn:           orgNodesTable.nameEn,
          basicSalary:             employeesTable.basicSalary,
          insurableAmount:         sql<number>`least(${employeesTable.basicSalary}::numeric, 3000)`,
          sscDeduction:            sql<number>`round(least(${employeesTable.basicSalary}::numeric, 3000) * 0.075, 3)`,
          sscEmployerContribution: sql<number>`round(least(${employeesTable.basicSalary}::numeric, 3000) * 0.1425, 3)`,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), eq(employeesTable.isSSCExempt, false), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .orderBy(asc(employeesTable.firstNameEn));
      rows = raw.map(r => ({ ...r, basicSalary: Number(r.basicSalary), insurableAmount: Number(r.insurableAmount), sscDeduction: Number(r.sscDeduction), sscEmployerContribution: Number(r.sscEmployerContribution) }));
    }

    if (format === "excel") {
      // Government submission format: minimal styling, fixed columns, clean data
      const wb = new ExcelJS.Workbook();
      wb.creator = "ZenJO HRMS";
      const ws = wb.addWorksheet("SSC Contributions");
      const govHeaders = ["SSC Number", "National ID", "Employee Name (AR)", "Employee Name (EN)", "Basic Salary (JOD)", "Insurable Amount (JOD)", "Employee Share 7.5% (JOD)", "Employer Share 14.25% (JOD)"];
      ws.columns = govHeaders.map((_, i) => ({ width: i < 4 ? 24 : 22 }));
      const hr = ws.addRow(govHeaders);
      hr.height = 22;
      hr.eachCell(c => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD4EDDA" } };
        c.font = { bold: true, size: 11 };
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = { bottom: { style: "medium", color: { argb: "FF1A6B4A" } } };
      });
      rows.forEach((r, i) => {
        const row = ws.addRow([r.sscNumber ?? "", r.nationalId ?? "", r.nameAr, r.nameEn, r.basicSalary, r.insurableAmount, r.sscDeduction, r.sscEmployerContribution]);
        if (i % 2 === 1) row.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F9F4" } }; });
        row.eachCell({ includeEmpty: true }, (c, ci) => {
          c.border = { top: { style: "thin", color: { argb: "FFADD8C0" } }, bottom: { style: "thin", color: { argb: "FFADD8C0" } }, left: { style: "thin", color: { argb: "FFADD8C0" } }, right: { style: "thin", color: { argb: "FFADD8C0" } } };
          if (ci >= 5) { c.numFmt = "#,##0.000"; c.alignment = { horizontal: "right" }; }
          if (ci === 3) { c.alignment = { horizontal: "right", readingOrder: "rtl" }; }
        });
      });
      const totRow = ws.addRow(["", "", "", "TOTAL", rows.reduce((s, r) => s + r.basicSalary, 0), rows.reduce((s, r) => s + r.insurableAmount, 0), rows.reduce((s, r) => s + r.sscDeduction, 0), rows.reduce((s, r) => s + r.sscEmployerContribution, 0)]);
      totRow.eachCell({ includeEmpty: true }, (c, ci) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5EE" } }; c.font = { bold: true }; c.border = { top: { style: "medium", color: { argb: "FF1A6B4A" } } }; if (ci >= 5) { c.numFmt = "#,##0.000"; c.alignment = { horizontal: "right" }; } });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-ssc-${year}-${month}.xlsx"`);
      await wb.xlsx.write(res); res.end();
      return;
    }

    res.json({ success: true, data: rows, meta: { source: run ? "payroll_run" : "estimated", month, year } });
  } catch (e) {
    console.error("[/api/reports/ssc-contributions]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/reports/income-tax-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const year = rptSafeInt(req.query["year"], new Date().getFullYear());
    const checkPayslips = await db.select({ id: payslipsTable.id })
      .from(payslipsTable)
      .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
      .where(and(eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.runYear, year), eq(payrollRunsTable.isDeleted, false)))
      .limit(1);
    if (checkPayslips.length > 0) {
      const rows = await db
        .select({
          employeeId: employeesTable.id,
          nameAr: sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          nameEn: sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          orgNodeNameAr: orgNodesTable.nameAr,
          orgNodeNameEn: orgNodesTable.nameEn,
          annualGross: sql<number>`coalesce(sum(${payslipsTable.grossSalary}), 0)::numeric(14,3)`,
          totalTax: sql<number>`coalesce(sum(${payslipsTable.incomeTaxDeduction}), 0)::numeric(14,3)`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(payslipsTable)
        .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.runYear, year), eq(payrollRunsTable.isDeleted, false)))
        .groupBy(employeesTable.id, employeesTable.firstNameAr, employeesTable.lastNameAr, employeesTable.firstNameEn, employeesTable.lastNameEn, employeesTable.taxExemptionAmount, orgNodesTable.nameAr, orgNodesTable.nameEn)
        .orderBy(desc(sql`coalesce(sum(${payslipsTable.grossSalary}), 0)`));
      res.json({ success: true, data: rows });
    } else {
      const rows = await db
        .select({
          employeeId: employeesTable.id,
          nameAr: sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          nameEn: sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          orgNodeNameAr: orgNodesTable.nameAr,
          orgNodeNameEn: orgNodesTable.nameEn,
          annualGross: sql<number>`round((${employeesTable.basicSalary}::numeric + coalesce(${employeesTable.housingAllowance}::numeric, 0) + coalesce(${employeesTable.transportAllowance}::numeric, 0)) * 12, 3)`,
          totalTax: sql<number>`0::numeric`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")))
        .orderBy(desc(sql`${employeesTable.basicSalary}`));
      res.json({ success: true, data: rows });
    }
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Internal server error" }); }
});

// ── 6. GET /api/reports/turnover ──────────────────────────────────────────────
app.get("/api/reports/turnover", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, format } = req.query as Record<string, string>;
    const year = rptSafeInt(req.query["year"], new Date().getFullYear());
    const from = rptSafeDate(req.query["from"], `${year}-01-01`);
    const to   = rptSafeDate(req.query["to"],   `${year}-12-31`);

    const hiresByMonth = await db
      .select({ month: sql<number>`extract(month from ${employeesTable.hireDate}::date)::int`, count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), gte(employeesTable.hireDate, from), lte(employeesTable.hireDate, to), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
      .groupBy(sql`extract(month from ${employeesTable.hireDate}::date)`);

    const exitsByMonth = await db
      .select({ month: sql<number>`extract(month from ${employeeActionsTable.effectiveDate}::date)::int`, actionType: employeeActionsTable.actionType, count: sql<number>`count(*)::int` })
      .from(employeeActionsTable)
      .innerJoin(employeesTable, eq(employeeActionsTable.employeeId, employeesTable.id))
      .where(and(eq(employeeActionsTable.companyId, user.companyId), inArray(employeeActionsTable.actionType, ["termination", "resignation"]), gte(employeeActionsTable.effectiveDate, from), lte(employeeActionsTable.effectiveDate, to), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
      .groupBy(sql`extract(month from ${employeeActionsTable.effectiveDate}::date)`, employeeActionsTable.actionType);

    const [activeRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return {
        month: m,
        monthName: monthNames[i]!,
        hired:      hiresByMonth.find(r => r.month === m)?.count ?? 0,
        resigned:   exitsByMonth.filter(r => r.month === m && r.actionType === "resignation").reduce((s, r) => s + r.count, 0),
        terminated: exitsByMonth.filter(r => r.month === m && r.actionType === "termination").reduce((s, r) => s + r.count, 0),
      };
    });

    const totalHired      = monthly.reduce((s, m) => s + m.hired, 0);
    const totalResigned   = monthly.reduce((s, m) => s + m.resigned, 0);
    const totalTerminated = monthly.reduce((s, m) => s + m.terminated, 0);
    const currentHeadcount = activeRow?.count ?? 1;
    const turnoverRate = currentHeadcount > 0 ? parseFloat((((totalResigned + totalTerminated) / currentHeadcount) * 100).toFixed(2)) : 0;

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const buffer = await generateExcelBuffer({
        sheetName: "Turnover Report",
        reportTitle: "Employee Turnover Report",
        reportTitleAr: "تقرير دوران الموظفين",
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { Year: String(year), From: from, To: to },
        columns: [
          { key: "monthName",  header: "Month",        headerAr: "الشهر",             width: 14 },
          { key: "hired",      header: "Hired",        headerAr: "موظفون جدد",        width: 14, isNumeric: true },
          { key: "resigned",   header: "Resigned",     headerAr: "استقالات",          width: 14, isNumeric: true },
          { key: "terminated", header: "Terminated",   headerAr: "إنهاء خدمة",       width: 16, isNumeric: true },
          { key: "exits",      header: "Total Exits",  headerAr: "إجمالي المغادرين", width: 16, isNumeric: true },
        ],
        data: monthly.map(m => ({ ...m, exits: m.resigned + m.terminated })),
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-turnover-${year}.xlsx"`);
      res.send(buffer);
      return;
    }

    res.json({
      success: true,
      data: {
        monthly,
        summary: { totalHired, totalResigned, totalTerminated, totalExits: totalResigned + totalTerminated, currentHeadcount, turnoverRate },
        year,
      },
    });
  } catch (e) {
    console.error("[/api/reports/turnover]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/reports/compliance-summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const today = new Date().toISOString().slice(0, 10);
    const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [totalActiveRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));
    const [sscEnrolledRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), isNotNull(employeesTable.sscNumber)));
    const [nonJordRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"),
        ne(employeesTable.nationality, "أردني"), ne(employeesTable.nationality, "Jordanian")));
    const [expiredRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"),
        isNotNull(employeesTable.workPermitExpiry), lte(sql`${employeesTable.workPermitExpiry}::date`, today)));
    const [expiringSoonRow] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"),
        isNotNull(employeesTable.workPermitExpiry), gte(sql`${employeesTable.workPermitExpiry}::date`, today), lte(sql`${employeesTable.workPermitExpiry}::date`, soonDate)));
    const totalActive = totalActiveRow?.count ?? 0;
    const sscEnrolled = sscEnrolledRow?.count ?? 0;
    res.json({
      success: true, data: {
        totalActive, sscEnrolled, sscNotEnrolled: totalActive - sscEnrolled,
        nonJordanians: nonJordRow?.count ?? 0, workPermitsExpired: expiredRow?.count ?? 0,
        workPermitsExpiringSoon: expiringSoonRow?.count ?? 0,
      }
    });
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: "Internal server error" }); }
});

// ─── Enhanced Step-3 Report Endpoints ────────────────────────────────────────

// ── 7. GET /api/reports/leave-analysis ────────────────────────────────────────
app.get("/api/reports/leave-analysis", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, leaveType, status, format } = req.query as Record<string, string>;
    const dateFrom = rptSafeDate(req.query["dateFrom"] ?? req.query["from"], `${new Date().getFullYear()}-01-01`);
    const dateTo   = rptSafeDate(req.query["dateTo"]   ?? req.query["to"],   new Date().toISOString().slice(0, 10));
    const isEmployee = user.role === "employee";
    const empIds = isEmployee ? [user.userId] : (await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
    ).map(e => e.id);

    if (empIds.length === 0) { res.json({ success: true, data: { requests: [], summary: [] } }); return; }

    const whereConditions: Parameters<typeof and>[0][] = [
      inArray(leaveRequestsTable.employeeId, empIds),
      eq(leaveRequestsTable.isDeleted, false),
      gte(leaveRequestsTable.startDate, dateFrom),
      lte(leaveRequestsTable.startDate, dateTo),
    ];
    if (leaveType) whereConditions.push(eq(leaveRequestsTable.leaveType, leaveType));
    if (status)    whereConditions.push(eq(leaveRequestsTable.status,    status));

    const requests = await db
      .select({
        id:           leaveRequestsTable.id,
        nameEn:       sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:       sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        employeeCode: employeesTable.employeeCode,
        orgNodeNameEn: orgNodesTable.nameEn,
        leaveType:    leaveRequestsTable.leaveType,
        startDate:    leaveRequestsTable.startDate,
        endDate:      leaveRequestsTable.endDate,
        totalDays:    leaveRequestsTable.totalDays,
        status:       leaveRequestsTable.status,
        approvedById: leaveRequestsTable.approvedById,
        reason:       leaveRequestsTable.reason,
        createdAt:    leaveRequestsTable.createdAt,
      })
      .from(leaveRequestsTable)
      .innerJoin(employeesTable, eq(leaveRequestsTable.employeeId, employeesTable.id))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(...whereConditions))
      .orderBy(desc(leaveRequestsTable.startDate));

    const summaryMap: Record<string, { type: string; approved: number; pending: number; rejected: number; totalDays: number }> = {};
    requests.forEach(r => {
      const key = r.leaveType ?? "unknown";
      if (!summaryMap[key]) summaryMap[key] = { type: key, approved: 0, pending: 0, rejected: 0, totalDays: 0 };
      const s = summaryMap[key]!;
      if (r.status === "approved") { s.approved++; s.totalDays += Number(r.totalDays ?? 0); }
      else if (r.status === "pending")  s.pending++;
      else if (r.status === "rejected") s.rejected++;
    });
    const summary = Object.values(summaryMap);

    if (format === "excel") {
      const wb = new ExcelJS.Workbook();
      wb.creator = "ZenJO HRMS";
      addSimpleSheet(wb, "Leave Requests",
        ["Code", "Name (EN)", "Org Unit", "Leave Type", "Start Date", "End Date", "Days", "Status"],
        requests.map(r => [r.employeeCode ?? "", r.nameEn, r.orgNodeNameEn ?? "", r.leaveType ?? "", r.startDate ?? "", r.endDate ?? "", Number(r.totalDays ?? 0), r.status ?? ""]));
      addSimpleSheet(wb, "Summary by Type",
        ["Leave Type", "Approved", "Pending", "Rejected", "Total Days"],
        summary.map(s => [s.type, s.approved, s.pending, s.rejected, s.totalDays]));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="zenjo-leave-analysis.xlsx"');
      await wb.xlsx.write(res); res.end();
      return;
    }

    res.json({ success: true, data: { requests, summary, period: { from: dateFrom, to: dateTo } } });
  } catch (e) {
    console.error("[/api/reports/leave-analysis]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── 8. GET /api/reports/income-tax ────────────────────────────────────────────
app.get("/api/reports/income-tax", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, format } = req.query as Record<string, string>;
    const year = rptSafeInt(req.query["year"], new Date().getFullYear());
    const runWhere: Parameters<typeof and>[0][] = [eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.runYear, year), eq(payrollRunsTable.isDeleted, false)];
    const [check] = await db.select({ id: payslipsTable.id }).from(payslipsTable)
      .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
      .where(and(...runWhere)).limit(1);

    type TaxRow = { employeeCode: string | null; nameEn: string; nameAr: string; orgNodeNameEn: string; annualGross: number; totalTax: number; effectiveTaxRate: number; extraExemption: number; isEstimated: boolean };
    let rows: TaxRow[];

    if (check) {
      const raw = await db
        .select({
          employeeCode:   employeesTable.employeeCode,
          nameEn:         sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:         sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:  orgNodesTable.nameEn,
          annualGross:    sql<number>`coalesce(sum(${payslipsTable.grossSalary}), 0)::numeric(14,3)`,
          totalTax:       sql<number>`coalesce(sum(${payslipsTable.incomeTaxDeduction}), 0)::numeric(14,3)`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(payslipsTable)
        .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(...runWhere, ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .groupBy(employeesTable.id, employeesTable.employeeCode, employeesTable.firstNameAr, employeesTable.lastNameAr, employeesTable.firstNameEn, employeesTable.lastNameEn, employeesTable.taxExemptionAmount, orgNodesTable.nameEn)
        .orderBy(desc(sql`coalesce(sum(${payslipsTable.grossSalary}), 0)`));
      rows = raw.map(r => ({ ...r, orgNodeNameEn: r.orgNodeNameEn ?? "", annualGross: Number(r.annualGross), totalTax: Number(r.totalTax), extraExemption: Number(r.extraExemption ?? 0), effectiveTaxRate: Number(r.annualGross) > 0 ? parseFloat(((Number(r.totalTax) / Number(r.annualGross)) * 100).toFixed(2)) : 0, isEstimated: false }));
    } else {
      const raw = await db
        .select({
          employeeCode:   employeesTable.employeeCode,
          nameEn:         sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:         sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:  orgNodesTable.nameEn,
          annualGross:    sql<number>`round((${employeesTable.basicSalary}::numeric + coalesce(${employeesTable.housingAllowance}::numeric,0) + coalesce(${employeesTable.transportAllowance}::numeric,0)) * 12, 3)`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .orderBy(desc(employeesTable.basicSalary));
      rows = raw.map(r => ({ ...r, orgNodeNameEn: r.orgNodeNameEn ?? "", annualGross: Number(r.annualGross), totalTax: 0, extraExemption: Number(r.extraExemption ?? 0), effectiveTaxRate: 0, isEstimated: true }));
    }

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const buffer = await generateExcelBuffer({
        sheetName: "Income Tax",
        reportTitle: `Income Tax Summary — ${year}`,
        reportTitleAr: `ملخص ضريبة الدخل — ${year}`,
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { Year: String(year), Source: check ? "Actual payroll data" : "Estimated from current salaries", ...(orgNodeId ? { "Org Unit": orgNodeId } : {}) },
        columns: [
          { key: "employeeCode",     header: "Code",                   headerAr: "الكود",                 width: 14 },
          { key: "nameEn",           header: "Name (EN)",              headerAr: "الاسم",                 width: 28 },
          { key: "nameAr",           header: "الاسم بالعربية",         headerAr: "Name (AR)",             width: 28, isArabic: true },
          { key: "orgNodeNameEn",    header: "Org Unit",               headerAr: "الوحدة",                width: 22 },
          { key: "annualGross",      header: "Annual Gross (JOD)",     headerAr: "الإجمالي السنوي",      width: 22, isCurrency: true },
          { key: "extraExemption",   header: "Extra Exemption (JOD)",  headerAr: "إعفاء إضافي",          width: 22, isCurrency: true },
          { key: "totalTax",         header: "Income Tax Paid (JOD)", headerAr: "ضريبة الدخل المدفوعة", width: 22, isCurrency: true },
          { key: "effectiveTaxRate", header: "Effective Rate %",       headerAr: "معدل الضريبة %",        width: 20, isNumeric: true },
        ],
        data: rows as Record<string, unknown>[],
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-income-tax-${year}.xlsx"`);
      res.send(buffer);
      return;
    }

    res.json({ success: true, data: { records: rows, year, isEstimated: !check } });
  } catch (e) {
    console.error("[/api/reports/income-tax]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── 9. GET /api/reports/compliance-status ────────────────────────────────────
app.get("/api/reports/compliance-status", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, nationality, documentType: _dt, status: filterStatus, format } = req.query as Record<string, string>;
    const today    = new Date().toISOString().slice(0, 10);
    const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const whereConditions: Parameters<typeof and>[0][] = [
      eq(employeesTable.companyId, user.companyId),
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, "active"),
    ];
    if (orgNodeId)   whereConditions.push(eq(employeesTable.orgNodeId, parseInt(orgNodeId)));
    if (nationality) whereConditions.push(eq(employeesTable.nationality, nationality));

    const emps = await db
      .select({
        id:               employeesTable.id,
        employeeCode:     employeesTable.employeeCode,
        nameEn:           sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:           sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        orgNodeNameEn:    orgNodesTable.nameEn,
        nationality:      employeesTable.nationality,
        sscNumber:        employeesTable.sscNumber,
        workPermitExpiry: employeesTable.workPermitExpiry,
        isSSCExempt:      employeesTable.isSSCExempt,
      })
      .from(employeesTable)
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(...whereConditions))
      .orderBy(asc(employeesTable.firstNameEn));

    const enriched = emps.map(emp => {
      const isJordanian = emp.nationality === "أردني" || emp.nationality === "Jordanian";
      const sscStatus = emp.isSSCExempt ? "exempt" : (emp.sscNumber ? "enrolled" : "missing");
      let workPermitStatus = "n/a";
      if (!isJordanian) {
        if (!emp.workPermitExpiry) workPermitStatus = "missing";
        else if (emp.workPermitExpiry <= today)    workPermitStatus = "expired";
        else if (emp.workPermitExpiry <= soonDate) workPermitStatus = "expiring";
        else                                       workPermitStatus = "valid";
      }
      let trafficLight = "green";
      if (sscStatus === "missing" || workPermitStatus === "expired" || workPermitStatus === "missing") trafficLight = "red";
      else if (workPermitStatus === "expiring") trafficLight = "amber";
      return { ...emp, orgNodeNameEn: emp.orgNodeNameEn ?? "", sscStatus, workPermitStatus, workPermitExpiry: emp.workPermitExpiry ?? "", trafficLight };
    }).filter(e => !filterStatus || e.trafficLight === filterStatus);

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const buffer = await generateExcelBuffer({
        sheetName: "Compliance Status",
        reportTitle: "Employee Compliance Status Report",
        reportTitleAr: "تقرير حالة الامتثال الوظيفي",
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { "As Of": today, ...(orgNodeId ? { "Org Unit": orgNodeId } : {}), ...(nationality ? { Nationality: nationality } : {}) },
        columns: [
          { key: "employeeCode",     header: "Code",          headerAr: "الكود",          width: 14 },
          { key: "nameEn",           header: "Name (EN)",     headerAr: "الاسم",           width: 28 },
          { key: "nameAr",           header: "الاسم بالعربية", headerAr: "Name (AR)",      width: 28, isArabic: true },
          { key: "orgNodeNameEn",    header: "Org Unit",      headerAr: "الوحدة",          width: 22 },
          { key: "nationality",      header: "Nationality",   headerAr: "الجنسية",         width: 16 },
          { key: "sscStatus",        header: "SSC Status",    headerAr: "حالة الضمان",    width: 16 },
          { key: "workPermitStatus", header: "Work Permit",   headerAr: "تصريح العمل",    width: 16 },
          { key: "workPermitExpiry", header: "Permit Expiry", headerAr: "انتهاء التصريح", width: 16, isDate: true },
          { key: "trafficLight",     header: "Status",        headerAr: "التقييم",         width: 12 },
        ],
        data: enriched as Record<string, unknown>[],
        rowColorFn: (record) => {
          if (record["trafficLight"] === "red")   return "FFFCE4E4";
          if (record["trafficLight"] === "amber") return "FFFFF8E0";
          if (record["trafficLight"] === "green") return "FFE8F5EE";
          return undefined;
        },
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="zenjo-compliance-status.xlsx"');
      res.send(buffer);
      return;
    }

    const summary = {
      total:              enriched.length,
      red:                enriched.filter(e => e.trafficLight === "red").length,
      amber:              enriched.filter(e => e.trafficLight === "amber").length,
      green:              enriched.filter(e => e.trafficLight === "green").length,
      sscMissing:         enriched.filter(e => e.sscStatus === "missing").length,
      workPermitExpired:  enriched.filter(e => e.workPermitStatus === "expired").length,
      workPermitExpiring: enriched.filter(e => e.workPermitStatus === "expiring").length,
    };
    res.json({ success: true, data: { records: enriched, summary, asOf: today } });
  } catch (e) {
    console.error("[/api/reports/compliance-status]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── 10. GET /api/reports/salary-components ────────────────────────────────────
app.get("/api/reports/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { orgNodeId, format } = req.query as Record<string, string>;
    const year  = rptSafeInt(req.query["year"],  new Date().getFullYear());
    const month = rptSafeInt(req.query["month"], new Date().getMonth() + 1);
    const [run] = await db.select({ id: payrollRunsTable.id, status: payrollRunsTable.status })
      .from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.runYear, year), eq(payrollRunsTable.runMonth, month), eq(payrollRunsTable.isDeleted, false)))
      .limit(1);

    type CompRow = { employeeCode: string | null; nameEn: string; nameAr: string; orgNodeNameEn: string; basicSalary: number; housingAllowance: number; transportAllowance: number; mobileAllowance: number; mealAllowance: number; otherAllowances: number; overtimeEarnings: number; grossSalary: number; sscDeduction: number; incomeTaxDeduction: number; loanDeductions: number; otherDeductions: number; totalDeductions: number; netSalary: number; source: string };
    let rows: CompRow[];

    if (run) {
      const raw = await db
        .select({
          employeeCode:        employeesTable.employeeCode,
          nameEn:              sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:              sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:       orgNodesTable.nameEn,
          basicSalary:         payslipsTable.basicSalary,
          housingAllowance:    payslipsTable.housingAllowance,
          transportAllowance:  payslipsTable.transportAllowance,
          mobileAllowance:     payslipsTable.mobileAllowance,
          mealAllowance:       payslipsTable.mealAllowance,
          otherAllowances:     payslipsTable.otherAllowances,
          overtimeEarnings:    payslipsTable.overtimeEarnings,
          grossSalary:         payslipsTable.grossSalary,
          sscDeduction:        payslipsTable.sscDeduction,
          incomeTaxDeduction:  payslipsTable.incomeTaxDeduction,
          loanDeductions:      payslipsTable.loanDeductions,
          otherDeductions:     payslipsTable.otherDeductions,
          totalDeductions:     payslipsTable.totalDeductions,
          netSalary:           payslipsTable.netSalary,
        })
        .from(payslipsTable)
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(payslipsTable.payrollRunId, run.id), eq(employeesTable.companyId, user.companyId), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .orderBy(asc(employeesTable.firstNameEn));
      rows = raw.map(r => ({ ...r, orgNodeNameEn: r.orgNodeNameEn ?? "", source: "payroll_run", basicSalary: Number(r.basicSalary), housingAllowance: Number(r.housingAllowance), transportAllowance: Number(r.transportAllowance), mobileAllowance: Number(r.mobileAllowance), mealAllowance: Number(r.mealAllowance), otherAllowances: Number(r.otherAllowances), overtimeEarnings: Number(r.overtimeEarnings), grossSalary: Number(r.grossSalary), sscDeduction: Number(r.sscDeduction), incomeTaxDeduction: Number(r.incomeTaxDeduction), loanDeductions: Number(r.loanDeductions), otherDeductions: Number(r.otherDeductions), totalDeductions: Number(r.totalDeductions), netSalary: Number(r.netSalary) }));
    } else {
      const raw = await db
        .select({
          employeeCode:       employeesTable.employeeCode,
          nameEn:             sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:             sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:      orgNodesTable.nameEn,
          basicSalary:        employeesTable.basicSalary,
          housingAllowance:   employeesTable.housingAllowance,
          transportAllowance: employeesTable.transportAllowance,
          mobileAllowance:    sql<number>`0::numeric`,
          mealAllowance:      sql<number>`0::numeric`,
          otherAllowances:    sql<number>`0::numeric`,
          overtimeEarnings:   sql<number>`0::numeric`,
          grossSalary:        sql<number>`(${employeesTable.basicSalary}::numeric + coalesce(${employeesTable.housingAllowance}::numeric,0) + coalesce(${employeesTable.transportAllowance}::numeric,0))`,
          sscDeduction:       sql<number>`round(least(${employeesTable.basicSalary}::numeric, 3000) * 0.075, 3)`,
          incomeTaxDeduction: sql<number>`0::numeric`,
          loanDeductions:     sql<number>`0::numeric`,
          otherDeductions:    sql<number>`0::numeric`,
          totalDeductions:    sql<number>`round(least(${employeesTable.basicSalary}::numeric, 3000) * 0.075, 3)`,
          netSalary:          sql<number>`(${employeesTable.basicSalary}::numeric + coalesce(${employeesTable.housingAllowance}::numeric,0) + coalesce(${employeesTable.transportAllowance}::numeric,0)) - round(least(${employeesTable.basicSalary}::numeric, 3000) * 0.075, 3)`,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), ...(orgNodeId ? [eq(employeesTable.orgNodeId, parseInt(orgNodeId))] : [])))
        .orderBy(asc(employeesTable.firstNameEn));
      rows = raw.map(r => ({ ...r, orgNodeNameEn: r.orgNodeNameEn ?? "", source: "estimated", basicSalary: Number(r.basicSalary), housingAllowance: Number(r.housingAllowance ?? 0), transportAllowance: Number(r.transportAllowance ?? 0), mobileAllowance: 0, mealAllowance: 0, otherAllowances: 0, overtimeEarnings: 0, grossSalary: Number(r.grossSalary), sscDeduction: Number(r.sscDeduction), incomeTaxDeduction: 0, loanDeductions: 0, otherDeductions: 0, totalDeductions: Number(r.totalDeductions), netSalary: Number(r.netSalary) }));
    }

    if (format === "excel") {
      const co = await rptGetCompany(user.companyId);
      const monthLabel = new Date(year, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
      const buffer = await generateExcelBuffer({
        sheetName: "Salary Components",
        reportTitle: `Salary Components — ${monthLabel}`,
        reportTitleAr: `مكونات الرواتب — ${monthLabel}`,
        companyName: co?.nameEn ?? "ZenJO HRMS",
        companyNameAr: co?.nameAr ?? "",
        filters: { Period: monthLabel, Source: run ? `Payroll Run #${run.id} (${run.status})` : "Estimated from current salaries", ...(orgNodeId ? { "Org Unit": orgNodeId } : {}) },
        columns: [
          { key: "employeeCode",       header: "Code",               headerAr: "الكود",              width: 14 },
          { key: "nameEn",             header: "Name (EN)",          headerAr: "الاسم",               width: 26 },
          { key: "nameAr",             header: "الاسم بالعربية",     headerAr: "Name (AR)",           width: 26, isArabic: true },
          { key: "orgNodeNameEn",      header: "Org Unit",           headerAr: "الوحدة",              width: 20 },
          { key: "basicSalary",        header: "Basic (JOD)",        headerAr: "الأساسي",            width: 16, isCurrency: true },
          { key: "housingAllowance",   header: "Housing (JOD)",      headerAr: "سكن",                width: 16, isCurrency: true },
          { key: "transportAllowance", header: "Transport (JOD)",    headerAr: "مواصلات",            width: 16, isCurrency: true },
          { key: "mobileAllowance",    header: "Mobile (JOD)",       headerAr: "هاتف",               width: 14, isCurrency: true },
          { key: "mealAllowance",      header: "Meals (JOD)",        headerAr: "وجبات",              width: 14, isCurrency: true },
          { key: "otherAllowances",    header: "Other Allow. (JOD)", headerAr: "بدلات أخرى",        width: 18, isCurrency: true },
          { key: "overtimeEarnings",   header: "Overtime (JOD)",     headerAr: "إضافي",              width: 16, isCurrency: true },
          { key: "grossSalary",        header: "Gross (JOD)",        headerAr: "الإجمالي",           width: 16, isCurrency: true },
          { key: "sscDeduction",       header: "SSC (JOD)",          headerAr: "ضمان اجتماعي",      width: 16, isCurrency: true },
          { key: "incomeTaxDeduction", header: "Tax (JOD)",          headerAr: "ضريبة الدخل",       width: 16, isCurrency: true },
          { key: "loanDeductions",     header: "Loans (JOD)",        headerAr: "قروض",               width: 16, isCurrency: true },
          { key: "otherDeductions",    header: "Other Deduct. (JOD)", headerAr: "استقطاعات أخرى",  width: 18, isCurrency: true },
          { key: "netSalary",          header: "Net (JOD)",          headerAr: "الصافي",             width: 16, isCurrency: true },
        ],
        data: rows as Record<string, unknown>[],
      });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="zenjo-salary-components-${year}-${month}.xlsx"`);
      res.send(buffer);
      return;
    }

    res.json({ success: true, data: { records: rows, period: { year, month }, source: run ? "payroll_run" : "estimated" } });
  } catch (e) {
    console.error("[/api/reports/salary-components]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Excel Export ──────────────────────────────────────────────────────────────

interface ReportResult {
  columns: ExportColumn[];
  data: Record<string, unknown>[];
  titleEn: string;
  titleAr: string;
  filters: Record<string, string>;
}

async function buildReportData(
  reportType: string,
  user: AuthReq["user"],
  query: Record<string, string>,
): Promise<ReportResult> {
  const year  = rptSafeInt(query["year"],  new Date().getFullYear());
  const month = rptSafeInt(query["month"], new Date().getMonth() + 1);
  const from  = rptSafeDate(query["from"], `${year}-01-01`);
  const to    = rptSafeDate(query["to"],   new Date().toISOString().slice(0, 10));
  const monthLabel = new Date(year, month - 1).toLocaleString("en-GB", { month: "long", year: "numeric" });

  // ── Headcount ──────────────────────────────────────────────────────────────
  if (reportType === "headcount") {
    const data = await db
      .select({ status: employeesTable.employmentStatus, count: sql<number>`count(*)::int` })
      .from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)))
      .groupBy(employeesTable.employmentStatus);
    return {
      titleEn: "Headcount Report",
      titleAr: "تقرير الكوادر البشرية",
      filters: {},
      columns: [
        { key: "status", header: "Employment Status", headerAr: "حالة التوظيف", width: 24 },
        { key: "count",  header: "Count",             headerAr: "العدد",         width: 14, isNumeric: true },
      ],
      data: data as Record<string, unknown>[],
    };
  }

  // ── Leave Summary ──────────────────────────────────────────────────────────
  if (reportType === "leave") {
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth   = new Date(year, month, 0).toISOString().slice(0, 10);
    const empIds = (await db
      .select({ id: employeesTable.id })
      .from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)))
    ).map(e => e.id);
    const data = empIds.length === 0 ? [] : await db
      .select({
        typeEn:    sql<string>`coalesce(${leaveRequestsTable.leaveType}, 'unknown')`,
        status:    leaveRequestsTable.status,
        count:     sql<number>`count(*)::int`,
        totalDays: sql<number>`coalesce(sum(${leaveRequestsTable.totalDays}), 0)::numeric(10,2)`,
      })
      .from(leaveRequestsTable)
      .where(and(
        inArray(leaveRequestsTable.employeeId, empIds),
        eq(leaveRequestsTable.isDeleted, false),
        gte(leaveRequestsTable.startDate, startOfMonth),
        lte(leaveRequestsTable.startDate, endOfMonth),
      ))
      .groupBy(leaveRequestsTable.leaveType, leaveRequestsTable.status)
      .orderBy(desc(sql`count(*)`));
    return {
      titleEn: "Leave Summary Report",
      titleAr: "تقرير ملخص الإجازات",
      filters: { Month: monthLabel },
      columns: [
        { key: "typeEn",    header: "Leave Type",  headerAr: "نوع الإجازة",    width: 24 },
        { key: "status",    header: "Status",      headerAr: "الحالة",         width: 16 },
        { key: "count",     header: "Requests",    headerAr: "عدد الطلبات",    width: 14, isNumeric: true },
        { key: "totalDays", header: "Total Days",  headerAr: "إجمالي الأيام", width: 14, isNumeric: true },
      ],
      data: data.map(r => ({ ...r, totalDays: Number(r.totalDays) })) as Record<string, unknown>[],
    };
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  if (reportType === "attendance") {
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const endOfMonth   = new Date(year, month, 0).toISOString().slice(0, 10);
    const data = await db
      .select({
        nameEn:           sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:           sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        orgNodeNameEn:    orgNodesTable.nameEn,
        presentDays:      sql<number>`count(case when ${attendanceRecordsTable.status} = 'present' then 1 end)::int`,
        absentDays:       sql<number>`count(case when ${attendanceRecordsTable.status} = 'absent'  then 1 end)::int`,
        totalLateMinutes: sql<number>`coalesce(sum(${attendanceRecordsTable.lateMinutes}), 0)::int`,
      })
      .from(employeesTable)
      .leftJoin(attendanceRecordsTable, and(
        eq(attendanceRecordsTable.employeeId, employeesTable.id),
        gte(attendanceRecordsTable.date, startOfMonth),
        lte(attendanceRecordsTable.date, endOfMonth),
      ))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(
        eq(employeesTable.companyId, user.companyId),
        eq(employeesTable.isDeleted, false),
        eq(employeesTable.employmentStatus, "active"),
      ))
      .groupBy(
        employeesTable.id,
        employeesTable.firstNameAr, employeesTable.lastNameAr,
        employeesTable.firstNameEn, employeesTable.lastNameEn,
        orgNodesTable.nameAr, orgNodesTable.nameEn,
      )
      .orderBy(asc(employeesTable.firstNameEn));
    return {
      titleEn: "Attendance Summary Report",
      titleAr: "تقرير ملخص الحضور",
      filters: { Month: monthLabel },
      columns: [
        { key: "nameEn",           header: "Name (EN)",     headerAr: "الاسم بالإنجليزية",  width: 28 },
        { key: "nameAr",           header: "الاسم بالعربية", headerAr: "Name (AR)",           width: 28, isArabic: true },
        { key: "orgNodeNameEn",    header: "Org Unit",      headerAr: "الوحدة التنظيمية",    width: 22 },
        { key: "presentDays",      header: "Present Days",  headerAr: "أيام الحضور",         width: 15, isNumeric: true },
        { key: "absentDays",       header: "Absent Days",   headerAr: "أيام الغياب",         width: 15, isNumeric: true },
        { key: "totalLateMinutes", header: "Late Minutes",  headerAr: "دقائق التأخير",       width: 15, isNumeric: true },
      ],
      data: data.map(r => ({ ...r, orgNodeNameEn: r.orgNodeNameEn ?? "" })) as Record<string, unknown>[],
    };
  }

  // ── Overtime ───────────────────────────────────────────────────────────────
  if (reportType === "overtime") {
    const data = await db
      .select({
        nameEn:        sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:        sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        orgNodeNameEn: orgNodesTable.nameEn,
        totalHours:    sql<number>`coalesce(sum(${overtimeRequestsTable.hours}), 0)::numeric(10,2)`,
        approvedHours: sql<number>`coalesce(sum(case when ${overtimeRequestsTable.status} = 'approved' then ${overtimeRequestsTable.hours} end), 0)::numeric(10,2)`,
        totalCost:     sql<number>`coalesce(sum(case when ${overtimeRequestsTable.status} = 'approved' then ${overtimeRequestsTable.hours}::numeric * (${employeesTable.basicSalary}::numeric / 176) * 1.5 end), 0)::numeric(12,3)`,
      })
      .from(employeesTable)
      .leftJoin(overtimeRequestsTable, and(
        eq(overtimeRequestsTable.employeeId, employeesTable.id),
        gte(overtimeRequestsTable.date, from),
        lte(overtimeRequestsTable.date, to),
        eq(overtimeRequestsTable.isDeleted, false),
      ))
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(
        eq(employeesTable.companyId, user.companyId),
        eq(employeesTable.isDeleted, false),
        eq(employeesTable.employmentStatus, "active"),
      ))
      .groupBy(
        employeesTable.id,
        employeesTable.firstNameAr, employeesTable.lastNameAr,
        employeesTable.firstNameEn, employeesTable.lastNameEn,
        employeesTable.basicSalary,
        orgNodesTable.nameAr, orgNodesTable.nameEn,
      );
    return {
      titleEn: "Overtime Summary Report",
      titleAr: "تقرير ملخص العمل الإضافي",
      filters: { From: from, To: to },
      columns: [
        { key: "nameEn",        header: "Name (EN)",        headerAr: "الاسم بالإنجليزية",  width: 28 },
        { key: "nameAr",        header: "الاسم بالعربية",   headerAr: "Name (AR)",           width: 28, isArabic: true },
        { key: "orgNodeNameEn", header: "Org Unit",         headerAr: "الوحدة التنظيمية",    width: 22 },
        { key: "totalHours",    header: "Total Hours",      headerAr: "إجمالي الساعات",      width: 15, isNumeric: true },
        { key: "approvedHours", header: "Approved Hours",   headerAr: "ساعات معتمدة",        width: 16, isNumeric: true },
        { key: "totalCost",     header: "OT Cost (JOD)",    headerAr: "تكلفة إضافي (دينار)", width: 18, isCurrency: true },
      ],
      data: data.map(r => ({
        ...r,
        orgNodeNameEn: r.orgNodeNameEn ?? "",
        totalHours:    Number(r.totalHours),
        approvedHours: Number(r.approvedHours),
        totalCost:     Number(r.totalCost),
      })) as Record<string, unknown>[],
    };
  }

  // ── Disciplinary ───────────────────────────────────────────────────────────
  if (reportType === "disciplinary") {
    const disciplinaryTypes = ["warning_issued", "suspension", "suspension_lift", "termination"];
    const typeArMap: Record<string, string> = {
      warning_issued:  "إنذار",
      suspension:      "إيقاف",
      suspension_lift: "رفع الإيقاف",
      termination:     "إنهاء خدمة",
    };
    const rows = await db
      .select({
        typeEn: employeeActionsTable.actionType,
        status: employeeActionsTable.status,
        count:  sql<number>`count(*)::int`,
      })
      .from(employeeActionsTable)
      .where(and(
        eq(employeeActionsTable.companyId, user.companyId),
        inArray(employeeActionsTable.actionType, disciplinaryTypes),
        gte(employeeActionsTable.effectiveDate, from),
        lte(employeeActionsTable.effectiveDate, to),
      ))
      .groupBy(employeeActionsTable.actionType, employeeActionsTable.status);
    return {
      titleEn: "Disciplinary Summary Report",
      titleAr: "تقرير ملخص الإجراءات التأديبية",
      filters: { From: from, To: to },
      columns: [
        { key: "typeEn", header: "Violation Type (EN)", headerAr: "نوع المخالفة",    width: 24 },
        { key: "typeAr", header: "نوع المخالفة",         headerAr: "Violation (AR)", width: 24, isArabic: true },
        { key: "status", header: "Status",              headerAr: "الحالة",          width: 16 },
        { key: "count",  header: "Count",               headerAr: "العدد",           width: 12, isNumeric: true },
      ],
      data: rows.map(r => ({
        typeEn: r.typeEn,
        typeAr: typeArMap[r.typeEn] ?? r.typeEn,
        status: r.status,
        count:  r.count,
      })) as Record<string, unknown>[],
    };
  }

  // ── Payroll Summary ────────────────────────────────────────────────────────
  if (reportType === "payroll") {
    const conditions: Parameters<typeof and>[0][] = [
      eq(payrollRunsTable.companyId, user.companyId),
      eq(payrollRunsTable.isDeleted, false),
      eq(payrollRunsTable.runYear, year),
    ];
    if (month > 0) conditions.push(eq(payrollRunsTable.runMonth, month));
    const rows = await db.select().from(payrollRunsTable).where(and(...conditions)).orderBy(desc(payrollRunsTable.runMonth));
    return {
      titleEn: "Payroll Summary Report",
      titleAr: "تقرير ملخص الرواتب",
      filters: { Year: String(year), ...(month > 0 ? { Month: monthLabel } : {}) },
      columns: [
        { key: "runYear",          header: "Year",             headerAr: "السنة",              width: 10, isNumeric: true },
        { key: "runMonth",         header: "Month",            headerAr: "الشهر",              width: 10, isNumeric: true },
        { key: "employeeCount",    header: "Employees",        headerAr: "عدد الموظفين",       width: 14, isNumeric: true },
        { key: "totalGross",       header: "Gross (JOD)",      headerAr: "الإجمالي (دينار)",   width: 18, isCurrency: true },
        { key: "totalNet",         header: "Net (JOD)",        headerAr: "الصافي (دينار)",     width: 18, isCurrency: true },
        { key: "totalDeductions",  header: "Deductions (JOD)", headerAr: "الاستقطاعات",        width: 18, isCurrency: true },
        { key: "totalSscEmployee", header: "SSC Employee",     headerAr: "تأمين الموظف",       width: 18, isCurrency: true },
        { key: "totalSscEmployer", header: "SSC Employer",     headerAr: "تأمين صاحب العمل",  width: 18, isCurrency: true },
        { key: "totalIncomeTax",   header: "Income Tax",       headerAr: "ضريبة الدخل",        width: 18, isCurrency: true },
        { key: "status",           header: "Status",           headerAr: "الحالة",             width: 14 },
      ],
      data: rows.map(r => ({
        ...r,
        totalGross:       Number(r.totalGross),
        totalNet:         Number(r.totalNet),
        totalDeductions:  Number(r.totalDeductions),
        totalSscEmployee: Number(r.totalSscEmployee),
        totalSscEmployer: Number(r.totalSscEmployer),
        totalIncomeTax:   Number(r.totalIncomeTax),
      })) as Record<string, unknown>[],
    };
  }

  // ── SSC Contributions ──────────────────────────────────────────────────────
  if (reportType === "ssc") {
    const sscCols: ExportColumn[] = [
      { key: "nameEn",                  header: "Name (EN)",              headerAr: "الاسم بالإنجليزية",   width: 28 },
      { key: "nameAr",                  header: "الاسم بالعربية",         headerAr: "Name (AR)",            width: 28, isArabic: true },
      { key: "sscNumber",               header: "SSC Number",             headerAr: "رقم التأمين",         width: 18 },
      { key: "orgNodeNameEn",           header: "Org Unit",               headerAr: "الوحدة التنظيمية",    width: 22 },
      { key: "basicSalary",             header: "Basic Salary (JOD)",     headerAr: "الراتب الأساسي",      width: 20, isCurrency: true },
      { key: "sscDeduction",            header: "Employee SSC (7.5%)",    headerAr: "تأمين الموظف",        width: 20, isCurrency: true },
      { key: "sscEmployerContribution", header: "Employer SSC (14.25%)",  headerAr: "تأمين صاحب العمل",   width: 22, isCurrency: true },
    ];
    const runs = await db
      .select({ id: payrollRunsTable.id })
      .from(payrollRunsTable)
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.runMonth, month),
        eq(payrollRunsTable.runYear, year),
        eq(payrollRunsTable.isDeleted, false),
      ))
      .limit(1);
    if (runs.length > 0) {
      const rows = await db
        .select({
          nameEn:                  sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:                  sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          sscNumber:               employeesTable.sscNumber,
          orgNodeNameEn:           orgNodesTable.nameEn,
          basicSalary:             payslipsTable.basicSalary,
          sscDeduction:            payslipsTable.sscDeduction,
          sscEmployerContribution: payslipsTable.sscEmployerContribution,
        })
        .from(payslipsTable)
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(eq(payslipsTable.payrollRunId, runs[0]!.id), eq(employeesTable.companyId, user.companyId)))
        .orderBy(asc(employeesTable.firstNameEn));
      return {
        titleEn: "SSC Contributions Report",
        titleAr: "تقرير اشتراكات الضمان الاجتماعي",
        filters: { Month: monthLabel },
        columns: sscCols,
        data: rows.map(r => ({
          ...r,
          sscNumber:               r.sscNumber ?? "",
          orgNodeNameEn:           r.orgNodeNameEn ?? "",
          basicSalary:             Number(r.basicSalary),
          sscDeduction:            Number(r.sscDeduction),
          sscEmployerContribution: Number(r.sscEmployerContribution),
        })) as Record<string, unknown>[],
      };
    } else {
      const rows = await db
        .select({
          nameEn:                  sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:                  sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          sscNumber:               employeesTable.sscNumber,
          orgNodeNameEn:           orgNodesTable.nameEn,
          basicSalary:             employeesTable.basicSalary,
          sscDeduction:            sql<number>`round(${employeesTable.basicSalary}::numeric * 0.075, 3)`,
          sscEmployerContribution: sql<number>`round(${employeesTable.basicSalary}::numeric * 0.1425, 3)`,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(
          eq(employeesTable.companyId, user.companyId),
          eq(employeesTable.isDeleted, false),
          eq(employeesTable.employmentStatus, "active"),
          eq(employeesTable.isSSCExempt, false),
        ))
        .orderBy(asc(employeesTable.firstNameEn));
      return {
        titleEn: "SSC Contributions Report (Estimated)",
        titleAr: "تقرير اشتراكات الضمان (تقديري)",
        filters: { Month: monthLabel, Note: "No payroll run found — estimates used" },
        columns: sscCols,
        data: rows.map(r => ({
          ...r,
          sscNumber:               r.sscNumber ?? "",
          orgNodeNameEn:           r.orgNodeNameEn ?? "",
          basicSalary:             Number(r.basicSalary),
          sscDeduction:            Number(r.sscDeduction),
          sscEmployerContribution: Number(r.sscEmployerContribution),
        })) as Record<string, unknown>[],
      };
    }
  }

  // ── Income Tax ─────────────────────────────────────────────────────────────
  if (reportType === "income-tax") {
    const taxCols: ExportColumn[] = [
      { key: "nameEn",         header: "Name (EN)",              headerAr: "الاسم بالإنجليزية",   width: 28 },
      { key: "nameAr",         header: "الاسم بالعربية",         headerAr: "Name (AR)",            width: 28, isArabic: true },
      { key: "orgNodeNameEn",  header: "Org Unit",               headerAr: "الوحدة التنظيمية",    width: 22 },
      { key: "annualGross",    header: "Annual Gross (JOD)",     headerAr: "الإجمالي السنوي",     width: 22, isCurrency: true },
      { key: "totalTax",       header: "Income Tax (JOD)",       headerAr: "ضريبة الدخل",         width: 20, isCurrency: true },
      { key: "extraExemption", header: "Extra Exemption (JOD)",  headerAr: "الإعفاء الإضافي",     width: 22, isCurrency: true },
    ];
    const checkPayslips = await db
      .select({ id: payslipsTable.id })
      .from(payslipsTable)
      .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.runYear, year),
        eq(payrollRunsTable.isDeleted, false),
      ))
      .limit(1);
    if (checkPayslips.length > 0) {
      const rows = await db
        .select({
          nameEn:         sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:         sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:  orgNodesTable.nameEn,
          annualGross:    sql<number>`coalesce(sum(${payslipsTable.grossSalary}), 0)::numeric(14,3)`,
          totalTax:       sql<number>`coalesce(sum(${payslipsTable.incomeTaxDeduction}), 0)::numeric(14,3)`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(payslipsTable)
        .innerJoin(payrollRunsTable, eq(payslipsTable.payrollRunId, payrollRunsTable.id))
        .innerJoin(employeesTable, eq(payslipsTable.employeeId, employeesTable.id))
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(
          eq(payrollRunsTable.companyId, user.companyId),
          eq(payrollRunsTable.runYear, year),
          eq(payrollRunsTable.isDeleted, false),
        ))
        .groupBy(
          employeesTable.id,
          employeesTable.firstNameAr, employeesTable.lastNameAr,
          employeesTable.firstNameEn, employeesTable.lastNameEn,
          employeesTable.taxExemptionAmount,
          orgNodesTable.nameAr, orgNodesTable.nameEn,
        )
        .orderBy(desc(sql`coalesce(sum(${payslipsTable.grossSalary}), 0)`));
      return {
        titleEn: "Income Tax Summary Report",
        titleAr: "تقرير ملخص ضريبة الدخل",
        filters: { Year: String(year) },
        columns: taxCols,
        data: rows.map(r => ({
          ...r,
          orgNodeNameEn:  r.orgNodeNameEn ?? "",
          annualGross:    Number(r.annualGross),
          totalTax:       Number(r.totalTax),
          extraExemption: Number(r.extraExemption ?? 0),
        })) as Record<string, unknown>[],
      };
    } else {
      const rows = await db
        .select({
          nameEn:         sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
          nameAr:         sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
          orgNodeNameEn:  orgNodesTable.nameEn,
          annualGross:    sql<number>`round((${employeesTable.basicSalary}::numeric + coalesce(${employeesTable.housingAllowance}::numeric, 0) + coalesce(${employeesTable.transportAllowance}::numeric, 0)) * 12, 3)`,
          extraExemption: employeesTable.taxExemptionAmount,
        })
        .from(employeesTable)
        .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
        .where(and(
          eq(employeesTable.companyId, user.companyId),
          eq(employeesTable.isDeleted, false),
          eq(employeesTable.employmentStatus, "active"),
        ));
      return {
        titleEn: "Income Tax Summary Report (Estimated)",
        titleAr: "تقرير ضريبة الدخل (تقديري)",
        filters: { Year: String(year), Note: "No payroll runs found — estimates used" },
        columns: taxCols,
        data: rows.map(r => ({
          ...r,
          orgNodeNameEn:  r.orgNodeNameEn ?? "",
          annualGross:    Number(r.annualGross),
          totalTax:       0,
          extraExemption: Number(r.extraExemption ?? 0),
        })) as Record<string, unknown>[],
      };
    }
  }

  // ── Turnover ───────────────────────────────────────────────────────────────
  if (reportType === "turnover") {
    const [hireRow]    = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), gte(employeesTable.hireDate, from), lte(employeesTable.hireDate, to)));
    const [exitRow]    = await db.select({ count: sql<number>`count(*)::int` }).from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.companyId, user.companyId), inArray(employeeActionsTable.actionType, ["termination", "resignation"]), gte(employeeActionsTable.effectiveDate, from), lte(employeeActionsTable.effectiveDate, to)));
    const [activeRow]  = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));
    const avg  = activeRow?.count ?? 1;
    const exits = exitRow?.count ?? 0;
    const rate  = avg > 0 ? parseFloat(((exits / avg) * 100).toFixed(2)) : 0;
    return {
      titleEn: "Turnover Report",
      titleAr: "تقرير معدل دوران الموظفين",
      filters: { From: from, To: to },
      columns: [
        { key: "metric", header: "Metric", headerAr: "المؤشر", width: 30 },
        { key: "value",  header: "Value",  headerAr: "القيمة", width: 20 },
      ],
      data: [
        { metric: "Hires",             value: hireRow?.count ?? 0 },
        { metric: "Exits",             value: exits },
        { metric: "Turnover Rate %",   value: rate },
        { metric: "Period From",       value: from },
        { metric: "Period To",         value: to },
        { metric: "Current Headcount", value: avg },
      ],
    };
  }

  // ── Compliance ─────────────────────────────────────────────────────────────
  if (reportType === "compliance") {
    const today    = new Date().toISOString().slice(0, 10);
    const soonDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [totalRow]     = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));
    const [sscRow]       = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), isNotNull(employeesTable.sscNumber)));
    const [nonJordRow]   = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), ne(employeesTable.nationality, "أردني"), ne(employeesTable.nationality, "Jordanian")));
    const [expiredRow]   = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), isNotNull(employeesTable.workPermitExpiry), lte(sql`${employeesTable.workPermitExpiry}::date`, today)));
    const [expiringSoon] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active"), isNotNull(employeesTable.workPermitExpiry), gte(sql`${employeesTable.workPermitExpiry}::date`, today), lte(sql`${employeesTable.workPermitExpiry}::date`, soonDate)));
    const totalActive = totalRow?.count ?? 0;
    const sscEnrolled = sscRow?.count ?? 0;
    return {
      titleEn: "Compliance Summary Report",
      titleAr: "تقرير الامتثال والمخاطر",
      filters: { "As Of": today },
      columns: [
        { key: "metric", header: "Compliance Metric", headerAr: "مؤشر الامتثال", width: 36 },
        { key: "value",  header: "Value",             headerAr: "القيمة",         width: 16 },
      ],
      data: [
        { metric: "Active Employees",              value: totalActive },
        { metric: "SSC Enrolled",                  value: sscEnrolled },
        { metric: "SSC Not Enrolled",              value: totalActive - sscEnrolled },
        { metric: "Non-Jordanian Employees",       value: nonJordRow?.count ?? 0 },
        { metric: "Work Permits Expired",          value: expiredRow?.count ?? 0 },
        { metric: "Work Permits Expiring (30 d)",  value: expiringSoon?.count ?? 0 },
      ],
    };
  }

  // ── Employee Directory ─────────────────────────────────────────────────────
  if (reportType === "employees") {
    const emps = await db
      .select({
        employeeCode:    employeesTable.employeeCode,
        nameEn:          sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        nameAr:          sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        orgNodeNameEn:   orgNodesTable.nameEn,
        gender:          employeesTable.gender,
        nationality:     employeesTable.nationality,
        hireDate:        employeesTable.hireDate,
        employmentStatus: employeesTable.employmentStatus,
        basicSalary:     employeesTable.basicSalary,
        sscNumber:       employeesTable.sscNumber,
        personalPhone:   employeesTable.personalPhone,
      })
      .from(employeesTable)
      .leftJoin(orgNodesTable, eq(employeesTable.orgNodeId, orgNodesTable.id))
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)))
      .orderBy(asc(employeesTable.firstNameEn));
    return {
      titleEn: "Employee Directory",
      titleAr: "دليل الموظفين",
      filters: {},
      columns: [
        { key: "employeeCode",     header: "Emp. Code",        headerAr: "كود الموظف",          width: 14 },
        { key: "nameEn",           header: "Name (EN)",        headerAr: "الاسم بالإنجليزية",  width: 30 },
        { key: "nameAr",           header: "الاسم بالعربية",   headerAr: "Name (AR)",           width: 30, isArabic: true },
        { key: "orgNodeNameEn",    header: "Org Unit",         headerAr: "الوحدة التنظيمية",    width: 24 },
        { key: "gender",           header: "Gender",           headerAr: "الجنس",               width: 12 },
        { key: "nationality",      header: "Nationality",      headerAr: "الجنسية",             width: 16 },
        { key: "hireDate",         header: "Hire Date",        headerAr: "تاريخ التعيين",       width: 14, isDate: true },
        { key: "employmentStatus", header: "Status",           headerAr: "الحالة",              width: 14 },
        { key: "basicSalary",      header: "Basic Salary (JOD)", headerAr: "الراتب الأساسي",   width: 20, isCurrency: true },
        { key: "sscNumber",        header: "SSC Number",       headerAr: "رقم الضمان",         width: 18 },
        { key: "personalPhone",    header: "Phone",            headerAr: "الهاتف",              width: 16 },
      ],
      data: emps.map(r => ({
        ...r,
        orgNodeNameEn: r.orgNodeNameEn ?? "",
        nationality:   r.nationality ?? "",
        sscNumber:     r.sscNumber ?? "",
        personalPhone: r.personalPhone ?? "",
        basicSalary:   Number(r.basicSalary),
      })) as Record<string, unknown>[],
    };
  }

  return { titleEn: "Report", titleAr: "تقرير", filters: {}, columns: [], data: [] };
}

app.get("/api/export/:reportType", auth, async (req, res) => {
  try {
    const user       = (req as AuthReq).user;
    const reportType = req.params["reportType"]!;

    const allowed = ["headcount", "leave", "attendance", "overtime", "disciplinary", "payroll", "ssc", "income-tax", "turnover", "compliance", "employees"];
    if (!allowed.includes(reportType)) {
      res.status(400).json({ success: false, message: "Unknown report type" });
      return;
    }

    const [company] = await db
      .select({ nameEn: companiesTable.nameEn, nameAr: companiesTable.nameAr })
      .from(companiesTable)
      .where(eq(companiesTable.id, user.companyId))
      .limit(1);

    const { columns, data, titleEn, titleAr, filters } = await buildReportData(
      reportType,
      user,
      req.query as Record<string, string>,
    );

    const buffer = await generateExcelBuffer({
      sheetName:      titleEn,
      columns,
      data,
      companyName:    company?.nameEn ?? "ZenJO HRMS",
      companyNameAr:  company?.nameAr ?? "",
      reportTitle:    titleEn,
      reportTitleAr:  titleAr,
      filters,
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="zenjo-${reportType}-report.xlsx"`);
    res.send(buffer);
  } catch (e) {
    console.error("[GET /api/export/:reportType]", e);
    if (!res.headersSent) res.status(500).json({ success: false, message: "Export failed" });
  }
});

// ─── Probation evaluations ────────────────────────────────────────────────────
const probationEvaluationsStore: any[] = [];
let probationEvalIdSeq = 1;

app.get("/api/probation/evaluations", auth, async (req, res) => {
  const { employeeId } = req.query as Record<string, string>;
  const result = probationEvaluationsStore.filter(e => !employeeId || String(e.employeeId) === employeeId);
  res.json({ success: true, data: result });
});

app.post("/api/probation/evaluations", auth, async (req, res) => {
  const record = { id: probationEvalIdSeq++, ...req.body, createdAt: new Date() };
  probationEvaluationsStore.push(record);
  res.status(201).json({ success: true, data: record });
});

// ─── Career paths ─────────────────────────────────────────────────────────────

app.get("/api/career-paths", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const fromJd = jobDescriptionsTable;
    const toJd = jobDescriptionsTable;

    const rows = await db
      .select({
        id: careerPathsTable.id,
        companyId: careerPathsTable.companyId,
        fromJobDescriptionId: careerPathsTable.fromJobDescriptionId,
        toJobDescriptionId: careerPathsTable.toJobDescriptionId,
        minMonthsRequired: careerPathsTable.minMonthsRequired,
        notes: careerPathsTable.notes,
        createdAt: careerPathsTable.createdAt,
      })
      .from(careerPathsTable)
      .where(eq(careerPathsTable.companyId, user.companyId))
      .orderBy(asc(careerPathsTable.id));

    const jdIds = Array.from(new Set(rows.flatMap(r => [r.fromJobDescriptionId, r.toJobDescriptionId])));
    let jdMap: Record<number, { titleAr: string; titleEn: string; grade: string | null }> = {};
    if (jdIds.length > 0) {
      const jds = await db
        .select({ id: jobDescriptionsTable.id, titleAr: jobDescriptionsTable.titleAr, titleEn: jobDescriptionsTable.titleEn, grade: jobDescriptionsTable.grade })
        .from(jobDescriptionsTable)
        .where(inArray(jobDescriptionsTable.id, jdIds));
      jdMap = Object.fromEntries(jds.map(j => [j.id, j]));
    }

    const enriched = rows.map(r => ({
      ...r,
      fromJob: jdMap[r.fromJobDescriptionId] ?? null,
      toJob: jdMap[r.toJobDescriptionId] ?? null,
    }));

    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/career-paths", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { fromJobDescriptionId, toJobDescriptionId, minMonthsRequired, notes } = req.body as {
      fromJobDescriptionId: number; toJobDescriptionId: number; minMonthsRequired?: number; notes?: string;
    };
    if (!fromJobDescriptionId || !toJobDescriptionId) {
      res.status(400).json({ success: false, message: "fromJobDescriptionId and toJobDescriptionId are required" }); return;
    }
    if (fromJobDescriptionId === toJobDescriptionId) {
      res.status(400).json({ success: false, message: "لا يمكن أن يكون المسار من وإلى نفس المسمى / Cannot create a path from and to the same job" }); return;
    }
    const jds = await db
      .select({ id: jobDescriptionsTable.id, companyId: jobDescriptionsTable.companyId })
      .from(jobDescriptionsTable)
      .where(inArray(jobDescriptionsTable.id, [fromJobDescriptionId, toJobDescriptionId]));
    if (jds.length !== 2) {
      res.status(404).json({ success: false, message: "One or both job descriptions not found" }); return;
    }
    if (jds.some(j => j.companyId !== user.companyId)) {
      res.status(403).json({ success: false, message: "Job descriptions must belong to your company" }); return;
    }
    const existing = await db
      .select({ id: careerPathsTable.id })
      .from(careerPathsTable)
      .where(and(eq(careerPathsTable.fromJobDescriptionId, fromJobDescriptionId), eq(careerPathsTable.toJobDescriptionId, toJobDescriptionId)));
    if (existing.length > 0) {
      res.status(409).json({ success: false, message: "هذا المسار موجود مسبقاً / This career path already exists" }); return;
    }
    const [created] = await db.insert(careerPathsTable).values({
      companyId: user.companyId,
      fromJobDescriptionId,
      toJobDescriptionId,
      minMonthsRequired: minMonthsRequired ?? 12,
      notes: notes ?? null,
    }).returning();
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/career-paths/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(careerPathsTable).where(and(eq(careerPathsTable.id, id), eq(careerPathsTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Career path not found" }); return; }
    await db.delete(careerPathsTable).where(eq(careerPathsTable.id, id));
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Roles ────────────────────────────────────────────────────────────────────

// GET /api/roles — all roles for company with their permissions
app.get("/api/roles", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const roles = await db.select().from(rolesTable)
      .where(eq(rolesTable.companyId, user.companyId))
      .orderBy(asc(rolesTable.name));

    const rps = await db
      .select({
        id: rolePermissionsTable.id,
        roleId: rolePermissionsTable.roleId,
        permissionId: rolePermissionsTable.permissionId,
        dataScope: rolePermissionsTable.dataScope,
        screen: permissionsTable.screen,
        action: permissionsTable.action,
      })
      .from(rolePermissionsTable)
      .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
      .where(inArray(rolePermissionsTable.roleId, roles.map(r => r.id)));

    res.json({ success: true, data: { roles, rolePermissions: rps } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/user-roles — users with their roles for assignment screen
app.get("/api/user-roles", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const users = await db.select().from(usersTable)
      .where(and(eq(usersTable.companyId, user.companyId), eq(usersTable.isDeleted, false)))
      .orderBy(asc(usersTable.username));

    const roles = await db.select().from(rolesTable)
      .where(eq(rolesTable.companyId, user.companyId))
      .orderBy(asc(rolesTable.name));

    const userRows = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      employeeId: u.employeeId,
      lastLoginAt: u.lastLoginAt,
    }));

    res.json({ success: true, data: { users: userRows, roles } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Job descriptions ─────────────────────────────────────────────────────────

app.get("/api/job-descriptions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { is_active, q, page, pageSize, sortBy, sortDir } = req.query as Record<string, string>;

    const conditions = [eq(jobDescriptionsTable.companyId, user.companyId)];
    if (is_active === "true") conditions.push(eq(jobDescriptionsTable.isActive, true));
    if (is_active === "false") conditions.push(eq(jobDescriptionsTable.isActive, false));
    if (q?.trim()) {
      conditions.push(
        sql`(${jobDescriptionsTable.titleAr} ilike ${"%" + q.trim() + "%"} OR ${jobDescriptionsTable.titleEn} ilike ${"%" + q.trim() + "%"})`
      );
    }

    const validSortCols: Record<string, unknown> = {
      grade: jobDescriptionsTable.grade,
      title_ar: jobDescriptionsTable.titleAr,
      title_en: jobDescriptionsTable.titleEn,
      created_at: jobDescriptionsTable.createdAt,
    };
    const sortCol = validSortCols[sortBy ?? ""] ?? jobDescriptionsTable.titleAr;
    const orderFn = sortDir === "desc" ? desc : asc;

    const limit = Math.min(parseInt(pageSize ?? "100") || 100, 200);
    const offset = ((parseInt(page ?? "1") || 1) - 1) * limit;

    const rows = await db
      .select()
      .from(jobDescriptionsTable)
      .where(and(...conditions))
      .orderBy(orderFn(sortCol as Parameters<typeof asc>[0]))
      .limit(limit)
      .offset(offset);

    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/job-descriptions/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    const [row] = await db.select().from(jobDescriptionsTable)
      .where(and(eq(jobDescriptionsTable.id, id), eq(jobDescriptionsTable.companyId, user.companyId)));
    if (!row) { res.status(404).json({ success: false, message: "Job description not found" }); return; }
    res.json({ success: true, data: row });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/job-descriptions", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const { titleAr, titleEn, grade, minSalary, maxSalary, orgNodeId, responsibilities, requirements, skills, qualifications, isActive } = req.body as Record<string, unknown>;
    if (!titleAr || !titleEn) {
      res.status(400).json({ success: false, message: "title_ar و title_en مطلوبان / title_ar and title_en are required" }); return;
    }
    const [created] = await db.insert(jobDescriptionsTable).values({
      companyId: user.companyId,
      titleAr: titleAr as string,
      titleEn: titleEn as string,
      grade: (grade as string) || null,
      minSalary: minSalary != null ? String(minSalary) : null,
      maxSalary: maxSalary != null ? String(maxSalary) : null,
      orgNodeId: orgNodeId ? Number(orgNodeId) : null,
      responsibilities: (responsibilities as string) || null,
      requirements: (requirements as string) || null,
      skills: (skills as string) || null,
      qualifications: (qualifications as string) || null,
      isActive: isActive !== false,
    }).returning();
    await logActivity(user.companyId, "job_description_created", `تم إنشاء المسمى الوظيفي: ${titleEn}`, null);
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/job-descriptions/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(jobDescriptionsTable)
      .where(and(eq(jobDescriptionsTable.id, id), eq(jobDescriptionsTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Job description not found" }); return; }

    const { titleAr, titleEn, grade, minSalary, maxSalary, orgNodeId, responsibilities, requirements, skills, qualifications, isActive } = req.body as Record<string, unknown>;
    const updates: Partial<typeof jobDescriptionsTable.$inferInsert> = {};
    if (titleAr !== undefined) updates.titleAr = titleAr as string;
    if (titleEn !== undefined) updates.titleEn = titleEn as string;
    if (grade !== undefined) updates.grade = (grade as string) || null;
    if (minSalary !== undefined) updates.minSalary = minSalary != null ? String(minSalary) : null;
    if (maxSalary !== undefined) updates.maxSalary = maxSalary != null ? String(maxSalary) : null;
    if (orgNodeId !== undefined) updates.orgNodeId = orgNodeId ? Number(orgNodeId) : null;
    if (responsibilities !== undefined) updates.responsibilities = (responsibilities as string) || null;
    if (requirements !== undefined) updates.requirements = (requirements as string) || null;
    if (skills !== undefined) updates.skills = (skills as string) || null;
    if (qualifications !== undefined) updates.qualifications = (qualifications as string) || null;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const [updated] = await db.update(jobDescriptionsTable).set(updates).where(eq(jobDescriptionsTable.id, id)).returning();
    await logActivity(user.companyId, "job_description_updated", `تم تعديل المسمى الوظيفي: ${updated.titleEn}`, null);
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/job-descriptions/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const id = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(jobDescriptionsTable)
      .where(and(eq(jobDescriptionsTable.id, id), eq(jobDescriptionsTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Job description not found" }); return; }

    const [pathRef] = await db.select({ id: careerPathsTable.id }).from(careerPathsTable)
      .where(sql`${careerPathsTable.fromJobDescriptionId} = ${id} OR ${careerPathsTable.toJobDescriptionId} = ${id}`)
      .limit(1);
    if (pathRef) {
      res.status(409).json({ success: false, message: "لا يمكن حذف هذا المسمى لأنه مرتبط بمسار مسيرة وظيفية / Cannot delete — this job description is referenced by a career path" }); return;
    }

    const [empRef] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.jobDescriptionId as any, id), eq(employeesTable.isDeleted, false)))
      .limit(1);
    if (empRef) {
      res.status(409).json({ success: false, message: "لا يمكن حذف هذا المسمى لأنه مرتبط بموظف أو أكثر / Cannot delete — one or more employees are assigned to this job description" }); return;
    }

    await db.delete(jobDescriptionsTable).where(eq(jobDescriptionsTable.id, id));
    await logActivity(user.companyId, "job_description_deleted", `تم حذف المسمى الوظيفي: ${existing.titleEn}`, null);
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Pre-employment ───────────────────────────────────────────────────────────
app.get("/api/pre-employment", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

app.post("/api/pre-employment", auth, async (req, res) => {
  res.status(201).json({ success: true, data: { id: 1, ...req.body } });
});

// ─── Registration ─────────────────────────────────────────────────────────────
app.post("/api/register/company", async (req, res) => {
  try {
    const { companyName, adminUsername, adminEmail, adminPassword } = req.body as { companyName: string; adminUsername: string; adminEmail: string; adminPassword: string };
    const [company] = await db.insert(companiesTable).values({ nameEn: companyName, nameAr: companyName, isActive: true }).returning();
    const [user] = await db.insert(usersTable).values({
      username: adminUsername, email: adminEmail, role: "superadmin",
      passwordHash: hashPassword(adminPassword), companyId: company.id,
    }).returning();
    res.status(201).json({ success: true, data: { companyId: company.id, userId: user.id } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Workflow: Multi-Step Employee Action Workflows ───────────────────────────

// Ensure approvalStepsJson column exists (idempotent)
;(async () => {
  try {
    await db.execute(sql`ALTER TABLE employee_actions ALTER COLUMN status TYPE varchar(30)`);
  } catch {}
  try {
    await db.execute(sql`ALTER TABLE employee_actions ADD COLUMN IF NOT EXISTS approval_steps_json TEXT`);
  } catch {}
})();

const CAREER_ACTION_TYPES = ['transfer', 'promotion', 'demotion'];
const SALARY_ACTION_TYPES = ['salary_change'];
const STATUS_ACTION_TYPES = ['suspension', 'suspension_lift', 'termination', 'resignation', 'contract_renewal'];

function getApprovalChain(actionType: string): string[] {
  if (['salary_change'].includes(actionType)) {
    return ['pending_hr', 'pending_payroll'];
  } else if (['termination', 'promotion', 'demotion'].includes(actionType)) {
    return ['pending_manager', 'pending_hr', 'pending_payroll'];
  } else {
    return ['pending_manager', 'pending_hr'];
  }
}

function canApproveWorkflowStep(role: string, status: string): boolean {
  if (role === 'superadmin') return true;
  if (status === 'pending_manager') return ['manager', 'hradmin'].includes(role);
  if (status === 'pending_hr') return ['hradmin'].includes(role);
  if (status === 'pending_payroll') return ['payrolladmin', 'hradmin'].includes(role);
  return false;
}

const workflowEmpAlias = alias(employeesTable, "wf_target_emp");
const workflowCreatorAlias = alias(employeesTable, "wf_creator_emp");

async function queryWorkflowActions(companyId: number, typeGroup: string[]) {
  const rows = await db.select({
    id: employeeActionsTable.id,
    companyId: employeeActionsTable.companyId,
    employeeId: employeeActionsTable.employeeId,
    actionType: employeeActionsTable.actionType,
    effectiveDate: employeeActionsTable.effectiveDate,
    createdByUserId: employeeActionsTable.createdByUserId,
    previousValueJson: employeeActionsTable.previousValueJson,
    newValueJson: employeeActionsTable.newValueJson,
    notes: employeeActionsTable.notes,
    status: employeeActionsTable.status,
    approvalStepsJson: employeeActionsTable.approvalStepsJson,
    createdAt: employeeActionsTable.createdAt,
    employeeFirstNameEn: workflowEmpAlias.firstNameEn,
    employeeLastNameEn: workflowEmpAlias.lastNameEn,
    employeeFirstNameAr: workflowEmpAlias.firstNameAr,
    employeeLastNameAr: workflowEmpAlias.lastNameAr,
    employeeCode: workflowEmpAlias.employeeCode,
    createdByUsername: usersTable.username,
    createdByFirstName: workflowCreatorAlias.firstNameEn,
    createdByLastName: workflowCreatorAlias.lastNameEn,
  })
  .from(employeeActionsTable)
  .leftJoin(workflowEmpAlias, eq(employeeActionsTable.employeeId, workflowEmpAlias.id))
  .leftJoin(usersTable, eq(employeeActionsTable.createdByUserId, usersTable.id))
  .leftJoin(workflowCreatorAlias, eq(usersTable.employeeId, workflowCreatorAlias.id))
  .where(and(
    eq(employeeActionsTable.companyId, companyId),
    inArray(employeeActionsTable.actionType, typeGroup)
  ))
  .orderBy(desc(employeeActionsTable.createdAt));

  return rows.map(r => ({
    ...r,
    employeeFullNameEn: `${r.employeeFirstNameEn ?? ''} ${r.employeeLastNameEn ?? ''}`.trim(),
    employeeFullNameAr: `${r.employeeFirstNameAr ?? ''} ${r.employeeLastNameAr ?? ''}`.trim(),
    createdByName: r.createdByFirstName && r.createdByLastName
      ? `${r.createdByFirstName} ${r.createdByLastName}`
      : (r.createdByUsername ?? null),
    labelEn: ACTION_TYPE_LABELS[r.actionType]?.en ?? r.actionType,
    labelAr: ACTION_TYPE_LABELS[r.actionType]?.ar ?? r.actionType,
  }));
}

// GET /api/workflow/career-movements
app.get("/api/workflow/career-movements", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!['hradmin', 'superadmin', 'manager', 'payrolladmin'].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const data = await queryWorkflowActions(user.companyId, CAREER_ACTION_TYPES);
    res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /api/workflow/career-movements]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/workflow/salary-changes
app.get("/api/workflow/salary-changes", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!['hradmin', 'superadmin', 'payrolladmin'].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const data = await queryWorkflowActions(user.companyId, SALARY_ACTION_TYPES);
    res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /api/workflow/salary-changes]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/workflow/status-changes
app.get("/api/workflow/status-changes", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!['hradmin', 'superadmin', 'manager', 'payrolladmin'].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    const data = await queryWorkflowActions(user.companyId, STATUS_ACTION_TYPES);
    res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /api/workflow/status-changes]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/workflow/requests/:id
app.get("/api/workflow/requests/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json({ success: true, data: action });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/workflow/requests — create new workflow request
app.post("/api/workflow/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!['hradmin', 'superadmin', 'manager'].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    const { employeeId, actionType, effectiveDate, notes, ...extra } = req.body as {
      employeeId: number; actionType: string; effectiveDate: string;
      notes?: string; [k: string]: any;
    };
    if (!employeeId || !actionType || !effectiveDate) {
      res.status(400).json({ success: false, message: "employeeId, actionType, effectiveDate are required" }); return;
    }

    const allWorkflowTypes = [...CAREER_ACTION_TYPES, ...SALARY_ACTION_TYPES, ...STATUS_ACTION_TYPES];
    if (!allWorkflowTypes.includes(actionType)) {
      res.status(400).json({ success: false, message: "Invalid actionType for workflow" }); return;
    }

    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.companyId, user.companyId))).limit(1);
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    // Build before/after snapshots (same logic as existing employee-actions POST)
    const beforeFields: Record<string, any> = {};
    const afterFields: Record<string, any> = {};

    if (actionType === 'transfer') {
      beforeFields.orgNodeId = emp.orgNodeId;
      beforeFields.departmentId = emp.departmentId;
      afterFields.orgNodeId = extra.orgNodeId ?? emp.orgNodeId;
      afterFields.departmentId = extra.departmentId ?? emp.departmentId;
    } else if (actionType === 'promotion' || actionType === 'demotion') {
      beforeFields.jobTitleId = emp.jobTitleId;
      afterFields.jobTitleId = extra.jobTitleId ?? emp.jobTitleId;
      if (extra.basicSalary != null) {
        beforeFields.basicSalary = emp.basicSalary;
        beforeFields.housingAllowance = emp.housingAllowance;
        beforeFields.transportAllowance = emp.transportAllowance;
        beforeFields.mobileAllowance = emp.mobileAllowance;
        beforeFields.mealAllowance = emp.mealAllowance;
        beforeFields.otherAllowances = emp.otherAllowances;
        afterFields.basicSalary = extra.basicSalary;
        afterFields.housingAllowance = extra.housingAllowance ?? emp.housingAllowance;
        afterFields.transportAllowance = extra.transportAllowance ?? emp.transportAllowance;
        afterFields.mobileAllowance = extra.mobileAllowance ?? emp.mobileAllowance;
        afterFields.mealAllowance = extra.mealAllowance ?? emp.mealAllowance;
        afterFields.otherAllowances = extra.otherAllowances ?? emp.otherAllowances;
      }
    } else if (actionType === 'salary_change') {
      beforeFields.basicSalary = emp.basicSalary;
      beforeFields.housingAllowance = emp.housingAllowance;
      beforeFields.transportAllowance = emp.transportAllowance;
      beforeFields.mobileAllowance = emp.mobileAllowance;
      beforeFields.mealAllowance = emp.mealAllowance;
      beforeFields.otherAllowances = emp.otherAllowances;
      afterFields.basicSalary = extra.basicSalary;
      afterFields.housingAllowance = extra.housingAllowance ?? emp.housingAllowance;
      afterFields.transportAllowance = extra.transportAllowance ?? emp.transportAllowance;
      afterFields.mobileAllowance = extra.mobileAllowance ?? emp.mobileAllowance;
      afterFields.mealAllowance = extra.mealAllowance ?? emp.mealAllowance;
      afterFields.otherAllowances = extra.otherAllowances ?? emp.otherAllowances;
    } else if (actionType === 'suspension') {
      beforeFields.employmentStatus = emp.employmentStatus;
      afterFields.employmentStatus = 'suspended';
    } else if (actionType === 'suspension_lift') {
      beforeFields.employmentStatus = emp.employmentStatus;
      afterFields.employmentStatus = 'active';
    } else if (actionType === 'termination') {
      beforeFields.employmentStatus = emp.employmentStatus;
      afterFields.employmentStatus = 'terminated';
      if (extra.terminationReason) afterFields.terminationReason = extra.terminationReason;
    } else if (actionType === 'resignation') {
      beforeFields.employmentStatus = emp.employmentStatus;
      afterFields.employmentStatus = 'resigned';
    } else if (actionType === 'contract_renewal') {
      beforeFields.contractEndDate = emp.contractEndDate;
      afterFields.contractEndDate = extra.contractEndDate ?? emp.contractEndDate;
    }

    // Determine initial status from approval chain
    const chain = getApprovalChain(actionType);
    const initialStatus = chain[0];

    const approvalStepsData = { chain, steps: [] as any[] };

    const [inserted] = await db.insert(employeeActionsTable).values({
      companyId: user.companyId,
      employeeId,
      actionType,
      effectiveDate,
      createdByUserId: user.userId,
      previousValueJson: Object.keys(beforeFields).length ? JSON.stringify(beforeFields) : null,
      newValueJson: Object.keys(afterFields).length ? JSON.stringify(afterFields) : null,
      notes: notes ?? null,
      status: initialStatus,
      approvalStepsJson: JSON.stringify(approvalStepsData),
    }).returning();

    await logActivity(user.companyId, "employee_action", `${actionType} workflow request created for employee #${employeeId}`, null);
    // ── Notification ───────────────────────────────────────────────────────
    const wfCrLabelEn = ACTION_TYPE_LABELS[actionType]?.en ?? actionType;
    const wfCrLabelAr = ACTION_TYPE_LABELS[actionType]?.ar ?? actionType;
    await notifyRole(user.companyId, "hradmin", {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "workflow_request",
      entityId: inserted.id,
      notificationType: "workflow_request_created",
      titleAr: `طلب سير عمل: ${wfCrLabelAr}`,
      titleEn: `Workflow Request: ${wfCrLabelEn}`,
      messageAr: `طلب "${wfCrLabelAr}" للموظف #${employeeId} يحتاج إلى موافقة.`,
      messageEn: `A "${wfCrLabelEn}" workflow request for employee #${employeeId} requires approval.`,
      priority: "normal",
      actionUrl: "/app/workflow-requests",
    });
    res.status(201).json({ success: true, data: { ...inserted, labelEn: ACTION_TYPE_LABELS[actionType]?.en, labelAr: ACTION_TYPE_LABELS[actionType]?.ar } });
  } catch (e) {
    console.error("[POST /api/workflow/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/workflow/requests/:id/approve — advance to next step or apply side effects
app.post("/api/workflow/requests/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }

    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Not found" }); return; }

    if (!canApproveWorkflowStep(user.role, action.status)) {
      res.status(403).json({ success: false, message: "You are not authorized to approve at this stage" }); return;
    }

    // Parse or initialize approval steps data
    let approvalData: { chain: string[]; steps: any[] };
    if (action.approvalStepsJson) {
      try { approvalData = JSON.parse(action.approvalStepsJson); }
      catch { approvalData = { chain: getApprovalChain(action.actionType), steps: [] }; }
    } else {
      approvalData = { chain: getApprovalChain(action.actionType), steps: [] };
    }

    // Record this approval step
    approvalData.steps.push({
      step: action.status,
      userId: user.userId,
      username: user.username,
      decision: 'approved',
      date: new Date().toISOString(),
      notes: req.body.notes ?? null,
    });

    // Determine next status
    const currentIdx = approvalData.chain.indexOf(action.status);
    const nextStatus = currentIdx >= 0 && currentIdx < approvalData.chain.length - 1
      ? approvalData.chain[currentIdx + 1]
      : null;

    if (nextStatus) {
      // Advance to next step
      await db.update(employeeActionsTable)
        .set({ status: nextStatus, approvalStepsJson: JSON.stringify(approvalData) })
        .where(eq(employeeActionsTable.id, actionId));
      await logActivity(user.companyId, "employee_action", `${action.actionType} advanced to ${nextStatus} for employee #${action.employeeId}`, null);
      // ── Notification: next approver role ──────────────────────────────────
      if (nextStatus === 'pending_hr' || nextStatus === 'pending_hradmin') {
        await notifyRole(user.companyId, "hradmin", {
          companyId: user.companyId,
          actorUserId: user.userId,
          entityType: "workflow_request",
          entityId: action.id,
          notificationType: "workflow_step_advanced",
          titleAr: `طلب سير عمل يحتاج موافقتك`,
          titleEn: `Workflow Request Needs Your Approval`,
          messageAr: `طلب "${ACTION_TYPE_LABELS[action.actionType]?.ar ?? action.actionType}" انتقل إلى مرحلة جديدة.`,
          messageEn: `A "${ACTION_TYPE_LABELS[action.actionType]?.en ?? action.actionType}" request advanced to the next step.`,
          priority: "normal",
          actionUrl: "/app/workflow-requests",
        });
      }
      res.json({ success: true, nextStatus });
    } else {
      // Final approval — apply side effects
      const [emp] = await db.select().from(employeesTable)
        .where(and(eq(employeesTable.id, action.employeeId), eq(employeesTable.companyId, user.companyId))).limit(1);
      if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

      const after = action.newValueJson ? JSON.parse(action.newValueJson) : {};
      const empUpdate: Record<string, any> = {};
      let insertSalaryComponent = false;

      if (action.actionType === 'transfer') {
        if (after.orgNodeId != null) empUpdate.orgNodeId = after.orgNodeId;
        if (after.departmentId != null) empUpdate.departmentId = after.departmentId;
      } else if (action.actionType === 'promotion' || action.actionType === 'demotion') {
        if (after.jobTitleId != null) empUpdate.jobTitleId = after.jobTitleId;
        if (after.basicSalary != null) {
          empUpdate.basicSalary = String(after.basicSalary);
          if (after.housingAllowance != null) empUpdate.housingAllowance = String(after.housingAllowance);
          if (after.transportAllowance != null) empUpdate.transportAllowance = String(after.transportAllowance);
          if (after.mobileAllowance != null) empUpdate.mobileAllowance = String(after.mobileAllowance);
          if (after.mealAllowance != null) empUpdate.mealAllowance = String(after.mealAllowance);
          if (after.otherAllowances != null) empUpdate.otherAllowances = String(after.otherAllowances);
          insertSalaryComponent = true;
        }
      } else if (action.actionType === 'salary_change') {
        if (after.basicSalary != null) empUpdate.basicSalary = String(after.basicSalary);
        if (after.housingAllowance != null) empUpdate.housingAllowance = String(after.housingAllowance);
        if (after.transportAllowance != null) empUpdate.transportAllowance = String(after.transportAllowance);
        if (after.mobileAllowance != null) empUpdate.mobileAllowance = String(after.mobileAllowance);
        if (after.mealAllowance != null) empUpdate.mealAllowance = String(after.mealAllowance);
        if (after.otherAllowances != null) empUpdate.otherAllowances = String(after.otherAllowances);
        insertSalaryComponent = true;
      } else if (action.actionType === 'suspension') {
        empUpdate.employmentStatus = 'suspended';
      } else if (action.actionType === 'suspension_lift') {
        empUpdate.employmentStatus = 'active';
      } else if (action.actionType === 'termination') {
        empUpdate.employmentStatus = 'terminated';
        empUpdate.terminationDate = action.effectiveDate;
        if (after.terminationReason) empUpdate.terminationReason = after.terminationReason;
      } else if (action.actionType === 'resignation') {
        empUpdate.employmentStatus = 'resigned';
        empUpdate.terminationDate = action.effectiveDate;
      } else if (action.actionType === 'contract_renewal') {
        if (after.contractEndDate) empUpdate.contractEndDate = after.contractEndDate;
      }

      await db.transaction(async (tx) => {
        if (insertSalaryComponent) {
          await tx.update(employeeSalaryComponentsTable)
            .set({ effectiveTo: dayBefore(action.effectiveDate) })
            .where(and(
              eq(employeeSalaryComponentsTable.employeeId, action.employeeId),
              isNull(employeeSalaryComponentsTable.effectiveTo)
            ));
        }
        if (Object.keys(empUpdate).length > 0) {
          await tx.update(employeesTable).set(empUpdate).where(eq(employeesTable.id, action.employeeId));
        }
        await tx.update(employeeActionsTable)
          .set({ status: 'applied', approvalStepsJson: JSON.stringify(approvalData) })
          .where(eq(employeeActionsTable.id, actionId));
        if (insertSalaryComponent) {
          const newBasic    = empUpdate.basicSalary         ?? emp.basicSalary         ?? '0';
          const newHousing  = empUpdate.housingAllowance    ?? emp.housingAllowance    ?? '0';
          const newTransport= empUpdate.transportAllowance  ?? emp.transportAllowance  ?? '0';
          const newMobile   = empUpdate.mobileAllowance     ?? emp.mobileAllowance     ?? '0';
          const newMeal     = empUpdate.mealAllowance       ?? emp.mealAllowance       ?? '0';
          const salaryComps = await tx.select()
            .from(salaryComponentsTable)
            .where(and(
              eq(salaryComponentsTable.companyId, user.companyId),
              eq(salaryComponentsTable.isActive, true),
              inArray(salaryComponentsTable.code, ['BASIC','HOUSING','TRANSPORT','MOBILE','MEAL'])
            ));
          const compByCode: Record<string, number> = {};
          for (const sc of salaryComps) compByCode[sc.code] = sc.id;
          const toInsert: { employeeId: number; salaryComponentId: number; overrideValue: string; effectiveFrom: string }[] = [];
          if (parseFloat(String(newBasic))    > 0 && compByCode['BASIC'])     toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode['BASIC'],     overrideValue: String(newBasic),     effectiveFrom: action.effectiveDate });
          if (parseFloat(String(newHousing))  > 0 && compByCode['HOUSING'])   toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode['HOUSING'],   overrideValue: String(newHousing),   effectiveFrom: action.effectiveDate });
          if (parseFloat(String(newTransport))> 0 && compByCode['TRANSPORT']) toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode['TRANSPORT'], overrideValue: String(newTransport), effectiveFrom: action.effectiveDate });
          if (parseFloat(String(newMobile))   > 0 && compByCode['MOBILE'])    toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode['MOBILE'],    overrideValue: String(newMobile),    effectiveFrom: action.effectiveDate });
          if (parseFloat(String(newMeal))     > 0 && compByCode['MEAL'])      toInsert.push({ employeeId: action.employeeId, salaryComponentId: compByCode['MEAL'],      overrideValue: String(newMeal),      effectiveFrom: action.effectiveDate });
          if (toInsert.length) await tx.insert(employeeSalaryComponentsTable).values(toInsert);
        }
      });

      await logActivity(user.companyId, "employee_action", `${action.actionType} fully approved and applied for employee #${action.employeeId}`, null);
      // ── Notification: final approval ───────────────────────────────────────
      const wfFinalLabelEn = ACTION_TYPE_LABELS[action.actionType]?.en ?? action.actionType;
      const wfFinalLabelAr = ACTION_TYPE_LABELS[action.actionType]?.ar ?? action.actionType;
      await notifyEmployee(action.employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "workflow_request",
        entityId: action.id,
        notificationType: "workflow_request_approved",
        titleAr: `تمت الموافقة النهائية على: ${wfFinalLabelAr}`,
        titleEn: `Final Approval: ${wfFinalLabelEn}`,
        messageAr: `تمت الموافقة النهائية وتطبيق إجراء "${wfFinalLabelAr}" الخاص بك.`,
        messageEn: `Your "${wfFinalLabelEn}" request has been fully approved and applied.`,
        priority: "high",
        actionUrl: "/app/my-profile",
      });
      res.json({ success: true, nextStatus: 'applied' });
    }
  } catch (e) {
    console.error("[POST /api/workflow/requests/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/workflow/requests/:id/reject
app.post("/api/workflow/requests/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }

    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Not found" }); return; }

    if (!canApproveWorkflowStep(user.role, action.status)) {
      res.status(403).json({ success: false, message: "Not authorized to reject at this stage" }); return;
    }

    let approvalData: { chain: string[]; steps: any[] };
    if (action.approvalStepsJson) {
      try { approvalData = JSON.parse(action.approvalStepsJson); }
      catch { approvalData = { chain: getApprovalChain(action.actionType), steps: [] }; }
    } else {
      approvalData = { chain: getApprovalChain(action.actionType), steps: [] };
    }

    approvalData.steps.push({
      step: action.status,
      userId: user.userId,
      username: user.username,
      decision: 'rejected',
      date: new Date().toISOString(),
      notes: req.body.notes ?? null,
    });

    await db.update(employeeActionsTable)
      .set({ status: 'rejected', approvalStepsJson: JSON.stringify(approvalData) })
      .where(eq(employeeActionsTable.id, actionId));

    await logActivity(user.companyId, "employee_action", `${action.actionType} rejected for employee #${action.employeeId}`, null);
    // ── Notification ───────────────────────────────────────────────────────
    const wfRejLabelEn = ACTION_TYPE_LABELS[action.actionType]?.en ?? action.actionType;
    const wfRejLabelAr = ACTION_TYPE_LABELS[action.actionType]?.ar ?? action.actionType;
    await notifyEmployee(action.employeeId, user.companyId, {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "workflow_request",
      entityId: action.id,
      notificationType: "workflow_request_rejected",
      titleAr: `تم رفض طلب: ${wfRejLabelAr}`,
      titleEn: `Request Rejected: ${wfRejLabelEn}`,
      messageAr: `تم رفض طلب "${wfRejLabelAr}" الخاص بك.`,
      messageEn: `Your "${wfRejLabelEn}" request was rejected.`,
      priority: "high",
      actionUrl: "/app/my-profile",
    });
    res.json({ success: true });
  } catch (e) {
    console.error("[POST /api/workflow/requests/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/workflow/requests/:id/cancel
app.post("/api/workflow/requests/:id/cancel", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const actionId = parseInt(req.params.id, 10);
    if (isNaN(actionId)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }

    const [action] = await db.select().from(employeeActionsTable)
      .where(and(eq(employeeActionsTable.id, actionId), eq(employeeActionsTable.companyId, user.companyId))).limit(1);
    if (!action) { res.status(404).json({ success: false, message: "Not found" }); return; }

    if (!action.status.startsWith('pending')) {
      res.status(400).json({ success: false, message: "Only pending requests can be cancelled" }); return;
    }
    const canCancel = action.createdByUserId === user.userId || ['hradmin', 'superadmin'].includes(user.role);
    if (!canCancel) { res.status(403).json({ success: false, message: "Not authorized to cancel" }); return; }

    await db.update(employeeActionsTable)
      .set({ status: 'cancelled' })
      .where(eq(employeeActionsTable.id, actionId));

    await logActivity(user.companyId, "employee_action", `${action.actionType} workflow request cancelled`, null);
    res.json({ success: true });
  } catch (e) {
    console.error("[POST /api/workflow/requests/:id/cancel]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/workflow/employee-list — all active employees for workflow dropdowns
app.get("/api/workflow/employee-list", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const emps = await db.select({
      id: employeesTable.id,
      employeeCode: employeesTable.employeeCode,
      firstNameEn: employeesTable.firstNameEn,
      lastNameEn: employeesTable.lastNameEn,
      firstNameAr: employeesTable.firstNameAr,
      lastNameAr: employeesTable.lastNameAr,
      basicSalary: employeesTable.basicSalary,
      housingAllowance: employeesTable.housingAllowance,
      transportAllowance: employeesTable.transportAllowance,
      mobileAllowance: employeesTable.mobileAllowance,
      mealAllowance: employeesTable.mealAllowance,
      otherAllowances: employeesTable.otherAllowances,
    })
    .from(employeesTable)
    .where(and(
      eq(employeesTable.companyId, user.companyId),
      eq(employeesTable.isDeleted, false),
      eq(employeesTable.employmentStatus, 'active')
    ))
    .orderBy(asc(employeesTable.firstNameEn));
    res.json({ success: true, data: emps });
  } catch (e) {
    console.error("[GET /api/employees/active-list]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Notifications API ────────────────────────────────────────────────────────

// GET /api/notifications — list for the authenticated user
app.get("/api/notifications", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { status, limit: limitStr } = req.query as Record<string, string>;
    const limitN = Math.min(parseInt(limitStr ?? "20", 10) || 20, 50);
    const conditions: any[] = [
      eq(notificationsTable.recipientUserId, user.userId),
      eq(notificationsTable.isDeleted, false),
    ];
    if (status === "unread") conditions.push(eq(notificationsTable.status, "unread"));
    const rows = await db.select().from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limitN);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/notifications]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/notifications/unread-count
app.get("/api/notifications/unread-count", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.recipientUserId, user.userId),
        eq(notificationsTable.status, "unread"),
        eq(notificationsTable.isDeleted, false)
      ));
    res.json({ success: true, data: { count: row?.count ?? 0 } });
  } catch (e) {
    console.error("[GET /api/notifications/unread-count]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/notifications/read-all — mark all unread as read
app.patch("/api/notifications/read-all", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    await db.update(notificationsTable)
      .set({ status: "read", readAt: new Date() })
      .where(and(
        eq(notificationsTable.recipientUserId, user.userId),
        eq(notificationsTable.status, "unread")
      ));
    res.json({ success: true });
  } catch (e) {
    console.error("[PATCH /api/notifications/read-all]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
app.patch("/api/notifications/:id/read", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
    await db.update(notificationsTable)
      .set({ status: "read", readAt: new Date() })
      .where(and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.recipientUserId, user.userId)
      ));
    res.json({ success: true });
  } catch (e) {
    console.error("[PATCH /api/notifications/:id/read]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/notifications/:id — soft-delete
app.delete("/api/notifications/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
    await db.update(notificationsTable)
      .set({ isDeleted: true })
      .where(and(
        eq(notificationsTable.id, id),
        eq(notificationsTable.recipientUserId, user.userId)
      ));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/notifications/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
async function logActivity(companyId: number, type: string, description: string, employeeName: string | null) {
  try {
    await db.insert(activityLogsTable).values({ companyId, type, description, employeeName });
  } catch {}
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["API_PORT"] ?? "3001");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ZenJO API server running on http://localhost:${PORT}`);
});

export default app;
