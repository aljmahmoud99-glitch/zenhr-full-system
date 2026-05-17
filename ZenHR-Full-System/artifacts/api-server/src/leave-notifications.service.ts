import type express from "express";
import { pool } from "@workspace/db";
import { fmtDateRange, notifyDirectManager, notifyEmployee, notifyRole, notifyUsers } from "./notification.service.js";

type AuthReq = express.Request & {
  user: { userId: number; username: string; role: string; companyId: number; employeeId: number | null };
};

type AuthMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => void;

const LEAVE_MUTATION_ROLES = new Set(["hradmin", "superadmin"]);
const LEAVE_REVIEW_ROLES = new Set(["hradmin", "manager", "superadmin"]);
const NOTIFICATION_ADMIN_ROLES = new Set(["hradmin", "superadmin"]);
const MAX_LEAVE_TOTAL_DAYS = 365;

function toCamel(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[key.replace(/_([a-z])/g, (_, ch) => String(ch).toUpperCase())] = value;
  }
  return out;
}

function rowsToCamel<T = any>(rows: Record<string, any>[]): T[] {
  return rows.map(row => toCamel(row) as T);
}

function intParam(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
}

function isPayrollReader(role: string): boolean {
  return role === "hradmin" || role === "payrolladmin";
}

function isHrAdmin(role: string): boolean {
  return role === "hradmin" || role === "superadmin";
}

async function employeeBelongsToCompany(companyId: number, employeeId: number) {
  const { rows } = await pool.query(
    `SELECT id, direct_manager_id, basic_salary, employment_type
     FROM employees
     WHERE id=$1 AND company_id=$2 AND is_deleted=false`,
    [employeeId, companyId],
  );
  return rows[0] || null;
}

async function managerCanAccessEmployee(user: AuthReq["user"], employeeId: number): Promise<boolean> {
  if (user.role !== "manager") return false;
  if (!user.employeeId) return false;
  if (user.employeeId === employeeId) return true;
  const { rows } = await pool.query(
    `SELECT id FROM employees
     WHERE id=$1 AND company_id=$2 AND is_deleted=false AND direct_manager_id=$3
     LIMIT 1`,
    [employeeId, user.companyId, user.employeeId],
  );
  return rows.length > 0;
}

async function managerCanApproveEmployee(user: AuthReq["user"], employeeId: number): Promise<boolean> {
  if (user.role !== "manager" || !user.employeeId) return false;
  const { rows } = await pool.query(
    `SELECT id FROM employees
     WHERE id=$1 AND company_id=$2 AND is_deleted=false AND direct_manager_id=$3
     LIMIT 1`,
    [employeeId, user.companyId, user.employeeId],
  );
  return rows.length > 0;
}

async function ensureEmployeeScope(user: AuthReq["user"], employeeId: number, forMutation = false): Promise<boolean> {
  const employee = await employeeBelongsToCompany(user.companyId, employeeId);
  if (!employee) return false;
  if (isHrAdmin(user.role)) return true;
  if (user.role === "employee") return !forMutation && user.employeeId === employeeId;
  if (user.role === "manager") return managerCanAccessEmployee(user, employeeId);
  if (user.role === "payrolladmin") return !forMutation;
  return false;
}

async function leaveTypeForCompany(companyId: number, leaveTypeId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM enterprise_leave_types
     WHERE id=$1 AND company_id=$2 AND is_deleted=false AND is_active=true`,
    [leaveTypeId, companyId],
  );
  return rows[0] || null;
}

function dateOnly(value: unknown): string {
  return String(value || "").slice(0, 10);
}

function parseFinitePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function validateLeaveTotalDays(days: unknown): { ok: true; days: number } | { ok: false; message: string } {
  const parsed = parseFinitePositiveNumber(days);
  if (parsed === null) return { ok: false, message: "totalDays must be a positive number" };
  if (parsed > MAX_LEAVE_TOTAL_DAYS) return { ok: false, message: `totalDays must not exceed ${MAX_LEAVE_TOTAL_DAYS}` };
  return { ok: true, days: parsed };
}

function computeRequestedDuration(body: any): { ok: true; days: number; hours: number; unit: string } | { ok: false; message: string } {
  const unit = String(body.durationUnit || body.duration_unit || "day");
  if (unit === "hour") {
    const hours = parseFinitePositiveNumber(body.totalHours ?? body.total_hours ?? body.requestedHours);
    if (hours === null) return { ok: false, message: "totalHours must be a positive number" };
    const days = hours / 8;
    const validation = validateLeaveTotalDays(days);
    if (!validation.ok) return validation;
    return { ok: true, days: validation.days, hours, unit };
  }
  if (unit === "half_day") return { ok: true, days: 0.5, hours: 4, unit };
  if (body.totalDays != null) {
    const validation = validateLeaveTotalDays(body.totalDays);
    if (!validation.ok) return validation;
    return { ok: true, days: validation.days, hours: validation.days * 8, unit };
  }
  const start = new Date(String(body.startDate));
  const end = new Date(String(body.endDate));
  const diff = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  const validation = validateLeaveTotalDays(diff);
  if (!validation.ok) return validation;
  return { ok: true, days: validation.days, hours: validation.days * 8, unit };
}

async function hasLeaveConflict(companyId: number, employeeId: number, startDate: string, endDate: string, excludeId?: number) {
  const params: any[] = [companyId, employeeId, startDate, endDate];
  let exclude = "";
  if (excludeId) {
    params.push(excludeId);
    exclude = `AND id <> $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT id, status FROM leave_requests
     WHERE company_id=$1
       AND employee_id=$2
       AND is_deleted=false
       AND status NOT IN ('rejected','cancelled')
       AND start_date <= $4::date
       AND end_date >= $3::date
       ${exclude}
     LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

async function insertLeaveAudit(companyId: number, leaveRequestId: number | null, actorUserId: number, action: string, beforeJson: any, afterJson: any, notes?: string | null) {
  await pool.query(
    `INSERT INTO leave_request_audit_logs
      (company_id, leave_request_id, actor_user_id, action, before_json, after_json, notes)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)`,
    [companyId, leaveRequestId, actorUserId, action, JSON.stringify(beforeJson ?? null), JSON.stringify(afterJson ?? null), notes || null],
  );
}

async function seedApprovalSteps(companyId: number, leaveRequestId: number, requiresManager: boolean, requiresHr: boolean) {
  const steps: Array<{ role: string; order: number }> = [];
  if (requiresManager) steps.push({ role: "manager", order: steps.length + 1 });
  if (requiresHr) steps.push({ role: "hradmin", order: steps.length + 1 });
  if (!steps.length) steps.push({ role: "hradmin", order: 1 });
  for (const step of steps) {
    await pool.query(
      `INSERT INTO leave_request_approval_steps (company_id, leave_request_id, step_order, approver_role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING`,
      [companyId, leaveRequestId, step.order, step.role],
    );
  }
  return steps;
}

async function refreshBalanceForRequest(companyId: number, employeeId: number, leaveTypeId: number, days: number, status: string) {
  const year = new Date().getFullYear();
  const policy = await pool.query(
    `SELECT * FROM leave_accrual_policies
     WHERE company_id=$1 AND leave_type_id=$2 AND is_deleted=false AND is_active=true
     ORDER BY id DESC LIMIT 1`,
    [companyId, leaveTypeId],
  );
  const entitlementDays = Number(policy.rows[0]?.entitlement_days ?? 0);
  const carried = Number(policy.rows[0]?.carry_forward_max_days ?? 0);
  await pool.query(
    `INSERT INTO leave_balances (employee_id, leave_policy_id, year, entitled_days, carried_forward_days, used_days, pending_days)
     SELECT $1, COALESCE(lp.id, 0), $3, $4, $5, 0, 0
     FROM leave_policies lp
     WHERE lp.company_id=$2 AND lp.leave_type=(SELECT code FROM enterprise_leave_types WHERE id=$6 AND company_id=$2)
     LIMIT 1
     ON CONFLICT DO NOTHING`,
    [employeeId, companyId, year, entitlementDays, carried, leaveTypeId],
  ).catch(() => undefined);

  const column = status === "approved" ? "used_days" : "pending_days";
  await pool.query(
    `UPDATE leave_balances lb
     SET ${column} = GREATEST(0, COALESCE(${column},0) + $1), updated_at=NOW()
     FROM leave_policies lp
     WHERE lb.leave_policy_id=lp.id AND lb.employee_id=$2 AND lb.year=$3 AND lp.company_id=$4
       AND lp.leave_type=(SELECT code FROM enterprise_leave_types WHERE id=$5 AND company_id=$4)`,
    [days, employeeId, year, companyId, leaveTypeId],
  ).catch(() => undefined);
}

async function createLeavePayrollImpact(companyId: number, request: any, type: any) {
  if (!type?.affects_payroll || type.payroll_impact_type === "none") return null;
  const { rows } = await pool.query(
    `INSERT INTO leave_payroll_impacts
      (company_id, leave_request_id, employee_id, impact_type, days, hours, amount, status)
     VALUES ($1,$2,$3,'unpaid_leave_deduction',$4,$5,COALESCE($6,0),'pending')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      companyId,
      request.id,
      request.employee_id,
      Number(request.total_days || 0),
      Number(request.total_hours || 0),
      Number(request.payroll_impact_amount || 0),
    ],
  );
  return rows[0] || null;
}

async function pendingApproverFor(companyId: number, leaveRequestId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM leave_request_approval_steps
     WHERE company_id=$1 AND leave_request_id=$2 AND decision='pending' AND is_deleted=false
     ORDER BY step_order LIMIT 1`,
    [companyId, leaveRequestId],
  );
  return rows[0] || null;
}

function notificationUrl() {
  return "/app/leave-management";
}

export async function approvedUnpaidLeaveImpactForEmployee(companyId: number, employeeId: number, month: number, year: number, dailyRate: number, hourlyRate: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(SUM(lr.total_days::numeric),0)::numeric AS days,
         COALESCE(SUM(COALESCE(lr.total_hours,0)::numeric),0)::numeric AS hours
       FROM leave_requests lr
       JOIN enterprise_leave_types elt ON elt.id::text=lr.leave_type::text AND elt.company_id=lr.company_id
       WHERE lr.company_id=$1
         AND lr.employee_id=$2
         AND lr.is_deleted=false
         AND lr.status='approved'
         AND elt.is_deleted=false
         AND elt.affects_payroll=true
         AND lr.start_date <= $4::date
         AND lr.end_date >= $3::date`,
      [companyId, employeeId, from, to],
    );
    const days = Number(rows[0]?.days || 0);
    const hours = Number(rows[0]?.hours || 0);
    const amount = hours > 0 ? money(hours * hourlyRate) : money(days * dailyRate);
    return { days, hours, amount };
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") return { days: 0, hours: 0, amount: 0 };
    throw error;
  }
}

export function registerLeaveNotificationsRoutes(app: express.Express, auth: AuthMiddleware) {
  app.get("/api/leave/management/dashboard", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (user.role === "recruiter") { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const scope = user.role === "employee" ? `AND lr.employee_id=$2` : user.role === "manager" ? `AND e.direct_manager_id=$2` : "";
      const params: any[] = [user.companyId];
      if (scope) params.push(user.employeeId || 0);
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE lr.status IN ('pending','manager_approved'))::int AS pending,
           COUNT(*) FILTER (WHERE lr.status='approved')::int AS approved,
           COUNT(*) FILTER (WHERE lr.status='rejected')::int AS rejected,
           COUNT(*) FILTER (WHERE lr.status='cancelled')::int AS cancelled,
           COALESCE(SUM(CASE WHEN lr.status='approved' THEN lr.total_days::numeric ELSE 0 END),0)::numeric AS approved_days,
           COALESCE(SUM(CASE WHEN lpi.status='pending' THEN lpi.amount ELSE 0 END),0)::numeric AS payroll_impact
         FROM leave_requests lr
         JOIN employees e ON e.id=lr.employee_id AND e.company_id=$1
         LEFT JOIN leave_payroll_impacts lpi ON lpi.leave_request_id=lr.id AND lpi.company_id=$1 AND lpi.is_deleted=false
         WHERE lr.company_id=$1 AND lr.is_deleted=false ${scope}`,
        params,
      );
      res.json({ success: true, data: toCamel(rows[0] || {}) });
    } catch (e) {
      console.error("[GET /api/leave/management/dashboard]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/types", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (user.role === "recruiter") { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const { rows } = await pool.query(
        `SELECT * FROM enterprise_leave_types
         WHERE company_id=$1 AND is_deleted=false
         ORDER BY is_active DESC, category, name_en`,
        [user.companyId],
      );
      res.json({ success: true, data: rowsToCamel(rows) });
    } catch (e) {
      console.error("[GET /api/leave/management/types]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/types", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_MUTATION_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const body = req.body || {};
      if (!body.code || !body.nameAr || !body.nameEn) {
        res.status(400).json({ success: false, message: "code, nameAr, and nameEn are required" }); return;
      }
      const { rows } = await pool.query(
        `INSERT INTO enterprise_leave_types
          (company_id, code, name_ar, name_en, description_ar, description_en, category, color, is_paid,
           allow_half_day, allow_hourly, requires_attachment, affects_payroll, payroll_impact_type, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
         RETURNING *`,
        [
          user.companyId,
          String(body.code).trim().toUpperCase(),
          body.nameAr,
          body.nameEn,
          body.descriptionAr || null,
          body.descriptionEn || null,
          body.category || "custom",
          body.color || "#2f8f6b",
          body.isPaid !== false,
          body.allowHalfDay !== false,
          body.allowHourly === true,
          body.requiresAttachment === true,
          body.affectsPayroll === true,
          body.payrollImpactType || (body.affectsPayroll ? "deduct_daily_rate" : "none"),
          user.userId,
        ],
      );
      res.status(201).json({ success: true, data: toCamel(rows[0]) });
    } catch (e: any) {
      if (e?.code === "23505") { res.status(409).json({ success: false, message: "Duplicate leave type code" }); return; }
      console.error("[POST /api/leave/management/types]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/leave/management/types/:id", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_MUTATION_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const body = req.body || {};
      const { rows } = await pool.query(
        `UPDATE enterprise_leave_types SET
           name_ar=COALESCE($3,name_ar), name_en=COALESCE($4,name_en),
           description_ar=$5, description_en=$6, category=COALESCE($7,category),
           color=COALESCE($8,color), is_paid=COALESCE($9,is_paid),
           allow_half_day=COALESCE($10,allow_half_day), allow_hourly=COALESCE($11,allow_hourly),
           requires_attachment=COALESCE($12,requires_attachment), affects_payroll=COALESCE($13,affects_payroll),
           payroll_impact_type=COALESCE($14,payroll_impact_type), is_active=COALESCE($15,is_active),
           updated_by=$16, updated_at=NOW()
         WHERE id=$1 AND company_id=$2 AND is_deleted=false
         RETURNING *`,
        [
          id, user.companyId, body.nameAr ?? null, body.nameEn ?? null,
          body.descriptionAr ?? null, body.descriptionEn ?? null, body.category ?? null,
          body.color ?? null, body.isPaid ?? null, body.allowHalfDay ?? null, body.allowHourly ?? null,
          body.requiresAttachment ?? null, body.affectsPayroll ?? null, body.payrollImpactType ?? null,
          body.isActive ?? null, user.userId,
        ],
      );
      if (!rows[0]) { res.status(404).json({ success: false, message: "Not found" }); return; }
      res.json({ success: true, data: toCamel(rows[0]) });
    } catch (e) {
      console.error("[PATCH /api/leave/management/types/:id]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.delete("/api/leave/management/types/:id", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_MUTATION_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      await pool.query(`UPDATE enterprise_leave_types SET is_deleted=true, is_active=false, updated_by=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2`, [id, user.companyId, user.userId]);
      res.json({ success: true });
    } catch (e) {
      console.error("[DELETE /api/leave/management/types/:id]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/requests", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (user.role === "recruiter") { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const page = Math.max(Number(req.query.page || 1), 1);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
      const where = ["lr.company_id=$1", "lr.is_deleted=false"];
      const params: any[] = [user.companyId];
      if (req.query.status) { params.push(req.query.status); where.push(`lr.status=$${params.length}`); }
      if (req.query.leaveTypeId) { params.push(String(req.query.leaveTypeId)); where.push(`lr.leave_type=$${params.length}`); }
      if (req.query.employeeId) { params.push(Number(req.query.employeeId)); where.push(`lr.employee_id=$${params.length}`); }
      if (req.query.from) { params.push(String(req.query.from)); where.push(`lr.start_date >= $${params.length}::date`); }
      if (req.query.to) { params.push(String(req.query.to)); where.push(`lr.end_date <= $${params.length}::date`); }
      if (req.query.q) {
        params.push(`%${String(req.query.q).toLowerCase()}%`);
        where.push(`(lower(e.employee_code) LIKE $${params.length} OR lower(concat_ws(' ', e.first_name_ar, e.last_name_ar, e.first_name_en, e.last_name_en)) LIKE $${params.length} OR lower(coalesce(lr.reason,'')) LIKE $${params.length})`);
      }
      if (user.role === "employee") {
        if (!user.employeeId) { res.json({ success: true, data: { items: [], total: 0, page, pageSize, totalPages: 0 } }); return; }
        params.push(user.employeeId);
        where.push(`lr.employee_id=$${params.length}`);
      } else if (user.role === "manager") {
        params.push(user.employeeId || 0);
        where.push(`e.direct_manager_id=$${params.length}`);
      } else if (user.role === "payrolladmin") {
        where.push(`EXISTS (SELECT 1 FROM enterprise_leave_types elt WHERE elt.id::text=lr.leave_type::text AND elt.company_id=lr.company_id AND elt.affects_payroll=true)`);
      }
      const count = await pool.query(`SELECT COUNT(*)::int AS total FROM leave_requests lr JOIN employees e ON e.id=lr.employee_id AND e.company_id=lr.company_id WHERE ${where.join(" AND ")}`, params);
      params.push(pageSize, (page - 1) * pageSize);
      const { rows } = await pool.query(
        `SELECT lr.*, elt.name_ar AS leave_type_name_ar, elt.name_en AS leave_type_name_en, elt.category,
                elt.is_paid, elt.affects_payroll,
                e.employee_code,
                concat_ws(' ', e.first_name_ar, e.middle_name_ar, e.last_name_ar) AS employee_name_ar,
                concat_ws(' ', e.first_name_en, e.middle_name_en, e.last_name_en) AS employee_name_en,
                d.name_ar AS department_name_ar, d.name_en AS department_name_en,
                ps.approver_role AS pending_approver_role
         FROM leave_requests lr
         JOIN employees e ON e.id=lr.employee_id AND e.company_id=lr.company_id
         LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
         LEFT JOIN enterprise_leave_types elt ON elt.id::text=lr.leave_type::text AND elt.company_id=lr.company_id
         LEFT JOIN LATERAL (
           SELECT approver_role FROM leave_request_approval_steps s
           WHERE s.company_id=lr.company_id AND s.leave_request_id=lr.id AND s.decision='pending' AND s.is_deleted=false
           ORDER BY s.step_order LIMIT 1
         ) ps ON true
         WHERE ${where.join(" AND ")}
         ORDER BY lr.created_at DESC, lr.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const total = Number(count.rows[0]?.total || 0);
      res.json({ success: true, data: { items: rowsToCamel(rows), total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
    } catch (e) {
      console.error("[GET /api/leave/management/requests]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/requests", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (user.role === "recruiter" || user.role === "payrolladmin") { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      if (user.role === "employee" && req.body.employeeId != null && intParam(req.body.employeeId) !== user.employeeId) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      const employeeId = user.role === "employee" ? user.employeeId : intParam(req.body.employeeId);
      const leaveTypeId = intParam(req.body.leaveTypeId || req.body.leaveType);
      if (!employeeId || !leaveTypeId || !req.body.startDate || !req.body.endDate) {
        res.status(400).json({ success: false, message: "employeeId, leaveTypeId, startDate, and endDate are required" }); return;
      }
      const targetEmployee = await employeeBelongsToCompany(user.companyId, employeeId);
      if (!targetEmployee) { res.status(404).json({ success: false, message: "Not found" }); return; }
      if (!(await ensureEmployeeScope(user, employeeId, user.role !== "employee"))) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      const type = await leaveTypeForCompany(user.companyId, leaveTypeId);
      if (!type) { res.status(400).json({ success: false, message: "Invalid leave type" }); return; }
      const startDate = dateOnly(req.body.startDate);
      const endDate = dateOnly(req.body.endDate);
      if (new Date(endDate) < new Date(startDate)) { res.status(400).json({ success: false, message: "Invalid date range" }); return; }
      const conflict = await hasLeaveConflict(user.companyId, employeeId, startDate, endDate);
      if (conflict) { res.status(409).json({ success: false, message: "Leave request conflicts with an existing request", data: toCamel(conflict) }); return; }
      const duration = computeRequestedDuration(req.body);
      if (!duration.ok) { res.status(400).json({ success: false, message: duration.message }); return; }
      const { rows } = await pool.query(
        `INSERT INTO leave_requests
          (company_id, employee_id, leave_type, start_date, end_date, total_days, total_hours, duration_unit,
           half_day_part, start_time, end_time, reason, status, current_approval_step, payroll_impact_type,
           created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending','manager',$13,$14,$14)
         RETURNING *`,
        [
          user.companyId,
          employeeId,
          String(leaveTypeId),
          startDate,
          endDate,
          duration.days,
          duration.hours,
          duration.unit,
          req.body.halfDayPart || null,
          req.body.startTime || null,
          req.body.endTime || null,
          req.body.reason || null,
          type.payroll_impact_type || "none",
          user.userId,
        ],
      );
      const request = rows[0];
      await seedApprovalSteps(user.companyId, request.id, type.requires_manager_approval, type.requires_hr_approval);
      await refreshBalanceForRequest(user.companyId, employeeId, leaveTypeId, duration.days, "pending");
      await insertLeaveAudit(user.companyId, request.id, user.userId, "submitted", null, request, req.body.reason || null);
      const payload = {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "leave_request",
        entityId: request.id,
        notificationType: "leave_request_submitted",
        titleAr: "طلب إجازة جديد",
        titleEn: "New leave request",
        messageAr: `${user.username} قدم طلب إجازة من ${fmtDateRange(startDate, endDate)}.`,
        messageEn: `${user.username} submitted a leave request from ${fmtDateRange(startDate, endDate)}.`,
        priority: "normal" as const,
        actionUrl: notificationUrl(),
      };
      await notifyRole(user.companyId, "hradmin", payload);
      await notifyDirectManager(employeeId, payload);
      res.status(201).json({ success: true, data: toCamel(request) });
    } catch (e) {
      console.error("[POST /api/leave/management/requests]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/requests/:id", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const { rows } = await pool.query(`SELECT * FROM leave_requests WHERE id=$1 AND company_id=$2 AND is_deleted=false`, [id, user.companyId]);
      const request = rows[0];
      if (!request) { res.status(404).json({ success: false, message: "Not found" }); return; }
      if (!(await ensureEmployeeScope(user, request.employee_id, false))) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const [steps, audit, impact] = await Promise.all([
        pool.query(`SELECT * FROM leave_request_approval_steps WHERE company_id=$1 AND leave_request_id=$2 AND is_deleted=false ORDER BY step_order`, [user.companyId, id]),
        pool.query(`SELECT la.*, u.username FROM leave_request_audit_logs la LEFT JOIN users u ON u.id=la.actor_user_id WHERE la.company_id=$1 AND la.leave_request_id=$2 ORDER BY la.created_at DESC`, [user.companyId, id]),
        pool.query(`SELECT * FROM leave_payroll_impacts WHERE company_id=$1 AND leave_request_id=$2 AND is_deleted=false ORDER BY created_at DESC`, [user.companyId, id]),
      ]);
      res.json({ success: true, data: { ...toCamel(request), approvalSteps: rowsToCamel(steps.rows), audit: rowsToCamel(audit.rows), payrollImpacts: rowsToCamel(impact.rows) } });
    } catch (e) {
      console.error("[GET /api/leave/management/requests/:id]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/requests/:id/approve", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_REVIEW_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const { rows } = await pool.query(`SELECT * FROM leave_requests WHERE id=$1 AND company_id=$2 AND is_deleted=false`, [id, user.companyId]);
      const request = rows[0];
      if (!request) { res.status(404).json({ success: false, message: "Not found" }); return; }
      if (user.role === "manager" && !(await managerCanApproveEmployee(user, request.employee_id))) {
        res.status(403).json({ success: false, message: "Forbidden" }); return;
      }
      const storedDays = validateLeaveTotalDays(request.total_days);
      if (!storedDays.ok) {
        res.status(400).json({ success: false, message: "Leave request has invalid totalDays and cannot be approved" }); return;
      }
      const step = await pendingApproverFor(user.companyId, id);
      if (!step) { res.status(409).json({ success: false, message: "No pending approval step" }); return; }
      if (user.role === "manager" && step.approver_role !== "manager") { res.status(403).json({ success: false, message: "Manager cannot approve this step" }); return; }
      await pool.query(`UPDATE leave_request_approval_steps SET decision='approved', approver_user_id=$1, decided_at=NOW(), notes=$2, updated_at=NOW() WHERE id=$3`, [user.userId, req.body.notes || null, step.id]);
      const next = await pendingApproverFor(user.companyId, id);
      const newStatus = next ? (next.approver_role === "hradmin" ? "manager_approved" : "pending") : "approved";
      const { rows: updatedRows } = await pool.query(
        `UPDATE leave_requests SET status=$1::varchar, current_approval_step=$2::varchar, approved_by_id=CASE WHEN $1::varchar='approved' THEN $3 ELSE approved_by_id END,
          approved_at=CASE WHEN $1::varchar='approved' THEN NOW() ELSE approved_at END, updated_by=$3, updated_at=NOW()
         WHERE id=$4 AND company_id=$5 RETURNING *`,
        [newStatus, next?.approver_role || null, user.userId, id, user.companyId],
      );
      const updated = updatedRows[0];
      await insertLeaveAudit(user.companyId, id, user.userId, "approved_step", request, updated, req.body.notes || null);
      if (newStatus === "approved") {
        const type = await leaveTypeForCompany(user.companyId, Number(request.leave_type));
        await refreshBalanceForRequest(user.companyId, request.employee_id, Number(request.leave_type), -storedDays.days, "pending");
        await refreshBalanceForRequest(user.companyId, request.employee_id, Number(request.leave_type), storedDays.days, "approved");
        await createLeavePayrollImpact(user.companyId, updated, type);
        await notifyEmployee(request.employee_id, user.companyId, {
          companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: id,
          notificationType: "leave_request_approved", titleAr: "تمت الموافقة على الإجازة", titleEn: "Leave approved",
          messageAr: `تمت الموافقة على طلب إجازتك من ${fmtDateRange(request.start_date, request.end_date)}.`,
          messageEn: `Your leave request from ${fmtDateRange(request.start_date, request.end_date)} was approved.`,
          priority: "high", actionUrl: notificationUrl(),
        });
      } else {
        await notifyRole(user.companyId, String(next.approver_role), {
          companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: id,
          notificationType: "leave_request_awaiting_approval", titleAr: "طلب إجازة بانتظار الاعتماد", titleEn: "Leave awaiting approval",
          messageAr: `طلب إجازة من ${fmtDateRange(request.start_date, request.end_date)} بانتظار المراجعة.`,
          messageEn: `A leave request from ${fmtDateRange(request.start_date, request.end_date)} is awaiting review.`,
          priority: "normal", actionUrl: notificationUrl(),
        });
      }
      res.json({ success: true, data: toCamel(updated) });
    } catch (e) {
      console.error("[POST /api/leave/management/requests/:id/approve]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/requests/:id/reject", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_REVIEW_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const { rows } = await pool.query(`SELECT * FROM leave_requests WHERE id=$1 AND company_id=$2 AND is_deleted=false`, [id, user.companyId]);
      const before = rows[0];
      if (!before) { res.status(404).json({ success: false, message: "Not found" }); return; }
      if (user.role === "manager" && !(await managerCanAccessEmployee(user, before.employee_id))) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const { rows: updatedRows } = await pool.query(
        `UPDATE leave_requests SET status='rejected', rejection_reason=$1, updated_by=$2, updated_at=NOW()
         WHERE id=$3 AND company_id=$4 RETURNING *`,
        [req.body.reason || null, user.userId, id, user.companyId],
      );
      await insertLeaveAudit(user.companyId, id, user.userId, "rejected", before, updatedRows[0], req.body.reason || null);
      await notifyEmployee(before.employee_id, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: id,
        notificationType: "leave_request_rejected", titleAr: "تم رفض طلب الإجازة", titleEn: "Leave request rejected",
        messageAr: `تم رفض طلب إجازتك من ${fmtDateRange(before.start_date, before.end_date)}.`,
        messageEn: `Your leave request from ${fmtDateRange(before.start_date, before.end_date)} was rejected.`,
        priority: "high", actionUrl: notificationUrl(),
      });
      res.json({ success: true, data: toCamel(updatedRows[0]) });
    } catch (e) {
      console.error("[POST /api/leave/management/requests/:id/reject]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/requests/:id/request-changes", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!LEAVE_REVIEW_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const { rows } = await pool.query(
        `UPDATE leave_requests SET status='changes_requested', rejection_reason=$1, updated_by=$2, updated_at=NOW()
         WHERE id=$3 AND company_id=$4 AND is_deleted=false RETURNING *`,
        [req.body.notes || req.body.reason || null, user.userId, id, user.companyId],
      );
      if (!rows[0]) { res.status(404).json({ success: false, message: "Not found" }); return; }
      await insertLeaveAudit(user.companyId, id, user.userId, "changes_requested", null, rows[0], req.body.notes || null);
      await notifyEmployee(rows[0].employee_id, user.companyId, {
        companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: id,
        notificationType: "leave_changes_requested", titleAr: "مطلوب تعديل طلب الإجازة", titleEn: "Leave changes requested",
        messageAr: "يرجى مراجعة طلب الإجازة وإجراء التعديلات المطلوبة.",
        messageEn: "Please review your leave request and apply the requested changes.",
        priority: "normal", actionUrl: notificationUrl(),
      });
      res.json({ success: true, data: toCamel(rows[0]) });
    } catch (e) {
      console.error("[POST /api/leave/management/requests/:id/request-changes]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/leave/management/requests/:id/cancel", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      const { rows } = await pool.query(`SELECT * FROM leave_requests WHERE id=$1 AND company_id=$2 AND is_deleted=false`, [id, user.companyId]);
      const before = rows[0];
      if (!before) { res.status(404).json({ success: false, message: "Not found" }); return; }
      const isOwner = user.role === "employee" && user.employeeId === before.employee_id;
      if (!isOwner && !isHrAdmin(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const finalStatus = before.status === "approved" && !isHrAdmin(user.role) ? "cancellation_pending" : "cancelled";
      const { rows: updatedRows } = await pool.query(
        `UPDATE leave_requests SET status=$1, cancellation_status=$2, cancellation_reason=$3, updated_by=$4, updated_at=NOW()
         WHERE id=$5 AND company_id=$6 RETURNING *`,
        [finalStatus, finalStatus === "cancelled" ? "approved" : "pending", req.body.reason || null, user.userId, id, user.companyId],
      );
      await pool.query(
        `INSERT INTO leave_cancellations (company_id, leave_request_id, requested_by, reason, status, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5='approved' THEN NOW() ELSE NULL END)`,
        [user.companyId, id, user.userId, req.body.reason || null, finalStatus === "cancelled" ? "approved" : "pending", finalStatus === "cancelled" ? user.userId : null],
      ).catch(() => undefined);
      await insertLeaveAudit(user.companyId, id, user.userId, "cancelled", before, updatedRows[0], req.body.reason || null);
      await notifyRole(user.companyId, "hradmin", {
        companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: id,
        notificationType: "leave_cancelled", titleAr: "تحديث إلغاء إجازة", titleEn: "Leave cancellation update",
        messageAr: `تم تحديث إلغاء طلب إجازة من ${fmtDateRange(before.start_date, before.end_date)}.`,
        messageEn: `A leave cancellation was updated for ${fmtDateRange(before.start_date, before.end_date)}.`,
        priority: "normal", actionUrl: notificationUrl(),
      });
      res.json({ success: true, data: toCamel(updatedRows[0]) });
    } catch (e) {
      console.error("[POST /api/leave/management/requests/:id/cancel]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/balances", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (user.role === "recruiter") { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const year = Number(req.query.year || new Date().getFullYear());
      const where = ["e.company_id=$1", "e.is_deleted=false"];
      const params: any[] = [user.companyId, year];
      if (user.role === "employee") {
        params.push(user.employeeId || 0);
        where.push(`e.id=$${params.length}`);
      } else if (user.role === "manager") {
        params.push(user.employeeId || 0);
        where.push(`e.direct_manager_id=$${params.length}`);
        where.push(`NOT EXISTS (
          SELECT 1
            FROM users scoped_user
           WHERE scoped_user.employee_id=e.id
             AND scoped_user.company_id=e.company_id
             AND COALESCE(scoped_user.is_deleted,false)=false
             AND COALESCE(scoped_user.is_active,true)=true
             AND scoped_user.role <> 'employee'
        )`);
      } else if (req.query.employeeId) {
        params.push(Number(req.query.employeeId));
        where.push(`e.id=$${params.length}`);
      }
      const { rows } = await pool.query(
        `SELECT e.id AS employee_id, e.employee_code,
                concat_ws(' ', e.first_name_ar, e.middle_name_ar, e.last_name_ar) AS employee_name_ar,
                concat_ws(' ', e.first_name_en, e.middle_name_en, e.last_name_en) AS employee_name_en,
                elt.id AS leave_type_id, elt.name_ar AS leave_type_name_ar, elt.name_en AS leave_type_name_en,
                COALESCE(lap.entitlement_days,0)::numeric AS entitled_days,
                COALESCE(lb.used_days,0)::numeric AS used_days,
                COALESCE(lb.pending_days,0)::numeric AS pending_days,
                COALESCE(lb.carried_forward_days,0)::numeric AS carried_forward_days,
                (COALESCE(lap.entitlement_days,0) + COALESCE(lb.carried_forward_days,0) - COALESCE(lb.used_days,0) - COALESCE(lb.pending_days,0))::numeric AS available_days
         FROM employees e
         CROSS JOIN enterprise_leave_types elt
         LEFT JOIN leave_accrual_policies lap ON lap.company_id=e.company_id AND lap.leave_type_id=elt.id AND lap.is_deleted=false AND lap.is_active=true
         LEFT JOIN leave_policies lp ON lp.company_id=e.company_id AND lp.leave_type=elt.code AND lp.is_deleted=false
         LEFT JOIN leave_balances lb ON lb.employee_id=e.id AND lb.leave_policy_id=lp.id AND lb.year=$2
         WHERE ${where.join(" AND ")} AND elt.company_id=e.company_id AND elt.is_deleted=false AND elt.is_active=true
         ORDER BY e.employee_code, elt.category`,
        params,
      );
      res.json({ success: true, data: rowsToCamel(rows) });
    } catch (e) {
      console.error("[GET /api/leave/management/balances]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/audit", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!["hradmin", "manager", "employee", "payrolladmin"].includes(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const where = ["la.company_id=$1"];
      const params: any[] = [user.companyId];
      if (req.query.leaveRequestId) {
        const leaveRequestId = intParam(req.query.leaveRequestId);
        if (!leaveRequestId) { res.status(400).json({ success: false, message: "Invalid leaveRequestId" }); return; }
        params.push(leaveRequestId);
        where.push(`la.leave_request_id=$${params.length}`);
      }
      if (user.role === "employee") { params.push(user.employeeId || 0); where.push(`lr.employee_id=$${params.length}`); }
      if (user.role === "manager") { params.push(user.employeeId || 0); where.push(`e.direct_manager_id=$${params.length}`); }
      const { rows } = await pool.query(
        `SELECT la.*, u.username, lr.employee_id, e.employee_code
         FROM leave_request_audit_logs la
         LEFT JOIN users u ON u.id=la.actor_user_id
         LEFT JOIN leave_requests lr ON lr.id=la.leave_request_id AND lr.company_id=la.company_id
         LEFT JOIN employees e ON e.id=lr.employee_id AND e.company_id=lr.company_id
         WHERE ${where.join(" AND ")}
         ORDER BY la.created_at DESC LIMIT 100`,
        params,
      );
      res.json({ success: true, data: rowsToCamel(rows) });
    } catch (e) {
      console.error("[GET /api/leave/management/audit]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/leave/management/payroll-impact", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!isPayrollReader(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const { rows } = await pool.query(
        `SELECT lpi.*, lr.start_date, lr.end_date, elt.name_ar AS leave_type_name_ar, elt.name_en AS leave_type_name_en,
                e.employee_code, concat_ws(' ', e.first_name_ar, e.middle_name_ar, e.last_name_ar) AS employee_name_ar,
                concat_ws(' ', e.first_name_en, e.middle_name_en, e.last_name_en) AS employee_name_en
         FROM leave_payroll_impacts lpi
         JOIN leave_requests lr ON lr.id=lpi.leave_request_id AND lr.company_id=lpi.company_id
         JOIN employees e ON e.id=lpi.employee_id AND e.company_id=lpi.company_id
         LEFT JOIN enterprise_leave_types elt ON elt.id::text=lr.leave_type::text AND elt.company_id=lr.company_id
         WHERE lpi.company_id=$1 AND lpi.is_deleted=false
         ORDER BY lpi.created_at DESC LIMIT 100`,
        [user.companyId],
      );
      res.json({ success: true, data: rowsToCamel(rows) });
    } catch (e) {
      console.error("[GET /api/leave/management/payroll-impact]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/notifications/center", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      const page = Math.max(Number(req.query.page || 1), 1);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100);
      const where = ["recipient_user_id=$1", "is_deleted=false"];
      const params: any[] = [user.userId];
      if (req.query.status) { params.push(req.query.status); where.push(`status=$${params.length}`); }
      if (req.query.type) { params.push(req.query.type); where.push(`notification_type=$${params.length}`); }
      const count = await pool.query(`SELECT COUNT(*)::int AS total FROM notifications WHERE ${where.join(" AND ")}`, params);
      params.push(pageSize, (page - 1) * pageSize);
      const { rows } = await pool.query(
        `SELECT * FROM notifications WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const total = Number(count.rows[0]?.total || 0);
      const items = rowsToCamel(rows).map((item: any) => {
        if (item.notificationType === "attendance_correction_hr_approved") {
          item.titleAr = "تم اعتماد طلب تصحيح الحضور";
          item.messageAr = `تم اعتماد طلب تصحيح حضورك #${item.entityId} من قبل الموارد البشرية.`;
          item.title = item.titleAr;
          item.message = item.messageAr;
        }
        if (item.notificationType === "leave_request_approved") {
          item.titleAr = "تمت الموافقة على طلب الإجازة";
          item.messageAr = "تمت الموافقة على طلب إجازتك.";
          item.title = item.titleAr;
          item.message = item.messageAr;
        }
        return item;
      });
      res.json({ success: true, data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } });
    } catch (e) {
      console.error("[GET /api/notifications/center]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/archive", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      await pool.query(`UPDATE notifications SET is_deleted=true WHERE id=$1 AND recipient_user_id=$2`, [id, user.userId]);
      res.json({ success: true });
    } catch (e) {
      console.error("[PATCH /api/notifications/:id/archive]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/unread", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      const id = intParam(req.params.id);
      if (!id) { res.status(400).json({ success: false, message: "Invalid id" }); return; }
      await pool.query(
        `UPDATE notifications SET status='unread', read_at=NULL WHERE id=$1 AND recipient_user_id=$2 AND is_deleted=false`,
        [id, user.userId],
      );
      res.json({ success: true });
    } catch (e) {
      console.error("[PATCH /api/notifications/:id/unread]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.get("/api/notifications/delivery-logs", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!NOTIFICATION_ADMIN_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const { rows } = await pool.query(
        `SELECT ndl.*, n.notification_type, n.title_ar, n.title_en
         FROM notification_delivery_logs ndl
         LEFT JOIN notifications n ON n.id=ndl.notification_id
         WHERE ndl.company_id=$1
         ORDER BY ndl.attempted_at DESC LIMIT 100`,
        [user.companyId],
      );
      res.json({ success: true, data: rowsToCamel(rows) });
    } catch (e) {
      console.error("[GET /api/notifications/delivery-logs]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/notifications/reminders/leave-approvals", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      if (!NOTIFICATION_ADMIN_ROLES.has(user.role)) { res.status(403).json({ success: false, message: "Forbidden" }); return; }
      const { rows } = await pool.query(
        `SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, ps.approver_role
         FROM leave_requests lr
         JOIN LATERAL (
           SELECT approver_role FROM leave_request_approval_steps s
           WHERE s.company_id=lr.company_id AND s.leave_request_id=lr.id AND s.decision='pending' AND s.is_deleted=false
           ORDER BY step_order LIMIT 1
         ) ps ON true
         WHERE lr.company_id=$1 AND lr.is_deleted=false AND lr.status IN ('pending','manager_approved')
         LIMIT 100`,
        [user.companyId],
      );
      let sent = 0;
      for (const row of rows) {
        await notifyRole(user.companyId, row.approver_role, {
          companyId: user.companyId, actorUserId: user.userId, entityType: "leave_request", entityId: row.id,
          notificationType: "leave_approval_reminder", titleAr: "تذكير باعتماد إجازة", titleEn: "Leave approval reminder",
          messageAr: `يوجد طلب إجازة بانتظار الاعتماد من ${fmtDateRange(row.start_date, row.end_date)}.`,
          messageEn: `A leave request from ${fmtDateRange(row.start_date, row.end_date)} is waiting for approval.`,
          priority: "normal", actionUrl: notificationUrl(),
        });
        sent++;
      }
      res.status(201).json({ success: true, data: { sent } });
    } catch (e) {
      console.error("[POST /api/notifications/reminders/leave-approvals]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  app.post("/api/notifications/center/test", auth, async (req, res) => {
    try {
      const user = (req as AuthReq).user;
      await notifyUsers([user.userId], {
        companyId: user.companyId,
        actorUserId: user.userId,
        entityType: "notification",
        notificationType: "phase_d_test",
        titleAr: "إشعار تجريبي",
        titleEn: "Test notification",
        messageAr: "تم إنشاء إشعار تجريبي في مركز الإشعارات.",
        messageEn: "A test notification was created in the notification center.",
        priority: "normal",
        actionUrl: "/app/notifications",
      });
      res.status(201).json({ success: true });
    } catch (e) {
      console.error("[POST /api/notifications/center/test]", e);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });
}
