import type express from "express";
import { pool } from "@workspace/db";

type AuthReq = express.Request & {
  user: { userId: number; username: string; role: string; companyId: number; employeeId: number | null };
};

type ApiUser = AuthReq["user"];

const MANAGE_ROLES = new Set(["hradmin", "superadmin"]);

function canManage(user: ApiUser): boolean {
  return MANAGE_ROLES.has(user.role);
}

function requireManage(req: express.Request, res: express.Response): ApiUser | null {
  const user = (req as AuthReq).user;
  if (!canManage(user)) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return null;
  }
  if (!user.companyId) {
    res.status(403).json({ success: false, message: "Company scope is required" });
    return null;
  }
  return user;
}

function camel(row: any): any {
  if (!row) return row;
  const out: any = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
  }
  return out;
}

function toInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function sqlDate(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const date = new Date(`${valueText.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : valueText.slice(0, 10);
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateText: string, months: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateText: string | Date | null | undefined): number | null {
  if (!dateText) return null;
  const raw: any = dateText as any;
  const iso = typeof raw?.toISOString === "function"
    ? raw.toISOString().slice(0, 10)
    : String(dateText).includes("T")
      ? String(dateText).slice(0, 10)
      : String(dateText).slice(0, 10);
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.ceil((target - todayUtc) / 86400000);
}

function computeContractStatus(endDate: string | null, requestedStatus: string | null): string {
  if (requestedStatus && requestedStatus !== "active") return requestedStatus;
  const remaining = daysUntil(endDate);
  if (remaining == null) return requestedStatus || "active";
  if (remaining < 0) return "expired";
  if (remaining <= 30) return "pending_renewal";
  return requestedStatus || "active";
}

function computeComplianceStatus(body: any, endDate: string | null): string {
  if (body.complianceStatus) return text(body.complianceStatus);
  const remaining = daysUntil(endDate);
  if (remaining == null) return "pending_review";
  if (remaining < 0) return "critical";
  if (remaining <= 30) return "warning";
  return "compliant";
}

function statusCode(error: any): number {
  if (error?.statusCode) return error.statusCode;
  if (error?.code === "42P01" || error?.code === "42703") return 503;
  if (error?.code === "23505") return 409;
  if (error?.code === "23503") return 400;
  return 500;
}

function errorMessage(error: any): string {
  if (error?.message && error?.statusCode) return error.message;
  if (error?.code === "42P01" || error?.code === "42703") return "Compliance contracts migration has not been applied";
  if (error?.code === "23505") return "Duplicate contract code or number";
  if (error?.code === "23503") return "Invalid referenced record";
  return "Internal server error";
}

function httpError(statusCode: number, message: string) {
  const e: any = new Error(message);
  e.statusCode = statusCode;
  return e;
}

async function assertEmployee(companyId: number, employeeId: number) {
  const { rows } = await pool.query(
    `SELECT id, employee_code, first_name_ar, middle_name_ar, last_name_ar, first_name_en, middle_name_en, last_name_en
     FROM employees WHERE id=$1 AND company_id=$2 AND COALESCE(is_deleted,false)=false`,
    [employeeId, companyId],
  );
  if (!rows[0]) throw httpError(400, "Employee does not belong to this company");
  return rows[0];
}

async function assertContractType(companyId: number, contractTypeId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM contract_types WHERE id=$1 AND company_id=$2 AND is_deleted=false`,
    [contractTypeId, companyId],
  );
  if (!rows[0]) throw httpError(400, "Contract type does not belong to this company");
  return rows[0];
}

async function audit(companyId: number, contractId: number | null, employeeId: number | null, action: string, userId: number, previousValues: any, newValues: any, notes?: string) {
  await pool.query(
    `INSERT INTO contract_audit_logs (company_id, contract_id, employee_id, action, previous_values, new_values, changed_by, notes)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
    [companyId, contractId, employeeId, action, previousValues ? JSON.stringify(previousValues) : null, newValues ? JSON.stringify(newValues) : null, userId, notes || null],
  );
}

async function ensureEnterpriseDocumentCategory(companyId: number, code: string, nameAr: string, nameEn: string, moduleScope = "hr", userId?: number) {
  const normalized = String(code || "").trim().toUpperCase();
  const existing = await pool.query(
    `SELECT id FROM enterprise_document_categories WHERE company_id=$1 AND code=$2 AND is_deleted=false LIMIT 1`,
    [companyId, normalized],
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const { rows } = await pool.query(
    `INSERT INTO enterprise_document_categories
       (company_id, code, name_ar, name_en, module_scope, requires_expiry, requires_approval, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,false,true,$6,$6)
     ON CONFLICT (company_id, code) DO UPDATE SET updated_at=NOW()
     RETURNING id`,
    [companyId, normalized, nameAr, nameEn, moduleScope, userId ?? null],
  );
  return Number(rows[0].id);
}

async function createEnterpriseDocumentIfMissing(input: {
  companyId: number;
  categoryCode: string;
  categoryNameAr: string;
  categoryNameEn: string;
  moduleScope?: string;
  employeeId?: number | null;
  sourceModule: string;
  entityType: string;
  entityId: number;
  titleAr: string;
  titleEn: string;
  documentNumber?: string | null;
  status?: string;
  fileObjectId?: number | null;
  fileName?: string | null;
  fileUrl?: string | null;
  expiresAt?: string | null;
  metadata?: any;
  userId?: number | null;
}) {
  const existing = await pool.query(
    `SELECT id FROM enterprise_documents
      WHERE company_id=$1 AND source_module=$2 AND entity_type=$3 AND entity_id=$4 AND is_deleted=false
      LIMIT 1`,
    [input.companyId, input.sourceModule, input.entityType, input.entityId],
  );
  if (existing.rows[0]) return Number(existing.rows[0].id);
  const categoryId = await ensureEnterpriseDocumentCategory(
    input.companyId,
    input.categoryCode,
    input.categoryNameAr,
    input.categoryNameEn,
    input.moduleScope || input.sourceModule || "hr",
    input.userId ?? undefined,
  );
  const { rows } = await pool.query(
    `INSERT INTO enterprise_documents
      (company_id, category_id, employee_id, source_module, entity_type, entity_id,
       title_ar, title_en, document_number, status, tags, metadata_json,
       file_object_id, file_name, file_url, expires_at, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$17)
     RETURNING id`,
    [
      input.companyId,
      categoryId,
      input.employeeId ?? null,
      input.sourceModule,
      input.entityType,
      input.entityId,
      input.titleAr,
      input.titleEn,
      input.documentNumber ?? null,
      input.status || "draft",
      JSON.stringify(["canonical", input.entityType]),
      JSON.stringify(input.metadata || {}),
      input.fileObjectId ?? null,
      input.fileName ?? null,
      input.fileUrl ?? null,
      input.expiresAt ?? null,
      input.userId ?? null,
    ],
  );
  return Number(rows[0].id);
}

function contractSelect() {
  return `
    ec.*,
    ct.code AS contract_type_code,
    ct.name_ar AS contract_type_name_ar,
    ct.name_en AS contract_type_name_en,
    e.employee_code,
    CONCAT_WS(' ', e.first_name_ar, e.middle_name_ar, e.last_name_ar) AS employee_name_ar,
    CONCAT_WS(' ', e.first_name_en, e.middle_name_en, e.last_name_en) AS employee_name_en,
    d.name_ar AS department_name_ar,
    d.name_en AS department_name_en,
    COALESCE(att.attachments_count, 0)::int AS attachments_count,
    COALESCE(req.required_documents_count, 0)::int AS required_documents_count
  `;
}

async function getContract(companyId: number, id: number) {
  const { rows } = await pool.query(
    `SELECT ${contractSelect()}
     FROM employee_contracts ec
     JOIN contract_types ct ON ct.id=ec.contract_type_id AND ct.company_id=ec.company_id
     JOIN employees e ON e.id=ec.employee_id AND e.company_id=ec.company_id
     LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
     LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS attachments_count FROM contract_attachments WHERE is_deleted=false GROUP BY company_id, contract_id) att
       ON att.company_id=ec.company_id AND att.contract_id=ec.id
     LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS required_documents_count FROM contract_required_documents WHERE is_deleted=false GROUP BY company_id, contract_id) req
       ON req.company_id=ec.company_id AND req.contract_id=ec.id
     WHERE ec.id=$1 AND ec.company_id=$2 AND ec.is_deleted=false`,
    [id, companyId],
  );
  return rows[0] ? camel({ ...rows[0], days_until_expiry: daysUntil(rows[0].end_date) }) : null;
}

function validateContractPayload(body: any, partial = false) {
  const employeeId = toInt(body.employeeId);
  const contractTypeId = toInt(body.contractTypeId);
  const titleAr = text(body.titleAr);
  const titleEn = text(body.titleEn);
  const startDate = sqlDate(body.startDate);
  const endDate = sqlDate(body.endDate);
  const probationEndDate = sqlDate(body.probationEndDate);

  if (!partial) {
    if (!employeeId) throw httpError(400, "employeeId is required");
    if (!contractTypeId) throw httpError(400, "contractTypeId is required");
    if (!titleAr || !titleEn) throw httpError(400, "titleAr and titleEn are required");
    if (!startDate) throw httpError(400, "startDate is required");
  }
  if (startDate && endDate && endDate < startDate) throw httpError(400, "endDate must be after startDate");
  if (startDate && probationEndDate && probationEndDate < startDate) throw httpError(400, "probationEndDate must be after startDate");
  return { employeeId, contractTypeId, titleAr, titleEn, startDate, endDate, probationEndDate };
}

export function registerComplianceContractsRoutes(app: express.Express, auth: express.RequestHandler) {
  app.get("/api/compliance-contracts/dashboard", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const { rows } = await pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE contract_status='active')::int AS active,
           COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date < CURRENT_DATE)::int AS expired,
           COUNT(*) FILTER (WHERE end_date IS NOT NULL AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS expiring_soon,
           COUNT(*) FILTER (WHERE probation_end_date IS NOT NULL AND probation_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')::int AS probation_due,
           COUNT(*) FILTER (WHERE compliance_status IN ('warning','critical','missing_documents'))::int AS compliance_risks
         FROM employee_contracts
         WHERE company_id=$1 AND is_deleted=false`,
        [user.companyId],
      );
      const byStatus = await pool.query(
        `SELECT compliance_status, COUNT(*)::int AS count
         FROM employee_contracts WHERE company_id=$1 AND is_deleted=false
         GROUP BY compliance_status ORDER BY compliance_status`,
        [user.companyId],
      );
      res.json({ success: true, data: { ...camel(rows[0] || {}), byStatus: byStatus.rows.map(camel) } });
    } catch (e: any) {
      console.error("[GET /api/compliance-contracts/dashboard]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.get("/api/compliance-contracts/types", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const { rows } = await pool.query(
        `SELECT * FROM contract_types
         WHERE company_id=$1 AND is_deleted=false
           AND ($2::text IS NULL OR code ILIKE $2 OR name_ar ILIKE $2 OR name_en ILIKE $2)
         ORDER BY is_active DESC, name_en ASC`,
        [user.companyId, req.query["q"] ? `%${String(req.query["q"])}%` : null],
      );
      res.json({ success: true, data: rows.map(camel) });
    } catch (e: any) {
      console.error("[GET /api/compliance-contracts/types]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.post("/api/compliance-contracts/types", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const code = text(req.body.code).toUpperCase();
      const nameAr = text(req.body.nameAr);
      const nameEn = text(req.body.nameEn);
      if (!code || !nameAr || !nameEn) throw httpError(400, "code, nameAr, and nameEn are required");
      const { rows } = await pool.query(
        `INSERT INTO contract_types (company_id, code, name_ar, name_en, description_ar, description_en, default_duration_months, default_probation_days, renewal_notice_days, requires_attachment, is_active, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        [
          user.companyId, code, nameAr, nameEn, nullableText(req.body.descriptionAr), nullableText(req.body.descriptionEn),
          toInt(req.body.defaultDurationMonths), toInt(req.body.defaultProbationDays) || 90, toInt(req.body.renewalNoticeDays) || 30,
          req.body.requiresAttachment !== false, req.body.isActive !== false, user.userId,
        ],
      );
      res.status(201).json({ success: true, data: camel(rows[0]) });
    } catch (e: any) {
      console.error("[POST /api/compliance-contracts/types]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.patch("/api/compliance-contracts/types/:id", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid type id");
      const { rows } = await pool.query(
        `UPDATE contract_types SET
           code=COALESCE($1, code),
           name_ar=COALESCE($2, name_ar),
           name_en=COALESCE($3, name_en),
           description_ar=$4,
           description_en=$5,
           default_duration_months=$6,
           default_probation_days=COALESCE($7, default_probation_days),
           renewal_notice_days=COALESCE($8, renewal_notice_days),
           requires_attachment=COALESCE($9, requires_attachment),
           is_active=COALESCE($10, is_active),
           updated_by=$11,
           updated_at=NOW()
         WHERE id=$12 AND company_id=$13 AND is_deleted=false RETURNING *`,
        [
          req.body.code ? text(req.body.code).toUpperCase() : null, req.body.nameAr ? text(req.body.nameAr) : null, req.body.nameEn ? text(req.body.nameEn) : null,
          req.body.descriptionAr === undefined ? null : nullableText(req.body.descriptionAr),
          req.body.descriptionEn === undefined ? null : nullableText(req.body.descriptionEn),
          req.body.defaultDurationMonths === undefined ? null : toInt(req.body.defaultDurationMonths),
          req.body.defaultProbationDays === undefined ? null : toInt(req.body.defaultProbationDays),
          req.body.renewalNoticeDays === undefined ? null : toInt(req.body.renewalNoticeDays),
          req.body.requiresAttachment === undefined ? null : req.body.requiresAttachment !== false,
          req.body.isActive === undefined ? null : req.body.isActive !== false,
          user.userId, id, user.companyId,
        ],
      );
      if (!rows[0]) return res.status(404).json({ success: false, message: "Contract type not found" });
      res.json({ success: true, data: camel(rows[0]) });
    } catch (e: any) {
      console.error("[PATCH /api/compliance-contracts/types/:id]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.get("/api/compliance-contracts/contracts", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const page = Math.max(1, toInt(req.query["page"]) || 1);
      const pageSize = Math.min(100, Math.max(5, toInt(req.query["pageSize"]) || 20));
      const offset = (page - 1) * pageSize;
      const params: any[] = [user.companyId];
      const where = [`ec.company_id=$1`, `ec.is_deleted=false`];
      const q = text(req.query["q"]);
      if (q) {
        params.push(`%${q}%`);
        where.push(`(ec.contract_number ILIKE $${params.length} OR ec.title_ar ILIKE $${params.length} OR ec.title_en ILIKE $${params.length} OR e.employee_code ILIKE $${params.length} OR e.first_name_ar ILIKE $${params.length} OR e.last_name_ar ILIKE $${params.length} OR e.first_name_en ILIKE $${params.length} OR e.last_name_en ILIKE $${params.length})`);
      }
      const status = text(req.query["status"]);
      if (status) {
        params.push(status);
        where.push(`ec.contract_status=$${params.length}`);
      }
      const complianceStatus = text(req.query["complianceStatus"]);
      if (complianceStatus) {
        params.push(complianceStatus);
        where.push(`ec.compliance_status=$${params.length}`);
      }
      const employeeId = toInt(req.query["employeeId"]);
      if (employeeId) {
        params.push(employeeId);
        where.push(`ec.employee_id=$${params.length}`);
      }
      const typeId = toInt(req.query["contractTypeId"]);
      if (typeId) {
        params.push(typeId);
        where.push(`ec.contract_type_id=$${params.length}`);
      }
      if (req.query["expiringDays"]) {
        const days = toInt(req.query["expiringDays"]) || 30;
        where.push(`ec.end_date IS NOT NULL AND ec.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${days} days'`);
      }
      const whereSql = where.join(" AND ");
      const total = await pool.query(
        `SELECT COUNT(*)::int AS total FROM employee_contracts ec JOIN employees e ON e.id=ec.employee_id AND e.company_id=ec.company_id WHERE ${whereSql}`,
        params,
      );
      params.push(pageSize, offset);
      const { rows } = await pool.query(
        `SELECT ${contractSelect()}
         FROM employee_contracts ec
         JOIN contract_types ct ON ct.id=ec.contract_type_id AND ct.company_id=ec.company_id
         JOIN employees e ON e.id=ec.employee_id AND e.company_id=ec.company_id
         LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
         LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS attachments_count FROM contract_attachments WHERE is_deleted=false GROUP BY company_id, contract_id) att
           ON att.company_id=ec.company_id AND att.contract_id=ec.id
         LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS required_documents_count FROM contract_required_documents WHERE is_deleted=false GROUP BY company_id, contract_id) req
           ON req.company_id=ec.company_id AND req.contract_id=ec.id
         WHERE ${whereSql}
         ORDER BY ec.end_date NULLS LAST, ec.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      const totalCount = Number(total.rows[0]?.total || 0);
      res.json({ success: true, data: { items: rows.map((r: any) => camel({ ...r, days_until_expiry: daysUntil(r.end_date) })), total: totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize) } });
    } catch (e: any) {
      console.error("[GET /api/compliance-contracts/contracts]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.get("/api/compliance-contracts/contracts/:id", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid contract id");
      const contract = await getContract(user.companyId, id);
      if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });
      const [history, attachments, requiredDocuments] = await Promise.all([
        pool.query(`SELECT cal.*, u.username FROM contract_audit_logs cal LEFT JOIN users u ON u.id=cal.changed_by WHERE cal.company_id=$1 AND cal.contract_id=$2 ORDER BY cal.changed_at DESC LIMIT 50`, [user.companyId, id]),
        pool.query(
          `SELECT ca.*, ed.id AS enterprise_document_id, ed.status AS enterprise_document_status, ed.file_object_id AS enterprise_file_object_id
             FROM contract_attachments ca
             LEFT JOIN enterprise_documents ed
               ON ed.company_id=ca.company_id
              AND ed.source_module='compliance'
              AND ed.entity_type='contract_attachment'
              AND ed.entity_id=ca.id
              AND ed.is_deleted=false
            WHERE ca.company_id=$1 AND ca.contract_id=$2 AND ca.is_deleted=false
            ORDER BY ca.uploaded_at DESC`,
          [user.companyId, id],
        ),
        pool.query(
          `SELECT crd.*, ed.id AS enterprise_document_id, ed.status AS enterprise_document_status, ed.metadata_json AS enterprise_document_metadata
             FROM contract_required_documents crd
             LEFT JOIN enterprise_documents ed
               ON ed.company_id=crd.company_id
              AND ed.source_module='compliance'
              AND ed.entity_type='contract_required_document'
              AND ed.entity_id=crd.id
              AND ed.is_deleted=false
            WHERE crd.company_id=$1 AND (crd.contract_id=$2 OR crd.contract_type_id=$3) AND crd.is_deleted=false
            ORDER BY crd.is_mandatory DESC, crd.name_en ASC`,
          [user.companyId, id, contract.contractTypeId],
        ),
      ]);
      res.json({ success: true, data: { ...contract, history: history.rows.map(camel), attachments: attachments.rows.map(camel), requiredDocuments: requiredDocuments.rows.map(camel) } });
    } catch (e: any) {
      console.error("[GET /api/compliance-contracts/contracts/:id]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.post("/api/compliance-contracts/contracts", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const payload = validateContractPayload(req.body);
      await assertEmployee(user.companyId, payload.employeeId!);
      const type = await assertContractType(user.companyId, payload.contractTypeId!);
      const startDate = payload.startDate!;
      const endDate = payload.endDate || (type.default_duration_months ? addMonths(startDate, Number(type.default_duration_months)) : null);
      const probationEndDate = payload.probationEndDate || (type.default_probation_days ? addDays(startDate, Number(type.default_probation_days)) : null);
      const renewalNoticeDate = endDate && type.renewal_notice_days ? addDays(endDate, -Number(type.renewal_notice_days)) : null;
      const contractStatus = computeContractStatus(endDate, text(req.body.contractStatus) || "active");
      const complianceStatus = computeComplianceStatus(req.body, endDate);
      const { rows } = await pool.query(
        `INSERT INTO employee_contracts (
           company_id, employee_id, contract_type_id, contract_number, title_ar, title_en,
           start_date, end_date, probation_end_date, renewal_notice_date, renewal_status,
           contract_status, compliance_status, auto_renewal, salary_amount, currency,
           notes_ar, notes_en, created_by, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
         RETURNING *`,
        [
          user.companyId, payload.employeeId, payload.contractTypeId, nullableText(req.body.contractNumber), payload.titleAr, payload.titleEn,
          startDate, endDate, probationEndDate, renewalNoticeDate, text(req.body.renewalStatus) || "not_required",
          contractStatus, complianceStatus, req.body.autoRenewal === true, req.body.salaryAmount ?? null, text(req.body.currency) || "JOD",
          nullableText(req.body.notesAr), nullableText(req.body.notesEn), user.userId,
        ],
      );
      await audit(user.companyId, rows[0].id, rows[0].employee_id, "created", user.userId, null, rows[0], "Contract created");
      try {
        await createEnterpriseDocumentIfMissing({
          companyId: user.companyId,
          categoryCode: "EMPLOYEE_CONTRACTS",
          categoryNameAr: "عقود الموظفين",
          categoryNameEn: "Employee Contracts",
          moduleScope: "hr",
          employeeId: rows[0].employee_id,
          sourceModule: "compliance",
          entityType: "employee_contract",
          entityId: Number(rows[0].id),
          titleAr: rows[0].title_ar,
          titleEn: rows[0].title_en,
          documentNumber: rows[0].contract_number,
          status: "draft",
          metadata: { requiredState: "pending_upload", contractId: rows[0].id, contractStatus: rows[0].contract_status, complianceStatus: rows[0].compliance_status },
          userId: user.userId,
        });
      } catch (docErr: any) {
        if (!["42P01", "42703"].includes(String(docErr?.code ?? ""))) throw docErr;
      }
      res.status(201).json({ success: true, data: await getContract(user.companyId, rows[0].id) });
    } catch (e: any) {
      console.error("[POST /api/compliance-contracts/contracts]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.patch("/api/compliance-contracts/contracts/:id", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid contract id");
      const before = await getContract(user.companyId, id);
      if (!before) return res.status(404).json({ success: false, message: "Contract not found" });
      const payload = validateContractPayload(req.body, true);
      if (payload.employeeId) await assertEmployee(user.companyId, payload.employeeId);
      if (payload.contractTypeId) await assertContractType(user.companyId, payload.contractTypeId);
      const startDate = payload.startDate || before.startDate;
      const endDate = req.body.endDate === undefined ? before.endDate : payload.endDate;
      const probationEndDate = req.body.probationEndDate === undefined ? before.probationEndDate : payload.probationEndDate;
      const contractStatus = computeContractStatus(endDate, req.body.contractStatus ? text(req.body.contractStatus) : null);
      const complianceStatus = computeComplianceStatus(req.body, endDate);
      const renewalNoticeDate = req.body.renewalNoticeDate === undefined ? before.renewalNoticeDate : sqlDate(req.body.renewalNoticeDate);
      const { rows } = await pool.query(
        `UPDATE employee_contracts SET
          employee_id=COALESCE($1, employee_id),
          contract_type_id=COALESCE($2, contract_type_id),
          contract_number=$3,
          title_ar=COALESCE($4, title_ar),
          title_en=COALESCE($5, title_en),
          start_date=COALESCE($6, start_date),
          end_date=$7,
          probation_end_date=$8,
          renewal_notice_date=$9,
          renewal_status=COALESCE($10, renewal_status),
          contract_status=COALESCE($11, contract_status),
          compliance_status=COALESCE($12, compliance_status),
          auto_renewal=COALESCE($13, auto_renewal),
          salary_amount=$14,
          currency=COALESCE($15, currency),
          notes_ar=$16,
          notes_en=$17,
          updated_by=$18,
          updated_at=NOW()
         WHERE id=$19 AND company_id=$20 AND is_deleted=false RETURNING *`,
        [
          payload.employeeId, payload.contractTypeId,
          req.body.contractNumber === undefined ? before.contractNumber : nullableText(req.body.contractNumber),
          payload.titleAr || null, payload.titleEn || null, startDate, endDate, probationEndDate, renewalNoticeDate,
          req.body.renewalStatus ? text(req.body.renewalStatus) : null, contractStatus, complianceStatus,
          req.body.autoRenewal === undefined ? null : req.body.autoRenewal === true,
          req.body.salaryAmount === undefined ? before.salaryAmount : req.body.salaryAmount,
          req.body.currency ? text(req.body.currency) : null,
          req.body.notesAr === undefined ? before.notesAr : nullableText(req.body.notesAr),
          req.body.notesEn === undefined ? before.notesEn : nullableText(req.body.notesEn),
          user.userId, id, user.companyId,
        ],
      );
      await audit(user.companyId, id, rows[0].employee_id, "updated", user.userId, before, rows[0], "Contract updated");
      res.json({ success: true, data: await getContract(user.companyId, id) });
    } catch (e: any) {
      console.error("[PATCH /api/compliance-contracts/contracts/:id]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.delete("/api/compliance-contracts/contracts/:id", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid contract id");
      const before = await getContract(user.companyId, id);
      if (!before) return res.status(404).json({ success: false, message: "Contract not found" });
      await pool.query(`UPDATE employee_contracts SET is_deleted=true, updated_by=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`, [user.userId, id, user.companyId]);
      await audit(user.companyId, id, before.employeeId, "deleted", user.userId, before, null, "Contract soft deleted");
      res.json({ success: true, data: { id } });
    } catch (e: any) {
      console.error("[DELETE /api/compliance-contracts/contracts/:id]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.get("/api/compliance-contracts/employees/:employeeId/history", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const employeeId = toInt(req.params["employeeId"]);
      if (!employeeId) throw httpError(400, "Invalid employee id");
      await assertEmployee(user.companyId, employeeId);
      const { rows } = await pool.query(
        `SELECT ${contractSelect()}
         FROM employee_contracts ec
         JOIN contract_types ct ON ct.id=ec.contract_type_id AND ct.company_id=ec.company_id
         JOIN employees e ON e.id=ec.employee_id AND e.company_id=ec.company_id
         LEFT JOIN departments d ON d.id=e.department_id AND d.company_id=e.company_id
         LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS attachments_count FROM contract_attachments WHERE is_deleted=false GROUP BY company_id, contract_id) att
           ON att.company_id=ec.company_id AND att.contract_id=ec.id
         LEFT JOIN (SELECT company_id, contract_id, COUNT(*) AS required_documents_count FROM contract_required_documents WHERE is_deleted=false GROUP BY company_id, contract_id) req
           ON req.company_id=ec.company_id AND req.contract_id=ec.id
         WHERE ec.company_id=$1 AND ec.employee_id=$2 AND ec.is_deleted=false
         ORDER BY ec.start_date DESC, ec.created_at DESC`,
        [user.companyId, employeeId],
      );
      res.json({ success: true, data: rows.map((r: any) => camel({ ...r, days_until_expiry: daysUntil(r.end_date) })) });
    } catch (e: any) {
      console.error("[GET /api/compliance-contracts/employees/:employeeId/history]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.post("/api/compliance-contracts/contracts/:id/attachments", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid contract id");
      const contract = await getContract(user.companyId, id);
      if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });
      const fileName = text(req.body.fileName);
      if (!fileName) throw httpError(400, "fileName is required");
      const { rows } = await pool.query(
        `INSERT INTO contract_attachments (company_id, contract_id, employee_id, document_id, file_name, file_path, mime_type, file_size, attachment_type, uploaded_by, notes_ar, notes_en)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          user.companyId, id, contract.employeeId, toInt(req.body.documentId), fileName, nullableText(req.body.filePath),
          nullableText(req.body.mimeType), req.body.fileSize ? Number(req.body.fileSize) : null, text(req.body.attachmentType) || "contract",
          user.userId, nullableText(req.body.notesAr), nullableText(req.body.notesEn),
        ],
      );
      let enterpriseDocumentId: number | null = null;
      try {
        enterpriseDocumentId = await createEnterpriseDocumentIfMissing({
          companyId: user.companyId,
          categoryCode: "EMPLOYEE_CONTRACTS",
          categoryNameAr: "عقود الموظفين",
          categoryNameEn: "Employee Contracts",
          moduleScope: "hr",
          employeeId: contract.employeeId,
          sourceModule: "compliance",
          entityType: "contract_attachment",
          entityId: Number(rows[0].id),
          titleAr: req.body.titleAr || "مرفق عقد",
          titleEn: req.body.titleEn || fileName,
          documentNumber: contract.contractNumber || null,
          status: "pending_approval",
          fileName,
          fileUrl: nullableText(req.body.filePath),
          metadata: { requiredState: "uploaded", contractId: id, contractAttachmentId: rows[0].id, attachmentType: rows[0].attachment_type },
          userId: user.userId,
        });
      } catch (docErr: any) {
        if (!["42P01", "42703"].includes(String(docErr?.code ?? ""))) throw docErr;
      }
      await audit(user.companyId, id, contract.employeeId, "attachment_added", user.userId, null, { ...rows[0], enterprise_document_id: enterpriseDocumentId }, "Contract attachment metadata added");
      res.status(201).json({ success: true, data: { ...camel(rows[0]), enterpriseDocumentId } });
    } catch (e: any) {
      console.error("[POST /api/compliance-contracts/contracts/:id/attachments]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.post("/api/compliance-contracts/contracts/:id/required-documents", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid contract id");
      const contract = await getContract(user.companyId, id);
      if (!contract) return res.status(404).json({ success: false, message: "Contract not found" });
      const documentCode = text(req.body.documentCode).toUpperCase();
      const nameAr = text(req.body.nameAr);
      const nameEn = text(req.body.nameEn);
      if (!documentCode || !nameAr || !nameEn) throw httpError(400, "documentCode, nameAr, and nameEn are required");
      const { rows } = await pool.query(
        `INSERT INTO contract_required_documents (company_id, contract_type_id, contract_id, document_code, name_ar, name_en, is_mandatory, expires, warning_days, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
        [
          user.companyId, contract.contractTypeId, id, documentCode, nameAr, nameEn,
          req.body.isMandatory !== false, req.body.expires === true, toInt(req.body.warningDays) || 30, user.userId,
        ],
      );
      let enterpriseDocumentId: number | null = null;
      try {
        enterpriseDocumentId = await createEnterpriseDocumentIfMissing({
          companyId: user.companyId,
          categoryCode: "COMPLIANCE_EXPIRY",
          categoryNameAr: "وثائق الامتثال",
          categoryNameEn: "Compliance Documents",
          moduleScope: "hr",
          employeeId: contract.employeeId,
          sourceModule: "compliance",
          entityType: "contract_required_document",
          entityId: Number(rows[0].id),
          titleAr: nameAr,
          titleEn: nameEn,
          status: "draft",
          metadata: { requiredState: "pending_upload", contractId: id, requiredDocumentId: rows[0].id, documentCode },
          userId: user.userId,
        });
      } catch (docErr: any) {
        if (!["42P01", "42703"].includes(String(docErr?.code ?? ""))) throw docErr;
      }
      await audit(user.companyId, id, contract.employeeId, "required_document_added", user.userId, null, { ...rows[0], enterprise_document_id: enterpriseDocumentId }, "Contract required document added");
      res.status(201).json({ success: true, data: { ...camel(rows[0]), enterpriseDocumentId } });
    } catch (e: any) {
      console.error("[POST /api/compliance-contracts/contracts/:id/required-documents]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });

  app.delete("/api/compliance-contracts/required-documents/:id", auth, async (req, res) => {
    try {
      const user = requireManage(req, res);
      if (!user) return;
      const id = toInt(req.params["id"]);
      if (!id) throw httpError(400, "Invalid required document id");
      const existing = await pool.query(
        `SELECT * FROM contract_required_documents WHERE id=$1 AND company_id=$2 AND is_deleted=false`,
        [id, user.companyId],
      );
      if (!existing.rows[0]) return res.status(404).json({ success: false, message: "Required document not found" });
      await pool.query(`UPDATE contract_required_documents SET is_deleted=true, updated_by=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3`, [user.userId, id, user.companyId]);
      await audit(user.companyId, existing.rows[0].contract_id, null, "required_document_deleted", user.userId, existing.rows[0], null, "Contract required document soft deleted");
      res.json({ success: true, data: { id } });
    } catch (e: any) {
      console.error("[DELETE /api/compliance-contracts/required-documents/:id]", e);
      res.status(statusCode(e)).json({ success: false, message: errorMessage(e) });
    }
  });
}
