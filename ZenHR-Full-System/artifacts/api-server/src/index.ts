import express from "express";
import cors from "cors";
import ExcelJS from "exceljs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { generateExcelBuffer, type ExportColumn } from "./export.service.js";
import { authMiddleware, authMiddleware as auth, hashPassword, signAccessToken, signRefreshToken, verifyToken } from "./auth.js";
import { runPayroll } from "./payroll-run.service.js";
import { applyBrackets, calculateComponentValueM } from "./salary-calculation.service.js";
import { db } from "@workspace/db";
import {
  usersTable, employeesTable, departmentsTable, jobTitlesTable,
  leaveRequestsTable, leavePoliciesTable, leaveBalancesTable,
  payrollRunsTable, payslipsTable, attendanceRecordsTable, attendanceCorrectionsTable,
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
  salaryAdvancesTable,
  complianceRecordsTable,
  violationTypesTable,
  disciplinaryCasesTable,
  disciplinaryInvestigationsTable,
  resignationsTable,
  resignationApprovalsTable,
  clearancesTable,
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

// ─── File upload (multer) ─────────────────────────────────────────────────────
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const docStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `doc_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const ALLOWED_DOC_MIMES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"]);
const docUpload = multer({
  storage: docStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_DOC_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type. Allowed: PDF, JPEG, PNG, WEBP"));
  },
});

// Serve uploaded files — auth required (checked in download handler below)
app.use("/uploads", auth, express.static(UPLOADS_DIR));

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
    const leaveType = body.leaveTypeId ?? body.leaveType;
    const empId = body.employeeId ?? user.employeeId;
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const totalDays = body.totalDays ?? Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    const [req2] = await db.insert(leaveRequestsTable).values({
      employeeId: empId,
      leaveType,
      startDate: body.startDate,
      endDate: body.endDate,
      totalDays,
      reason: body.reason || null,
      status: "pending",
    }).returning();
    await logActivity(user.companyId, "leave_request", `Leave request submitted`, null);
    // ── Notifications ──────────────────────────────────────────────────────
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
    res.status(201).json({ success: true, data: { ...req2, leaveTypeId: req2.leaveType } });
  } catch (e) {
    console.error("[POST /api/leave/requests]", e);
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
    if (user.role !== "manager" && user.role !== "hradmin") {
      res.status(403).json({ success: false, message: "Only managers or HR administrators can approve leave requests" }); return;
    }
    const requestId = parseInt(req.params["id"]!);
    const [lr] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, requestId));
    if (!lr) { res.status(404).json({ success: false, message: "Leave request not found" }); return; }

    if (user.role === "manager") {
      // Manager: scope check + pending→manager_approved
      if (lr.status !== "pending") {
        res.status(400).json({ success: false, message: "Only pending requests can be approved by a manager" }); return;
      }
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(eq(employeesTable.id, lr.employeeId), eq(employeesTable.isDeleted, false), ...scopeConds));
      if (!emp) { res.status(403).json({ success: false, message: "Not authorized to approve this employee's request" }); return; }
      const [updated] = await db.update(leaveRequestsTable).set({ status: "manager_approved" })
        .where(eq(leaveRequestsTable.id, requestId)).returning();
      await notifyRole(user.companyId, "hradmin", {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "leave_request", entityId: requestId,
        notificationType: "leave_manager_approved",
        titleAr: "طلب إجازة بانتظار موافقة الموارد البشرية",
        titleEn: "Leave Request Awaiting HR Approval",
        messageAr: `وافق المدير على طلب إجازة من ${fmtDateRange(lr.startDate, lr.endDate)}. يحتاج إلى موافقة الموارد البشرية.`,
        messageEn: `Manager approved a leave request from ${fmtDateRange(lr.startDate, lr.endDate)}. Awaiting HR approval.`,
        priority: "normal" as const, actionUrl: "/app/leave",
      });
      res.json({ success: true, data: updated }); return;
    }

    // hradmin: manager_approved or pending → approved (+ balance deduction)
    if (lr.status !== "pending" && lr.status !== "manager_approved") {
      res.status(400).json({ success: false, message: "Request cannot be approved in its current state" }); return;
    }
    const [updated] = await db.update(leaveRequestsTable).set({
      status: "approved", approvedById: user.userId, approvedAt: new Date(),
    }).where(eq(leaveRequestsTable.id, requestId)).returning();

    // ── Balance update (best-effort) ──────────────────────────────────────
    try {
      const year = new Date(String(lr.startDate)).getFullYear();
      const [lt] = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.id, Number(lr.leaveType)));
      if (lt) {
        const [policy] = await db.select().from(leavePoliciesTable)
          .where(and(eq(leavePoliciesTable.companyId, user.companyId), eq(leavePoliciesTable.leaveType, lt.code)));
        if (policy) {
          await db.update(leaveBalancesTable).set({
            usedDays: sql`${leaveBalancesTable.usedDays} + ${Number(lr.totalDays)}`,
            pendingDays: sql`GREATEST(0, ${leaveBalancesTable.pendingDays} - ${Number(lr.totalDays)})`,
          }).where(and(
            eq(leaveBalancesTable.employeeId, lr.employeeId),
            eq(leaveBalancesTable.leavePolicyId, policy.id),
            eq(leaveBalancesTable.year, year),
          ));
        }
      }
    } catch (balErr) { console.error("[approve] balance update non-fatal:", balErr); }

    // ── Notify employee ───────────────────────────────────────────────────
    if (updated?.employeeId) {
      await notifyEmployee(updated.employeeId, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "leave_request", entityId: updated.id,
        notificationType: "leave_request_approved",
        titleAr: "تمت الموافقة على طلب الإجازة",
        titleEn: "Leave Request Approved",
        messageAr: `تمت الموافقة على طلب إجازتك من ${fmtDateRange(updated.startDate, updated.endDate)}.`,
        messageEn: `Your leave request from ${fmtDateRange(updated.startDate, updated.endDate)} was approved.`,
        priority: "high", actionUrl: "/app/leave",
      });
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[POST /api/leave/requests/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "manager" && user.role !== "hradmin") {
      res.status(403).json({ success: false, message: "Only managers or HR administrators can reject leave requests" }); return;
    }
    const requestId = parseInt(req.params["id"]!);
    const [lr] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, requestId));
    if (!lr) { res.status(404).json({ success: false, message: "Leave request not found" }); return; }
    if (lr.status === "approved" || lr.status === "rejected" || lr.status === "cancelled") {
      res.status(400).json({ success: false, message: "Request cannot be rejected in its current state" }); return;
    }
    if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(eq(employeesTable.id, lr.employeeId), eq(employeesTable.isDeleted, false), ...scopeConds));
      if (!emp) { res.status(403).json({ success: false, message: "Not authorized to reject this employee's request" }); return; }
    }
    const { reason } = req.body as { reason: string };
    const [updated] = await db.update(leaveRequestsTable).set({
      status: "rejected", rejectionReason: reason,
    }).where(eq(leaveRequestsTable.id, requestId)).returning();
    if (updated?.employeeId) {
      await notifyEmployee(updated.employeeId, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "leave_request", entityId: updated.id,
        notificationType: "leave_request_rejected",
        titleAr: "تم رفض طلب الإجازة",
        titleEn: "Leave Request Rejected",
        messageAr: `تم رفض طلب إجازتك من ${fmtDateRange(updated.startDate, updated.endDate)}.`,
        messageEn: `Your leave request from ${fmtDateRange(updated.startDate, updated.endDate)} was rejected.`,
        priority: "high", actionUrl: "/app/leave",
      });
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[POST /api/leave/requests/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests/:id/cancel", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const requestId = parseInt(req.params["id"]!);
    const [lr] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, requestId));
    if (!lr) { res.status(404).json({ success: false, message: "Leave request not found" }); return; }
    if (user.role === "employee") {
      if (lr.employeeId !== user.employeeId) {
        res.status(403).json({ success: false, message: "Not authorized to cancel this request" }); return;
      }
    }
    if (lr.status === "approved" || lr.status === "rejected" || lr.status === "cancelled") {
      res.status(400).json({ success: false, message: "Request cannot be cancelled in its current state" }); return;
    }
    const [updated] = await db.update(leaveRequestsTable).set({ status: "cancelled" })
      .where(eq(leaveRequestsTable.id, requestId)).returning();
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[POST /api/leave/requests/:id/cancel]", e);
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
    if (!runMonth || runMonth < 1 || runMonth > 12 || !runYear) {
      res.status(400).json({ success: false, message: "Valid month (1-12) and year are required" }); return;
    }

    // Block any duplicate for same month+year (regardless of status)
    const [existing] = await db.select({ id: payrollRunsTable.id, status: payrollRunsTable.status })
      .from(payrollRunsTable)
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.runMonth, runMonth),
        eq(payrollRunsTable.runYear, runYear),
        eq(payrollRunsTable.isDeleted, false),
      ));
    if (existing) {
      res.status(409).json({ success: false, message: `A payroll run already exists for this period (status: ${existing.status}).` }); return;
    }

    const [run] = await db.insert(payrollRunsTable).values({
      companyId:    user.companyId,
      runMonth,
      runYear,
      status:       "draft",
      notes:        notes?.trim() || null,
      createdById:  user.userId,
    }).returning();

    await logActivity(user.companyId, "payroll_run_created",
      `Payroll run created for ${runYear}-${String(runMonth).padStart(2,"0")} by ${user.username}`,
      user.username);

    res.status(201).json({ success: true, data: run });
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

app.post("/api/payroll/runs/:id/calculate", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden: payroll admin required" }); return;
    }
    const runId = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.id, runId), eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Payroll run not found" }); return; }
    if (!["draft", "calculated"].includes(existing.status)) {
      res.status(409).json({ success: false, message: `Cannot calculate a run with status '${existing.status}'` }); return;
    }
    const result = await runPayroll(db, {
      companyId: user.companyId,
      runId,
      runMonth: existing.runMonth,
      runYear:  existing.runYear,
    });
    await logActivity(user.companyId, "payroll_calculated",
      `Payroll run #${runId} calculated: ${result.payslipCount} slips, gross=${result.totalGross} JOD by ${user.username}`,
      user.username);
    res.json({ success: true, data: result.run });
  } catch (e) {
    console.error("[POST /api/payroll/runs/:id/calculate]", e);
    res.status(500).json({ success: false, message: (e as Error).message || "Internal server error" });
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
    if (existing.status === "approved" || existing.status === "published") {
      res.status(409).json({ success: false, message: `This payroll run is already ${existing.status}.` }); return;
    }
    if (existing.status !== "calculated") {
      res.status(409).json({ success: false, message: "Run must be calculated before approval." }); return;
    }
    const [run] = await db.update(payrollRunsTable).set({
      status: "approved", approvedAt: new Date(), approvedById: user.userId,
    }).where(eq(payrollRunsTable.id, runId)).returning();
    await logActivity(user.companyId, "payroll_approved",
      `Payroll run #${runId} (${existing.runYear}-${String(existing.runMonth).padStart(2,"0")}) approved by ${user.username}`,
      user.username);
    res.json({ success: true, data: run });
  } catch (e) {
    console.error("[POST /api/payroll/runs/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/payroll/runs/:id/publish", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden: payroll admin required" }); return;
    }
    const runId = parseInt(req.params["id"]!);
    const [existing] = await db.select().from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.id, runId), eq(payrollRunsTable.companyId, user.companyId)));
    if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }
    if (existing.status === "published") {
      res.status(409).json({ success: false, message: "Run is already published." }); return;
    }
    if (existing.status !== "approved") {
      res.status(409).json({ success: false, message: "Run must be approved before publishing." }); return;
    }

    const [run] = await db.update(payrollRunsTable).set({
      status: "published", publishedAt: new Date(), publishedById: user.userId,
    }).where(eq(payrollRunsTable.id, runId)).returning();

    // Notify employees and settle advance deductions
    const slips = await db.select().from(payslipsTable).where(eq(payslipsTable.payrollRunId, runId));
    const empIds = [...new Set(slips.map((s: any) => s.employeeId))];

    // Get user IDs for all affected employees
    const empUsers = empIds.length > 0
      ? await db.select({ userId: usersTable.id, employeeId: usersTable.employeeId })
          .from(usersTable)
          .where(and(inArray(usersTable.employeeId, empIds as number[]), eq(usersTable.isDeleted, false)))
      : [];

    // Notify each employee
    for (const eu of empUsers) {
      const slip = slips.find((s: any) => s.employeeId === eu.employeeId);
      const netAmt = slip ? parseFloat(String(slip.netSalary)).toFixed(3) : "0.000";
      await notifyUsers([eu.userId], {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "payroll",
        entityId: runId,
        notificationType: "payroll_published",
        titleAr: "تم نشر كشف الراتب",
        titleEn: "Payslip Published",
        messageAr: `كشف راتب ${existing.runYear}/${String(existing.runMonth).padStart(2,"0")} جاهز. صافي الراتب: ${netAmt} د.أ`,
        messageEn: `Your payslip for ${existing.runYear}/${String(existing.runMonth).padStart(2,"0")} is ready. Net salary: ${netAmt} JOD`,
        priority: "normal",
        actionUrl: "/app/payroll/slips",
      });
    }

    // Settle advance deductions: reduce remaining_balance for each advance
    for (const slip of slips) {
      const advDeductionM = Math.round(parseFloat(String(slip.advanceDeduction ?? "0")) * 1000);
      if (advDeductionM <= 0) continue;
      let snapshot: any = {};
      try { snapshot = JSON.parse(slip.componentsSnapshot ?? "{}"); } catch {}
      const advIds: number[] = snapshot.advanceIds ?? [];
      if (!advIds.length) continue;

      // Distribute the deduction across the linked advances
      let remainingToSettle = advDeductionM;
      for (const advId of advIds) {
        if (remainingToSettle <= 0) break;
        const [adv] = await db.select().from(salaryAdvancesTable).where(eq(salaryAdvancesTable.id, advId));
        if (!adv) continue;
        const currentRemM = Math.round(parseFloat(String(adv.remainingBalance ?? "0")) * 1000);
        if (currentRemM <= 0) continue;
        const settleM = Math.min(remainingToSettle, currentRemM);
        const newRemM = currentRemM - settleM;
        const newStatus = newRemM <= 0 ? "settled" : "approved";
        await db.update(salaryAdvancesTable).set({
          remainingBalance: (newRemM / 1000).toFixed(3),
          status: newStatus,
        }).where(eq(salaryAdvancesTable.id, advId));
        remainingToSettle -= settleM;
      }
    }

    await logActivity(user.companyId, "payroll_published",
      `Payroll run #${runId} (${existing.runYear}-${String(existing.runMonth).padStart(2,"0")}) published by ${user.username}`,
      user.username);

    res.json({ success: true, data: run });
  } catch (e) {
    console.error("[POST /api/payroll/runs/:id/publish]", e);
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
    // Only expose slips from published runs
    const publishedRunIds = (await db.select({ id: payrollRunsTable.id })
      .from(payrollRunsTable)
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.status, "published"),
        eq(payrollRunsTable.isDeleted, false),
      ))).map((r: any) => r.id);
    const slips = publishedRunIds.length
      ? await db.select().from(payslipsTable)
          .where(and(
            eq(payslipsTable.employeeId, user.employeeId),
            inArray(payslipsTable.payrollRunId, publishedRunIds),
          ))
          .orderBy(desc(payslipsTable.createdAt))
      : [];
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
    // Only include published runs in the summary
    const publishedRunIds = (await db.select({ id: payrollRunsTable.id })
      .from(payrollRunsTable)
      .where(and(
        eq(payrollRunsTable.companyId, user.companyId),
        eq(payrollRunsTable.status, "published"),
        eq(payrollRunsTable.isDeleted, false),
      ))).map((r: any) => r.id);
    const slips = publishedRunIds.length
      ? await db.select().from(payslipsTable)
          .where(and(
            eq(payslipsTable.employeeId, user.employeeId),
            inArray(payslipsTable.payrollRunId, publishedRunIds),
          ))
          .orderBy(desc(payslipsTable.createdAt))
      : [];
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
    // Employees may only view their own slips from published runs
    if (user.role === "employee") {
      if (slip.employeeId !== user.employeeId) {
        res.status(403).json({ success: false, error: "Forbidden" }); return;
      }
      const [run] = await db.select({ status: payrollRunsTable.status })
        .from(payrollRunsTable).where(eq(payrollRunsTable.id, slip.payrollRunId));
      if (!run || run.status !== "published") {
        res.status(404).json({ success: false, error: "Not found" }); return;
      }
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
    if (!nameEn || !nameAr || !code) {
      res.status(400).json({ success: false, message: "nameEn, nameAr and code are required" }); return;
    }
    const upperCode = (code as string).toUpperCase();
    // Duplicate check — return 409 instead of letting DB throw a 500
    const [dupe] = await db.select({ id: salaryComponentsTable.id }).from(salaryComponentsTable)
      .where(and(eq(salaryComponentsTable.companyId, user.companyId), eq(salaryComponentsTable.code, upperCode)));
    if (dupe) {
      res.status(409).json({ success: false, message: `Component code '${upperCode}' already exists` }); return;
    }
    const [row] = await db.insert(salaryComponentsTable).values({
      companyId: user.companyId,
      nameAr,
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
// ─── Formula expression safety validator ──────────────────────────────────────
// Mirrors the tokeniser logic in salary-calculation.service.ts so dangerous
// expressions are rejected at save time, not only at calculation time.
const ALLOWED_FORMULA_VARS = new Set(["basic", "gross", "hours", "rate", "days"]);
function validateFormulaExpression(expr: string): boolean {
  // Substitute allowed variable names with a placeholder number
  const substituted = expr.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m) =>
    ALLOWED_FORMULA_VARS.has(m) ? "1" : "INVALID"
  );
  if (substituted.includes("INVALID")) return false;
  // After substitution only digits, spaces, operators and parentheses allowed
  return /^[\d\s\.\+\-\*\/\(\)]+$/.test(substituted);
}

app.get("/api/salary-components", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin", "superadmin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
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
    if (!nameEn || !nameAr || !code) {
      res.status(400).json({ success: false, message: "nameEn, nameAr and code are required" }); return;
    }
    // Validate formula expression safety at save time
    if (calculationType === "formula") {
      const expr = (formulaExpression ?? "").trim();
      if (!expr) {
        res.status(400).json({ success: false, message: "formulaExpression is required for formula type" }); return;
      }
      if (!validateFormulaExpression(expr)) {
        res.status(400).json({ success: false, message: "Invalid formula: only variables basic, gross, hours, rate, days and arithmetic operators are allowed" }); return;
      }
    }
    // Validate defaultValue — earnings must not be negative
    const parsedDefault = parseFloat(String(defaultValue ?? "0"));
    if ((componentType ?? "earning") === "earning" && parsedDefault < 0) {
      res.status(400).json({ success: false, message: "Earning components cannot have a negative default value" }); return;
    }
    const upperCode = (code as string).toUpperCase();
    const [dupe] = await db.select({ id: salaryComponentsTable.id }).from(salaryComponentsTable)
      .where(and(eq(salaryComponentsTable.companyId, user.companyId), eq(salaryComponentsTable.code, upperCode)));
    if (dupe) {
      res.status(409).json({ success: false, message: `Component code '${upperCode}' already exists` }); return;
    }
    const [row] = await db.insert(salaryComponentsTable).values({
      companyId: user.companyId,
      nameAr,
      nameEn,
      code: upperCode,
      componentType: componentType ?? "earning",
      calculationType: calculationType ?? "fixed",
      defaultValue: String(parsedDefault),
      formulaExpression: calculationType === "formula" ? (formulaExpression ?? null) : null,
      percentageBase: calculationType === "percentage" ? (percentageBase ?? null) : null,
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
    // Validate formula if being set or if calculationType is being changed to formula
    if (formulaExpression !== undefined || calculationType === "formula") {
      const expr = (formulaExpression ?? "").trim();
      if (calculationType === "formula" || expr) {
        if (!expr) {
          res.status(400).json({ success: false, message: "formulaExpression is required for formula type" }); return;
        }
        if (!validateFormulaExpression(expr)) {
          res.status(400).json({ success: false, message: "Invalid formula: only variables basic, gross, hours, rate, days and arithmetic operators are allowed" }); return;
        }
      }
    }
    // Validate defaultValue — earnings must not be negative
    if (defaultValue !== undefined) {
      const type = componentType ?? (await db.select({ componentType: salaryComponentsTable.componentType })
        .from(salaryComponentsTable).where(eq(salaryComponentsTable.id, id)).then(r => r[0]?.componentType ?? "earning"));
      if (type === "earning" && parseFloat(String(defaultValue)) < 0) {
        res.status(400).json({ success: false, message: "Earning components cannot have a negative default value" }); return;
      }
    }
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
    const rows = await db
      .select({
        id: attendanceRecordsTable.id,
        employeeId: attendanceRecordsTable.employeeId,
        date: attendanceRecordsTable.date,
        clockIn: attendanceRecordsTable.clockIn,
        clockOut: attendanceRecordsTable.clockOut,
        workedMinutes: attendanceRecordsTable.workedMinutes,
        status: attendanceRecordsTable.status,
        lateMinutes: attendanceRecordsTable.lateMinutes,
        overtimeMinutes: attendanceRecordsTable.overtimeMinutes,
        attendanceType: attendanceRecordsTable.attendanceType,
        notes: attendanceRecordsTable.notes,
        createdAt: attendanceRecordsTable.createdAt,
        updatedAt: attendanceRecordsTable.updatedAt,
        employeeCode: employeesTable.employeeCode,
        fullNameAr: sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        fullNameEn: sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
        orgNodeId: employeesTable.orgNodeId,
      })
      .from(attendanceRecordsTable)
      .leftJoin(employeesTable, eq(attendanceRecordsTable.employeeId, employeesTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(attendanceRecordsTable.date))
      .limit(200);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/attendance]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/clock-in", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "No employee profile linked to this account" }); return; }
    const { attendanceType, notes } = req.body as { attendanceType?: string; notes?: string };
    const today = new Date().toISOString().split("T")[0]!;
    const [existing] = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, user.employeeId), eq(attendanceRecordsTable.date, today)));
    if (existing?.clockIn) {
      res.status(409).json({ success: false, message: "Already clocked in today" }); return;
    }
    const now = new Date();
    const shiftStartHour = 9, shiftStartMin = 0, graceMins = 15;
    const shiftWithGrace = shiftStartHour * 60 + shiftStartMin + graceMins;
    const clockMins = now.getHours() * 60 + now.getMinutes();
    const lateMinutes = Math.max(0, clockMins - shiftWithGrace);
    const status = lateMinutes > 0 ? "late" : "present";
    let record: any;
    if (existing) {
      [record] = await db.update(attendanceRecordsTable)
        .set({ clockIn: now, status, lateMinutes, attendanceType: attendanceType ?? "office", notes: notes ?? existing.notes })
        .where(eq(attendanceRecordsTable.id, existing.id)).returning();
    } else {
      [record] = await db.insert(attendanceRecordsTable).values({
        employeeId: user.employeeId,
        date: today, clockIn: now, status, lateMinutes,
        attendanceType: attendanceType ?? "office", notes,
      }).returning();
    }
    await logActivity(user.companyId, "attendance_check_in",
      `Clock-in: ${user.username} at ${now.toISOString()} (${status}, late: ${lateMinutes}m)`, user.username);
    res.status(201).json({ success: true, data: record });
  } catch (e) {
    console.error("[POST /api/attendance/clock-in]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/clock-out", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "No employee profile linked to this account" }); return; }
    const today = new Date().toISOString().split("T")[0]!;
    const [existing] = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, user.employeeId), eq(attendanceRecordsTable.date, today)));
    if (!existing || !existing.clockIn) {
      res.status(400).json({ success: false, message: "No clock-in found for today" }); return;
    }
    if (existing.clockOut) {
      res.status(409).json({ success: false, message: "Already clocked out today" }); return;
    }
    const now = new Date();
    const workedMs = now.getTime() - existing.clockIn.getTime();
    const workedMinutes = Math.max(0, Math.floor(workedMs / 60000));
    const [record] = await db.update(attendanceRecordsTable)
      .set({ clockOut: now, workedMinutes })
      .where(eq(attendanceRecordsTable.id, existing.id)).returning();
    await logActivity(user.companyId, "attendance_check_out",
      `Clock-out: ${user.username} at ${now.toISOString()}, worked ${workedMinutes} minutes`, user.username);
    res.json({ success: true, data: record });
  } catch (e) {
    console.error("[POST /api/attendance/clock-out]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, month, year } = req.query as Record<string, string>;
    const m = parseInt(month ?? String(new Date().getMonth() + 1));
    const y = parseInt(year ?? String(new Date().getFullYear()));
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const to = `${y}-${String(m).padStart(2, "0")}-31`;
    const conditions: any[] = [gte(attendanceRecordsTable.date, from), lte(attendanceRecordsTable.date, to)];
    if (user.role === "employee") {
      if (!user.employeeId) {
        res.json({ success: true, data: { present: 0, absent: 0, late: 0, total: 0, totalWorkedMinutes: 0, month: m, year: y } }); return;
      }
      conditions.push(eq(attendanceRecordsTable.employeeId, user.employeeId));
    } else if (employeeId) {
      conditions.push(eq(attendanceRecordsTable.employeeId, parseInt(employeeId)));
    }
    const rows = await db.select().from(attendanceRecordsTable).where(and(...conditions));
    const present = rows.filter(r => r.status === "present").length;
    const absent = rows.filter(r => r.status === "absent").length;
    const late = rows.filter(r => r.status === "late" || (r.lateMinutes ?? 0) > 0).length;
    const totalWorked = rows.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0);
    res.json({ success: true, data: { present, absent, late, total: rows.length, totalWorkedMinutes: totalWorked, month: m, year: y } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────

// Helper: compute document status from expiresAt + alertDaysBefore
function computeDocStatus(expiresAt: string | null, alertDaysBefore = 30): "valid" | "expiring_soon" | "expired" | "missing" {
  if (!expiresAt) return "valid";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt);
  const soon = new Date(today); soon.setDate(today.getDate() + alertDaysBefore);
  if (expiry < today) return "expired";
  if (expiry <= soon) return "expiring_soon";
  return "valid";
}

// Helper: build joined document rows with all UI-required fields
async function fetchDocumentsJoined(conditions: any[]) {
  const docs = await db
    .select({
      id: documentsTable.id,
      companyId: documentsTable.companyId,
      employeeId: documentsTable.employeeId,
      documentTypeId: documentsTable.documentTypeId,
      documentNumber: documentsTable.documentNumber,
      issuedAt: documentsTable.issuedAt,
      expiresAt: documentsTable.expiresAt,
      issuedBy: documentsTable.issuedBy,
      fileUrl: documentsTable.fileUrl,
      fileName: documentsTable.fileName,
      notes: documentsTable.notes,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
      isDeleted: documentsTable.isDeleted,
      employeeCode: employeesTable.employeeCode,
      employeeNameAr: sql<string>`concat(${employeesTable.firstNameAr},' ',${employeesTable.lastNameAr})`,
      employeeNameEn: sql<string>`concat(${employeesTable.firstNameEn},' ',${employeesTable.lastNameEn})`,
      documentTypeNameAr: documentTypesTable.nameAr,
      documentTypeNameEn: documentTypesTable.nameEn,
      documentTypeCategory: documentTypesTable.category,
      requiresExpiry: documentTypesTable.requiresExpiry,
      alertDaysBefore: documentTypesTable.alertDaysBefore,
    })
    .from(documentsTable)
    .innerJoin(employeesTable, eq(documentsTable.employeeId, employeesTable.id))
    .innerJoin(documentTypesTable, eq(documentsTable.documentTypeId, documentTypesTable.id))
    .where(and(...conditions))
    .orderBy(desc(documentsTable.createdAt));

  return docs.map(d => ({
    ...d,
    issuedDate: d.issuedAt,
    expiryDate: d.expiresAt,
    status: computeDocStatus(d.expiresAt, d.alertDaysBefore ?? 30),
    complianceRelated: ["identity", "employment"].includes(d.documentTypeCategory ?? ""),
    linkedModule: d.documentTypeCategory === "identity" ? "employee_profile"
      : d.documentTypeCategory === "employment" ? "compliance"
      : "documents",
  }));
}

// GET /api/documents — role-scoped list with JOIN
app.get("/api/documents", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId } = req.query as Record<string, string>;
    const conditions: any[] = [eq(documentsTable.isDeleted, false)];

    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(documentsTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(documentsTable.employeeId, ids));
    } else {
      // hradmin, payrolladmin, superadmin — filter by company
      conditions.push(eq(documentsTable.companyId, user.companyId));
      if (employeeId) conditions.push(eq(documentsTable.employeeId, parseInt(employeeId)));
    }

    const docs = await fetchDocumentsJoined(conditions);
    res.json({ success: true, data: docs });
  } catch (e) {
    console.error("[GET /api/documents]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/documents — create document record [role guard + field mapping]
app.post("/api/documents", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, documentTypeId, documentNumber, issuedBy, issuedDate,
            expiryDate, fileName, fileUrl, notes } = req.body;

    if (!employeeId || !documentTypeId) {
      res.status(400).json({ success: false, message: "employeeId and documentTypeId are required" }); return;
    }

    // Role guard: employee can only create for themselves
    if (user.role === "employee") {
      if (Number(employeeId) !== user.employeeId) {
        res.status(403).json({ success: false, message: "Employees can only upload their own documents" }); return;
      }
    } else if (user.role === "payrolladmin") {
      res.status(403).json({ success: false, message: "Payroll admins cannot create employee documents" }); return;
    } else if (!["hradmin", "superadmin", "manager"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    // Validate expiry > issued
    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      res.status(400).json({ success: false, message: "Expiry date must be after issue date" }); return;
    }

    const [doc] = await db.insert(documentsTable).values({
      companyId: user.companyId,
      employeeId: Number(employeeId),
      documentTypeId: Number(documentTypeId),
      documentNumber: documentNumber ?? null,
      issuedAt: issuedDate ?? null,
      expiresAt: expiryDate ?? null,
      issuedBy: issuedBy ?? null,
      fileUrl: fileUrl ?? null,
      fileName: fileName ?? null,
      notes: notes ?? null,
    }).returning();

    await db.insert(activityLogsTable).values({
      type: "document_uploaded",
      description: `Document #${doc.id} (type ${documentTypeId}) uploaded for employee ${employeeId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    console.error("[POST /api/documents]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PATCH /api/documents/:id — update document [role guard + ownership]
app.patch("/api/documents/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    const { documentNumber, issuedBy, issuedDate, expiryDate,
            fileName, fileUrl, notes, documentTypeId } = req.body;

    const [existing] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Document not found" }); return; }

    if (user.role === "employee" && existing.employeeId !== user.employeeId) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    if (user.role === "payrolladmin") {
      res.status(403).json({ success: false, message: "Payroll admins cannot edit employee documents" }); return;
    }
    if (!["hradmin", "superadmin", "manager", "employee"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    if (issuedDate && expiryDate && expiryDate < issuedDate) {
      res.status(400).json({ success: false, message: "Expiry date must be after issue date" }); return;
    }

    const update: Record<string, any> = { updatedAt: new Date() };
    if (documentNumber !== undefined) update.documentNumber = documentNumber;
    if (documentTypeId !== undefined) update.documentTypeId = Number(documentTypeId);
    if (issuedBy !== undefined) update.issuedBy = issuedBy;
    if (issuedDate !== undefined) update.issuedAt = issuedDate;
    if (expiryDate !== undefined) update.expiresAt = expiryDate;
    if (fileName !== undefined) update.fileName = fileName;
    if (fileUrl !== undefined) update.fileUrl = fileUrl;
    if (notes !== undefined) update.notes = notes;

    const [doc] = await db.update(documentsTable).set(update)
      .where(eq(documentsTable.id, id)).returning();

    await db.insert(activityLogsTable).values({
      type: "document_updated",
      description: `Document #${id} updated by user ${user.userId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.json({ success: true, data: doc });
  } catch (e) {
    console.error("[PATCH /api/documents/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// DELETE /api/documents/:id — soft delete [role guard + ownership]
app.delete("/api/documents/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);

    const [existing] = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.id, id), eq(documentsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Document not found" }); return; }

    if (user.role === "employee" && existing.employeeId !== user.employeeId) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }
    if (!["hradmin", "superadmin", "manager", "employee"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    await db.update(documentsTable).set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(documentsTable.id, id));

    await db.insert(activityLogsTable).values({
      type: "document_deleted",
      description: `Document #${id} soft-deleted by user ${user.userId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.status(204).send();
  } catch (e) {
    console.error("[DELETE /api/documents/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Assets helpers ───────────────────────────────────────────────────────────
async function buildAssetShape(a: typeof assetsTable.$inferSelect, depts: { id: number; nameAr: string; nameEn: string }[], emps: { id: number; employeeCode: string; firstNameAr: string; lastNameAr: string; firstNameEn: string; lastNameEn: string; departmentId: number | null }[], cats: { id: number; nameAr: string; nameEn: string }[]) {
  const emp = a.assignedToEmployeeId ? emps.find(e => e.id === a.assignedToEmployeeId) : null;
  const dept = emp?.departmentId ? depts.find(d => d.id === emp.departmentId) : null;
  const cat = cats.find(c => c.id === a.categoryId);
  return {
    id: a.id,
    companyId: a.companyId,
    categoryId: a.categoryId,
    categoryNameAr: cat?.nameAr ?? null,
    categoryNameEn: cat?.nameEn ?? null,
    assetNameAr: a.nameAr,
    assetNameEn: a.nameEn,
    serialNumber: a.serialNumber ?? null,
    barcode: a.barcode ?? null,
    model: a.model ?? null,
    brand: a.brand ?? null,
    supplier: a.supplier ?? null,
    purchaseDate: a.purchaseDate ?? null,
    purchaseValue: a.purchaseValue ?? null,
    currentStatus: a.currentStatus,
    currentCondition: a.currentCondition ?? "good",
    assignedToEmployeeId: a.assignedToEmployeeId ?? null,
    assignedToNameAr: emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : null,
    assignedToNameEn: emp ? `${emp.firstNameEn} ${emp.lastNameEn}` : null,
    assignedEmployeeCode: emp?.employeeCode ?? null,
    assignedOrgNodeNameAr: dept?.nameAr ?? null,
    assignedOrgNodeNameEn: dept?.nameEn ?? null,
    assignedDepartmentAr: dept?.nameAr ?? null,
    assignedDepartmentEn: dept?.nameEn ?? null,
    employeeOnLongLeave: false,
    assignedDate: a.assignedDate ?? null,
    returnedDate: a.returnedDate ?? null,
    notes: a.notes ?? null,
    isActive: a.isActive,
    isDeleted: a.isDeleted,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

async function loadAssetLookups(companyId: number) {
  const [cats, emps, depts] = await Promise.all([
    db.select({ id: assetCategoriesTable.id, nameAr: assetCategoriesTable.nameAr, nameEn: assetCategoriesTable.nameEn }).from(assetCategoriesTable).where(eq(assetCategoriesTable.isActive, true)),
    db.select({ id: employeesTable.id, employeeCode: employeesTable.employeeCode, firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn, departmentId: employeesTable.departmentId }).from(employeesTable).where(and(eq(employeesTable.companyId, companyId), eq(employeesTable.isDeleted, false))),
    db.select({ id: departmentsTable.id, nameAr: departmentsTable.nameAr, nameEn: departmentsTable.nameEn }).from(departmentsTable).where(and(eq(departmentsTable.companyId, companyId), eq(departmentsTable.isDeleted, false))),
  ]);
  return { cats, emps, depts };
}

// ─── Assets ───────────────────────────────────────────────────────────────────
app.get("/api/assets/export", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { status } = req.query as Record<string, string>;
    const conditions: any[] = [eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)];
    if (status) conditions.push(eq(assetsTable.currentStatus, status));
    const assets = await db.select().from(assetsTable).where(and(...conditions)).orderBy(assetsTable.nameAr);
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await Promise.all(assets.map(a => buildAssetShape(a, depts, emps, cats)));
    res.json({ success: true, data: shaped });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/assets/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const isEmp = user.role === "employee";
    const conditions: any[] = [eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)];
    if (isEmp) {
      if (!user.employeeId) { res.json({ success: true, data: { total: 0, assigned: 0, available: 0 } }); return; }
      conditions.push(eq(assetsTable.assignedToEmployeeId, user.employeeId));
    }
    const [total] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(and(...conditions));
    const [assigned] = await db.select({ count: sql<number>`count(*)::int` }).from(assetsTable).where(and(...conditions, eq(assetsTable.currentStatus, "assigned")));
    const t = total?.count ?? 0;
    const a = isEmp ? t : (assigned?.count ?? 0);
    res.json({ success: true, data: { total: t, assigned: a, available: t - a } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

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
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(assetsTable.assignedToEmployeeId, ids));
    } else {
      if (employeeId) conditions.push(eq(assetsTable.assignedToEmployeeId, parseInt(employeeId)));
    }
    if (status) conditions.push(eq(assetsTable.currentStatus, status));
    const assets = await db.select().from(assetsTable).where(and(...conditions)).orderBy(desc(assetsTable.createdAt));
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await Promise.all(assets.map(a => buildAssetShape(a, depts, emps, cats)));
    res.json({ success: true, data: shaped });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { assetNameAr, assetNameEn, categoryId, serialNumber, barcode, purchaseDate, purchaseValue, supplier, currentStatus, condition, notes, model, brand } = req.body as Record<string, any>;
    if (!assetNameAr?.trim()) { res.status(400).json({ success: false, message: "Asset name (Arabic) is required" }); return; }
    if (!categoryId) { res.status(400).json({ success: false, message: "Category is required" }); return; }
    if (purchaseValue !== undefined && purchaseValue !== null && Number(purchaseValue) < 0) { res.status(400).json({ success: false, message: "Purchase value cannot be negative" }); return; }
    if (serialNumber?.trim()) {
      const [dup] = await db.select({ id: assetsTable.id }).from(assetsTable).where(and(eq(assetsTable.companyId, user.companyId), eq(assetsTable.serialNumber, serialNumber.trim()), eq(assetsTable.isDeleted, false)));
      if (dup) { res.status(409).json({ success: false, message: "An asset with this serial number already exists" }); return; }
    }
    const [asset] = await db.insert(assetsTable).values({
      companyId: user.companyId,
      categoryId: Number(categoryId),
      nameAr: assetNameAr.trim(),
      nameEn: assetNameEn?.trim() || assetNameAr.trim(),
      serialNumber: serialNumber?.trim() || null,
      barcode: barcode?.trim() || null,
      model: model?.trim() || null,
      brand: brand?.trim() || null,
      supplier: supplier?.trim() || null,
      purchaseDate: purchaseDate || null,
      purchaseValue: purchaseValue != null ? String(purchaseValue) : null,
      currentStatus: currentStatus || "available",
      currentCondition: condition || "good",
      notes: notes?.trim() || null,
    }).returning();
    await db.insert(activityLogsTable).values({ type: "asset_created", description: `Asset "${assetNameAr}" created (serial: ${serialNumber || "N/A"})`, employeeName: user.name || "HR", companyId: user.companyId });
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(asset, depts, emps, cats);
    res.status(201).json({ success: true, data: shaped });
  } catch (e) {
    console.error("[POST /api/assets]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/assets/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid asset ID" }); return; }
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    if (user.role === "employee" && asset.assignedToEmployeeId !== user.employeeId) {
      res.status(403).json({ success: false, message: "Access denied" }); return;
    }
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(asset, depts, emps, cats);
    res.json({ success: true, data: shaped });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/assets/:id", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid asset ID" }); return; }
    const [existing] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    const { assetNameAr, assetNameEn, categoryId, serialNumber, barcode, purchaseDate, purchaseValue, supplier, currentStatus, condition, notes, model, brand } = req.body as Record<string, any>;
    if (assetNameAr !== undefined && !assetNameAr?.trim()) { res.status(400).json({ success: false, message: "Asset name cannot be empty" }); return; }
    if (purchaseValue !== undefined && purchaseValue !== null && Number(purchaseValue) < 0) { res.status(400).json({ success: false, message: "Purchase value cannot be negative" }); return; }
    if (serialNumber?.trim() && serialNumber.trim() !== existing.serialNumber) {
      const [dup] = await db.select({ id: assetsTable.id }).from(assetsTable).where(and(eq(assetsTable.companyId, user.companyId), eq(assetsTable.serialNumber, serialNumber.trim()), eq(assetsTable.isDeleted, false)));
      if (dup) { res.status(409).json({ success: false, message: "An asset with this serial number already exists" }); return; }
    }
    const updateFields: Record<string, any> = {};
    if (assetNameAr !== undefined) updateFields["nameAr"] = assetNameAr.trim();
    if (assetNameEn !== undefined) updateFields["nameEn"] = assetNameEn?.trim() || existing.nameEn;
    if (categoryId !== undefined) updateFields["categoryId"] = Number(categoryId);
    if (serialNumber !== undefined) updateFields["serialNumber"] = serialNumber?.trim() || null;
    if (barcode !== undefined) updateFields["barcode"] = barcode?.trim() || null;
    if (model !== undefined) updateFields["model"] = model?.trim() || null;
    if (brand !== undefined) updateFields["brand"] = brand?.trim() || null;
    if (supplier !== undefined) updateFields["supplier"] = supplier?.trim() || null;
    if (purchaseDate !== undefined) updateFields["purchaseDate"] = purchaseDate || null;
    if (purchaseValue !== undefined) updateFields["purchaseValue"] = purchaseValue != null ? String(purchaseValue) : null;
    if (currentStatus !== undefined) updateFields["currentStatus"] = currentStatus;
    if (condition !== undefined) updateFields["currentCondition"] = condition;
    if (notes !== undefined) updateFields["notes"] = notes?.trim() || null;
    const [updated] = await db.update(assetsTable).set(updateFields).where(eq(assetsTable.id, id)).returning();
    await db.insert(activityLogsTable).values({ type: "asset_updated", description: `Asset "${updated.nameAr}" updated`, employeeName: user.name || "HR", companyId: user.companyId });
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(updated, depts, emps, cats);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/assets/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/assets/:id", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid asset ID" }); return; }
    const [existing] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    const [updated] = await db.update(assetsTable).set(req.body).where(eq(assetsTable.id, id)).returning();
    await db.insert(activityLogsTable).values({ type: "asset_updated", description: `Asset "${updated.nameAr}" updated`, employeeName: user.name || "HR", companyId: user.companyId });
    res.json({ success: true, data: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/assets/:id", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) { res.status(400).json({ success: false, message: "Invalid asset ID" }); return; }
    const [existing] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!existing) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    if (existing.currentStatus === "assigned") {
      res.status(409).json({ success: false, message: "Cannot delete an assigned asset. Please return it first." }); return;
    }
    await db.update(assetsTable).set({ isDeleted: true }).where(eq(assetsTable.id, id));
    await db.insert(activityLogsTable).values({ type: "asset_deleted", description: `Asset "${existing.nameAr}" deleted (serial: ${existing.serialNumber || "N/A"})`, employeeName: user.name || "HR", companyId: user.companyId });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets/:id/assign", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    const { employeeId, assignedDate, condition, notes } = req.body as Record<string, any>;
    if (!employeeId) { res.status(400).json({ success: false, message: "Employee ID is required" }); return; }
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    if (asset.currentStatus === "assigned") { res.status(409).json({ success: false, message: "Asset is already assigned" }); return; }
    const [emp] = await db.select({ id: employeesTable.id, firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr }).from(employeesTable).where(and(eq(employeesTable.id, Number(employeeId)), eq(employeesTable.companyId, user.companyId)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    const today = new Date().toISOString().split("T")[0]!;
    const [updated] = await db.update(assetsTable).set({
      assignedToEmployeeId: Number(employeeId),
      currentStatus: "assigned",
      assignedDate: assignedDate || today,
      currentCondition: condition || asset.currentCondition,
      notes: notes?.trim() || asset.notes,
    }).where(eq(assetsTable.id, id)).returning();
    await db.insert(activityLogsTable).values({ type: "asset_assigned", description: `Asset "${asset.nameAr}" assigned to ${emp.firstNameAr} ${emp.lastNameAr}`, employeeName: user.name || "HR", companyId: user.companyId });
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(updated, depts, emps, cats);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[POST /api/assets/:id/assign]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets/:id/return", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    const { returnDate, condition, notes, isLost } = req.body as Record<string, any>;
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    const today = new Date().toISOString().split("T")[0]!;
    const newStatus = isLost ? "lost" : (condition === "damaged" ? "damaged" : "available");
    const [updated] = await db.update(assetsTable).set({
      assignedToEmployeeId: null,
      currentStatus: newStatus,
      returnedDate: returnDate || today,
      currentCondition: condition || asset.currentCondition,
      notes: notes?.trim() || asset.notes,
    }).where(eq(assetsTable.id, id)).returning();
    await db.insert(activityLogsTable).values({ type: "asset_returned", description: `Asset "${asset.nameAr}" returned (condition: ${condition || "good"}, status: ${newStatus})`, employeeName: user.name || "HR", companyId: user.companyId });
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(updated, depts, emps, cats);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[POST /api/assets/:id/return]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets/:id/retire", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    const { notes } = req.body as Record<string, any>;
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found" }); return; }
    if (asset.currentStatus === "assigned") { res.status(409).json({ success: false, message: "Cannot retire an assigned asset. Return it first." }); return; }
    const [updated] = await db.update(assetsTable).set({ currentStatus: "retired", notes: notes?.trim() || asset.notes }).where(eq(assetsTable.id, id)).returning();
    await db.insert(activityLogsTable).values({ type: "asset_deleted", description: `Asset "${asset.nameAr}" retired`, employeeName: user.name || "HR", companyId: user.companyId });
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await buildAssetShape(updated, depts, emps, cats);
    res.json({ success: true, data: shaped });
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
app.get("/api/lookups/violation-types", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const rows = await db
      .select()
      .from(violationTypesTable)
      .where(and(
        eq(violationTypesTable.companyId, user.companyId),
        eq(violationTypesTable.isActive, true),
        eq(violationTypesTable.isDeleted, false)
      ))
      .orderBy(asc(violationTypesTable.nameAr));
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[/api/lookups/violation-types]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
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
  { key: "compliance_warning_days", value: "30", category: "compliance", description: "Days before expiry to show warning" },
  { key: "health_certificate_required", value: "true", category: "compliance", description: "Health certificate required for all employees" },
  { key: "criminal_record_required", value: "true", category: "compliance", description: "Criminal record clearance required" },
  { key: "work_permit_required_non_jordanian", value: "true", category: "compliance", description: "Work permit required for non-Jordanian employees" },
  { key: "residency_required_non_jordanian", value: "true", category: "compliance", description: "Residency permit required for non-Jordanian employees" },
  { key: "passport_required_non_jordanian", value: "true", category: "compliance", description: "Passport required for non-Jordanian employees" },
  { key: "social_security_required_active", value: "true", category: "compliance", description: "SSC registration required for all active employees" },
  { key: "social_security_portal_url", value: "", category: "compliance", description: "Social Security Portal URL" },
  { key: "ministry_of_health_portal_url", value: "", category: "compliance", description: "Ministry of Health Portal URL" },
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
    if (!user.employeeId) { res.json({ success: true, data: null }); return; }
    const today = new Date().toISOString().split("T")[0]!;
    const [record] = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, user.employeeId), eq(attendanceRecordsTable.date, today)));
    res.json({ success: true, data: record ?? null });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/map", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const today = new Date().toISOString().split("T")[0]!;
    const conditions: any[] = [eq(attendanceRecordsTable.date, today)];
    if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = deptEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conditions.push(inArray(attendanceRecordsTable.employeeId, ids));
    }
    const rows = await db
      .select({
        id: attendanceRecordsTable.id,
        employeeId: attendanceRecordsTable.employeeId,
        date: attendanceRecordsTable.date,
        clockIn: attendanceRecordsTable.clockIn,
        clockOut: attendanceRecordsTable.clockOut,
        status: attendanceRecordsTable.status,
        attendanceType: attendanceRecordsTable.attendanceType,
        employeeCode: employeesTable.employeeCode,
        fullNameAr: sql<string>`concat(${employeesTable.firstNameAr}, ' ', ${employeesTable.lastNameAr})`,
        fullNameEn: sql<string>`concat(${employeesTable.firstNameEn}, ' ', ${employeesTable.lastNameEn})`,
      })
      .from(attendanceRecordsTable)
      .leftJoin(employeesTable, eq(attendanceRecordsTable.employeeId, employeesTable.id))
      .where(and(...conditions));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/locations", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

app.post("/api/attendance/locations", auth, async (req, res) => {
  res.status(201).json({ success: true, data: { id: 1, ...req.body } });
});

app.delete("/api/attendance/locations/:id", auth, async (_req, res) => {
  res.json({ success: true });
});

// ─── Documents extra endpoints ─────────────────────────────────────────────────
app.get("/api/documents/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const scopeConds: any[] = [eq(documentsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: { total: 0, expiringSoon: 0, expired: 0, missing: 0 } }); return; }
      scopeConds.push(eq(documentsTable.employeeId, user.employeeId));
    } else {
      scopeConds.push(eq(documentsTable.companyId, user.companyId));
    }
    const docs = await db.select({ expiresAt: documentsTable.expiresAt, alertDaysBefore: documentTypesTable.alertDaysBefore })
      .from(documentsTable)
      .innerJoin(documentTypesTable, eq(documentsTable.documentTypeId, documentTypesTable.id))
      .where(and(...scopeConds));
    let expiringSoon = 0, expired = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const d of docs) {
      if (!d.expiresAt) continue;
      const expiry = new Date(d.expiresAt);
      const soon = new Date(today); soon.setDate(today.getDate() + (d.alertDaysBefore ?? 30));
      if (expiry < today) expired++;
      else if (expiry <= soon) expiringSoon++;
    }
    res.json({ success: true, data: { total: docs.length, expiringSoon, expired, missing: 0 } });
  } catch (e) {
    console.error("[GET /api/documents/summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/documents/expiring", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { days = "30" } = req.query as Record<string, string>;
    const today = new Date().toISOString().split("T")[0]!;
    const future = new Date();
    future.setDate(future.getDate() + parseInt(days));
    const futureStr = future.toISOString().split("T")[0]!;
    const conditions: any[] = [
      eq(documentsTable.isDeleted, false),
      gte(documentsTable.expiresAt, today),
      lte(documentsTable.expiresAt, futureStr),
    ];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(documentsTable.employeeId, user.employeeId));
    } else {
      conditions.push(eq(documentsTable.companyId, user.companyId));
    }
    const docs = await fetchDocumentsJoined(conditions);
    res.json({ success: true, data: docs });
  } catch (e) {
    console.error("[GET /api/documents/expiring]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/documents/export", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const conditions: any[] = [eq(documentsTable.isDeleted, false)];
    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conditions.push(eq(documentsTable.employeeId, user.employeeId));
    } else {
      conditions.push(eq(documentsTable.companyId, user.companyId));
    }
    const docs = await fetchDocumentsJoined(conditions);
    res.json({ success: true, data: docs });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/documents/upload — real file upload via multipart [auth required]
app.post("/api/documents/upload", auth, (req, res) => {
  const user = (req as AuthReq).user;
  docUpload.single("file")(req, res, async (err) => {
    if (err) {
      const msg = err instanceof multer.MulterError
        ? (err.code === "LIMIT_FILE_SIZE" ? "File exceeds 5 MB limit" : err.message)
        : err.message;
      res.status(400).json({ success: false, message: msg }); return;
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ success: false, message: "No file provided" }); return;
    }
    const employeeId = (req.body as any).employeeId;
    if (!employeeId) {
      fs.unlink(file.path, () => {});
      res.status(400).json({ success: false, message: "employeeId is required" }); return;
    }
    if (user.role === "employee" && Number(employeeId) !== user.employeeId) {
      fs.unlink(file.path, () => {});
      res.status(403).json({ success: false, message: "Employees can only upload their own files" }); return;
    }
    const fileUrl = `/uploads/${file.filename}`;
    res.json({ success: true, data: { fileName: file.originalname, fileUrl, fileSize: file.size, mimeType: file.mimetype } });
  });
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
    // Enforce employeeId from JWT for employee role — prevent forging
    const employeeId = user.role === "employee"
      ? user.employeeId
      : (req.body.employeeId ?? user.employeeId);
    if (!employeeId) { res.status(400).json({ success: false, message: "employeeId is required" }); return; }
    const { date, hours, reason } = req.body;
    if (!date) { res.status(400).json({ success: false, message: "Date is required" }); return; }
    if (!hours || Number(hours) <= 0) { res.status(400).json({ success: false, message: "Hours must be greater than 0" }); return; }
    const [row] = await db.insert(overtimeRequestsTable).values({ employeeId, date, hours: Number(hours), reason, status: "pending" }).returning();
    const otPayload = {
      companyId: user.companyId, actorUserId: user.userId,
      entityType: "overtime_request", entityId: row.id,
      notificationType: "overtime_request_created",
      titleAr: "طلب عمل إضافي جديد", titleEn: "New Overtime Request",
      messageAr: `قدّم ${user.username} طلب عمل إضافي بتاريخ ${row.date} (${row.hours} ساعات).`,
      messageEn: `${user.username} submitted an overtime request on ${row.date} (${row.hours} hrs).`,
      priority: "normal" as const, actionUrl: "/app/overtime",
    };
    await notifyRole(user.companyId, "hradmin", otPayload);
    await notifyDirectManager(employeeId, otPayload);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/overtime]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── Shared handler: approve overtime request ────────────────────────────────
async function handleOvertimeApprove(req: any, res: any) {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "manager" && user.role !== "hradmin") {
      res.status(403).json({ success: false, message: "Only managers or HR administrators can approve overtime requests" }); return;
    }
    const requestId = parseInt(req.params["id"]!);
    const [ot] = await db.select().from(overtimeRequestsTable).where(eq(overtimeRequestsTable.id, requestId));
    if (!ot) { res.status(404).json({ success: false, message: "Overtime request not found" }); return; }

    if (user.role === "manager") {
      if (ot.status !== "pending") {
        res.status(400).json({ success: false, message: "Only pending requests can be approved by a manager" }); return;
      }
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(eq(employeesTable.id, ot.employeeId), eq(employeesTable.isDeleted, false), ...scopeConds));
      if (!emp) { res.status(403).json({ success: false, message: "Not authorized to approve this employee's request" }); return; }
      const [updated] = await db.update(overtimeRequestsTable).set({ status: "manager_approved", managerApprovedById: user.userId, managerApprovedAt: new Date() })
        .where(eq(overtimeRequestsTable.id, requestId)).returning();
      await notifyRole(user.companyId, "hradmin", {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "overtime_request", entityId: requestId,
        notificationType: "overtime_manager_approved",
        titleAr: "طلب عمل إضافي بانتظار موافقة الموارد البشرية",
        titleEn: "Overtime Request Awaiting HR Approval",
        messageAr: `وافق المدير على طلب عمل إضافي بتاريخ ${ot.date}. يحتاج إلى موافقة الموارد البشرية.`,
        messageEn: `Manager approved an overtime request on ${ot.date}. Awaiting HR approval.`,
        priority: "normal" as const, actionUrl: "/app/overtime",
      });
      res.json({ success: true, data: updated }); return;
    }
    // hradmin
    if (ot.status !== "pending" && ot.status !== "manager_approved") {
      res.status(400).json({ success: false, message: "Request cannot be approved in its current state" }); return;
    }
    const [updated] = await db.update(overtimeRequestsTable).set({ status: "approved", hrApprovedById: user.userId, hrApprovedAt: new Date() })
      .where(eq(overtimeRequestsTable.id, requestId)).returning();
    if (updated?.employeeId) {
      await notifyEmployee(updated.employeeId, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "overtime_request", entityId: updated.id,
        notificationType: "overtime_request_approved",
        titleAr: "تمت الموافقة على طلب العمل الإضافي",
        titleEn: "Overtime Request Approved",
        messageAr: `تمت الموافقة على طلب العمل الإضافي بتاريخ ${updated.date}.`,
        messageEn: `Your overtime request on ${updated.date} was approved.`,
        priority: "high", actionUrl: "/app/overtime",
      });
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[overtime/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

// ── Shared handler: reject overtime request ─────────────────────────────────
async function handleOvertimeReject(req: any, res: any) {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "manager" && user.role !== "hradmin") {
      res.status(403).json({ success: false, message: "Only managers or HR administrators can reject overtime requests" }); return;
    }
    const requestId = parseInt(req.params["id"]!);
    const [ot] = await db.select().from(overtimeRequestsTable).where(eq(overtimeRequestsTable.id, requestId));
    if (!ot) { res.status(404).json({ success: false, message: "Overtime request not found" }); return; }
    if (["approved", "rejected", "cancelled"].includes(ot.status)) {
      res.status(400).json({ success: false, message: "Request cannot be rejected in its current state" }); return;
    }
    if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(eq(employeesTable.id, ot.employeeId), eq(employeesTable.isDeleted, false), ...scopeConds));
      if (!emp) { res.status(403).json({ success: false, message: "Not authorized to reject this employee's request" }); return; }
    }
    const reason = req.body.reason ?? req.body.notes;
    const [updated] = await db.update(overtimeRequestsTable).set({ status: "rejected", rejectionReason: reason })
      .where(eq(overtimeRequestsTable.id, requestId)).returning();
    if (updated?.employeeId) {
      await notifyEmployee(updated.employeeId, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId,
        entityType: "overtime_request", entityId: updated.id,
        notificationType: "overtime_request_rejected",
        titleAr: "تم رفض طلب العمل الإضافي",
        titleEn: "Overtime Request Rejected",
        messageAr: `تم رفض طلب العمل الإضافي بتاريخ ${updated.date}.`,
        messageEn: `Your overtime request on ${updated.date} was rejected.`,
        priority: "high", actionUrl: "/app/overtime",
      });
    }
    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[overtime/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}

app.post("/api/overtime/:id/approve", auth, handleOvertimeApprove);
app.post("/api/overtime/:id/reject", auth, handleOvertimeReject);

// ─── Disciplinary ─────────────────────────────────────────────────────────────

// Helper: build a full case shape with JOINs
async function buildCaseShape(caseRow: any, companyId: number) {
  const [emp] = await db
    .select({
      id: employeesTable.id,
      employeeCode: employeesTable.employeeCode,
      firstNameAr: employeesTable.firstNameAr,
      lastNameAr: employeesTable.lastNameAr,
      firstNameEn: employeesTable.firstNameEn,
      lastNameEn: employeesTable.lastNameEn,
      departmentId: employeesTable.departmentId,
      directManagerId: employeesTable.directManagerId,
    })
    .from(employeesTable)
    .where(eq(employeesTable.id, caseRow.employeeId));

  const [vt] = await db
    .select()
    .from(violationTypesTable)
    .where(eq(violationTypesTable.id, caseRow.violationTypeId));

  let departmentAr = '';
  if (emp?.departmentId) {
    const [dept] = await db
      .select({ nameAr: departmentsTable.nameAr })
      .from(departmentsTable)
      .where(eq(departmentsTable.id, emp.departmentId));
    departmentAr = dept?.nameAr ?? '';
  }

  return {
    id: caseRow.id,
    employeeId: caseRow.employeeId,
    employeeCode: emp?.employeeCode ?? '',
    employeeNameAr: emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : '',
    employeeNameEn: emp ? `${emp.firstNameEn} ${emp.lastNameEn}` : '',
    departmentAr,
    violationTypeId: caseRow.violationTypeId,
    violationNameAr: vt?.nameAr ?? '',
    violationNameEn: vt?.nameEn ?? '',
    violationCode: vt?.code ?? '',
    availablePenaltiesJson: vt?.availablePenaltiesJson ?? null,
    violationDate: caseRow.violationDate,
    violationDescription: caseRow.violationDescription,
    penaltyType: caseRow.penaltyType,
    penaltyDays: caseRow.penaltyDays,
    salaryDeductionAmount: caseRow.salaryDeductionAmount,
    actionDeadline: caseRow.actionDeadline,
    issuedDate: caseRow.issuedDate,
    status: caseRow.status,
    employeeAcknowledgment: caseRow.employeeAcknowledgment,
    previousViolationsCount: caseRow.previousViolationsCount,
    decisionDate: caseRow.decisionDate,
    notes: caseRow.notes,
    reportedBy: caseRow.reportedBy,
    createdByUserId: caseRow.createdByUserId,
    createdAt: caseRow.createdAt,
    updatedAt: caseRow.updatedAt,
  };
}

// GET /api/disciplinary — list cases (HR: all company; employee: own; manager: 403 by default)
app.get("/api/disciplinary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    let conditions: any[] = [
      eq(disciplinaryCasesTable.companyId, user.companyId),
      eq(disciplinaryCasesTable.isDeleted, false),
    ];

    if (user.role === "employee") {
      if (!user.employeeId) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      conditions.push(eq(disciplinaryCasesTable.employeeId, user.employeeId));
    } else if (!["hradmin", "superadmin", "admin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    const { status, violationTypeId, employeeId } = req.query as Record<string, string>;
    if (status) conditions.push(eq(disciplinaryCasesTable.status, status));
    if (violationTypeId) conditions.push(eq(disciplinaryCasesTable.violationTypeId, +violationTypeId));
    if (employeeId && user.role !== "employee") conditions.push(eq(disciplinaryCasesTable.employeeId, +employeeId));

    const rows = await db
      .select()
      .from(disciplinaryCasesTable)
      .where(and(...conditions))
      .orderBy(desc(disciplinaryCasesTable.createdAt));

    const shaped = await Promise.all(rows.map(r => buildCaseShape(r, user.companyId)));
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[GET /api/disciplinary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/disciplinary/stats
app.get("/api/disciplinary/stats", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "superadmin", "admin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    const rows = await db
      .select({ status: disciplinaryCasesTable.status, actionDeadline: disciplinaryCasesTable.actionDeadline })
      .from(disciplinaryCasesTable)
      .where(and(
        eq(disciplinaryCasesTable.companyId, user.companyId),
        eq(disciplinaryCasesTable.isDeleted, false)
      ));

    const today = new Date().toISOString().slice(0, 10);
    const total = rows.length;
    const open = rows.filter(r => r.status === "open").length;
    const investigating = rows.filter(r => r.status === "investigating").length;
    const overdue = rows.filter(r =>
      ["open", "investigating"].includes(r.status) &&
      r.actionDeadline && String(r.actionDeadline) < today
    ).length;

    res.json({ success: true, data: { total, open, investigating, overdue } });
  } catch (e) {
    console.error("[GET /api/disciplinary/stats]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/disciplinary/violations — list violation types for settings page (HR only)
app.get("/api/disciplinary/violations", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!requireHR(req, res)) return;
    const rows = await db
      .select()
      .from(violationTypesTable)
      .where(and(
        eq(violationTypesTable.companyId, user.companyId),
        eq(violationTypesTable.isDeleted, false)
      ))
      .orderBy(asc(violationTypesTable.nameAr));
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /api/disciplinary/violations]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/disciplinary/violations — create violation type (HR only)
app.post("/api/disciplinary/violations", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { nameAr, nameEn, code } = req.body;

    if (!nameAr?.trim()) { res.status(400).json({ success: false, message: "Arabic name is required" }); return; }
    if (!code?.trim()) { res.status(400).json({ success: false, message: "Code is required" }); return; }

    const normalizedCode = String(code).trim().toLowerCase().replace(/\s+/g, '_');
    const [existing] = await db
      .select({ id: violationTypesTable.id })
      .from(violationTypesTable)
      .where(and(
        eq(violationTypesTable.companyId, user.companyId),
        eq(violationTypesTable.code, normalizedCode),
        eq(violationTypesTable.isDeleted, false)
      ));
    if (existing) { res.status(409).json({ success: false, message: "A violation type with this code already exists" }); return; }

    const [created] = await db.insert(violationTypesTable).values({
      companyId: user.companyId,
      code: normalizedCode,
      nameAr: nameAr.trim(),
      nameEn: nameEn?.trim() || null,
    }).returning();

    await db.insert(activityLogsTable).values({
      type: "violation_type_created",
      description: `Violation type "${nameAr}" (${normalizedCode}) created`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.status(201).json({ success: true, data: created });
  } catch (e) {
    console.error("[POST /api/disciplinary/violations]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/violations/:id — update violation type (HR only)
app.put("/api/disciplinary/violations/:id", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;
    const { nameAr, nameEn } = req.body;

    const [vt] = await db
      .select()
      .from(violationTypesTable)
      .where(and(eq(violationTypesTable.id, id), eq(violationTypesTable.companyId, user.companyId), eq(violationTypesTable.isDeleted, false)));
    if (!vt) { res.status(404).json({ success: false, message: "Violation type not found" }); return; }

    const [updated] = await db.update(violationTypesTable)
      .set({ nameAr: nameAr?.trim() || vt.nameAr, nameEn: nameEn?.trim() || vt.nameEn, updatedAt: new Date() })
      .where(eq(violationTypesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "violation_type_updated",
      description: `Violation type "${updated.nameAr}" (${updated.code}) updated`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[PUT /api/disciplinary/violations/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/violations/:id/toggle — toggle active status (HR only)
app.put("/api/disciplinary/violations/:id/toggle", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;

    const [vt] = await db
      .select()
      .from(violationTypesTable)
      .where(and(eq(violationTypesTable.id, id), eq(violationTypesTable.companyId, user.companyId), eq(violationTypesTable.isDeleted, false)));
    if (!vt) { res.status(404).json({ success: false, message: "Violation type not found" }); return; }

    const [updated] = await db.update(violationTypesTable)
      .set({ isActive: !vt.isActive, updatedAt: new Date() })
      .where(eq(violationTypesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "violation_type_updated",
      description: `Violation type "${vt.nameAr}" ${updated.isActive ? 'activated' : 'deactivated'}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[PUT /api/disciplinary/violations/:id/toggle]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/disciplinary/employee/:id/history — employee violation history (HR only)
app.get("/api/disciplinary/employee/:id/history", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = +req.params.id;

    // Verify employee belongs to company
    const [emp] = await db
      .select({ id: employeesTable.id, companyId: employeesTable.companyId })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    const cases = await db
      .select({
        id: disciplinaryCasesTable.id,
        violationDate: disciplinaryCasesTable.violationDate,
        penaltyType: disciplinaryCasesTable.penaltyType,
        status: disciplinaryCasesTable.status,
        violationTypeId: disciplinaryCasesTable.violationTypeId,
      })
      .from(disciplinaryCasesTable)
      .where(and(
        eq(disciplinaryCasesTable.employeeId, empId),
        eq(disciplinaryCasesTable.companyId, user.companyId),
        eq(disciplinaryCasesTable.isDeleted, false)
      ))
      .orderBy(desc(disciplinaryCasesTable.violationDate));

    const totalCases = cases.length;
    // Suggest next penalty level based on previous warnings
    const penaltyOrder = ['warning_verbal','warning_written','warning_written_2','warning_final','termination'];
    const warnings = cases.filter(c => c.penaltyType?.startsWith('warning_')).length;
    const suggested = penaltyOrder[Math.min(warnings, penaltyOrder.length - 1)];

    res.json({ success: true, data: { totalCases, suggested, cases } });
  } catch (e) {
    console.error("[GET /api/disciplinary/employee/:id/history]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/disciplinary/:id — case detail (HR or own employee)
app.get("/api/disciplinary/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = +req.params.id;

    const conditions: any[] = [
      eq(disciplinaryCasesTable.id, id),
      eq(disciplinaryCasesTable.companyId, user.companyId),
      eq(disciplinaryCasesTable.isDeleted, false),
    ];
    if (user.role === "employee") {
      if (!user.employeeId) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      conditions.push(eq(disciplinaryCasesTable.employeeId, user.employeeId));
    } else if (!["hradmin", "superadmin", "admin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    const [caseRow] = await db.select().from(disciplinaryCasesTable).where(and(...conditions));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }

    const base = await buildCaseShape(caseRow, user.companyId);

    // Get employee details
    const [emp] = await db
      .select({
        id: employeesTable.id,
        employeeCode: employeesTable.employeeCode,
        firstNameAr: employeesTable.firstNameAr,
        lastNameAr: employeesTable.lastNameAr,
        directManagerId: employeesTable.directManagerId,
        departmentId: employeesTable.departmentId,
      })
      .from(employeesTable)
      .where(eq(employeesTable.id, caseRow.employeeId));

    let managerDetail = null;
    if (emp?.directManagerId) {
      const [mgr] = await db
        .select({ id: employeesTable.id, firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr })
        .from(employeesTable)
        .where(eq(employeesTable.id, emp.directManagerId));
      if (mgr) managerDetail = { id: mgr.id, nameAr: `${mgr.firstNameAr} ${mgr.lastNameAr}` };
    }

    // Get investigation if exists
    const [inv] = await db
      .select()
      .from(disciplinaryInvestigationsTable)
      .where(eq(disciplinaryInvestigationsTable.caseId, id));

    // Get previous cases for this employee (excluding current)
    const prevCases = await db
      .select({
        id: disciplinaryCasesTable.id,
        violationDate: disciplinaryCasesTable.violationDate,
        penaltyType: disciplinaryCasesTable.penaltyType,
        status: disciplinaryCasesTable.status,
        violationTypeId: disciplinaryCasesTable.violationTypeId,
      })
      .from(disciplinaryCasesTable)
      .where(and(
        eq(disciplinaryCasesTable.employeeId, caseRow.employeeId),
        eq(disciplinaryCasesTable.companyId, user.companyId),
        eq(disciplinaryCasesTable.isDeleted, false),
        ne(disciplinaryCasesTable.id, id)
      ))
      .orderBy(desc(disciplinaryCasesTable.violationDate));

    const vtRows = prevCases.length > 0
      ? await db.select().from(violationTypesTable)
          .where(inArray(violationTypesTable.id, prevCases.map(p => p.violationTypeId)))
      : [];
    const vtMap = Object.fromEntries(vtRows.map(v => [v.id, v]));

    res.json({
      success: true,
      data: {
        ...base,
        reportedBy: caseRow.reportedBy,
        employee: {
          employeeId: emp?.id,
          employeeCode: emp?.employeeCode,
          nameAr: emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : '',
          department: base.departmentAr,
          manager: managerDetail,
        },
        investigation: inv ? {
          id: inv.id,
          hrNotes: inv.hrNotes,
          employeeStatement: inv.employeeStatement,
          managerStatement: inv.managerStatement,
          investigationDate: inv.investigationDate,
          outcome: inv.outcome,
        } : null,
        previousCases: prevCases.map(p => ({
          id: p.id,
          violationDate: p.violationDate,
          penaltyType: p.penaltyType,
          status: p.status,
          violationNameAr: vtMap[p.violationTypeId]?.nameAr ?? '',
        })),
      },
    });
  } catch (e) {
    console.error("[GET /api/disciplinary/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/disciplinary — create case (HR only)
app.post("/api/disciplinary", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const {
      employeeId, violationTypeId, violationDate, violationDescription,
      penaltyType, notes, reportedBy, asDraft
    } = req.body;

    if (!employeeId) { res.status(400).json({ success: false, message: "Employee is required" }); return; }
    if (!violationTypeId) { res.status(400).json({ success: false, message: "Violation type is required" }); return; }
    if (!violationDate) { res.status(400).json({ success: false, message: "Violation date is required" }); return; }
    if (!violationDescription?.trim()) { res.status(400).json({ success: false, message: "Description is required" }); return; }

    // Verify employee belongs to company
    const [emp] = await db
      .select({ id: employeesTable.id, companyId: employeesTable.companyId })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, +employeeId), eq(employeesTable.companyId, user.companyId)));
    if (!emp) { res.status(400).json({ success: false, message: "Employee not found in your company" }); return; }

    // Verify violation type belongs to company
    const [vt] = await db
      .select({ id: violationTypesTable.id })
      .from(violationTypesTable)
      .where(and(eq(violationTypesTable.id, +violationTypeId), eq(violationTypesTable.companyId, user.companyId), eq(violationTypesTable.isDeleted, false)));
    if (!vt) { res.status(400).json({ success: false, message: "Invalid violation type" }); return; }

    // Count previous cases for this employee
    const prevCount = await db.$count(disciplinaryCasesTable,
      and(
        eq(disciplinaryCasesTable.employeeId, +employeeId),
        eq(disciplinaryCasesTable.companyId, user.companyId),
        eq(disciplinaryCasesTable.isDeleted, false)
      )
    );

    const status = asDraft ? "draft" : "open";
    const issuedDate = new Date().toISOString().slice(0, 10);
    // Action deadline: 14 days from violation date
    const vDate = new Date(`${violationDate}T00:00:00`);
    const deadline = new Date(vDate.getTime() + 14 * 86400000).toISOString().slice(0, 10);

    const [created] = await db.insert(disciplinaryCasesTable).values({
      companyId: user.companyId,
      employeeId: +employeeId,
      violationTypeId: +violationTypeId,
      violationDate,
      violationDescription: violationDescription.trim(),
      penaltyType: penaltyType || "warning_verbal",
      notes: notes || null,
      reportedBy: reportedBy || null,
      actionDeadline: deadline,
      issuedDate,
      status,
      previousViolationsCount: prevCount,
      createdByUserId: user.userId,
    }).returning();

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_created",
      description: `Disciplinary case #${created.id} created for employee ID ${employeeId} (${status})`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    // Notify employee if case is open (not draft)
    if (status === "open") {
      await notifyEmployee(+employeeId, user.companyId, {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "disciplinary_case",
        entityId: created.id,
        notificationType: "disciplinary_case_opened",
        titleAr: "قضية تأديبية جديدة",
        titleEn: "New Disciplinary Case",
        messageAr: "تم فتح قضية تأديبية بحقك. يرجى مراجعة قسم الموارد البشرية.",
        messageEn: "A disciplinary case has been opened against you. Please contact HR.",
        priority: "high",
        actionUrl: `/app/disciplinary`,
      });
    }

    const shaped = await buildCaseShape(created, user.companyId);
    res.status(201).json({ success: true, data: shaped });
  } catch (e) {
    console.error("[POST /api/disciplinary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/investigation — save investigation notes (HR only)
app.put("/api/disciplinary/:id/investigation", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;
    const { hrNotes, employeeStatement, managerStatement, investigationDate, outcome } = req.body;

    const [caseRow] = await db.select().from(disciplinaryCasesTable)
      .where(and(eq(disciplinaryCasesTable.id, id), eq(disciplinaryCasesTable.companyId, user.companyId), eq(disciplinaryCasesTable.isDeleted, false)));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }
    if (caseRow.status === "closed" || caseRow.status === "cancelled") {
      res.status(409).json({ success: false, message: "Cannot modify a closed or cancelled case" }); return;
    }

    // Upsert investigation
    const [existing] = await db.select({ id: disciplinaryInvestigationsTable.id })
      .from(disciplinaryInvestigationsTable)
      .where(eq(disciplinaryInvestigationsTable.caseId, id));

    if (existing) {
      await db.update(disciplinaryInvestigationsTable)
        .set({ hrNotes, employeeStatement, managerStatement, investigationDate: investigationDate || null, outcome: outcome || "pending", updatedAt: new Date() })
        .where(eq(disciplinaryInvestigationsTable.id, existing.id));
    } else {
      await db.insert(disciplinaryInvestigationsTable).values({
        caseId: id, companyId: user.companyId, hrNotes, employeeStatement, managerStatement,
        investigationDate: investigationDate || null, outcome: outcome || "pending",
      });
    }

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_investigation_started",
      description: `Investigation for case #${id} updated (outcome: ${outcome || 'pending'})`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, message: "Investigation saved successfully" });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/investigation]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/decision — record final decision (HR only)
app.put("/api/disciplinary/:id/decision", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;
    const { penaltyType, penaltyDays, salaryDeductionAmount, decisionDate, notes } = req.body;

    const [caseRow] = await db.select().from(disciplinaryCasesTable)
      .where(and(eq(disciplinaryCasesTable.id, id), eq(disciplinaryCasesTable.companyId, user.companyId), eq(disciplinaryCasesTable.isDeleted, false)));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }
    if (caseRow.status === "closed" || caseRow.status === "cancelled") {
      res.status(409).json({ success: false, message: "Cannot modify a closed or cancelled case" }); return;
    }

    const [updated] = await db.update(disciplinaryCasesTable)
      .set({
        penaltyType: penaltyType || caseRow.penaltyType,
        penaltyDays: penaltyDays ?? caseRow.penaltyDays,
        salaryDeductionAmount: salaryDeductionAmount ?? caseRow.salaryDeductionAmount,
        decisionDate: decisionDate || null,
        notes: notes || caseRow.notes,
        status: "decided",
        updatedAt: new Date(),
      })
      .where(eq(disciplinaryCasesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_updated",
      description: `Decision recorded for case #${id}: ${penaltyType} (status: decided)`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    // Notify employee of decision
    await notifyEmployee(caseRow.employeeId, user.companyId, {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "disciplinary_case",
      entityId: id,
      notificationType: "disciplinary_case_decided",
      titleAr: "قرار في قضيتك التأديبية",
      titleEn: "Decision on Your Disciplinary Case",
      messageAr: "تم اتخاذ قرار في القضية التأديبية المتعلقة بك.",
      messageEn: "A decision has been made on your disciplinary case.",
      priority: "high",
      actionUrl: `/app/disciplinary`,
    });

    const shaped = await buildCaseShape(updated, user.companyId);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/decision]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/status — change status (e.g. open → investigating) (HR only)
app.put("/api/disciplinary/:id/status", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;
    const { status } = req.body;

    const allowedStatuses = ["draft","open","investigating","decided","closed","cancelled"];
    if (!status || !allowedStatuses.includes(status)) {
      res.status(400).json({ success: false, message: "Invalid status" }); return;
    }

    const [caseRow] = await db.select().from(disciplinaryCasesTable)
      .where(and(eq(disciplinaryCasesTable.id, id), eq(disciplinaryCasesTable.companyId, user.companyId), eq(disciplinaryCasesTable.isDeleted, false)));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }
    if (caseRow.status === "closed" || caseRow.status === "cancelled") {
      res.status(409).json({ success: false, message: "Cannot change status of a closed or cancelled case" }); return;
    }

    // State machine transitions
    const validTransitions: Record<string, string[]> = {
      draft: ["open", "cancelled"],
      open: ["investigating", "cancelled"],
      investigating: ["decided", "cancelled"],
      decided: ["closed", "cancelled"],
      closed: [],
      cancelled: [],
    };
    if (!validTransitions[caseRow.status]?.includes(status)) {
      res.status(409).json({ success: false, message: `Invalid transition: ${caseRow.status} → ${status}` }); return;
    }

    const [updated] = await db.update(disciplinaryCasesTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(disciplinaryCasesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: `disciplinary_case_${status === "investigating" ? "investigation_started" : status === "decided" ? "updated" : status}`,
      description: `Case #${id} status changed: ${caseRow.status} → ${status}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    const shaped = await buildCaseShape(updated, user.companyId);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/status]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/close — close a case (HR only)
app.put("/api/disciplinary/:id/close", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;

    const [caseRow] = await db.select().from(disciplinaryCasesTable)
      .where(and(eq(disciplinaryCasesTable.id, id), eq(disciplinaryCasesTable.companyId, user.companyId), eq(disciplinaryCasesTable.isDeleted, false)));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }
    if (caseRow.status === "closed") { res.status(409).json({ success: false, message: "Case is already closed" }); return; }
    if (caseRow.status === "cancelled") { res.status(409).json({ success: false, message: "Cannot close a cancelled case" }); return; }

    const [updated] = await db.update(disciplinaryCasesTable)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(disciplinaryCasesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_closed",
      description: `Case #${id} closed`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    // Notify employee
    await notifyEmployee(caseRow.employeeId, user.companyId, {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "disciplinary_case",
      entityId: id,
      notificationType: "disciplinary_case_closed",
      titleAr: "تم إغلاق قضيتك التأديبية",
      titleEn: "Your Disciplinary Case Has Been Closed",
      messageAr: "تم إغلاق القضية التأديبية المتعلقة بك.",
      messageEn: "Your disciplinary case has been closed.",
      priority: "normal",
      actionUrl: `/app/disciplinary`,
    });

    const shaped = await buildCaseShape(updated, user.companyId);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/close]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/cancel — cancel a case (HR only)
app.put("/api/disciplinary/:id/cancel", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const id = +req.params.id;

    const [caseRow] = await db.select().from(disciplinaryCasesTable)
      .where(and(eq(disciplinaryCasesTable.id, id), eq(disciplinaryCasesTable.companyId, user.companyId), eq(disciplinaryCasesTable.isDeleted, false)));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }
    if (caseRow.status === "closed") { res.status(409).json({ success: false, message: "Cannot cancel a closed case" }); return; }
    if (caseRow.status === "cancelled") { res.status(409).json({ success: false, message: "Case is already cancelled" }); return; }

    const [updated] = await db.update(disciplinaryCasesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(disciplinaryCasesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_cancelled",
      description: `Case #${id} cancelled`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    const shaped = await buildCaseShape(updated, user.companyId);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/cancel]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/disciplinary/:id/acknowledge — employee acknowledges case (HR or self)
app.put("/api/disciplinary/:id/acknowledge", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = +req.params.id;

    const conditions: any[] = [
      eq(disciplinaryCasesTable.id, id),
      eq(disciplinaryCasesTable.companyId, user.companyId),
      eq(disciplinaryCasesTable.isDeleted, false),
    ];
    if (user.role === "employee") {
      if (!user.employeeId) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      conditions.push(eq(disciplinaryCasesTable.employeeId, user.employeeId));
    } else if (!["hradmin", "superadmin", "admin"].includes(user.role)) {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    const [caseRow] = await db.select().from(disciplinaryCasesTable).where(and(...conditions));
    if (!caseRow) { res.status(404).json({ success: false, message: "Case not found" }); return; }

    const [updated] = await db.update(disciplinaryCasesTable)
      .set({ employeeAcknowledgment: true, updatedAt: new Date() })
      .where(eq(disciplinaryCasesTable.id, id))
      .returning();

    await db.insert(activityLogsTable).values({
      type: "disciplinary_case_updated",
      description: `Employee acknowledged case #${id}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    const shaped = await buildCaseShape(updated, user.companyId);
    res.json({ success: true, data: shaped });
  } catch (e) {
    console.error("[PUT /api/disciplinary/:id/acknowledge]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Resignations ─────────────────────────────────────────────────────────────
// Approval workflow steps:
//   step 1 — HR (hradmin)        : pending       → hr_approved
//   step 2 — Manager (manager)   : hr_approved   → manager_approved
//   step 3 — Finance (payroll)   : manager_approved → active_notice
// Start clearance  (HR only)     : active_notice → clearance
// Complete         (HR only)     : clearance     → completed
// Reject (any active step)       : any → rejected
//
// Status set that counts as terminal (no transitions out):
const RESIGNATION_TERMINAL = new Set(["completed", "rejected", "withdrawn"]);

// Build joined resignation list row shape from a raw DB row + joined data
async function buildResignationRow(r: any, userId: number, userRole: string, userEmpId: number | null) {
  const [emp] = await db.select({
    id: employeesTable.id,
    code: employeesTable.employeeCode,
    nameAr: sql<string>`${employeesTable.firstNameAr} || ' ' || ${employeesTable.lastNameAr}`,
    departmentId: employeesTable.departmentId,
    orgNodeId: employeesTable.orgNodeId,
    jobTitleId: employeesTable.jobTitleId,
    directManagerId: employeesTable.directManagerId,
  }).from(employeesTable).where(eq(employeesTable.id, r.employeeId)).limit(1);

  const dept = emp?.departmentId
    ? (await db.select({ nameAr: departmentsTable.nameAr, nameEn: departmentsTable.nameEn }).from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId)).limit(1))[0]
    : null;

  const orgNode = emp?.orgNodeId
    ? (await db.select({ nameAr: orgNodesTable.nameAr, nameEn: orgNodesTable.nameEn, nodeType: orgNodesTable.nodeType }).from(orgNodesTable).where(eq(orgNodesTable.id, emp.orgNodeId)).limit(1))[0]
    : null;

  const jobTitle = emp?.jobTitleId
    ? (await db.select({ titleAr: jobTitlesTable.titleAr }).from(jobTitlesTable).where(eq(jobTitlesTable.id, emp.jobTitleId)).limit(1))[0]
    : null;

  // notice progress (0-100)
  let noticeProgress = 0;
  if (r.noticeTimerStart && r.noticeTimerEnd) {
    const start = new Date(r.noticeTimerStart).getTime();
    const end = new Date(r.noticeTimerEnd).getTime();
    const now = Date.now();
    if (end > start) noticeProgress = Math.min(100, Math.max(0, Math.round((now - start) / (end - start) * 100)));
  }

  // canCurrentUserApprove/Reject
  let canCurrentUserApprove = false;
  let canCurrentUserReject = false;
  let currentApprovalStep: number | null = r.currentApprovalStep;
  let currentApprovalLabel: string | null = null;

  if (!RESIGNATION_TERMINAL.has(r.status) && currentApprovalStep) {
    const stepRoleMap: Record<number, string> = { 1: "hradmin", 2: "manager", 3: "payrolladmin" };
    const stepLabels: Record<number, string> = { 1: "مراجعة الموارد البشرية", 2: "موافقة المدير", 3: "اعتماد المالية" };
    const expectedRole = stepRoleMap[currentApprovalStep];
    currentApprovalLabel = stepLabels[currentApprovalStep] ?? null;
    if (userRole === expectedRole) {
      canCurrentUserApprove = true;
      canCurrentUserReject = true;
    }
  }

  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeCode: emp?.code ?? "",
    employeeNameAr: emp?.nameAr ?? "",
    departmentAr: dept?.nameAr ?? "",
    departmentEn: dept?.nameEn ?? "",
    departmentId: emp?.departmentId ?? null,
    orgNodeId: emp?.orgNodeId ?? null,
    orgNodeNameAr: orgNode?.nameAr ?? null,
    orgNodeNameEn: orgNode?.nameEn ?? null,
    orgNodeType: orgNode?.nodeType ?? null,
    jobTitleAr: jobTitle?.titleAr ?? "",
    resignationDate: r.resignationDate,
    lastWorkingDay: r.lastWorkingDay ?? null,
    noticePeriodDays: r.noticePeriodDays ?? 30,
    noticeTimerStart: r.noticeTimerStart ?? null,
    noticeTimerEnd: r.noticeTimerEnd ?? null,
    reason: r.reason ?? null,
    status: r.status,
    noticeProgress,
    currentApprovalStep,
    currentApprovalLabel,
    canCurrentUserApprove,
    canCurrentUserReject,
  };
}

// GET /api/resignations — list
app.get("/api/resignations", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  try {
    const conditions: any[] = [
      eq(resignationsTable.companyId, user.companyId),
      eq(resignationsTable.isDeleted, false),
    ];
    // employees see only own resignations; payroll → 403
    if (user.role === "employee") {
      if (!user.employeeId) return res.status(403).json({ success: false, message: "No employee record" });
      conditions.push(eq(resignationsTable.employeeId, user.employeeId));
    } else if (user.role === "payrolladmin") {
      // payroll can see resignations in read-only (they approve step 3) — allow list
    } else if (!["hradmin", "manager"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const rows = await db.select().from(resignationsTable).where(and(...conditions)).orderBy(desc(resignationsTable.createdAt));
    const data = await Promise.all(rows.map(r => buildResignationRow(r, user.id, user.role, user.employeeId ?? null)));
    res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /api/resignations]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/resignations/stats
app.get("/api/resignations/stats", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!["hradmin", "manager", "payrolladmin"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    const rows = await db.select({ status: resignationsTable.status })
      .from(resignationsTable)
      .where(and(eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)));

    const total = rows.length;
    const pending = rows.filter(r => r.status === "pending").length;
    const activeNotice = rows.filter(r => r.status === "active_notice").length;
    const clearance = rows.filter(r => r.status === "clearance").length;
    const completed = rows.filter(r => r.status === "completed").length;
    const rejected = rows.filter(r => r.status === "rejected").length;

    res.json({ success: true, data: { total, pending, activeNotice, clearance, completed, rejected } });
  } catch (e) {
    console.error("[GET /api/resignations/stats]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/resignations/:id — detail with nested objects
app.get("/api/resignations/:id", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select().from(resignationsTable).where(and(
      eq(resignationsTable.id, id),
      eq(resignationsTable.companyId, user.companyId),
      eq(resignationsTable.isDeleted, false)
    )).limit(1);

    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });

    // employees can only see their own
    if (user.role === "employee") {
      if (r.employeeId !== user.employeeId) return res.status(404).json({ success: false, message: "Resignation not found" });
    } else if (!["hradmin", "manager", "payrolladmin"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    // employee info
    const [emp] = await db.select({
      id: employeesTable.id,
      code: employeesTable.employeeCode,
      nameAr: sql<string>`${employeesTable.firstNameAr} || ' ' || ${employeesTable.lastNameAr}`,
      departmentId: employeesTable.departmentId,
      orgNodeId: employeesTable.orgNodeId,
      jobTitleId: employeesTable.jobTitleId,
    }).from(employeesTable).where(eq(employeesTable.id, r.employeeId)).limit(1);

    const dept = emp?.departmentId
      ? (await db.select({ nameAr: departmentsTable.nameAr, nameEn: departmentsTable.nameEn }).from(departmentsTable).where(eq(departmentsTable.id, emp.departmentId)).limit(1))[0]
      : null;

    const orgNode = emp?.orgNodeId
      ? (await db.select({ nameAr: orgNodesTable.nameAr, nameEn: orgNodesTable.nameEn }).from(orgNodesTable).where(eq(orgNodesTable.id, emp.orgNodeId)).limit(1))[0]
      : null;

    const jobTitle = emp?.jobTitleId
      ? (await db.select({ titleAr: jobTitlesTable.titleAr }).from(jobTitlesTable).where(eq(jobTitlesTable.id, emp.jobTitleId)).limit(1))[0]
      : null;

    // approvals
    const approvalRows = await db.select().from(resignationApprovalsTable)
      .where(and(eq(resignationApprovalsTable.resignationId, id), eq(resignationApprovalsTable.companyId, user.companyId)))
      .orderBy(asc(resignationApprovalsTable.approvalStep));

    const stepRoleMap: Record<number, string> = { 1: "hradmin", 2: "manager", 3: "payrolladmin" };
    const approvals = approvalRows.map(a => ({
      approvalStep: a.approvalStep,
      stepLabel: a.stepLabel,
      approverRole: a.approverRole,
      decision: a.decision,
      notes: a.notes,
      decidedAt: a.decidedAt,
      canAct: a.decision === "pending" && a.approvalStep === r.currentApprovalStep && user.role === stepRoleMap[a.approvalStep ?? 0],
    }));

    // pending assets (currently assigned to this employee)
    const pendingAssets = await db.select({
      id: assetsTable.id,
      assetNameAr: assetsTable.nameAr,
      assetNameEn: assetsTable.nameEn,
      serialNumber: assetsTable.serialNumber,
      categoryId: assetsTable.categoryId,
      assignedDate: assetsTable.assignedDate,
    }).from(assetsTable).where(and(
      eq(assetsTable.assignedToEmployeeId, r.employeeId),
      eq(assetsTable.companyId, user.companyId),
      eq(assetsTable.currentStatus, "assigned"),
      eq(assetsTable.isDeleted, false)
    ));

    // attach category names
    const assetsWithCat = await Promise.all(pendingAssets.map(async a => {
      const cat = a.categoryId
        ? (await db.select({ nameAr: assetCategoriesTable.nameAr, nameEn: assetCategoriesTable.nameEn }).from(assetCategoriesTable).where(eq(assetCategoriesTable.id, a.categoryId)).limit(1))[0]
        : null;
      return { ...a, categoryNameAr: cat?.nameAr ?? null, categoryNameEn: cat?.nameEn ?? null };
    }));

    // notice progress
    let noticeProgress = 0;
    if (r.noticeTimerStart && r.noticeTimerEnd) {
      const start = new Date(r.noticeTimerStart).getTime();
      const end = new Date(r.noticeTimerEnd).getTime();
      const now = Date.now();
      if (end > start) noticeProgress = Math.min(100, Math.max(0, Math.round((now - start) / (end - start) * 100)));
    }

    const detail = {
      id: r.id,
      employeeId: r.employeeId,
      employeeCode: emp?.code ?? "",
      employeeNameAr: emp?.nameAr ?? "",
      departmentAr: dept?.nameAr ?? "",
      departmentEn: dept?.nameEn ?? "",
      departmentId: emp?.departmentId ?? null,
      orgNodeId: emp?.orgNodeId ?? null,
      orgNodeNameAr: orgNode?.nameAr ?? null,
      orgNodeNameEn: orgNode?.nameEn ?? null,
      jobTitleAr: jobTitle?.titleAr ?? "",
      resignationDate: r.resignationDate,
      lastWorkingDay: r.lastWorkingDay ?? null,
      noticePeriodDays: r.noticePeriodDays ?? 30,
      noticeTimerStart: r.noticeTimerStart ?? null,
      noticeTimerEnd: r.noticeTimerEnd ?? null,
      reason: r.reason ?? null,
      status: r.status,
      noticeProgress,
      currentApprovalStep: r.currentApprovalStep,
      pendingAssetsCount: assetsWithCat.length,
      pendingAssets: assetsWithCat,
      employee: {
        nameAr: emp?.nameAr ?? "",
        code: emp?.code ?? "",
        jobTitle: jobTitle?.titleAr ?? "",
        department: dept?.nameAr ?? "",
        orgNodeNameAr: orgNode?.nameAr ?? null,
        orgNodeNameEn: orgNode?.nameEn ?? null,
      },
      approvals,
      exitInterview: {
        leavingReason: r.leavingReason ?? "",
        companyFeedback: r.companyFeedback ?? "",
        interviewDate: r.interviewDate ?? null,
      },
      clearance: {
        remainingSalary: Number(r.remainingSalary ?? 0),
        leavePayout: Number(r.leavePayout ?? 0),
        eosbAmount: Number(r.eosbAmount ?? 0),
        noticeCompensation: Number(r.noticeCompensation ?? 0),
        otherDeductions: Number(r.otherDeductions ?? 0),
        settlementNotes: r.settlementNotes ?? "",
        clearanceItemsJson: r.clearanceItemsJson ?? "[]",
      },
    };

    res.json({ success: true, data: detail });
  } catch (e) {
    console.error("[GET /api/resignations/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/resignations — create
app.post("/api/resignations", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  // employees can create for themselves; HR can create for any employee
  if (!["hradmin", "employee"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    const { employeeId: bodyEmpId, resignationDate, lastWorkingDay, noticePeriodDays, reason } = req.body;

    // resolve employeeId
    let resolvedEmpId: number;
    if (user.role === "employee") {
      if (!user.employeeId) return res.status(400).json({ success: false, message: "No employee record linked to your account" });
      resolvedEmpId = user.employeeId;
    } else {
      if (!bodyEmpId) return res.status(400).json({ success: false, message: "employeeId is required" });
      resolvedEmpId = Number(bodyEmpId);
    }

    if (!resignationDate) return res.status(400).json({ success: false, message: "resignationDate is required" });
    if (!reason || !String(reason).trim()) return res.status(400).json({ success: false, message: "reason is required" });

    // validate employee in company
    const [empCheck] = await db.select({ id: employeesTable.id, employmentStatus: employeesTable.employmentStatus })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, resolvedEmpId), eq(employeesTable.companyId, user.companyId)))
      .limit(1);
    if (!empCheck) return res.status(400).json({ success: false, message: "Employee not found in your company" });
    if (empCheck.employmentStatus !== "active") return res.status(400).json({ success: false, message: "Employee is not currently active" });

    // validate lastWorkingDay >= resignationDate (field validation before duplicate check)
    const noticeDays = Math.max(0, Number(noticePeriodDays ?? 30));
    let resolvedLWD = lastWorkingDay ?? null;
    if (resolvedLWD && resolvedLWD < resignationDate) {
      return res.status(400).json({ success: false, message: "lastWorkingDay cannot be before resignationDate" });
    }

    // block duplicate active resignation
    const existing = await db.select({ id: resignationsTable.id, status: resignationsTable.status })
      .from(resignationsTable).where(and(
        eq(resignationsTable.employeeId, resolvedEmpId),
        eq(resignationsTable.companyId, user.companyId),
        eq(resignationsTable.isDeleted, false),
      )).limit(1);
    if (existing.length > 0 && !RESIGNATION_TERMINAL.has(existing[0].status)) {
      return res.status(409).json({ success: false, message: "Employee already has an active resignation in progress" });
    }
    // compute LWD from notice if not supplied
    if (!resolvedLWD && noticeDays > 0) {
      const d = new Date(resignationDate);
      d.setDate(d.getDate() + noticeDays);
      resolvedLWD = d.toISOString().substring(0, 10);
    }

    const [inserted] = await db.insert(resignationsTable).values({
      companyId: user.companyId,
      employeeId: resolvedEmpId,
      resignationDate,
      lastWorkingDay: resolvedLWD,
      noticePeriodDays: noticeDays,
      noticeTimerStart: resignationDate,
      noticeTimerEnd: resolvedLWD,
      reason: String(reason).substring(0, 2000),
      status: "pending",
      currentApprovalStep: 1,
      createdByUserId: user.id,
    }).returning();

    // create 3 approval stub rows
    const stepDefs = [
      { step: 1, label: "مراجعة الموارد البشرية", role: "hradmin" },
      { step: 2, label: "موافقة المدير", role: "manager" },
      { step: 3, label: "اعتماد المالية", role: "payrolladmin" },
    ];
    for (const s of stepDefs) {
      await db.insert(resignationApprovalsTable).values({
        companyId: user.companyId,
        resignationId: inserted.id,
        approvalStep: s.step,
        stepLabel: s.label,
        approverRole: s.role,
        decision: "pending",
      });
    }

    // audit log
    await db.insert(activityLogsTable).values({
      type: "resignation_created",
      description: `تم تسجيل استقالة جديدة للموظف ID ${resolvedEmpId} (الاستقالة #${inserted.id})`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    // notify employee (confirmation of submission)
    await notifyEmployee(resolvedEmpId, user.companyId, {
      notificationType: "resignation_submitted",
      titleAr: "تم استلام طلب استقالتك",
      titleEn: "Resignation Request Received",
      messageAr: `تم تسجيل طلب استقالتك بتاريخ ${resignationDate}. سيتم مراجعته من قبل الموارد البشرية.`,
      messageEn: `Your resignation request dated ${resignationDate} has been recorded and is pending HR review.`,
      priority: "normal",
      entityType: "resignation",
      entityId: inserted.id,
    });

    const row = await buildResignationRow(inserted, user.id, user.role, user.employeeId ?? null);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/resignations]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/approve — approve current step
app.put("/api/resignations/:id/approve", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!["hradmin", "manager", "payrolladmin"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select().from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });
    if (RESIGNATION_TERMINAL.has(r.status)) return res.status(409).json({ success: false, message: "Resignation is already in a terminal state" });

    const step = r.currentApprovalStep ?? 1;
    const stepRoleMap: Record<number, string> = { 1: "hradmin", 2: "manager", 3: "payrolladmin" };
    const stepStatusMap: Record<number, string> = { 1: "hr_approved", 2: "manager_approved", 3: "active_notice" };
    if (user.role !== stepRoleMap[step]) {
      return res.status(403).json({ success: false, message: `This step requires role: ${stepRoleMap[step]}` });
    }

    const newStatus = stepStatusMap[step];
    const nextStep = step < 3 ? step + 1 : null;

    await db.update(resignationsTable).set({
      status: newStatus,
      currentApprovalStep: nextStep,
      updatedAt: new Date(),
    }).where(eq(resignationsTable.id, id));

    await db.update(resignationApprovalsTable).set({
      decision: "approved",
      approverUserId: user.id,
      notes: req.body.notes ?? null,
      decidedAt: new Date(),
    }).where(and(eq(resignationApprovalsTable.resignationId, id), eq(resignationApprovalsTable.approvalStep, step)));

    await db.insert(activityLogsTable).values({
      type: "resignation_approved",
      description: `تمت الموافقة على المرحلة ${step} للاستقالة #${id} — الحالة الجديدة: ${newStatus}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    // notify employee of approval
    await notifyEmployee(r.employeeId, user.companyId, {
      notificationType: "resignation_step_approved",
      titleAr: "تمت الموافقة على مرحلة استقالتك",
      titleEn: "Resignation Step Approved",
      messageAr: `تمت الموافقة على المرحلة ${step} من استقالتك. الحالة الحالية: ${newStatus}.`,
      messageEn: `Step ${step} of your resignation was approved. New status: ${newStatus}.`,
      priority: "normal",
      entityType: "resignation",
      entityId: id,
    });

    res.json({ success: true, data: { id, status: newStatus, currentApprovalStep: nextStep } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/reject — reject at current step
app.put("/api/resignations/:id/reject", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!["hradmin", "manager", "payrolladmin"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select().from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });
    if (RESIGNATION_TERMINAL.has(r.status)) return res.status(409).json({ success: false, message: "Resignation is already in a terminal state" });

    const notes = req.body.notes?.trim();
    if (!notes) return res.status(400).json({ success: false, message: "Rejection reason (notes) is required" });

    const step = r.currentApprovalStep ?? 1;
    const stepRoleMap: Record<number, string> = { 1: "hradmin", 2: "manager", 3: "payrolladmin" };
    if (user.role !== stepRoleMap[step]) {
      return res.status(403).json({ success: false, message: `This step requires role: ${stepRoleMap[step]}` });
    }

    await db.update(resignationsTable).set({ status: "rejected", currentApprovalStep: null, updatedAt: new Date() }).where(eq(resignationsTable.id, id));
    await db.update(resignationApprovalsTable).set({
      decision: "rejected",
      approverUserId: user.id,
      notes,
      decidedAt: new Date(),
    }).where(and(eq(resignationApprovalsTable.resignationId, id), eq(resignationApprovalsTable.approvalStep, step)));

    await db.insert(activityLogsTable).values({
      type: "resignation_rejected",
      description: `تم رفض الاستقالة #${id} في المرحلة ${step} — السبب: ${notes}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    await notifyEmployee(r.employeeId, user.companyId, {
      notificationType: "resignation_rejected",
      titleAr: "تم رفض استقالتك",
      titleEn: "Resignation Rejected",
      messageAr: `تم رفض طلب استقالتك في المرحلة ${step}. السبب: ${notes}`,
      messageEn: `Your resignation was rejected at step ${step}. Reason: ${notes}`,
      priority: "high",
      entityType: "resignation",
      entityId: id,
    });

    res.json({ success: true, data: { id, status: "rejected" } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/start-clearance — active_notice → clearance (HR only)
app.put("/api/resignations/:id/start-clearance", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!requireHR(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select().from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });
    if (r.status !== "active_notice") return res.status(409).json({ success: false, message: `Cannot start clearance from status: ${r.status}` });

    await db.update(resignationsTable).set({ status: "clearance", updatedAt: new Date() }).where(eq(resignationsTable.id, id));
    await db.insert(activityLogsTable).values({
      type: "resignation_clearance_started",
      description: `تم بدء إجراءات التسليم للاستقالة #${id}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: { id, status: "clearance" } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/start-clearance]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/complete — clearance → completed (HR only)
app.put("/api/resignations/:id/complete", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!requireHR(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select().from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });
    if (r.status !== "clearance") return res.status(409).json({ success: false, message: `Cannot complete resignation from status: ${r.status}` });

    await db.update(resignationsTable).set({ status: "completed", currentApprovalStep: null, updatedAt: new Date() }).where(eq(resignationsTable.id, id));
    await db.insert(activityLogsTable).values({
      type: "resignation_completed",
      description: `تم إنهاء الاستقالة #${id} بنجاح`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    await notifyEmployee(r.employeeId, user.companyId, {
      notificationType: "resignation_completed",
      titleAr: "تم إنهاء استقالتك",
      titleEn: "Resignation Completed",
      messageAr: "تم إنهاء إجراءات استقالتك رسمياً. نتمنى لك التوفيق.",
      messageEn: "Your resignation process has been officially completed. Best of luck!",
      priority: "normal",
      entityType: "resignation",
      entityId: id,
    });

    res.json({ success: true, data: { id, status: "completed" } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/complete]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/exit-interview — save exit interview (HR only)
app.put("/api/resignations/:id/exit-interview", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!requireHR(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select({ id: resignationsTable.id }).from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });

    const { leavingReason, companyFeedback, interviewDate } = req.body;
    await db.update(resignationsTable).set({
      leavingReason: leavingReason ?? null,
      companyFeedback: companyFeedback ?? null,
      interviewDate: interviewDate ?? null,
      updatedAt: new Date(),
    }).where(eq(resignationsTable.id, id));

    await db.insert(activityLogsTable).values({
      type: "resignation_interview_saved",
      description: `تم حفظ بيانات مقابلة الخروج للاستقالة #${id}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/exit-interview]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/clearance — save clearance items (HR only)
app.put("/api/resignations/:id/clearance", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!requireHR(req, res)) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select({ id: resignationsTable.id }).from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });

    const { clearanceItemsJson } = req.body;
    await db.update(resignationsTable).set({
      clearanceItemsJson: clearanceItemsJson ?? "[]",
      updatedAt: new Date(),
    }).where(eq(resignationsTable.id, id));

    await db.insert(activityLogsTable).values({
      type: "resignation_clearance_saved",
      description: `تم حفظ بنود التسليم للاستقالة #${id}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/clearance]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/resignations/:id/settlement — save settlement (HR or Finance)
app.put("/api/resignations/:id/settlement", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  if (!["hradmin", "payrolladmin"].includes(user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ success: false, message: "Invalid id" });
  try {
    const [r] = await db.select({ id: resignationsTable.id }).from(resignationsTable).where(and(
      eq(resignationsTable.id, id), eq(resignationsTable.companyId, user.companyId), eq(resignationsTable.isDeleted, false)
    )).limit(1);
    if (!r) return res.status(404).json({ success: false, message: "Resignation not found" });

    const { remainingSalary, leavePayout, eosbAmount, noticeCompensation, otherDeductions, settlementNotes } = req.body;
    const rs = Number(remainingSalary ?? 0);
    const lp = Number(leavePayout ?? 0);
    const eosb = Number(eosbAmount ?? 0);
    const nc = Number(noticeCompensation ?? 0);
    const od = Number(otherDeductions ?? 0);
    const finalAmount = rs + lp + eosb + nc - od;

    await db.update(resignationsTable).set({
      remainingSalary: String(rs),
      leavePayout: String(lp),
      eosbAmount: String(eosb),
      noticeCompensation: String(nc),
      otherDeductions: String(od),
      settlementNotes: settlementNotes ?? null,
      updatedAt: new Date(),
    }).where(eq(resignationsTable.id, id));

    await db.insert(activityLogsTable).values({
      type: "resignation_settlement_saved",
      description: `تم حفظ بيانات التسوية للاستقالة #${id} — المبلغ الإجمالي: ${finalAmount.toFixed(3)}`,
      employeeName: user.username,
      companyId: user.companyId,
    });

    res.json({ success: true, data: { id, finalAmount } });
  } catch (e) {
    console.error("[PUT /api/resignations/:id/settlement]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Clearance ────────────────────────────────────────────────────────────────

function calcGratuity(basicSalary: number, yearsOfService: number, terminationReason: string): number {
  if (yearsOfService <= 0) return 0;
  const monthly = basicSalary / 12;
  if (terminationReason === "resignation") {
    if (yearsOfService < 3) return 0;
    if (yearsOfService < 5) return monthly * yearsOfService * 0.5;
    return monthly * yearsOfService;
  }
  return monthly * yearsOfService;
}

async function buildClearanceEosb(employeeId: number, companyId: number, terminationReason: string): Promise<{
  salary: number; yearsOfService: number; gratuity: number;
  leaveBalanceCompensation: number; pendingSalary: number;
  additions: number; penalties: number; advances: number;
  deductions: number; finalSettlement: number;
}> {
  const [emp] = await db.select({
    basicSalary: employeesTable.basicSalary,
    hireDate: employeesTable.hireDate,
  }).from(employeesTable)
    .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.companyId, companyId)))
    .limit(1);

  if (!emp) throw new Error("Employee not found");

  const salary = parseFloat(emp.basicSalary as any ?? "0");
  const hireDate = new Date(emp.hireDate as any);
  const now = new Date();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const yearsOfService = Math.max(0, (now.getTime() - hireDate.getTime()) / msPerYear);
  const gratuity = calcGratuity(salary, yearsOfService, terminationReason);

  const currentYear = now.getFullYear();
  const balances = await db.select({
    entitledDays: leaveBalancesTable.entitledDays,
    usedDays: leaveBalancesTable.usedDays,
    pendingDays: leaveBalancesTable.pendingDays,
    carriedForward: leaveBalancesTable.carriedForwardDays,
  }).from(leaveBalancesTable)
    .where(and(eq(leaveBalancesTable.employeeId, employeeId), eq(leaveBalancesTable.year, currentYear)));

  let totalRemaining = 0;
  for (const b of balances) {
    const remaining = parseFloat(b.entitledDays as any ?? "0")
      + parseFloat(b.carriedForward as any ?? "0")
      - parseFloat(b.usedDays as any ?? "0")
      - parseFloat(b.pendingDays as any ?? "0");
    totalRemaining += Math.max(0, remaining);
  }
  const dailySalary = salary / 30;
  const leaveBalanceCompensation = totalRemaining * dailySalary;

  const daysWorkedInMonth = now.getDate();
  const pendingSalary = (salary / 30) * daysWorkedInMonth;

  const activeAdvances = await db.select({ remaining: salaryAdvancesTable.remainingBalance })
    .from(salaryAdvancesTable)
    .where(and(
      eq(salaryAdvancesTable.employeeId, employeeId),
      eq(salaryAdvancesTable.companyId, companyId),
      eq(salaryAdvancesTable.status, "approved"),
      eq(salaryAdvancesTable.isDeleted, false)
    ));
  const advances = activeAdvances.reduce((s, a) => s + parseFloat(a.remaining as any ?? "0"), 0);

  const additions = 0;
  const penalties = 0;
  const deductions = penalties + advances;
  const finalSettlement = gratuity + leaveBalanceCompensation + pendingSalary + additions - deductions;

  return {
    salary, yearsOfService, gratuity, leaveBalanceCompensation, pendingSalary,
    additions, penalties, advances, deductions, finalSettlement,
  };
}

async function buildClearanceRow(clr: any) {
  const [emp] = await db.select({
    code: employeesTable.employeeCode,
    firstNameAr: employeesTable.firstNameAr,
    middleNameAr: employeesTable.middleNameAr,
    lastNameAr: employeesTable.lastNameAr,
    firstNameEn: employeesTable.firstNameEn,
    middleNameEn: employeesTable.middleNameEn,
    lastNameEn: employeesTable.lastNameEn,
    orgNodeId: employeesTable.orgNodeId,
  }).from(employeesTable).where(eq(employeesTable.id, clr.employeeId)).limit(1);

  let deptAr = "", deptEn = "";
  if (emp?.orgNodeId) {
    const [node] = await db.select({ nameAr: orgNodesTable.nameAr, nameEn: orgNodesTable.nameEn })
      .from(orgNodesTable).where(eq(orgNodesTable.id, emp.orgNodeId)).limit(1);
    deptAr = node?.nameAr ?? "";
    deptEn = node?.nameEn ?? "";
  }

  const pendingAssets = await db.select({
    id: assetsTable.id,
    nameAr: assetsTable.nameAr,
    nameEn: assetsTable.nameEn,
    serialNumber: assetsTable.serialNumber,
    categoryId: assetsTable.categoryId,
    assignedDate: assetsTable.assignedDate,
  }).from(assetsTable)
    .where(and(
      eq(assetsTable.assignedToEmployeeId, clr.employeeId),
      eq(assetsTable.currentStatus, "assigned"),
      eq(assetsTable.isDeleted, false)
    ));

  const catIds = [...new Set(pendingAssets.map(a => a.categoryId).filter(Boolean))];
  const catMap: Record<number, string> = {};
  if (catIds.length > 0) {
    const cats = await db.select({ id: assetCategoriesTable.id, nameAr: assetCategoriesTable.nameAr })
      .from(assetCategoriesTable).where(inArray(assetCategoriesTable.id, catIds));
    for (const c of cats) catMap[c.id] = c.nameAr;
  }

  const nameAr = emp ? [emp.firstNameAr, emp.middleNameAr, emp.lastNameAr].filter(Boolean).join(" ") : "";
  const nameEn = emp ? [emp.firstNameEn, emp.middleNameEn, emp.lastNameEn].filter(Boolean).join(" ") : "";

  return {
    ...clr,
    salary: parseFloat(clr.salary ?? "0"),
    yearsOfService: parseFloat(clr.yearsOfService ?? "0"),
    gratuity: parseFloat(clr.gratuity ?? "0"),
    leaveBalanceCompensation: parseFloat(clr.leaveBalanceCompensation ?? "0"),
    pendingSalary: parseFloat(clr.pendingSalary ?? "0"),
    additions: parseFloat(clr.additions ?? "0"),
    penalties: parseFloat(clr.penalties ?? "0"),
    advances: parseFloat(clr.advances ?? "0"),
    deductions: parseFloat(clr.deductions ?? "0"),
    finalSettlementAmount: parseFloat(clr.finalSettlementAmount ?? "0"),
    employeeCode: emp?.code ?? null,
    employeeNameAr: nameAr,
    employeeNameEn: nameEn,
    departmentAr: deptAr,
    departmentEn: deptEn,
    pendingAssetsCount: pendingAssets.length,
    pendingAssets: pendingAssets.map(a => ({
      id: a.id,
      assetNameAr: a.nameAr,
      assetNameEn: a.nameEn,
      serialNumber: a.serialNumber,
      categoryNameAr: catMap[a.categoryId] ?? null,
      assignedDate: a.assignedDate,
    })),
  };
}

// GET /api/clearance/calculate-eosb/:employeeId  ← MUST be before /:id
app.get("/api/clearance/calculate-eosb/:employeeId", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin", "manager"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const employeeId = parseInt(req.params["employeeId"]!);
    if (isNaN(employeeId)) return res.status(400).json({ success: false, message: "Invalid employeeId" });
    const terminationReason = String(req.query["reason"] ?? "resignation");

    const [empCheck] = await db.select({ id: employeesTable.id })
      .from(employeesTable)
      .where(and(eq(employeesTable.id, employeeId), eq(employeesTable.companyId, user.companyId)))
      .limit(1);
    if (!empCheck) return res.status(404).json({ success: false, message: "Employee not found" });

    const calc = await buildClearanceEosb(employeeId, user.companyId, terminationReason);
    res.json({ success: true, data: calc });
  } catch (e) {
    console.error("[GET /api/clearance/calculate-eosb]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/clearance/summary
app.get("/api/clearance/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role === "employee") return res.status(403).json({ success: false, message: "Access denied" });

    const rows = await db.select().from(clearancesTable)
      .where(and(eq(clearancesTable.companyId, user.companyId), eq(clearancesTable.isDeleted, false)));

    const total = rows.length;
    const pending = rows.filter(r => r.clearanceStatus !== "completed").length;
    const completed = rows.filter(r => r.clearanceStatus === "completed").length;
    const totalSettlement = rows.reduce((s, r) => s + parseFloat(r.finalSettlementAmount as any ?? "0"), 0);

    res.json({ success: true, data: { total, pending, completed, totalSettlement } });
  } catch (e) {
    console.error("[GET /api/clearance/summary]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/clearance
app.get("/api/clearance", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    let conds: any[] = [eq(clearancesTable.companyId, user.companyId), eq(clearancesTable.isDeleted, false)];

    if (user.role === "employee") {
      if (!user.employeeId) return res.json({ success: true, data: [] });
      conds.push(eq(clearancesTable.employeeId, user.employeeId));
    }

    const rows = await db.select().from(clearancesTable).where(and(...conds)).orderBy(desc(clearancesTable.createdAt));
    const enriched = await Promise.all(rows.map(buildClearanceRow));
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/clearance]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/clearance
app.post("/api/clearance", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!requireHR(req, res)) return;

    const { employeeId, hrNotes = "", resignationId } = req.body;
    const terminationReason = String(req.body.terminationReason ?? "resignation").trim() || "resignation";
    if (!employeeId) return res.status(400).json({ success: false, message: "employeeId is required" });
    const resolvedEmpId = parseInt(String(employeeId));
    if (isNaN(resolvedEmpId) || resolvedEmpId <= 0) {
      return res.status(400).json({ success: false, message: "employeeId must be a positive integer" });
    }

    const validReasons = ["resignation", "termination", "contract_end", "retirement"];
    if (!validReasons.includes(terminationReason)) {
      return res.status(400).json({ success: false, message: "Invalid terminationReason" });
    }

    const [empCheck] = await db.select({
      id: employeesTable.id,
      employmentStatus: employeesTable.employmentStatus,
      firstNameAr: employeesTable.firstNameAr,
      middleNameAr: employeesTable.middleNameAr,
      lastNameAr: employeesTable.lastNameAr,
    }).from(employeesTable)
      .where(and(eq(employeesTable.id, resolvedEmpId), eq(employeesTable.companyId, user.companyId)))
      .limit(1);
    if (!empCheck) return res.status(404).json({ success: false, message: "Employee not found in your company" });

    const existing = await db.select({ id: clearancesTable.id })
      .from(clearancesTable)
      .where(and(
        eq(clearancesTable.employeeId, parseInt(employeeId)),
        eq(clearancesTable.companyId, user.companyId),
        eq(clearancesTable.clearanceStatus, "pending"),
        eq(clearancesTable.isDeleted, false)
      )).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Employee already has an active clearance in progress" });
    }

    const calc = await buildClearanceEosb(resolvedEmpId, user.companyId, terminationReason);

    const [inserted] = await db.insert(clearancesTable).values({
      companyId: user.companyId,
      employeeId: resolvedEmpId,
      resignationId: resignationId ? parseInt(resignationId) : null,
      terminationReason,
      clearanceStatus: "pending",
      hrNotes: hrNotes ? String(hrNotes).trim() : null,
      salary: String(calc.salary),
      yearsOfService: String(calc.yearsOfService),
      gratuity: String(calc.gratuity),
      leaveBalanceCompensation: String(calc.leaveBalanceCompensation),
      pendingSalary: String(calc.pendingSalary),
      additions: String(calc.additions),
      penalties: String(calc.penalties),
      advances: String(calc.advances),
      deductions: String(calc.deductions),
      finalSettlementAmount: String(calc.finalSettlement),
      createdByUserId: user.userId,
    } as any).returning();

    const empNameAr = [empCheck.firstNameAr, empCheck.middleNameAr, empCheck.lastNameAr].filter(Boolean).join(" ");
    await logActivity(user.companyId, "clearance_created",
      `تم إنشاء براءة ذمة للموظف ID ${empCheck.id} (البراءة #${inserted.id})`, user.username);

    await notifyEmployee(resolvedEmpId, user.companyId, {
      notificationType: "clearance_created",
      titleAr: "تم إنشاء براءة ذمتك",
      titleEn: "Your Clearance Has Been Created",
      messageAr: `تم إنشاء نموذج نهاية الخدمة وبراءة الذمة الخاصة بك. التسوية النهائية: ${calc.finalSettlement.toFixed(3)} JOD`,
      messageEn: `Your end-of-service clearance has been created. Final settlement: ${calc.finalSettlement.toFixed(3)} JOD`,
      priority: "normal",
      entityType: "clearance",
      entityId: inserted.id,
    });

    const enriched = await buildClearanceRow(inserted);
    res.status(201).json({ success: true, data: enriched });
  } catch (e) {
    console.error("[POST /api/clearance]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/clearance/:id
app.get("/api/clearance/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) return res.status(404).json({ success: false, message: "Not found" });

    const [clr] = await db.select().from(clearancesTable)
      .where(and(eq(clearancesTable.id, id), eq(clearancesTable.companyId, user.companyId), eq(clearancesTable.isDeleted, false)))
      .limit(1);
    if (!clr) return res.status(404).json({ success: false, message: "Clearance not found" });

    if (user.role === "employee" && clr.employeeId !== user.employeeId) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const enriched = await buildClearanceRow(clr);

    const [empDetail] = await db.select({
      firstNameAr: employeesTable.firstNameAr,
      middleNameAr: employeesTable.middleNameAr,
      lastNameAr: employeesTable.lastNameAr,
      firstNameEn: employeesTable.firstNameEn,
      middleNameEn: employeesTable.middleNameEn,
      lastNameEn: employeesTable.lastNameEn,
      employeeCode: employeesTable.employeeCode,
      orgNodeId: employeesTable.orgNodeId,
    }).from(employeesTable).where(eq(employeesTable.id, clr.employeeId)).limit(1);

    let deptAr = "", deptEn = "";
    if (empDetail?.orgNodeId) {
      const [node] = await db.select({ nameAr: orgNodesTable.nameAr, nameEn: orgNodesTable.nameEn })
        .from(orgNodesTable).where(eq(orgNodesTable.id, empDetail.orgNodeId)).limit(1);
      deptAr = node?.nameAr ?? "";
      deptEn = node?.nameEn ?? "";
    }

    const empNameAr = empDetail ? [empDetail.firstNameAr, empDetail.middleNameAr, empDetail.lastNameAr].filter(Boolean).join(" ") : "";
    const empNameEn = empDetail ? [empDetail.firstNameEn, empDetail.middleNameEn, empDetail.lastNameEn].filter(Boolean).join(" ") : "";

    const response = {
      ...enriched,
      employee: {
        nameAr: empNameAr,
        nameEn: empNameEn,
        employeeCode: empDetail?.employeeCode ?? null,
        departmentAr: deptAr,
        departmentEn: deptEn,
      },
      calculation: {
        salary: parseFloat(clr.salary as any ?? "0"),
        yearsOfService: parseFloat(clr.yearsOfService as any ?? "0"),
        gratuity: parseFloat(clr.gratuity as any ?? "0"),
        leaveBalanceCompensation: parseFloat(clr.leaveBalanceCompensation as any ?? "0"),
        pendingSalary: parseFloat(clr.pendingSalary as any ?? "0"),
        additions: parseFloat(clr.additions as any ?? "0"),
        penalties: parseFloat(clr.penalties as any ?? "0"),
        advances: parseFloat(clr.advances as any ?? "0"),
        deductions: parseFloat(clr.deductions as any ?? "0"),
        finalSettlement: parseFloat(clr.finalSettlementAmount as any ?? "0"),
      },
    };

    res.json({ success: true, data: response });
  } catch (e) {
    console.error("[GET /api/clearance/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/clearance/:id  (update notes, or complete via clearanceStatus: 'completed')
app.put("/api/clearance/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!["hradmin", "payrolladmin"].includes(user.role)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const id = parseInt(req.params["id"]!);
    if (isNaN(id)) return res.status(404).json({ success: false, message: "Not found" });

    const [clr] = await db.select().from(clearancesTable)
      .where(and(eq(clearancesTable.id, id), eq(clearancesTable.companyId, user.companyId), eq(clearancesTable.isDeleted, false)))
      .limit(1);
    if (!clr) return res.status(404).json({ success: false, message: "Clearance not found" });

    if (clr.clearanceStatus === "completed") {
      return res.status(409).json({ success: false, message: "Cannot modify a completed clearance" });
    }

    const { clearanceStatus, hrNotes, additions, penalties, advances } = req.body;
    const updates: any = { updatedAt: new Date() };

    if (hrNotes !== undefined) updates.hrNotes = String(hrNotes).trim() || null;

    if (clearanceStatus === "completed") {
      if (!requireHR(req, res)) return;

      const pendingAssets = await db.select({ id: assetsTable.id })
        .from(assetsTable)
        .where(and(
          eq(assetsTable.assignedToEmployeeId, clr.employeeId),
          eq(assetsTable.currentStatus, "assigned"),
          eq(assetsTable.isDeleted, false)
        )).limit(1);
      if (pendingAssets.length > 0) {
        return res.status(409).json({ success: false, message: "Cannot complete clearance while assets are still pending return" });
      }

      updates.clearanceStatus = "completed";
      updates.completedByUserId = user.userId;
      updates.completedAt = new Date();
    }

    if (additions !== undefined) {
      const add = Math.max(0, parseFloat(String(additions)) || 0);
      const pen = penalties !== undefined ? Math.max(0, parseFloat(String(penalties)) || 0) : parseFloat(clr.penalties as any ?? "0");
      const adv = advances !== undefined ? Math.max(0, parseFloat(String(advances)) || 0) : parseFloat(clr.advances as any ?? "0");
      const ded = pen + adv;
      const gratuity = parseFloat(clr.gratuity as any ?? "0");
      const lbc = parseFloat(clr.leaveBalanceCompensation as any ?? "0");
      const ps = parseFloat(clr.pendingSalary as any ?? "0");
      const fs = gratuity + lbc + ps + add - ded;
      updates.additions = String(add);
      updates.penalties = String(pen);
      updates.advances = String(adv);
      updates.deductions = String(ded);
      updates.finalSettlementAmount = String(fs);
    }

    const [updated] = await db.update(clearancesTable).set(updates).where(eq(clearancesTable.id, id)).returning();

    const actionType = clearanceStatus === "completed" ? "clearance_completed" : "clearance_updated";
    const descAr = clearanceStatus === "completed"
      ? `تم إتمام براءة الذمة #${id} بنجاح — الموظف ID ${clr.employeeId}`
      : `تم تحديث براءة الذمة #${id}`;
    await logActivity(user.companyId, actionType, descAr, user.username);

    if (clearanceStatus === "completed") {
      await notifyEmployee(clr.employeeId, user.companyId, {
        notificationType: "clearance_completed",
        titleAr: "تم إتمام براءة ذمتك",
        titleEn: "Your Clearance Has Been Completed",
        messageAr: `تم إتمام إجراءات براءة الذمة الخاصة بك. التسوية النهائية: ${parseFloat(updated.finalSettlementAmount as any ?? "0").toFixed(3)} JOD`,
        messageEn: `Your clearance procedure has been completed. Final settlement: ${parseFloat(updated.finalSettlementAmount as any ?? "0").toFixed(3)} JOD`,
        priority: "high",
        entityType: "clearance",
        entityId: id,
      });
    }

    const enriched = await buildClearanceRow(updated);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[PUT /api/clearance/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Salary Advances ──────────────────────────────────────────────────────────
async function buildAdvanceRow(adv: any) {
  const [emp] = await db.select({
    code: employeesTable.employeeCode,
    firstNameAr: employeesTable.firstNameAr,
    middleNameAr: employeesTable.middleNameAr,
    lastNameAr: employeesTable.lastNameAr,
    firstNameEn: employeesTable.firstNameEn,
    middleNameEn: employeesTable.middleNameEn,
    lastNameEn: employeesTable.lastNameEn,
    orgNodeId: employeesTable.orgNodeId,
  }).from(employeesTable).where(eq(employeesTable.id, adv.employeeId));
  let orgNameAr = "", orgNameEn = "";
  if (emp?.orgNodeId) {
    const [node] = await db.select({ nameAr: orgNodesTable.nameAr, nameEn: orgNodesTable.nameEn })
      .from(orgNodesTable).where(eq(orgNodesTable.id, emp.orgNodeId));
    orgNameAr = node?.nameAr ?? "";
    orgNameEn = node?.nameEn ?? "";
  }
  const nameAr = emp ? [emp.firstNameAr, emp.middleNameAr, emp.lastNameAr].filter(Boolean).join(" ") : "";
  const nameEn = emp ? [emp.firstNameEn, emp.middleNameEn, emp.lastNameEn].filter(Boolean).join(" ") : "";
  return {
    ...adv,
    requestedAmount: parseFloat(adv.requestedAmount ?? adv.requested_amount ?? 0),
    approvedAmount: adv.approvedAmount != null ? parseFloat(adv.approvedAmount) : null,
    remainingBalance: parseFloat(adv.remainingBalance ?? adv.remaining_balance ?? 0),
    employeeCode: emp?.code ?? null,
    employeeNameAr: nameAr,
    employeeNameEn: nameEn,
    departmentAr: orgNameAr,
    departmentEn: orgNameEn,
    orgNodeNameAr: orgNameAr,
    orgNodeNameEn: orgNameEn,
  };
}

app.get("/api/salary-advances", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    let conds: any[] = [eq(salaryAdvancesTable.isDeleted, false), eq(salaryAdvancesTable.companyId, user.companyId)];

    if (user.role === "employee") {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      conds.push(eq(salaryAdvancesTable.employeeId, user.employeeId));
    } else if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const teamEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = teamEmps.map(e => e.id);
      if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
      conds.push(inArray(salaryAdvancesTable.employeeId, ids));
    }

    const rows = await db.select().from(salaryAdvancesTable).where(and(...conds)).orderBy(desc(salaryAdvancesTable.createdAt));
    const enriched = await Promise.all(rows.map(buildAdvanceRow));
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/salary-advances]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/salary-advances", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "employee") { res.status(403).json({ success: false, message: "Only employees can submit advance requests" }); return; }
    if (!user.employeeId) { res.status(403).json({ success: false, message: "No employee profile linked to this account" }); return; }
    const { amount, reason, repaymentMethod, notes } = req.body;
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ success: false, message: "Amount must be a positive number" }); return;
    }
    if (parsedAmount > 100000) {
      res.status(400).json({ success: false, message: "Amount exceeds maximum allowed (100,000)" }); return;
    }
    if (!reason?.trim()) { res.status(400).json({ success: false, message: "Reason is required" }); return; }
    const validMethods = ["monthly", "one_time"];
    const method = validMethods.includes(repaymentMethod) ? repaymentMethod : "monthly";
    const today = new Date().toISOString().split("T")[0]!;
    const [adv] = await db.insert(salaryAdvancesTable).values({
      employeeId: user.employeeId,
      companyId: user.companyId,
      requestedAmount: String(parsedAmount),
      reason: reason.trim(),
      requestDate: today,
      repaymentMethod: method,
      requestNotes: notes?.trim() || null,
      remainingBalance: "0",
      status: "pending",
    }).returning();
    await logActivity(user.companyId, "advance_requested",
      `Advance request by ${user.username} for amount ${parsedAmount}`, user.username);
    const notifPayload = {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "salary_advance",
      entityId: adv.id,
      notificationType: "advance_created",
      titleAr: "طلب سلفة راتب جديد",
      titleEn: "New Salary Advance Request",
      messageAr: `قدّم ${user.username} طلب سلفة راتب بمبلغ ${parsedAmount}.`,
      messageEn: `${user.username} submitted a salary advance request for ${parsedAmount}.`,
      priority: "normal" as const,
      actionUrl: "/app/advances",
    };
    await notifyRole(user.companyId, "hradmin", notifPayload);
    await notifyDirectManager(user.employeeId, notifPayload);
    const enriched = await buildAdvanceRow(adv);
    res.status(201).json({ success: true, data: enriched });
  } catch (e) {
    console.error("[POST /api/salary-advances]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/salary-advances/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "hradmin" && user.role !== "admin" && user.role !== "manager") {
      res.status(403).json({ success: false, message: "Insufficient permissions" }); return;
    }
    const advId = parseInt(req.params["id"]!);
    const { approvedAmount, repaymentPlan, notes } = req.body;
    const [adv] = await db.select().from(salaryAdvancesTable).where(eq(salaryAdvancesTable.id, advId));
    if (!adv) { res.status(404).json({ success: false, message: "Advance request not found" }); return; }
    if (adv.companyId !== user.companyId) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
    if (adv.status === "approved" || adv.status === "rejected") {
      res.status(409).json({ success: false, message: `Request is already ${adv.status}` }); return;
    }
    const now = new Date();
    let updated: any;
    if (user.role === "manager") {
      if (adv.status !== "pending") {
        res.status(409).json({ success: false, message: "Only pending requests can be manager-approved" }); return;
      }
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const teamEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = new Set(teamEmps.map(e => e.id));
      if (!ids.has(adv.employeeId)) { res.status(403).json({ success: false, message: "This employee is not in your team scope" }); return; }
      [updated] = await db.update(salaryAdvancesTable).set({
        status: "manager_approved",
        decisionNotes: notes?.trim() || null,
        approvedById: user.userId,
        approvedAt: now,
      }).where(eq(salaryAdvancesTable.id, advId)).returning();
      await logActivity(user.companyId, "advance_manager_approved",
        `Manager ${user.username} approved advance #${advId}`, user.username);
      await notifyRole(user.companyId, "hradmin", {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "salary_advance",
        entityId: advId,
        notificationType: "advance_manager_approved",
        titleAr: "طلب سلفة بانتظار HR",
        titleEn: "Salary Advance Awaiting HR",
        messageAr: `وافق المدير ${user.username} على طلب السلفة #${advId}. بانتظار اعتماد HR.`,
        messageEn: `Manager ${user.username} approved advance #${advId}. Awaiting HR approval.`,
        priority: "normal",
        actionUrl: "/app/advances",
      });
    } else {
      if (adv.status !== "pending" && adv.status !== "manager_approved") {
        res.status(409).json({ success: false, message: "Request must be pending or manager_approved for HR approval" }); return;
      }
      const finalAmount = approvedAmount && parseFloat(approvedAmount) > 0
        ? parseFloat(approvedAmount) : parseFloat(adv.requestedAmount);
      [updated] = await db.update(salaryAdvancesTable).set({
        status: "approved",
        approvedAmount: String(finalAmount),
        remainingBalance: String(finalAmount),
        repaymentPlan: repaymentPlan?.trim() || null,
        decisionNotes: notes?.trim() || null,
        approvedById: user.userId,
        approvedAt: now,
      }).where(eq(salaryAdvancesTable.id, advId)).returning();
      await logActivity(user.companyId, "advance_hr_approved",
        `HR ${user.username} approved advance #${advId} for amount ${finalAmount}`, user.username);
      const empUsers = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.employeeId, adv.employeeId), eq(usersTable.isDeleted, false)));
      if (empUsers.length > 0) {
        await notifyUsers(empUsers.map(u => u.id), {
          companyId: user.companyId,
          actorUserId: user.userId,
          entityType: "salary_advance",
          entityId: advId,
          notificationType: "advance_approved",
          titleAr: "تمت الموافقة على طلب السلفة",
          titleEn: "Salary Advance Approved",
          messageAr: `تمت الموافقة على طلب سلفتك #${advId} بمبلغ ${finalAmount}.`,
          messageEn: `Your salary advance request #${advId} has been approved for ${finalAmount}.`,
          priority: "normal",
          actionUrl: "/app/advances",
        });
      }
    }
    const enriched = await buildAdvanceRow(updated);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[PUT /api/salary-advances/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/salary-advances/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (user.role !== "hradmin" && user.role !== "admin" && user.role !== "manager") {
      res.status(403).json({ success: false, message: "Insufficient permissions" }); return;
    }
    const advId = parseInt(req.params["id"]!);
    const { reason, notes } = req.body;
    const rejectionReason = reason?.trim() || notes?.trim();
    if (!rejectionReason) { res.status(400).json({ success: false, message: "Rejection reason is required" }); return; }
    const [adv] = await db.select().from(salaryAdvancesTable).where(eq(salaryAdvancesTable.id, advId));
    if (!adv) { res.status(404).json({ success: false, message: "Advance request not found" }); return; }
    if (adv.companyId !== user.companyId) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
    if (adv.status === "approved" || adv.status === "rejected") {
      res.status(409).json({ success: false, message: `Request is already ${adv.status}` }); return;
    }
    if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const teamEmps = await db.select({ id: employeesTable.id }).from(employeesTable)
        .where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      const ids = new Set(teamEmps.map(e => e.id));
      if (!ids.has(adv.employeeId)) { res.status(403).json({ success: false, message: "This employee is not in your team scope" }); return; }
    }
    const now = new Date();
    const [updated] = await db.update(salaryAdvancesTable).set({
      status: "rejected",
      rejectionReason,
      decisionNotes: notes?.trim() || null,
      rejectedById: user.userId,
      rejectedAt: now,
    }).where(eq(salaryAdvancesTable.id, advId)).returning();
    await logActivity(user.companyId, "advance_rejected",
      `${user.username} rejected advance #${advId}: ${rejectionReason}`, user.username);
    const empUsers = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.employeeId, adv.employeeId), eq(usersTable.isDeleted, false)));
    if (empUsers.length > 0) {
      await notifyUsers(empUsers.map(u => u.id), {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "salary_advance",
        entityId: advId,
        notificationType: "advance_rejected",
        titleAr: "تم رفض طلب السلفة",
        titleEn: "Salary Advance Rejected",
        messageAr: `تم رفض طلب سلفتك #${advId}. السبب: ${rejectionReason}`,
        messageEn: `Your salary advance request #${advId} was rejected. Reason: ${rejectionReason}`,
        priority: "normal",
        actionUrl: "/app/advances",
      });
    }
    const enriched = await buildAdvanceRow(updated);
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[PUT /api/salary-advances/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
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
// Role guard helper: HR-only
function requireHR(req: express.Request, res: express.Response): boolean {
  const role = (req as AuthReq).user.role;
  if (!["hradmin", "superadmin"].includes(role)) {
    res.status(403).json({ success: false, message: "Forbidden: HR access only" });
    return false;
  }
  return true;
}

// Compliance status computation
function complianceStatus(
  expiryDate: string | null,
  referenceNumber: string | null | undefined,
  warningDays: number
): { status: "valid" | "expiring_soon" | "expired" | "missing"; daysRemaining: number | null } {
  if (!referenceNumber && !expiryDate) return { status: "missing", daysRemaining: null };
  if (!expiryDate) return { status: "valid", daysRemaining: null };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  const diffMs = expiry.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysRemaining < 0) return { status: "expired", daysRemaining };
  if (daysRemaining <= warningDays) return { status: "expiring_soon", daysRemaining };
  return { status: "valid", daysRemaining };
}

// Build compliance item rows for a list of employees
async function buildComplianceItems(companyId: number, employeeIdFilter?: number) {
  // Load warning days from config
  const [warnCfg] = await db.select({ value: systemConfigurationsTable.value })
    .from(systemConfigurationsTable)
    .where(and(eq(systemConfigurationsTable.companyId, companyId), eq(systemConfigurationsTable.key, "compliance_warning_days")));
  const warningDays = parseInt(warnCfg?.value ?? "30");

  // Load departments for join
  const depts = await db.select({ id: departmentsTable.id, nameAr: departmentsTable.nameAr, nameEn: departmentsTable.nameEn })
    .from(departmentsTable).where(eq(departmentsTable.companyId, companyId));
  const deptMap = new Map(depts.map(d => [d.id, d]));

  // Load active employees
  const empWhere: any[] = [eq(employeesTable.companyId, companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")];
  if (employeeIdFilter) empWhere.push(eq(employeesTable.id, employeeIdFilter));
  const emps = await db.select({
    id: employeesTable.id,
    employeeCode: employeesTable.employeeCode,
    firstNameAr: employeesTable.firstNameAr,
    lastNameAr: employeesTable.lastNameAr,
    firstNameEn: employeesTable.firstNameEn,
    lastNameEn: employeesTable.lastNameEn,
    nationality: employeesTable.nationality,
    departmentId: employeesTable.departmentId,
    sscNumber: employeesTable.sscNumber,
    sscEnrollmentDate: employeesTable.sscEnrollmentDate,
    isSscExempt: employeesTable.isSSCExempt,
    workPermitNumber: employeesTable.workPermitNumber,
    workPermitExpiry: employeesTable.workPermitExpiry,
    passportNumber: employeesTable.passportNumber,
    passportExpiry: employeesTable.passportExpiry,
    residencyNumber: employeesTable.residencyNumber,
    residencyExpiry: employeesTable.residencyExpiry,
  }).from(employeesTable).where(and(...empWhere));

  // Load compliance_records (health_cert + criminal_record)
  const crWhere: any[] = [eq(complianceRecordsTable.companyId, companyId), eq(complianceRecordsTable.isDeleted, false)];
  if (employeeIdFilter) crWhere.push(eq(complianceRecordsTable.employeeId, employeeIdFilter));
  const crRows = await db.select().from(complianceRecordsTable).where(and(...crWhere));
  const crMap = new Map<string, typeof crRows[0]>();
  for (const r of crRows) crMap.set(`${r.employeeId}:${r.category}`, r);

  const items: any[] = [];
  for (const emp of emps) {
    const dept = emp.departmentId ? deptMap.get(emp.departmentId) : null;
    const base = {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeNameAr: `${emp.firstNameAr} ${emp.lastNameAr}`,
      employeeNameEn: `${emp.firstNameEn} ${emp.lastNameEn}`,
      nationalityCode: emp.nationality ?? "",
      departmentAr: dept?.nameAr ?? "",
      departmentEn: dept?.nameEn ?? "",
      orgNodeNameAr: dept?.nameAr ?? "",
      orgNodeNameEn: dept?.nameEn ?? "",
    };

    // Social Security
    const sscRef = emp.isSscExempt ? "EXEMPT" : (emp.sscNumber ?? null);
    const sscStat = emp.isSscExempt
      ? { status: "valid" as const, daysRemaining: null }
      : complianceStatus(null, emp.sscNumber, warningDays);
    items.push({
      id: `ss_${emp.id}`, category: "social_security",
      labelAr: "الضمان الاجتماعي", labelEn: "Social Security",
      referenceNumber: sscRef, issueDate: emp.sscEnrollmentDate ?? null, expiryDate: null,
      issuedBy: null, notes: null, ...sscStat, ...base,
    });

    // Work Permit (only if non-Jordanian or has a permit)
    const wpRef = emp.workPermitNumber ?? null;
    const wpStat = complianceStatus(emp.workPermitExpiry ?? null, wpRef, warningDays);
    items.push({
      id: `wp_${emp.id}`, category: "work_permit",
      labelAr: "تصريح العمل", labelEn: "Work Permit",
      referenceNumber: wpRef, issueDate: null, expiryDate: emp.workPermitExpiry ?? null,
      issuedBy: null, notes: null, ...wpStat, ...base,
    });

    // Health Certificate
    const hc = crMap.get(`${emp.id}:health_certificate`);
    const hcStat = complianceStatus(hc?.expiryDate ?? null, hc?.referenceNumber, warningDays);
    items.push({
      id: hc ? `hc_${hc.id}` : `hc_new_${emp.id}`, category: "health_certificate",
      labelAr: "الشهادة الصحية", labelEn: "Health Certificate",
      referenceNumber: hc?.referenceNumber ?? null, issueDate: hc?.issueDate ?? null, expiryDate: hc?.expiryDate ?? null,
      issuedBy: hc?.issuedBy ?? null, notes: hc?.notes ?? null, ...hcStat, ...base,
    });

    // Criminal Record
    const cr = crMap.get(`${emp.id}:criminal_record`);
    const crStat = complianceStatus(cr?.expiryDate ?? null, cr?.referenceNumber, warningDays);
    items.push({
      id: cr ? `cr_${cr.id}` : `cr_new_${emp.id}`, category: "criminal_record",
      labelAr: "براءة الذمة", labelEn: "Criminal Record",
      referenceNumber: cr?.referenceNumber ?? null, issueDate: cr?.issueDate ?? null, expiryDate: cr?.expiryDate ?? null,
      issuedBy: null, notes: cr?.notes ?? null, ...crStat, ...base,
    });
  }
  return { items, warningDays };
}

// GET /api/compliance/overview — HR only. Real computed summary + alerts
app.get("/api/compliance/overview", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { items, warningDays } = await buildComplianceItems(user.companyId);

    let compliant = 0, expiringSoon = 0, expired = 0, missing = 0;
    for (const item of items) {
      if (item.status === "valid") compliant++;
      else if (item.status === "expiring_soon") expiringSoon++;
      else if (item.status === "expired") expired++;
      else missing++;
    }
    const total = items.length;
    const score = total > 0 ? Math.round((compliant / total) * 100) : 100;

    const alerts = items
      .filter(i => i.status === "expired" || i.status === "expiring_soon" || i.status === "missing")
      .sort((a: any, b: any) => {
        const w: Record<string, number> = { missing: 4, expired: 3, expiring_soon: 2, valid: 1 };
        const diff = (w[b.status] ?? 0) - (w[a.status] ?? 0);
        if (diff !== 0) return diff;
        return (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER);
      });

    res.json({
      success: true,
      data: {
        score, total, compliant, expiringSoon, expired, missing,
        warningDays,
        alerts,
        links: {
          socialSecurityPortalUrl: "https://ssc.gov.jo",
          ministryOfHealthPortalUrl: "https://www.moh.gov.jo",
        },
      },
    });
  } catch (e) {
    console.error("[GET /api/compliance/overview]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/compliance/items — HR only. All compliance records with employee details
app.get("/api/compliance/items", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { items } = await buildComplianceItems(user.companyId);
    res.json({ success: true, data: items });
  } catch (e) {
    console.error("[GET /api/compliance/items]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/compliance/employee/:id — HR only. One employee's full compliance view
app.get("/api/compliance/employee/:id", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);
    const [emp] = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    const { items } = await buildComplianceItems(user.companyId, empId);
    res.json({ success: true, data: { employee: emp, items } });
  } catch (e) {
    console.error("[GET /api/compliance/employee/:id]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/compliance/employees/:id/social-security — HR only
app.put("/api/compliance/employees/:id/social-security", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);
    const { sscNumber, registrationDate, status, notes } = req.body as Record<string, string | null>;

    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    const [updated] = await db.update(employeesTable).set({
      sscNumber: sscNumber ?? null,
      sscEnrollmentDate: registrationDate ?? null,
    }).where(eq(employeesTable.id, empId)).returning({ id: employeesTable.id });

    await db.insert(activityLogsTable).values({
      type: "compliance_updated",
      description: `SSC record updated for employee ${empId} by user ${user.userId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.json({ success: true, data: { employeeId: empId, category: "social_security", sscNumber, registrationDate, status } });
  } catch (e) {
    console.error("[PUT /api/compliance/employees/:id/social-security]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/compliance/employees/:id/work-permit — HR only
app.put("/api/compliance/employees/:id/work-permit", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);
    const { workPermitNumber, issueDate, expiryDate, residencyNumber, residencyExpiry, passportNumber, passportExpiry, notes } = req.body as Record<string, string | null>;

    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    if (issueDate && expiryDate && expiryDate < issueDate) {
      res.status(400).json({ success: false, message: "Expiry date must be after issue date" }); return;
    }
    if (passportExpiry && issueDate && passportExpiry < issueDate) {
      res.status(400).json({ success: false, message: "Passport expiry must be a future date" }); return;
    }

    await db.update(employeesTable).set({
      workPermitNumber: workPermitNumber ?? null,
      workPermitExpiry: expiryDate ?? null,
      passportNumber: passportNumber ?? null,
      passportExpiry: passportExpiry ?? null,
      residencyNumber: residencyNumber ?? null,
      residencyExpiry: residencyExpiry ?? null,
    }).where(eq(employeesTable.id, empId));

    await db.insert(activityLogsTable).values({
      type: "compliance_updated",
      description: `Work permit updated for employee ${empId} by user ${user.userId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.json({ success: true, data: { employeeId: empId, category: "work_permit", workPermitNumber, expiryDate } });
  } catch (e) {
    console.error("[PUT /api/compliance/employees/:id/work-permit]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/compliance/employees/:id/health-certificate — HR only (upsert compliance_records)
app.put("/api/compliance/employees/:id/health-certificate", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);
    const { certificateNumber, issueDate, expiryDate, issuedBy, notes } = req.body as Record<string, string | null>;

    if (!certificateNumber) { res.status(400).json({ success: false, message: "Certificate number is required" }); return; }
    if (!expiryDate) { res.status(400).json({ success: false, message: "Expiry date is required" }); return; }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      res.status(400).json({ success: false, message: "Expiry date must be after issue date" }); return;
    }

    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    // Upsert: soft-delete old + insert new
    await db.update(complianceRecordsTable).set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(complianceRecordsTable.employeeId, empId), eq(complianceRecordsTable.category, "health_certificate"), eq(complianceRecordsTable.isDeleted, false)));
    const [rec] = await db.insert(complianceRecordsTable).values({
      companyId: user.companyId, employeeId: empId, category: "health_certificate",
      referenceNumber: certificateNumber, issueDate: issueDate ?? null,
      expiryDate: expiryDate, issuedBy: issuedBy ?? null, notes: notes ?? null,
    }).returning();

    await db.insert(activityLogsTable).values({
      type: "compliance_updated",
      description: `Health certificate ${certificateNumber} added for employee ${empId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.json({ success: true, data: rec });
  } catch (e) {
    console.error("[PUT /api/compliance/employees/:id/health-certificate]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT /api/compliance/employees/:id/criminal-record — HR only (upsert compliance_records)
app.put("/api/compliance/employees/:id/criminal-record", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const empId = parseInt(req.params["id"]!);
    const { referenceNumber, issueDate, expiryDate, notes } = req.body as Record<string, string | null>;

    if (!referenceNumber) { res.status(400).json({ success: false, message: "Reference number is required" }); return; }
    if (!expiryDate) { res.status(400).json({ success: false, message: "Expiry date is required" }); return; }
    if (issueDate && expiryDate && expiryDate < issueDate) {
      res.status(400).json({ success: false, message: "Expiry date must be after issue date" }); return;
    }

    const [emp] = await db.select({ id: employeesTable.id }).from(employeesTable)
      .where(and(eq(employeesTable.id, empId), eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }

    await db.update(complianceRecordsTable).set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(complianceRecordsTable.employeeId, empId), eq(complianceRecordsTable.category, "criminal_record"), eq(complianceRecordsTable.isDeleted, false)));
    const [rec] = await db.insert(complianceRecordsTable).values({
      companyId: user.companyId, employeeId: empId, category: "criminal_record",
      referenceNumber, issueDate: issueDate ?? null, expiryDate: expiryDate,
      notes: notes ?? null,
    }).returning();

    await db.insert(activityLogsTable).values({
      type: "compliance_updated",
      description: `Criminal record ${referenceNumber} added for employee ${empId}`,
      companyId: user.companyId,
    }).catch(() => {});

    res.json({ success: true, data: rec });
  } catch (e) {
    console.error("[PUT /api/compliance/employees/:id/criminal-record]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/compliance/badge-status — HR only
app.get("/api/compliance/badge-status", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { items } = await buildComplianceItems(user.companyId);
    const result: Record<number, string> = {};
    for (const item of items) {
      const empId = item.employeeId;
      if (!result[empId]) result[empId] = "compliant";
      if (item.status === "missing" || item.status === "expired") result[empId] = "non_compliant";
      else if (item.status === "expiring_soon" && result[empId] === "compliant") result[empId] = "expiring";
    }
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// GET /api/compliance/export — HR only. Per-employee summary for print export
app.get("/api/compliance/export", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { items } = await buildComplianceItems(user.companyId);
    // Group by employee
    const empMap = new Map<number, any>();
    for (const item of items) {
      if (!empMap.has(item.employeeId)) {
        empMap.set(item.employeeId, {
          employeeId: item.employeeId, employeeCode: item.employeeCode,
          employeeNameAr: item.employeeNameAr, employeeNameEn: item.employeeNameEn,
          nationality: item.nationalityCode, orgNodeNameAr: item.orgNodeNameAr, orgNodeNameEn: item.orgNodeNameEn,
          missingOrExpiredCount: 0,
        });
      }
      if (item.status === "missing" || item.status === "expired") {
        empMap.get(item.employeeId).missingOrExpiredCount++;
      }
    }
    res.json({ success: true, data: Array.from(empMap.values()) });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Forms Catalog ────────────────────────────────────────────────────────────
const FORMS_CATALOG_CATEGORIES = [
  { id: 'employee',      name_ar: 'نماذج الموظفين',           name_en: 'Employee Forms',              icon: 'person' },
  { id: 'recruitment',   name_ar: 'التوظيف والتعيين',          name_en: 'Recruitment & Onboarding',    icon: 'work' },
  { id: 'contracts',     name_ar: 'العقود والتصاريح',           name_en: 'Contracts & Permits',         icon: 'description' },
  { id: 'legal',         name_ar: 'قانونية وإدارية',           name_en: 'Legal & Administrative',      icon: 'gavel' },
  { id: 'certificates',  name_ar: 'خطابات وشهادات',            name_en: 'Letters & Certificates',      icon: 'workspace_premium' },
  { id: 'payroll',       name_ar: 'الرواتب والمالية',           name_en: 'Payroll & Finance',           icon: 'payments' },
  { id: 'attendance',    name_ar: 'الحضور والإجازات',           name_en: 'Attendance & Leave',          icon: 'event_available' },
  { id: 'disciplinary',  name_ar: 'التأديب وبراءة الذمة',      name_en: 'Disciplinary & Clearance',    icon: 'warning_amber' },
];

const FORMS_CATALOG_ALL = [
  // ── Employee Forms ────────────────────────────────────────────────
  { id: 'employee-info-update',  name_ar: 'نموذج تحديث بيانات الموظف',         name_en: 'Employee Information Update Form',      category: 'employee',     roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'personal-data-change',  name_ar: 'نموذج تغيير البيانات الشخصية',       name_en: 'Personal Data Change Form',             category: 'employee',     roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'bank-account-update',   name_ar: 'نموذج تحديث الحساب البنكي / IBAN',  name_en: 'Bank Account / IBAN Update Form',       category: 'employee',     roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'emergency-contact',     name_ar: 'نموذج تحديث جهة الاتصال الطارئ',   name_en: 'Emergency Contact Update Form',         category: 'employee',     roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'family-declaration',    name_ar: 'إعلان المعالين والأسرة',             name_en: 'Family / Dependents Declaration Form',  category: 'employee',     roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'document-checklist',    name_ar: 'قائمة تسليم الوثائق',               name_en: 'Document Submission Checklist',         category: 'employee',     roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'employee-acknowledgment',name_ar:'نموذج إقرار الموظف',                name_en: 'Employee Acknowledgment Form',          category: 'employee',     roles_allowed: ['hradmin','superadmin','employee'] },
  // ── Recruitment & Onboarding ──────────────────────────────────────
  { id: 'job-application',       name_ar: 'نموذج طلب التوظيف',                 name_en: 'Job Application Form',                  category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'hiring-request',        name_ar: 'طلب احتياج وظيفي',                  name_en: 'Hiring Request',                        category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'interview-evaluation',  name_ar: 'نموذج تقييم المقابلة',              name_en: 'Interview Evaluation Form',             category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'appointment-letter',    name_ar: 'كتاب تعيين',                         name_en: 'Offer / Appointment Letter',            category: 'recruitment',  roles_allowed: ['hradmin','superadmin'] },
  { id: 'new-hire-checklist',    name_ar: 'قائمة متطلبات الموظف الجديد',       name_en: 'New Hire Checklist',                    category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'onboarding-form',       name_ar: 'نموذج تأهيل الموظف',               name_en: 'Employee Onboarding Form',              category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'probation-review',      name_ar: 'نموذج تقييم فترة التجربة',          name_en: 'Probation Review Form',                 category: 'recruitment',  roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'probation-confirmation',name_ar: 'خطاب تثبيت في الوظيفة',            name_en: 'Probation Confirmation Letter',         category: 'recruitment',  roles_allowed: ['hradmin','superadmin'] },
  { id: 'probation-extension',   name_ar: 'خطاب تمديد فترة التجربة',           name_en: 'Probation Extension Letter',            category: 'recruitment',  roles_allowed: ['hradmin','superadmin'] },
  // ── Contracts & Permits ───────────────────────────────────────────
  { id: 'employment-contract',   name_ar: 'عقد عمل',                           name_en: 'Employment Contract',                   category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'contract-renewal',      name_ar: 'نموذج تجديد العقد',                 name_en: 'Contract Renewal Form',                 category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'work-permit',           name_ar: 'طلب تصريح عمل',                     name_en: 'Work Permit Request',                   category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'work-permit-renewal',   name_ar: 'قائمة تجديد تصريح العمل',           name_en: 'Work Permit Renewal Checklist',         category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'residency-renewal',     name_ar: 'قائمة تجديد الإقامة',               name_en: 'Residency / Iqama Renewal Checklist',   category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'social-security-reg',   name_ar: 'نموذج تسجيل الضمان الاجتماعي',     name_en: 'Social Security Registration Form',     category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'nda',                   name_ar: 'اتفاقية السرية وعدم الإفصاح',       name_en: 'NDA / Confidentiality Agreement',       category: 'contracts',    roles_allowed: ['hradmin','superadmin'] },
  { id: 'asset-handover',        name_ar: 'نموذج استلام عهدة / أصول',          name_en: 'Asset Handover Form',                   category: 'contracts',    roles_allowed: ['hradmin','superadmin','manager','employee'] },
  // ── Legal & Administrative ────────────────────────────────────────
  { id: 'policy-acknowledgment', name_ar: 'إقرار سياسة الشركة',               name_en: 'Company Policy Acknowledgment',         category: 'legal',        roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'code-of-conduct',       name_ar: 'إقرار مدونة السلوك',               name_en: 'Code of Conduct Acknowledgment',        category: 'legal',        roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'conflict-of-interest',  name_ar: 'إقرار تضارب المصالح',              name_en: 'Conflict of Interest Declaration',      category: 'legal',        roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'data-privacy',          name_ar: 'موافقة خصوصية البيانات',            name_en: 'Data Privacy Consent Form',             category: 'legal',        roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'authorization-letter',  name_ar: 'نموذج خطاب تفويض',                 name_en: 'Authorization Letter Template',         category: 'legal',        roles_allowed: ['hradmin','superadmin'] },
  { id: 'internal-memo',         name_ar: 'نموذج مذكرة داخلية',               name_en: 'Internal Memo Template',               category: 'legal',        roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'warning-letter',        name_ar: 'نموذج خطاب تحذير رسمي',            name_en: 'Official Warning Letter Template',      category: 'legal',        roles_allowed: ['hradmin','superadmin'] },
  { id: 'admin-decision',        name_ar: 'نموذج قرار إداري',                  name_en: 'Administrative Decision',               category: 'legal',        roles_allowed: ['hradmin','superadmin'] },
  { id: 'investigation',         name_ar: 'إشعار تحقيق',                       name_en: 'Investigation Notice',                  category: 'legal',        roles_allowed: ['hradmin','superadmin','manager'] },
  // ── Letters & Certificates ────────────────────────────────────────
  { id: 'salary-certificate',    name_ar: 'شهادة راتب',                        name_en: 'Salary Certificate',                    category: 'certificates', roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'employment-certificate',name_ar: 'شهادة عمل',                         name_en: 'Employment Certificate',                category: 'certificates', roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'experience-certificate',name_ar: 'شهادة خبرة',                        name_en: 'Experience Certificate',                category: 'certificates', roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'no-objection-letter',   name_ar: 'خطاب عدم ممانعة',                   name_en: 'No Objection Certificate',              category: 'certificates', roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'bank-letter',           name_ar: 'خطاب للبنك',                         name_en: 'Bank Letter',                           category: 'certificates', roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'embassy-letter',        name_ar: 'خطاب للسفارة',                       name_en: 'Embassy Letter',                        category: 'certificates', roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'recommendation-letter', name_ar: 'خطاب توصية',                        name_en: 'Recommendation Letter',                 category: 'certificates', roles_allowed: ['hradmin','superadmin'] },
  { id: 'letterhead',            name_ar: 'خطاب رسمي (ترويسة)',               name_en: 'Official Letterhead',                   category: 'certificates', roles_allowed: ['hradmin','superadmin'] },
  { id: 'service-certificate',   name_ar: 'شهادة انتهاء خدمة',                name_en: 'Service Certificate',                   category: 'certificates', roles_allowed: ['hradmin','superadmin','payrolladmin'] },
  // ── Payroll & Finance ─────────────────────────────────────────────
  { id: 'salary-adjustment',     name_ar: 'طلب تعديل الراتب',                  name_en: 'Salary Adjustment Request',             category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin'] },
  { id: 'salary-advance',        name_ar: 'طلب سلفة راتب',                     name_en: 'Salary Advance Request',                category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'payroll-deduction',     name_ar: 'تفويض خصم من الراتب',               name_en: 'Payroll Deduction Authorization',       category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'overtime-claim',        name_ar: 'مطالبة ساعات إضافية',               name_en: 'Overtime Claim Form',                   category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin','manager','employee'] },
  { id: 'allowance-request',     name_ar: 'نموذج طلب بدل',                     name_en: 'Allowance Request Form',                category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'expense-reimbursement', name_ar: 'نموذج سداد المصروفات',              name_en: 'Expense Reimbursement Form',            category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin','manager','employee'] },
  { id: 'final-settlement',      name_ar: 'نموذج التسوية النهائية',            name_en: 'Final Settlement Form',                 category: 'payroll',      roles_allowed: ['hradmin','superadmin','payrolladmin'] },
  // ── Attendance & Leave ────────────────────────────────────────────
  { id: 'leave',                 name_ar: 'نموذج طلب إجازة',                   name_en: 'Leave Request Form',                    category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'sick-leave',            name_ar: 'نموذج إجازة مرضية',                 name_en: 'Sick Leave Form',                       category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'unpaid-leave',          name_ar: 'طلب إجازة بدون راتب',               name_en: 'Unpaid Leave Request',                  category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'business-trip',         name_ar: 'نموذج طلب مأمورية',                 name_en: 'Business Trip Request',                 category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'attendance-correction', name_ar: 'نموذج تصحيح الدوام',               name_en: 'Attendance Correction Form',            category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'remote-work',           name_ar: 'طلب العمل عن بُعد',                 name_en: 'Remote Work Request',                   category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'shift-change',          name_ar: 'طلب تغيير الوردية',                 name_en: 'Shift Change Request',                  category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'exit-permit',           name_ar: 'تصريح خروج',                        name_en: 'Exit Permit',                           category: 'attendance',   roles_allowed: ['hradmin','superadmin','manager'] },
  // ── Disciplinary & Clearance ──────────────────────────────────────
  { id: 'disciplinary-report',   name_ar: 'تقرير مخالفة تأديبية',              name_en: 'Disciplinary Incident Report',          category: 'disciplinary', roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'investigation-minutes', name_ar: 'محضر اجتماع التحقيق',              name_en: 'Investigation Meeting Minutes',         category: 'disciplinary', roles_allowed: ['hradmin','superadmin','manager'] },
  { id: 'employee-statement',    name_ar: 'نموذج إفادة الموظف',               name_en: 'Employee Statement Form',               category: 'disciplinary', roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'disciplinary-decision', name_ar: 'نموذج قرار تأديبي',                 name_en: 'Disciplinary Decision Form',            category: 'disciplinary', roles_allowed: ['hradmin','superadmin'] },
  { id: 'resignation',           name_ar: 'خطاب استقالة',                      name_en: 'Resignation Letter',                    category: 'disciplinary', roles_allowed: ['hradmin','superadmin','employee'] },
  { id: 'clearance',             name_ar: 'نموذج براءة الذمة',                 name_en: 'Clearance Checklist',                   category: 'disciplinary', roles_allowed: ['hradmin','superadmin','payrolladmin','employee'] },
  { id: 'asset-return',          name_ar: 'نموذج إعادة الأصول',               name_en: 'Asset Return Form',                     category: 'disciplinary', roles_allowed: ['hradmin','superadmin','manager','employee'] },
  { id: 'termination',           name_ar: 'قرار إنهاء الخدمة',                 name_en: 'End of Service / Termination Letter',   category: 'disciplinary', roles_allowed: ['hradmin','superadmin'] },
];

const formSubmissionsStore: any[] = [];
let formSubmissionIdSeq = 1;

function filterCatalogByRole(role: string) {
  const forms = FORMS_CATALOG_ALL.filter(f => (f.roles_allowed as string[]).includes(role));
  const usedCats = new Set(forms.map(f => f.category));
  const categories = FORMS_CATALOG_CATEGORIES.filter(c => usedCats.has(c.id));
  return { categories, forms };
}

// GET /api/forms — recent submissions for the current user
app.get("/api/forms", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  const userSubs = formSubmissionsStore.filter(s => !s.userId || s.userId === user.id);
  res.json({ success: true, data: userSubs });
});

// GET /api/forms-catalog — role-filtered catalog { categories, forms }
app.get("/api/forms-catalog", auth, async (req, res) => {
  const user = (req as AuthReq).user;
  const catalog = filterCatalogByRole(user.role);
  res.json({ success: true, data: catalog });
});

// GET /api/forms-catalog/:id — basic DynamicFormDefinition for the form-viewer
app.get("/api/forms-catalog/:formId", auth, (req, res) => {
  const user = (req as any).user;
  const formId = req.params.formId;
  const form = FORMS_CATALOG_ALL.find(f => f.id === formId);
  if (!form) { res.status(404).json({ success: false, message: "Form not found" }); return; }
  if (!(form.roles_allowed as string[]).includes(user.role)) {
    res.status(403).json({ success: false, message: "Access denied" }); return;
  }
  res.json({ success: true, data: { id: form.id, name_ar: form.name_ar, name_en: form.name_en, category: form.category, fields: [], template: '' } });
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
  const user = (req as AuthReq).user;
  const record = { id: formSubmissionIdSeq++, userId: user.id, ...req.body, submittedAt: new Date(), status: req.body.status || "submitted" };
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

app.get("/api/dashboard/compliance-alerts", auth, async (req, res) => {
  try {
    if (!requireHR(req, res)) return;
    const user = (req as AuthReq).user;
    const { items } = await buildComplianceItems(user.companyId);
    const alerts = items
      .filter((i: any) => i.status === "expired" || i.status === "expiring_soon" || i.status === "missing")
      .sort((a: any, b: any) => {
        const w: Record<string, number> = { missing: 4, expired: 3, expiring_soon: 2, valid: 1 };
        return (w[b.status] ?? 0) - (w[a.status] ?? 0);
      })
      .slice(0, 20);
    res.json({ success: true, data: alerts });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
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
    const conditions: any[] = [eq(attendanceRecordsTable.employeeId, user.employeeId)];
    if (from) conditions.push(gte(attendanceRecordsTable.date, from));
    if (to) conditions.push(lte(attendanceRecordsTable.date, to));
    const rows = await db
      .select({
        id: attendanceRecordsTable.id,
        employeeId: attendanceRecordsTable.employeeId,
        date: attendanceRecordsTable.date,
        clockIn: attendanceRecordsTable.clockIn,
        clockOut: attendanceRecordsTable.clockOut,
        workedMinutes: attendanceRecordsTable.workedMinutes,
        status: attendanceRecordsTable.status,
        lateMinutes: attendanceRecordsTable.lateMinutes,
        overtimeMinutes: attendanceRecordsTable.overtimeMinutes,
        attendanceType: attendanceRecordsTable.attendanceType,
        notes: attendanceRecordsTable.notes,
        createdAt: attendanceRecordsTable.createdAt,
        updatedAt: attendanceRecordsTable.updatedAt,
      })
      .from(attendanceRecordsTable)
      .where(and(...conditions))
      .orderBy(desc(attendanceRecordsTable.date))
      .limit(50);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Attendance Corrections ───────────────────────────────────────────────────

function buildCorrectionRow(c: any, emp?: any) {
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeNameAr: emp ? `${emp.firstNameAr} ${emp.lastNameAr}` : undefined,
    employeeNameEn: emp ? `${emp.firstNameEn} ${emp.lastNameEn}` : undefined,
    employeeCode: emp?.employeeCode ?? undefined,
    requestType: c.correctionType,
    requestDate: c.requestDate,
    requestedClockIn: c.requestedClockIn ?? null,
    requestedClockOut: c.requestedClockOut ?? null,
    reason: c.reason ?? null,
    status: c.status,
    managerApproval: c.managerApprovedById ? "approved" : (c.status === "rejected" ? "rejected" : "pending"),
    hrApproval: c.hrApprovedById ? "approved" : (c.status === "approved" ? "approved" : (c.status === "rejected" ? "rejected" : "pending")),
    managerNotes: c.managerNotes ?? null,
    hrNotes: c.hrNotes ?? null,
    createdAt: c.createdAt,
  };
}

app.get("/api/attendance/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const rows = await db.select().from(attendanceCorrectionsTable)
      .where(eq(attendanceCorrectionsTable.employeeId, user.employeeId))
      .orderBy(desc(attendanceCorrectionsTable.createdAt));
    res.json({ success: true, data: rows.map(r => buildCorrectionRow(r)) });
  } catch (e) {
    console.error("[GET /api/attendance/me/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "No employee profile linked to this account" }); return; }
    const { requestType, requestDate, requestedClockIn, requestedClockOut, reason } = req.body;
    if (!requestDate) { res.status(400).json({ success: false, message: "requestDate is required" }); return; }
    const today = new Date().toISOString().split("T")[0]!;
    if (requestDate > today) { res.status(400).json({ success: false, message: "Future dates are not allowed for correction requests" }); return; }
    if (!requestedClockIn && !requestedClockOut) { res.status(400).json({ success: false, message: "At least one of requestedClockIn or requestedClockOut is required" }); return; }
    if (!reason?.trim()) { res.status(400).json({ success: false, message: "reason is required" }); return; }
    const existingRecord = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, user.employeeId), eq(attendanceRecordsTable.date, requestDate)));
    const attendanceRecord = existingRecord[0] ?? null;
    const [correction] = await db.insert(attendanceCorrectionsTable).values({
      employeeId: user.employeeId,
      attendanceRecordId: attendanceRecord?.id ?? null,
      correctionType: requestType ?? "time_correction",
      requestDate,
      currentClockIn: attendanceRecord?.clockIn ?? null,
      currentClockOut: attendanceRecord?.clockOut ?? null,
      requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
      requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
      reason: reason.trim(),
      status: "pending",
    }).returning();
    await logActivity(user.companyId, "attendance_correction_requested",
      `Correction request by ${user.username} for date ${requestDate}`, user.username);
    const notifPayload = {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "attendance_correction",
      entityId: correction.id,
      notificationType: "attendance_correction_created",
      titleAr: "طلب تصحيح حضور جديد",
      titleEn: "New Attendance Correction Request",
      messageAr: `قدّم ${user.username} طلب تصحيح حضور بتاريخ ${requestDate}.`,
      messageEn: `${user.username} submitted an attendance correction request for ${requestDate}.`,
      priority: "normal" as const,
      actionUrl: "/app/attendance",
    };
    await notifyRole(user.companyId, "hradmin", notifPayload);
    await notifyDirectManager(user.employeeId, notifPayload);
    res.status(201).json({ success: true, data: buildCorrectionRow(correction) });
  } catch (e) {
    console.error("[POST /api/attendance/me/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/attendance/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    let empIds: number[] | null = null;
    if (user.role === "manager") {
      const scopeConds = await getEmployeeScopeConditions(req as AuthReq);
      const deptEmps = await db.select({ id: employeesTable.id }).from(employeesTable).where(and(...scopeConds, eq(employeesTable.isDeleted, false)));
      empIds = deptEmps.map(e => e.id);
      if (empIds.length === 0) { res.json({ success: true, data: [] }); return; }
    }
    const corrections = empIds
      ? await db.select().from(attendanceCorrectionsTable)
          .where(inArray(attendanceCorrectionsTable.employeeId, empIds))
          .orderBy(desc(attendanceCorrectionsTable.createdAt))
      : await db.select().from(attendanceCorrectionsTable)
          .orderBy(desc(attendanceCorrectionsTable.createdAt));
    const empIdsNeeded = [...new Set(corrections.map(c => c.employeeId))];
    const emps = empIdsNeeded.length > 0
      ? await db.select({ id: employeesTable.id, employeeCode: employeesTable.employeeCode, firstNameAr: employeesTable.firstNameAr, lastNameAr: employeesTable.lastNameAr, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn })
          .from(employeesTable).where(inArray(employeesTable.id, empIdsNeeded))
      : [];
    const empMap = Object.fromEntries(emps.map(e => [e.id, e]));
    res.json({ success: true, data: corrections.map(c => buildCorrectionRow(c, empMap[c.employeeId])) });
  } catch (e) {
    console.error("[GET /api/attendance/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/attendance/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { employeeId, requestType, requestDate, requestedClockIn, requestedClockOut, reason } = req.body;
    const targetEmpId = employeeId ?? user.employeeId;
    if (!targetEmpId) { res.status(400).json({ success: false, message: "employeeId is required" }); return; }
    if (!requestDate) { res.status(400).json({ success: false, message: "requestDate is required" }); return; }
    if (!requestedClockIn && !requestedClockOut) { res.status(400).json({ success: false, message: "At least one requested time is required" }); return; }
    if (!reason?.trim()) { res.status(400).json({ success: false, message: "reason is required" }); return; }
    const existingRecord = await db.select().from(attendanceRecordsTable)
      .where(and(eq(attendanceRecordsTable.employeeId, targetEmpId), eq(attendanceRecordsTable.date, requestDate)));
    const attendanceRecord = existingRecord[0] ?? null;
    const [correction] = await db.insert(attendanceCorrectionsTable).values({
      employeeId: targetEmpId,
      attendanceRecordId: attendanceRecord?.id ?? null,
      correctionType: requestType ?? "time_correction",
      requestDate,
      currentClockIn: attendanceRecord?.clockIn ?? null,
      currentClockOut: attendanceRecord?.clockOut ?? null,
      requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
      requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
      reason: reason.trim(),
      status: "pending",
    }).returning();
    await logActivity(user.companyId, "attendance_correction_requested",
      `Correction request by ${user.username} for employee #${targetEmpId} on ${requestDate}`, user.username);
    res.status(201).json({ success: true, data: buildCorrectionRow(correction) });
  } catch (e) {
    console.error("[POST /api/attendance/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/attendance/requests/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const correctionId = parseInt(req.params["id"]!);
    const { notes } = req.body as { notes?: string };
    const [correction] = await db.select().from(attendanceCorrectionsTable)
      .where(eq(attendanceCorrectionsTable.id, correctionId));
    if (!correction) { res.status(404).json({ success: false, message: "Correction request not found" }); return; }
    if (correction.status === "approved" || correction.status === "rejected") {
      res.status(409).json({ success: false, message: `Request is already ${correction.status}` }); return;
    }
    const now = new Date();
    let updated: any;
    if (user.role === "manager") {
      if (correction.status !== "pending") {
        res.status(409).json({ success: false, message: "Only pending requests can be manager-approved" }); return;
      }
      [updated] = await db.update(attendanceCorrectionsTable).set({
        status: "manager_approved",
        managerApprovedById: user.userId,
        managerApprovedAt: now,
        managerNotes: notes ?? null,
      }).where(eq(attendanceCorrectionsTable.id, correctionId)).returning();
      await logActivity(user.companyId, "attendance_correction_manager_approved",
        `Manager ${user.username} approved correction #${correctionId}`, user.username);
      await notifyRole(user.companyId, "hradmin", {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "attendance_correction",
        entityId: correctionId,
        notificationType: "attendance_correction_manager_approved",
        titleAr: "طلب تصحيح حضور بانتظار HR",
        titleEn: "Attendance Correction Awaiting HR",
        messageAr: `وافق المدير ${user.username} على طلب التصحيح #${correctionId}. بانتظار اعتماد HR.`,
        messageEn: `Manager ${user.username} approved correction request #${correctionId}. Awaiting HR approval.`,
        priority: "normal",
        actionUrl: "/app/attendance",
      });
    } else if (user.role === "hradmin" || user.role === "admin") {
      if (correction.status !== "pending" && correction.status !== "manager_approved") {
        res.status(409).json({ success: false, message: "Request must be pending or manager_approved for HR approval" }); return;
      }
      [updated] = await db.update(attendanceCorrectionsTable).set({
        status: "approved",
        hrApprovedById: user.userId,
        hrApprovedAt: now,
        hrNotes: notes ?? null,
      }).where(eq(attendanceCorrectionsTable.id, correctionId)).returning();
      if (updated.requestedClockIn || updated.requestedClockOut) {
        try {
          if (updated.attendanceRecordId) {
            const recordSet: any = {};
            if (updated.requestedClockIn) recordSet.clockIn = updated.requestedClockIn;
            if (updated.requestedClockOut) recordSet.clockOut = updated.requestedClockOut;
            const [rec] = await db.select().from(attendanceRecordsTable)
              .where(eq(attendanceRecordsTable.id, updated.attendanceRecordId));
            if (rec) {
              const ci = updated.requestedClockIn ?? rec.clockIn;
              const co = updated.requestedClockOut ?? rec.clockOut;
              if (ci) {
                const ciDate = new Date(ci);
                const shiftWithGrace = 9 * 60 + 15;
                const lateMin = Math.max(0, ciDate.getHours() * 60 + ciDate.getMinutes() - shiftWithGrace);
                recordSet.lateMinutes = lateMin;
                recordSet.status = lateMin > 0 ? "late" : "present";
              }
              if (ci && co) {
                const worked = Math.max(0, Math.floor((new Date(co).getTime() - new Date(ci).getTime()) / 60000));
                recordSet.workedMinutes = worked;
              }
              await db.update(attendanceRecordsTable).set(recordSet)
                .where(eq(attendanceRecordsTable.id, updated.attendanceRecordId));
            }
          } else {
            const ciTime = updated.requestedClockIn ? new Date(updated.requestedClockIn) : null;
            const coTime = updated.requestedClockOut ? new Date(updated.requestedClockOut) : null;
            const worked = ciTime && coTime ? Math.max(0, Math.floor((coTime.getTime() - ciTime.getTime()) / 60000)) : 0;
            const shiftWithGrace = 9 * 60 + 15;
            const lateMin = ciTime ? Math.max(0, ciTime.getHours() * 60 + ciTime.getMinutes() - shiftWithGrace) : 0;
            await db.insert(attendanceRecordsTable).values({
              employeeId: updated.employeeId,
              date: updated.requestDate,
              clockIn: ciTime ?? undefined,
              clockOut: coTime ?? undefined,
              workedMinutes: worked,
              status: lateMin > 0 ? "late" : "present",
              lateMinutes: lateMin,
              attendanceType: "manual",
              notes: `Correction #${correctionId} applied`,
            }).onConflictDoNothing();
          }
        } catch (applyErr) {
          console.error("[attendance correction apply]", applyErr);
        }
      }
      await logActivity(user.companyId, "attendance_correction_hr_approved",
        `HR ${user.username} approved correction #${correctionId}`, user.username);
      await logActivity(user.companyId, "attendance_record_corrected",
        `HR ${user.username} approved and applied correction #${correctionId}`, user.username);
      const empUser = await db.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.employeeId, updated.employeeId), eq(usersTable.isDeleted, false)));
      if (empUser.length > 0) {
        await notifyUsers(empUser.map(u => u.id), {
          companyId: user.companyId,
          actorUserId: user.userId,
          entityType: "attendance_correction",
          entityId: correctionId,
          notificationType: "attendance_correction_hr_approved",
          titleAr: "تم اعتماد طلب تصحيح الحضور",
          titleEn: "Attendance Correction Approved",
          messageAr: `تم اعتماد طلب تصحيح حضورك #${correctionId} من قِبل HR.`,
          messageEn: `Your attendance correction request #${correctionId} has been approved by HR.`,
          priority: "normal",
          actionUrl: "/app/attendance",
        });
      }
    } else {
      res.status(403).json({ success: false, message: "Insufficient permissions" }); return;
    }
    res.json({ success: true, data: buildCorrectionRow(updated) });
  } catch (e) {
    console.error("[PUT /api/attendance/requests/:id/approve]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/attendance/requests/:id/reject", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const correctionId = parseInt(req.params["id"]!);
    const { notes } = req.body as { notes?: string };
    if (!notes?.trim()) { res.status(400).json({ success: false, message: "Rejection reason is required" }); return; }
    const [correction] = await db.select().from(attendanceCorrectionsTable)
      .where(eq(attendanceCorrectionsTable.id, correctionId));
    if (!correction) { res.status(404).json({ success: false, message: "Correction request not found" }); return; }
    if (correction.status === "approved" || correction.status === "rejected") {
      res.status(409).json({ success: false, message: `Request is already ${correction.status}` }); return;
    }
    const [updated] = await db.update(attendanceCorrectionsTable).set({
      status: "rejected",
      rejectionReason: notes.trim(),
    }).where(eq(attendanceCorrectionsTable.id, correctionId)).returning();
    await logActivity(user.companyId, "attendance_correction_rejected",
      `${user.username} rejected correction #${correctionId}: ${notes.trim()}`, user.username);
    const empUser = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.employeeId, updated.employeeId), eq(usersTable.isDeleted, false)));
    if (empUser.length > 0) {
      await notifyUsers(empUser.map(u => u.id), {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "attendance_correction",
        entityId: correctionId,
        notificationType: "attendance_correction_rejected",
        titleAr: "تم رفض طلب تصحيح الحضور",
        titleEn: "Attendance Correction Rejected",
        messageAr: `تم رفض طلب تصحيح حضورك #${correctionId}. السبب: ${notes.trim()}`,
        messageEn: `Your attendance correction request #${correctionId} was rejected. Reason: ${notes.trim()}`,
        priority: "normal",
        actionUrl: "/app/attendance",
      });
    }
    res.json({ success: true, data: buildCorrectionRow(updated) });
  } catch (e) {
    console.error("[PUT /api/attendance/requests/:id/reject]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/leave/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const [rows, types] = await Promise.all([
      db.select().from(leaveRequestsTable)
        .where(and(eq(leaveRequestsTable.employeeId, user.employeeId), eq(leaveRequestsTable.isDeleted, false)))
        .orderBy(desc(leaveRequestsTable.createdAt)),
      db.select().from(leaveTypesTable),
    ]);
    const typeMap = Object.fromEntries(types.map(t => [String(t.id), t]));
    const enriched = rows.map(r => {
      const lt = typeMap[String(r.leaveType)];
      return { ...r, leaveTypeId: Number(r.leaveType) || r.leaveType, leaveTypeNameAr: lt?.nameAr ?? null, leaveTypeNameEn: lt?.nameEn ?? null };
    });
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/leave/me/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "No employee profile linked to this account" }); return; }
    const { leaveTypeId, startDate, endDate, reason, attachmentUrl } = req.body;
    if (!leaveTypeId || !startDate || !endDate) {
      res.status(400).json({ success: false, message: "leaveTypeId, startDate, and endDate are required" }); return;
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      res.status(400).json({ success: false, message: "Invalid date range" }); return;
    }
    const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
    const [req2] = await db.insert(leaveRequestsTable).values({
      employeeId: user.employeeId,
      leaveType: leaveTypeId,
      startDate,
      endDate,
      totalDays,
      reason: reason || null,
      status: "pending",
    }).returning();
    await logActivity(user.companyId, "leave_request", `Leave request submitted`, null);
    const dateRange = fmtDateRange(startDate, endDate);
    const notifPayload = {
      companyId: user.companyId,
      actorUserId: user.userId,
      entityType: "leave_request",
      entityId: req2.id,
      notificationType: "leave_request_created",
      titleAr: "طلب إجازة جديد",
      titleEn: "New Leave Request",
      messageAr: `قدّم ${user.username} طلب إجازة من ${dateRange}.`,
      messageEn: `${user.username} submitted a leave request from ${dateRange}.`,
      priority: "normal" as const,
      actionUrl: "/app/leave",
    };
    await notifyRole(user.companyId, "hradmin", notifPayload);
    await notifyDirectManager(user.employeeId, notifPayload);
    res.status(201).json({ success: true, data: { ...req2, leaveTypeId: req2.leaveType } });
  } catch (e) {
    console.error("[POST /api/leave/me/requests]", e);
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
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const rows = await db.select().from(salaryAdvancesTable)
      .where(and(eq(salaryAdvancesTable.employeeId, user.employeeId), eq(salaryAdvancesTable.isDeleted, false)))
      .orderBy(desc(salaryAdvancesTable.createdAt));
    const enriched = await Promise.all(rows.map(buildAdvanceRow));
    res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/salary-advances/me]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/salary-advances/me/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: { totalRequests: 0, pendingRequests: 0, approvedAmount: 0 } }); return; }
    const rows = await db.select().from(salaryAdvancesTable)
      .where(and(eq(salaryAdvancesTable.employeeId, user.employeeId), eq(salaryAdvancesTable.isDeleted, false)));
    const totalRequests = rows.length;
    const pendingRequests = rows.filter(r => r.status === "pending").length;
    const approvedAmount = rows.filter(r => r.status === "approved" || r.status === "deducted" || r.status === "partially_deducted")
      .reduce((s, r) => s + parseFloat(r.approvedAmount ?? "0"), 0);
    res.json({ success: true, data: { totalRequests, pendingRequests, approvedAmount } });
  } catch (e) {
    console.error("[GET /api/salary-advances/me/summary]", e);
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

app.post("/api/employee/assets/:id/confirm-receive", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "Not linked to employee record" }); return; }
    const id = parseInt(req.params["id"]!);
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.assignedToEmployeeId, user.employeeId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found or not assigned to you" }); return; }
    await db.insert(activityLogsTable).values({ type: "asset_updated", description: `Employee confirmed receipt of asset "${asset.nameAr}"`, employeeName: user.name || "Employee", companyId: user.companyId });
    res.json({ success: true, message: "Receipt confirmed" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/employee/assets/:id/request-return", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "Not linked to employee record" }); return; }
    const id = parseInt(req.params["id"]!);
    const { returnDate, notes } = req.body as Record<string, any>;
    const [asset] = await db.select().from(assetsTable).where(and(eq(assetsTable.id, id), eq(assetsTable.assignedToEmployeeId, user.employeeId), eq(assetsTable.isDeleted, false)));
    if (!asset) { res.status(404).json({ success: false, message: "Asset not found or not assigned to you" }); return; }
    await db.update(assetsTable).set({ currentStatus: "pending_return" }).where(eq(assetsTable.id, id));
    await db.insert(activityLogsTable).values({ type: "asset_updated", description: `Employee requested return of asset "${asset.nameAr}" (requested date: ${returnDate || "not specified"})${notes ? ` — ${notes}` : ""}`, employeeName: user.name || "Employee", companyId: user.companyId });
    res.json({ success: true, message: "Return request submitted" });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employee/assets", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const assets = await db.select().from(assetsTable).where(and(eq(assetsTable.assignedToEmployeeId, user.employeeId), eq(assetsTable.isDeleted, false)));
    const { cats, emps, depts } = await loadAssetLookups(user.companyId);
    const shaped = await Promise.all(assets.map(a => buildAssetShape(a, depts, emps, cats)));
    res.json({ success: true, data: shaped });
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

// POST /api/overtime/me/requests — employee self-service submit (must be before /:id routes)
app.post("/api/overtime/me/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.status(403).json({ success: false, message: "Not linked to an employee record" }); return; }
    const { date, hours, reason } = req.body;
    if (!date) { res.status(400).json({ success: false, message: "Date is required" }); return; }
    const calcHours = Number(hours);
    if (!calcHours || calcHours <= 0) { res.status(400).json({ success: false, message: "Hours must be greater than 0" }); return; }
    if (!reason || !String(reason).trim()) { res.status(400).json({ success: false, message: "Reason is required" }); return; }
    const [row] = await db.insert(overtimeRequestsTable).values({
      employeeId: user.employeeId, date, hours: calcHours, reason: String(reason).trim(), status: "pending",
    }).returning();
    const otPayload = {
      companyId: user.companyId, actorUserId: user.userId,
      entityType: "overtime_request", entityId: row.id,
      notificationType: "overtime_request_created",
      titleAr: "طلب عمل إضافي جديد", titleEn: "New Overtime Request",
      messageAr: `قدّم ${user.username} طلب عمل إضافي بتاريخ ${row.date} (${row.hours} ساعات).`,
      messageEn: `${user.username} submitted an overtime request on ${row.date} (${row.hours} hrs).`,
      priority: "normal" as const, actionUrl: "/app/overtime",
    };
    await notifyRole(user.companyId, "hradmin", otPayload);
    await notifyDirectManager(user.employeeId, otPayload);
    res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /api/overtime/me/requests]", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// PUT routes — frontend calls PUT /api/overtime/requests/:id/approve|reject
app.get("/api/overtime/requests", auth, async (req, res) => {
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
app.put("/api/overtime/requests/:id/approve", auth, handleOvertimeApprove);
app.put("/api/overtime/requests/:id/reject", auth, handleOvertimeReject);

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
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: { summary: { valid: 0, expiringSoon: 0, expired: 0, missing: 0 }, alerts: [] } }); return; }
    const { items } = await buildComplianceItems(user.companyId, user.employeeId);
    const summary = { valid: 0, expiringSoon: 0, expired: 0, missing: 0 };
    for (const item of items) {
      if (item.status === "valid") summary.valid++;
      else if (item.status === "expiring_soon") summary.expiringSoon++;
      else if (item.status === "expired") summary.expired++;
      else summary.missing++;
    }
    const alerts = items.filter((i: any) => i.status !== "valid");
    res.json({ success: true, data: { summary, alerts } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Permissions ──────────────────────────────────────────────────────────────
app.get("/api/permissions/check", auth, async (req, res) => {
  res.json({ success: true, data: { allowed: true } });
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
    let data = await queryWorkflowActions(user.companyId, CAREER_ACTION_TYPES);
    // Employees can only see their own career movement records
    if (user.role === 'employee') {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      data = data.filter(r => r.employeeId === user.employeeId);
    }
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
    let data = await queryWorkflowActions(user.companyId, SALARY_ACTION_TYPES);
    // Employees can only see their own salary change records — no cross-employee leakage
    if (user.role === 'employee') {
      if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
      data = data.filter(r => r.employeeId === user.employeeId);
    }
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
    const data = await queryWorkflowActions(user.companyId, STATUS_ACTION_TYPES);
    if (user.role === 'employee') {
      const empId = user.employeeId;
      if (!empId) { res.json({ success: true, data: [] }); return; }
      res.json({ success: true, data: data.filter((r: any) => r.employeeId === empId) }); return;
    }
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
    // Employees can only access their own records — return 404 (not 403) to avoid ID enumeration
    if (user.role === 'employee' && action.employeeId !== user.employeeId) {
      res.status(404).json({ success: false, message: "Not found" }); return;
    }
    res.json({ success: true, data: action });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// POST /api/workflow/requests — create new workflow request
app.post("/api/workflow/requests", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;

    const { actionType, effectiveDate, notes, ...extra } = req.body as {
      employeeId: number; actionType: string; effectiveDate: string;
      notes?: string; [k: string]: any;
    };

    // Employees may only submit career movement requests for themselves
    let employeeId: number;
    if (user.role === 'employee') {
      if (!CAREER_ACTION_TYPES.includes(actionType)) {
        res.status(403).json({ success: false, message: "Employees can only submit career movement requests" }); return;
      }
      if (!user.employeeId) {
        res.status(403).json({ success: false, message: "No employee record linked to your account" }); return;
      }
      employeeId = user.employeeId;
    } else if (['hradmin', 'superadmin', 'manager'].includes(user.role)) {
      employeeId = parseInt(String(req.body.employeeId), 10);
    } else {
      res.status(403).json({ success: false, message: "Forbidden" }); return;
    }

    if (!employeeId || isNaN(employeeId) || employeeId <= 0 || !actionType || !effectiveDate) {
      res.status(400).json({ success: false, message: "employeeId, actionType, effectiveDate are required" }); return;
    }

    const allWorkflowTypes = [...CAREER_ACTION_TYPES, ...SALARY_ACTION_TYPES, ...STATUS_ACTION_TYPES];
    if (!allWorkflowTypes.includes(actionType)) {
      res.status(400).json({ success: false, message: "Invalid actionType for workflow" }); return;
    }

    // Salary-change specific validation — must run before DB lookup
    if (actionType === 'salary_change') {
      const basicSalary = parseFloat(String(extra.basicSalary ?? ''));
      if (extra.basicSalary == null || extra.basicSalary === '') {
        res.status(400).json({ success: false, message: "basicSalary is required for salary_change requests" }); return;
      }
      if (isNaN(basicSalary)) {
        res.status(400).json({ success: false, message: "basicSalary must be a valid number" }); return;
      }
      if (basicSalary <= 0) {
        res.status(400).json({ success: false, message: "basicSalary must be greater than zero" }); return;
      }
      if (basicSalary > 999999) {
        res.status(400).json({ success: false, message: "basicSalary value is unreasonably large" }); return;
      }
      const allowanceFields = ['housingAllowance', 'transportAllowance', 'mobileAllowance', 'mealAllowance', 'otherAllowances'];
      for (const field of allowanceFields) {
        if (extra[field] != null) {
          const val = parseFloat(String(extra[field]));
          if (isNaN(val)) {
            res.status(400).json({ success: false, message: `${field} must be a valid number` }); return;
          }
          if (val < 0) {
            res.status(400).json({ success: false, message: `${field} cannot be negative` }); return;
          }
          if (val > 999999) {
            res.status(400).json({ success: false, message: `${field} value is unreasonably large` }); return;
          }
        }
      }
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

    const auditCreateType = CAREER_ACTION_TYPES.includes(actionType) ? "movement_created"
      : SALARY_ACTION_TYPES.includes(actionType) ? "salary_change_created"
      : STATUS_ACTION_TYPES.includes(actionType) ? "status_change_created"
      : "employee_action";
    await logActivity(user.companyId, auditCreateType, `${actionType} workflow request created for employee #${employeeId}`, null);
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

    // Bug 4 fix: already-finalized records return 409 before role check
    if (['applied', 'rejected', 'cancelled'].includes(action.status)) {
      res.status(409).json({ success: false, message: `Request is already ${action.status} and cannot be approved` }); return;
    }

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
      const auditAdvType = CAREER_ACTION_TYPES.includes(action.actionType) ? "movement_approved"
        : SALARY_ACTION_TYPES.includes(action.actionType) ? "salary_change_approved"
        : STATUS_ACTION_TYPES.includes(action.actionType) ? "status_change_approved"
        : "employee_action";
      await logActivity(user.companyId, auditAdvType, `${action.actionType} advanced to ${nextStatus} for employee #${action.employeeId}`, null);
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

      const auditFinalType = CAREER_ACTION_TYPES.includes(action.actionType) ? "movement_approved"
        : SALARY_ACTION_TYPES.includes(action.actionType) ? "salary_change_applied"
        : STATUS_ACTION_TYPES.includes(action.actionType) ? "status_change_applied"
        : "employee_action";
      await logActivity(user.companyId, auditFinalType, `${action.actionType} fully approved and applied for employee #${action.employeeId}`, null);
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

    const auditRejType = CAREER_ACTION_TYPES.includes(action.actionType) ? "movement_rejected"
      : SALARY_ACTION_TYPES.includes(action.actionType) ? "salary_change_rejected"
      : STATUS_ACTION_TYPES.includes(action.actionType) ? "status_change_rejected"
      : "employee_action";
    await logActivity(user.companyId, auditRejType, `${action.actionType} rejected for employee #${action.employeeId}`, null);
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
