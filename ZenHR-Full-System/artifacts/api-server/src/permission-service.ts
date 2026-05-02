/*
 * Phase 1 — Centralized Permission Service
 *
 * Analysis:
 * - JWT carries: userId, username, role (string), companyId, employeeId
 * - roles table has company-scoped role records
 * - role_permissions table maps roleId → permissionId with a dataScope
 * - permissions table: screen × action pairs
 *
 * This service is called once per request and cached on req (no DB hit per query).
 *
 * Data scopes:
 *   own       → WHERE employee_id = currentUser.employeeId
 *   department → WHERE department_id = currentUser's departmentId
 *   org_node  → WHERE org_node_id IN (getDescendantNodeIds(currentUser.orgNodeId))
 *   company   → no extra filter (already scoped by companyId in every query)
 */

import { db } from "@workspace/db";
import {
  rolesTable, rolePermissionsTable, permissionsTable,
  employeesTable, orgNodesTable,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { Request } from "express";

export type DataScope = "own" | "department" | "org_node" | "branch" | "company";

export interface PermissionMap {
  screens: Record<string, Record<string, boolean>>;
  dataScope: DataScope;
}

// Augment Request with cached permission data
interface EnrichedUser {
  userId: number;
  username: string;
  role: string;
  companyId: number;
  employeeId: number | null;
}

const cache = new WeakMap<object, PermissionMap>();

/**
 * Fetches the full permission map for a user.
 * Result is cached on the request object — safe to call multiple times.
 */
export async function getPermissionMap(req: Request & { user: EnrichedUser }): Promise<PermissionMap> {
  const hit = cache.get(req);
  if (hit) return hit;

  const { role, companyId } = req.user;

  // Find the role record for this company
  const [roleRow] = await db
    .select({ id: rolesTable.id })
    .from(rolesTable)
    .where(and(eq(rolesTable.companyId, companyId), eq(rolesTable.name, role)))
    .limit(1);

  if (!roleRow) {
    // No role record found — return empty map (will rely on legacy role string checks)
    const empty: PermissionMap = { screens: {}, dataScope: "own" };
    cache.set(req, empty);
    return empty;
  }

  // Load all role_permissions with their permission details
  const grants = await db
    .select({
      screen: permissionsTable.screen,
      action: permissionsTable.action,
      dataScope: rolePermissionsTable.dataScope,
    })
    .from(rolePermissionsTable)
    .innerJoin(permissionsTable, eq(rolePermissionsTable.permissionId, permissionsTable.id))
    .where(eq(rolePermissionsTable.roleId, roleRow.id));

  const screens: Record<string, Record<string, boolean>> = {};
  let broadestScope: DataScope = "own";

  const scopeRank: Record<string, number> = { own: 0, department: 1, org_node: 2, branch: 3, company: 4 };

  for (const grant of grants) {
    if (!screens[grant.screen]) screens[grant.screen] = {};
    screens[grant.screen]![grant.action] = true;

    const rank = scopeRank[grant.dataScope as string] ?? 0;
    if (rank > (scopeRank[broadestScope] ?? 0)) {
      broadestScope = grant.dataScope as DataScope;
    }
  }

  const result: PermissionMap = { screens, dataScope: broadestScope };
  cache.set(req, result);
  return result;
}

/**
 * Checks if a user has a specific permission.
 * Uses DB-backed permission map; falls back to legacy role string if no DB record found.
 */
export async function hasPermission(
  req: Request & { user: EnrichedUser },
  screen: string,
  action: string
): Promise<boolean> {
  const map = await getPermissionMap(req);
  if (map.screens[screen]?.[action]) return true;

  // Legacy fallback: if no DB permission record, use hardcoded role-based defaults
  return legacyCheck(req.user.role, screen, action);
}

/**
 * Gets the data scope for a user on a given screen.
 */
export async function getDataScope(
  req: Request & { user: EnrichedUser },
  _screen?: string
): Promise<DataScope> {
  const map = await getPermissionMap(req);
  if (map.screens && Object.keys(map.screens).length > 0) return map.dataScope;

  // Legacy fallback
  const { role } = req.user;
  if (role === "hradmin" || role === "payrolladmin" || role === "superadmin") return "company";
  if (role === "manager") return "department";
  return "own";
}

/**
 * Returns all descendant org_node IDs for a given node (recursive CTE).
 */
export async function getDescendantNodeIds(orgNodeId: number): Promise<number[]> {
  const result = await db.execute<{ id: number }>(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM org_nodes WHERE id = ${orgNodeId} AND is_deleted = false
       UNION ALL
       SELECT n.id FROM org_nodes n
       INNER JOIN descendants d ON n.parent_id = d.id
       WHERE n.is_deleted = false
     )
     SELECT id FROM descendants`
  );
  return result.rows.map((r: { id: number }) => r.id);
}

/**
 * Builds WHERE clause conditions to scope employee queries by user's data scope.
 * Returns an array of drizzle conditions to add to your query.
 */
export async function getEmployeeScopeConditions(
  req: Request & { user: EnrichedUser }
): Promise<Parameters<typeof and>> {
  const scope = await getDataScope(req);
  const { employeeId, companyId } = req.user;

  if (scope === "own") {
    if (!employeeId) return [eq(employeesTable.companyId, companyId)];
    return [eq(employeesTable.id, employeeId), eq(employeesTable.companyId, companyId)];
  }

  if (scope === "department") {
    // Get the current user's departmentId from their employee record
    if (!employeeId) return [eq(employeesTable.companyId, companyId)];
    const [emp] = await db
      .select({ departmentId: employeesTable.departmentId, orgNodeId: employeesTable.orgNodeId })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId))
      .limit(1);

    if (emp?.departmentId) {
      return [
        eq(employeesTable.companyId, companyId),
        eq(employeesTable.departmentId, emp.departmentId),
      ];
    }
    return [eq(employeesTable.companyId, companyId)];
  }

  if (scope === "org_node") {
    if (!employeeId) return [eq(employeesTable.companyId, companyId)];
    const [emp] = await db
      .select({ orgNodeId: employeesTable.orgNodeId })
      .from(employeesTable)
      .where(eq(employeesTable.id, employeeId))
      .limit(1);

    if (emp?.orgNodeId) {
      const nodeIds = await getDescendantNodeIds(emp.orgNodeId);
      if (nodeIds.length > 0) {
        return [eq(employeesTable.companyId, companyId), inArray(employeesTable.orgNodeId, nodeIds)];
      }
    }
    return [eq(employeesTable.companyId, companyId)];
  }

  // company scope: just filter by companyId
  return [eq(employeesTable.companyId, companyId)];
}

/**
 * Legacy permission check based on role strings.
 * Used as fallback when no DB permission record is found.
 */
function legacyCheck(role: string, screen: string, action: string): boolean {
  if (role === "superadmin") return screen === "users" || screen === "settings";
  if (role === "hradmin") return true; // hradmin can do everything

  const payrollScreens = ["payroll", "advances", "reports", "forms", "employees", "documents", "attendance", "assets"];
  if (role === "payrolladmin") {
    if (!payrollScreens.includes(screen)) return false;
    if (screen === "employees" || screen === "documents" || screen === "attendance" || screen === "assets") {
      return action === "view" || action === "export";
    }
    return true;
  }

  const managerScreens = ["employees", "leave", "overtime", "attendance", "disciplinary", "documents", "assets", "forms"];
  if (role === "manager") {
    if (!managerScreens.includes(screen)) return false;
    if (screen === "employees" || screen === "documents" || screen === "assets" || screen === "forms") return action === "view";
    if (screen === "leave" || screen === "overtime") return action === "view" || action === "approve";
    if (screen === "attendance") return action === "view";
    if (screen === "disciplinary") return action === "view" || action === "create" || action === "update";
    return false;
  }

  const ownScreens = ["leave", "overtime", "advances", "attendance", "documents", "assets", "payroll", "forms"];
  if (role === "employee") {
    if (!ownScreens.includes(screen)) return false;
    if (screen === "documents" || screen === "assets" || screen === "payroll" || screen === "forms") return action === "view";
    return action === "view" || action === "create";
  }

  return false;
}
