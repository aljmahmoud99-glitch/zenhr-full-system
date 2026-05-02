import express from "express";
import cors from "cors";
import { authMiddleware, authMiddleware as auth, hashPassword, signAccessToken, signRefreshToken, verifyToken } from "./auth.js";
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
} from "@workspace/db/schema";
import { eq, and, ilike, desc, asc, isNull, isNotNull, sql, gte, lte, ne, inArray } from "drizzle-orm";
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
    res.json({ id: u.id, username: u.username, email: u.email, role: u.role, companyId: u.companyId, employeeId: u.employeeId });
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
  res.json({ annual: 0, sick: 0, emergency: 0, maternity: 0, paternity: 0, other: 0 });
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
  res.json([]);
});

// ─── Employee enrichment helper ───────────────────────────────────────────────
async function loadOrgEnrichmentMaps(companyId: number) {
  const [allDepts, allJobs, allOrgNodes] = await Promise.all([
    db.select().from(departmentsTable).where(and(eq(departmentsTable.companyId, companyId), eq(departmentsTable.isDeleted, false))),
    db.select().from(jobTitlesTable).where(and(eq(jobTitlesTable.companyId, companyId), eq(jobTitlesTable.isDeleted, false))),
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
    const { search, departmentId, orgNodeId, branchId, status, page = "1", pageSize = "20" } = req.query as Record<string, string>;
    const pageNum = parseInt(page);
    const size = parseInt(pageSize);
    const offset = (pageNum - 1) * size;

    // Phase 1: apply data scope (own / department / org_node / company)
    const scopeConditions = await getEmployeeScopeConditions(req as AuthReq);
    const conditions = [...scopeConditions, eq(employeesTable.isDeleted, false)];

    if (status) conditions.push(eq(employeesTable.employmentStatus, status));
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

    res.json({ data: enriched, total: total?.count ?? 0, page: pageNum, pageSize: size });
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
    res.status(201).json(emp);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [emp] = await db.select().from(employeesTable).where(and(eq(employeesTable.id, parseInt(req.params["id"]!)), eq(employeesTable.isDeleted, false)));
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    const maps = await loadOrgEnrichmentMaps(user.companyId);
    let managerMap: Record<number, any> = {};
    if (emp.directManagerId) {
      const [mgr] = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.directManagerId));
      if (mgr) managerMap[mgr.id] = mgr;
    }
    res.json(enrichEmployee(emp, maps, managerMap));
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/employees/:id", auth, async (req, res) => {
  try {
    const [emp] = await db.update(employeesTable).set(req.body).where(eq(employeesTable.id, parseInt(req.params["id"]!))).returning();
    if (!emp) { res.status(404).json({ success: false, message: "Employee not found" }); return; }
    res.json(emp);
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
    res.json(emp);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id/documents", auth, async (req, res) => {
  try {
    const docs = await db.select().from(documentsTable)
      .where(and(eq(documentsTable.employeeId, parseInt(req.params["id"]!)), eq(documentsTable.isDeleted, false)));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/employees/:id/leave-balances", auth, async (req, res) => {
  try {
    const balances = await db.select().from(leaveBalancesTable)
      .where(eq(leaveBalancesTable.employeeId, parseInt(req.params["id"]!)));
    res.json(balances);
  } catch (e) {
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
    res.json(depts);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/departments", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [dept] = await db.insert(departmentsTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json(dept);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/departments/:id", auth, async (req, res) => {
  try {
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, parseInt(req.params["id"]!)));
    if (!dept) { res.status(404).json({ success: false, message: "Department not found" }); return; }
    res.json(dept);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/departments/:id", auth, async (req, res) => {
  try {
    const [dept] = await db.update(departmentsTable).set(req.body).where(eq(departmentsTable.id, parseInt(req.params["id"]!))).returning();
    res.json(dept);
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
    const titles = await db.select().from(jobTitlesTable)
      .where(and(eq(jobTitlesTable.companyId, user.companyId), eq(jobTitlesTable.isDeleted, false)))
      .orderBy(asc(jobTitlesTable.titleEn));
    res.json(titles);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/job-titles", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [title] = await db.insert(jobTitlesTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json(title);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/job-titles/:id", auth, async (req, res) => {
  try {
    const [title] = await db.update(jobTitlesTable).set(req.body).where(eq(jobTitlesTable.id, parseInt(req.params["id"]!))).returning();
    res.json(title);
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
    const { employeeId, status, year } = req.query as Record<string, string>;
    const conditions = [eq(leaveRequestsTable.isDeleted, false)];
    if (employeeId) conditions.push(eq(leaveRequestsTable.employeeId, parseInt(employeeId)));
    if (status) conditions.push(eq(leaveRequestsTable.status, status));
    const rows = await db.select().from(leaveRequestsTable).where(and(...conditions)).orderBy(desc(leaveRequestsTable.createdAt));
    res.json(rows);
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
    res.status(201).json(req2);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/leave/requests/:id", auth, async (req, res) => {
  try {
    const [lr] = await db.select().from(leaveRequestsTable).where(eq(leaveRequestsTable.id, parseInt(req.params["id"]!)));
    if (!lr) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json(lr);
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
    res.json(lr);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/requests/:id/reject", auth, async (req, res) => {
  try {
    const { reason } = req.body as { reason: string };
    const [lr] = await db.update(leaveRequestsTable).set({
      status: "rejected", rejectionReason: reason,
    }).where(eq(leaveRequestsTable.id, parseInt(req.params["id"]!))).returning();
    res.json(lr);
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
    res.json(policies);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/leave/policies", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [policy] = await db.insert(leavePoliciesTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json(policy);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/leave/policies/:id", auth, async (req, res) => {
  try {
    const [policy] = await db.update(leavePoliciesTable).set(req.body).where(eq(leavePoliciesTable.id, parseInt(req.params["id"]!))).returning();
    res.json(policy);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Payroll Runs ─────────────────────────────────────────────────────────────
app.get("/api/payroll/runs", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { year, month } = req.query as Record<string, string>;
    const conditions = [eq(payrollRunsTable.companyId, user.companyId), eq(payrollRunsTable.isDeleted, false)];
    if (year) conditions.push(eq(payrollRunsTable.runYear, parseInt(year)));
    if (month) conditions.push(eq(payrollRunsTable.runMonth, parseInt(month)));
    const runs = await db.select().from(payrollRunsTable).where(and(...conditions)).orderBy(desc(payrollRunsTable.createdAt));
    res.json(runs);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/payroll/runs", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const { runMonth, runYear, notes } = req.body as { runMonth: number; runYear: number; notes?: string };
    const employees = await db.select().from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));

    let totalGross = 0, totalNet = 0, totalDeductions = 0;
    const payslipValues = [];
    for (const emp of employees) {
      const basic = parseFloat(emp.basicSalary);
      const housing = parseFloat(String(emp.housingAllowance ?? "0"));
      const transport = parseFloat(String(emp.transportAllowance ?? "0"));
      const meal = parseFloat(String(emp.mealAllowance ?? "0"));
      const mobile = parseFloat(String(emp.mobileAllowance ?? "0"));
      const other = parseFloat(String(emp.otherAllowances ?? "0"));
      const gross = basic + housing + transport + meal + mobile + other;
      const insurable = Math.min(basic, 3000);
      const sscDeduction = emp.isSSCExempt ? 0 : insurable * 0.075;
      const taxable = gross - sscDeduction;
      let incomeTax = 0;
      if (taxable > 833.33) incomeTax = (taxable - 833.33) * 0.05;
      const deductions = sscDeduction + incomeTax;
      const net = gross - deductions;
      totalGross += gross; totalDeductions += deductions; totalNet += net;
      payslipValues.push({
        runMonth, runYear, employeeId: emp.id,
        basicSalary: String(basic), housingAllowance: String(housing), transportAllowance: String(transport),
        mealAllowance: String(meal), mobileAllowance: String(mobile), otherAllowances: String(other),
        grossSalary: String(gross), sscDeduction: String(sscDeduction), incomeTaxDeduction: String(incomeTax),
        loanDeductions: "0", otherDeductions: "0", totalDeductions: String(deductions), netSalary: String(net),
        bankName: emp.bankName, iban: emp.iban, payrollRunId: 0,
      });
    }

    const [run] = await db.insert(payrollRunsTable).values({
      companyId: user.companyId, runMonth, runYear, status: "processed",
      totalGross: String(totalGross.toFixed(3)), totalNet: String(totalNet.toFixed(3)),
      totalDeductions: String(totalDeductions.toFixed(3)), employeeCount: employees.length,
      processedAt: new Date(), notes,
    }).returning();

    if (run && payslipValues.length > 0) {
      for (const ps of payslipValues) {
        ps.payrollRunId = run.id;
        await db.insert(payslipsTable).values(ps);
      }
    }
    res.status(201).json(run);
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/runs/:id", auth, async (req, res) => {
  try {
    const [run] = await db.select().from(payrollRunsTable).where(eq(payrollRunsTable.id, parseInt(req.params["id"]!)));
    if (!run) { res.status(404).json({ success: false, message: "Not found" }); return; }
    const payslips = await db.select().from(payslipsTable).where(eq(payslipsTable.payrollRunId, run.id));
    res.json({ ...run, payslips });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/payroll/runs/:id/approve", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [run] = await db.update(payrollRunsTable).set({
      status: "approved", approvedAt: new Date(), approvedById: user.userId,
    }).where(eq(payrollRunsTable.id, parseInt(req.params["id"]!))).returning();
    res.json(run);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/slips", auth, async (req, res) => {
  try {
    const { employeeId, year, month } = req.query as Record<string, string>;
    const conditions = [];
    if (employeeId) conditions.push(eq(payslipsTable.employeeId, parseInt(employeeId)));
    if (year) conditions.push(eq(payslipsTable.runYear, parseInt(year)));
    if (month) conditions.push(eq(payslipsTable.runMonth, parseInt(month)));
    const slips = conditions.length > 0
      ? await db.select().from(payslipsTable).where(and(...conditions)).orderBy(desc(payslipsTable.createdAt))
      : await db.select().from(payslipsTable).orderBy(desc(payslipsTable.createdAt));
    res.json(slips);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/slips/:id", auth, async (req, res) => {
  try {
    const [slip] = await db.select().from(payslipsTable).where(eq(payslipsTable.id, parseInt(req.params["id"]!)));
    if (!slip) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json(slip);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Attendance ───────────────────────────────────────────────────────────────
app.get("/api/attendance", auth, async (req, res) => {
  try {
    const { employeeId, from, to } = req.query as Record<string, string>;
    const conditions = [];
    if (employeeId) conditions.push(eq(attendanceRecordsTable.employeeId, parseInt(employeeId)));
    if (from) conditions.push(gte(attendanceRecordsTable.date, from));
    if (to) conditions.push(lte(attendanceRecordsTable.date, to));
    const rows = conditions.length > 0
      ? await db.select().from(attendanceRecordsTable).where(and(...conditions)).orderBy(desc(attendanceRecordsTable.date))
      : await db.select().from(attendanceRecordsTable).orderBy(desc(attendanceRecordsTable.date)).limit(100);
    res.json(rows);
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
    res.status(201).json(record);
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
    res.json(record);
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
    res.json({ present, absent, late, totalWorkedMinutes: totalWorked, month: m, year: y });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Documents ────────────────────────────────────────────────────────────────
app.get("/api/documents", auth, async (req, res) => {
  try {
    const { employeeId, expiringWithinDays } = req.query as Record<string, string>;
    const conditions = [eq(documentsTable.isDeleted, false)];
    if (employeeId) conditions.push(eq(documentsTable.employeeId, parseInt(employeeId)));
    const docs = await db.select().from(documentsTable).where(and(...conditions)).orderBy(desc(documentsTable.createdAt));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/documents", auth, async (req, res) => {
  try {
    const [doc] = await db.insert(documentsTable).values(req.body).returning();
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/documents/:id", auth, async (req, res) => {
  try {
    const [doc] = await db.update(documentsTable).set(req.body).where(eq(documentsTable.id, parseInt(req.params["id"]!))).returning();
    res.json(doc);
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
    const conditions = [eq(assetsTable.companyId, user.companyId), eq(assetsTable.isDeleted, false)];
    if (employeeId) conditions.push(eq(assetsTable.assignedToEmployeeId, parseInt(employeeId)));
    if (status) conditions.push(eq(assetsTable.currentStatus, status));
    const assets = await db.select().from(assetsTable).where(and(...conditions)).orderBy(desc(assetsTable.createdAt));
    const emps = await db.select({ id: employeesTable.id, firstNameEn: employeesTable.firstNameEn, lastNameEn: employeesTable.lastNameEn }).from(employeesTable);
    res.json(assets.map(a => ({
      ...a,
      assignedToEmployeeName: a.assignedToEmployeeId
        ? (() => { const e = emps.find(e => e.id === a.assignedToEmployeeId); return e ? `${e.firstNameEn} ${e.lastNameEn}` : null; })()
        : null,
    })));
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/assets", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [asset] = await db.insert(assetsTable).values({ ...req.body, companyId: user.companyId }).returning();
    res.status(201).json(asset);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/assets/:id", auth, async (req, res) => {
  try {
    const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, parseInt(req.params["id"]!)));
    if (!asset) { res.status(404).json({ success: false, message: "Not found" }); return; }
    res.json(asset);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.patch("/api/assets/:id", auth, async (req, res) => {
  try {
    const [asset] = await db.update(assetsTable).set(req.body).where(eq(assetsTable.id, parseInt(req.params["id"]!))).returning();
    res.json(asset);
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
    res.json(asset);
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
    res.json(asset);
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Lookups ──────────────────────────────────────────────────────────────────
app.get("/api/lookups/nationalities", async (_req, res) => {
  const rows = await db.select().from(nationalitiesTable).where(eq(nationalitiesTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/cities", async (_req, res) => {
  const rows = await db.select().from(citiesTable).where(eq(citiesTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/banks", async (_req, res) => {
  const rows = await db.select().from(banksTable).where(eq(banksTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/document-types", async (_req, res) => {
  const rows = await db.select().from(documentTypesTable).where(eq(documentTypesTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/leave-types", async (_req, res) => {
  const rows = await db.select().from(leaveTypesTable).where(eq(leaveTypesTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/asset-categories", async (_req, res) => {
  const rows = await db.select().from(assetCategoriesTable).where(eq(assetCategoriesTable.isActive, true));
  res.json(rows);
});
app.get("/api/lookups/violation-types", async (_req, res) => {
  res.json([
    { id: 1, nameAr: "التغيب عن العمل", nameEn: "Absence", code: "absence" },
    { id: 2, nameAr: "التأخر عن العمل", nameEn: "Tardiness", code: "tardiness" },
    { id: 3, nameAr: "سوء السلوك", nameEn: "Misconduct", code: "misconduct" },
    { id: 4, nameAr: "الإهمال في العمل", nameEn: "Negligence", code: "negligence" },
    { id: 5, nameAr: "مخالفة السياسات", nameEn: "Policy Violation", code: "policy_violation" },
  ]);
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
    const { employeeId, status } = req.query as Record<string, string>;
    const conditions = [eq(overtimeRequestsTable.isDeleted, false)];
    if (employeeId) conditions.push(eq(overtimeRequestsTable.employeeId, parseInt(employeeId)));
    if (status) conditions.push(eq(overtimeRequestsTable.status, status));
    const rows = await db.select().from(overtimeRequestsTable).where(and(...conditions)).orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/overtime", auth, async (req, res) => {
  try {
    const [row] = await db.insert(overtimeRequestsTable).values({ ...req.body, status: "pending" }).returning();
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
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/overtime/:id/reject", auth, async (req, res) => {
  try {
    const { reason } = req.body as { reason: string };
    const [row] = await db.update(overtimeRequestsTable).set({ status: "rejected", rejectionReason: reason })
      .where(eq(overtimeRequestsTable.id, parseInt(req.params["id"]!))).returning();
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ─── Disciplinary ─────────────────────────────────────────────────────────────
const disciplinaryStore: any[] = [];
let disciplinaryIdSeq = 1;

app.get("/api/disciplinary", auth, async (req, res) => {
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

app.get("/api/resignations", auth, async (_req, res) => {
  res.json({ success: true, data: resignationsStore });
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
  const { employeeId } = req.query as Record<string, string>;
  const result = advancesStore.filter(a => !employeeId || String(a.employeeId) === employeeId);
  res.json({ success: true, data: result });
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
    const { employeeId, year } = req.query as Record<string, string>;
    const conditions = [];
    if (employeeId) conditions.push(eq(leaveBalancesTable.employeeId, parseInt(employeeId)));
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

app.get("/api/payroll/slips/my", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: [] }); return; }
    const slips = await db.select().from(payslipsTable).where(eq(payslipsTable.employeeId, user.employeeId)).orderBy(desc(payslipsTable.createdAt));
    res.json({ success: true, data: slips });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/payroll/slips/my/summary", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    if (!user.employeeId) { res.json({ success: true, data: { totalNetYTD: 0, lastPayslip: null } }); return; }
    const slips = await db.select().from(payslipsTable).where(eq(payslipsTable.employeeId, user.employeeId)).orderBy(desc(payslipsTable.createdAt));
    const ytd = slips.reduce((s, p) => s + parseFloat(p.netSalary), 0);
    res.json({ success: true, data: { totalNetYTD: ytd, lastPayslip: slips[0] ?? null } });
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
    const { status } = req.query as Record<string, string>;
    const conditions = [eq(overtimeRequestsTable.isDeleted, false)];
    if (status) conditions.push(eq(overtimeRequestsTable.status, status));
    const rows = await db.select().from(overtimeRequestsTable).where(and(...conditions)).orderBy(desc(overtimeRequestsTable.date));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/compliance/my-summary", auth, async (req, res) => {
  res.json({ success: true, data: { score: 100, items: 5, compliant: 5, nonCompliant: 0 } });
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
app.get("/api/reports/headcount", auth, async (req, res) => {
  try {
    const user = (req as AuthReq).user;
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(employeesTable)
      .where(and(eq(employeesTable.companyId, user.companyId), eq(employeesTable.isDeleted, false), eq(employeesTable.employmentStatus, "active")));
    res.json({ success: true, data: { totalHeadcount: count?.count ?? 0, asOf: new Date().toISOString() } });
  } catch (e) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/api/reports/compliance-summary", auth, async (_req, res) => {
  res.json({ success: true, data: { score: 92, items: 24, compliant: 22, nonCompliant: 2 } });
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
app.get("/api/career-paths", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

app.post("/api/career-paths", auth, async (req, res) => {
  res.status(201).json({ success: true, data: { id: 1, ...req.body } });
});

app.put("/api/career-paths/:id", auth, async (req, res) => {
  res.json({ success: true, data: { id: parseInt(req.params["id"]!), ...req.body } });
});

app.delete("/api/career-paths/:id", auth, async (req, res) => {
  res.status(204).send();
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
app.get("/api/job-descriptions", auth, async (_req, res) => {
  res.json({ success: true, data: [] });
});

app.post("/api/job-descriptions", auth, async (req, res) => {
  res.status(201).json({ success: true, data: { id: 1, ...req.body } });
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
