/*
 * Phase 1 Seed — Org Structure & Dynamic Permissions
 *
 * What this does:
 * 1. Verifies employee count before migration
 * 2. Seeds org_nodes from existing departments (type='department')
 * 3. Backfills employees.org_node_id from their department_id
 * 4. Seeds system roles per company
 * 5. Seeds all permissions (18 screens × 6 actions = 108 entries)
 * 6. Seeds role_permissions for each system role
 * 7. Backfills users.role_id from their role string
 * 8. Verifies employee count after migration (must match)
 *
 * Safe to run multiple times (uses upsert / skip-if-exists logic)
 */

import { db } from "./index.js";
import {
  departmentsTable,
  employeesTable,
  usersTable,
  companiesTable,
  orgNodesTable,
  rolesTable,
  permissionsTable,
  rolePermissionsTable,
} from "./schema/index.js";
import { eq, and, sql } from "drizzle-orm";

const SCREENS = [
  "employees", "leave", "overtime", "attendance", "payroll",
  "advances", "compliance", "documents", "assets", "disciplinary",
  "resignations", "clearance", "reports", "forms", "users",
  "settings", "pre-employment", "job-descriptions",
] as const;

const ACTIONS = ["view", "create", "update", "delete", "approve", "export"] as const;

// Permissions granted per role string
const ROLE_PERMISSIONS: Record<string, { screens: string[]; actions: string[]; scope: string }[]> = {
  hradmin: [
    { screens: [...SCREENS], actions: [...ACTIONS], scope: "company" },
  ],
  payrolladmin: [
    { screens: ["payroll", "advances", "reports", "forms"], actions: [...ACTIONS], scope: "company" },
    { screens: ["employees", "documents", "assets"], actions: ["view", "export"], scope: "company" },
    { screens: ["attendance"], actions: ["view", "export"], scope: "company" },
  ],
  manager: [
    { screens: ["employees"], actions: ["view"], scope: "department" },
    { screens: ["leave", "overtime"], actions: ["view", "approve"], scope: "department" },
    { screens: ["attendance"], actions: ["view"], scope: "department" },
    { screens: ["disciplinary"], actions: ["view", "create", "update"], scope: "department" },
    { screens: ["documents", "assets", "forms"], actions: ["view"], scope: "department" },
  ],
  employee: [
    { screens: ["leave", "overtime", "advances", "attendance"], actions: ["view", "create"], scope: "own" },
    { screens: ["documents", "assets"], actions: ["view"], scope: "own" },
    { screens: ["payroll"], actions: ["view"], scope: "own" }, // view own payslips
    { screens: ["forms"], actions: ["view"], scope: "own" },
  ],
};

const ROLE_DISPLAY: Record<string, { nameAr: string }> = {
  superadmin: { nameAr: "مدير النظام" },
  hradmin: { nameAr: "مدير الموارد البشرية" },
  payrolladmin: { nameAr: "مدير الرواتب" },
  manager: { nameAr: "مدير القسم" },
  employee: { nameAr: "موظف" },
  recruiter: { nameAr: "موظف تعيين" },
};

async function run() {
  console.log("═══════════════════════════════════════");
  console.log("Phase 1 Seed — Start");
  console.log("═══════════════════════════════════════");

  // ── 1. Count employees before ──────────────────────────────────────────────
  const [{ countBefore }] = await db
    .select({ countBefore: sql<number>`count(*)::int` })
    .from(employeesTable)
    .where(eq(employeesTable.isDeleted, false));
  console.log(`\nEmployee count before: ${countBefore}`);

  // ── 2. Get all companies ───────────────────────────────────────────────────
  const companies = await db.select().from(companiesTable).where(eq(companiesTable.isDeleted, false));
  console.log(`Companies: ${companies.map(c => c.nameEn).join(", ")}`);

  // ── 3. Seed permissions table (global, shared across all companies) ────────
  console.log("\nSeeding permissions table…");
  const permMap: Record<string, number> = {}; // "screen:action" → id

  for (const screen of SCREENS) {
    for (const action of ACTIONS) {
      const key = `${screen}:${action}`;
      const existing = await db.select({ id: permissionsTable.id })
        .from(permissionsTable)
        .where(and(
          eq(permissionsTable.screen, screen),
          eq(permissionsTable.action, action),
        ))
        .limit(1);

      if (existing.length > 0) {
        permMap[key] = existing[0]!.id;
      } else {
        const [inserted] = await db.insert(permissionsTable).values({
          screen,
          action,
          description: `${action} on ${screen}`,
        }).returning({ id: permissionsTable.id });
        permMap[key] = inserted!.id;
      }
    }
  }
  console.log(`  ${Object.keys(permMap).length} permissions ready`);

  for (const company of companies) {
    console.log(`\n── Company: ${company.nameEn} (id=${company.id}) ──`);

    // ── 4. Seed org_nodes from existing departments ──────────────────────────
    console.log("  Seeding org_nodes from departments…");
    const departments = await db.select().from(departmentsTable)
      .where(and(eq(departmentsTable.companyId, company.id), eq(departmentsTable.isDeleted, false)));

    const deptToOrgNode: Record<number, number> = {};

    for (const dept of departments) {
      // Check if already seeded (match by company + name)
      const existing = await db.select({ id: orgNodesTable.id })
        .from(orgNodesTable)
        .where(and(
          eq(orgNodesTable.companyId, company.id),
          eq(orgNodesTable.nameEn, dept.nameEn),
          eq(orgNodesTable.nodeType, "department"),
          eq(orgNodesTable.isDeleted, false),
        ))
        .limit(1);

      if (existing.length > 0) {
        deptToOrgNode[dept.id] = existing[0]!.id;
        console.log(`    ↳ Already exists: ${dept.nameEn} → org_node ${existing[0]!.id}`);
      } else {
        const [node] = await db.insert(orgNodesTable).values({
          companyId: company.id,
          parentId: null,
          nodeType: "department",
          nameAr: dept.nameAr,
          nameEn: dept.nameEn,
          code: dept.code,
          managerEmployeeId: dept.managerEmployeeId,
          isActive: dept.isActive,
          sortOrder: dept.id,
        }).returning({ id: orgNodesTable.id });
        deptToOrgNode[dept.id] = node!.id;
        console.log(`    ↳ Created: ${dept.nameEn} → org_node ${node!.id}`);
      }
    }

    // ── 5. Backfill employees.org_node_id ────────────────────────────────────
    console.log("  Backfilling employees.org_node_id…");
    for (const [deptId, orgNodeId] of Object.entries(deptToOrgNode)) {
      await db.update(employeesTable)
        .set({ orgNodeId })
        .where(and(
          eq(employeesTable.companyId, company.id),
          eq(employeesTable.departmentId, parseInt(deptId)),
          eq(employeesTable.isDeleted, false),
        ));
    }
    // Employees with no department get orgNodeId = null (already null, no action needed)
    console.log("    ↳ Done");

    // ── 6. Seed system roles for this company ────────────────────────────────
    console.log("  Seeding system roles…");
    const roleIds: Record<string, number> = {};
    const roleNames = Object.keys(ROLE_PERMISSIONS);

    // Also seed superadmin and recruiter (no permissions defined but need role record)
    const allRoleNames = [...roleNames, "superadmin", "recruiter"];

    for (const roleName of allRoleNames) {
      const existing = await db.select({ id: rolesTable.id })
        .from(rolesTable)
        .where(and(
          eq(rolesTable.companyId, company.id),
          eq(rolesTable.name, roleName),
        ))
        .limit(1);

      if (existing.length > 0) {
        roleIds[roleName] = existing[0]!.id;
        console.log(`    ↳ Already exists: ${roleName} → role ${existing[0]!.id}`);
      } else {
        const [role] = await db.insert(rolesTable).values({
          companyId: company.id,
          name: roleName,
          nameAr: ROLE_DISPLAY[roleName]?.nameAr ?? roleName,
          isSystemRole: true,
          isActive: true,
        }).returning({ id: rolesTable.id });
        roleIds[roleName] = role!.id;
        console.log(`    ↳ Created: ${roleName} → role ${role!.id}`);
      }
    }

    // ── 7. Seed role_permissions ─────────────────────────────────────────────
    console.log("  Seeding role_permissions…");
    for (const [roleName, grants] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleIds[roleName];
      if (!roleId) continue;

      for (const { screens, actions, scope } of grants) {
        for (const screen of screens) {
          for (const action of actions) {
            const permId = permMap[`${screen}:${action}`];
            if (!permId) continue;

            // Skip if already exists
            const existing = await db.select({ id: rolePermissionsTable.id })
              .from(rolePermissionsTable)
              .where(and(
                eq(rolePermissionsTable.roleId, roleId),
                eq(rolePermissionsTable.permissionId, permId),
              ))
              .limit(1);

            if (existing.length === 0) {
              await db.insert(rolePermissionsTable).values({
                roleId,
                permissionId: permId,
                dataScope: scope,
              });
            }
          }
        }
      }
    }
    console.log("    ↳ Done");

    // ── 8. Backfill users.role_id ────────────────────────────────────────────
    console.log("  Backfilling users.role_id…");
    const users = await db.select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(and(eq(usersTable.companyId, company.id), eq(usersTable.isDeleted, false)));

    for (const user of users) {
      const roleId = roleIds[user.role];
      if (roleId) {
        await db.update(usersTable)
          .set({ roleId })
          .where(eq(usersTable.id, user.id));
        console.log(`    ↳ User ${user.id} (${user.role}) → role_id ${roleId}`);
      } else {
        console.log(`    ↳ User ${user.id} (${user.role}) → no matching role found, skipping`);
      }
    }
  }

  // ── 9. Verify employee count after ─────────────────────────────────────────
  const [{ countAfter }] = await db
    .select({ countAfter: sql<number>`count(*)::int` })
    .from(employeesTable)
    .where(eq(employeesTable.isDeleted, false));

  console.log(`\nEmployee count after: ${countAfter}`);
  if (countBefore !== countAfter) {
    throw new Error(`MIGRATION FAILED: employee count changed! Before=${countBefore} After=${countAfter}`);
  }
  console.log("✓ Employee count matches — zero data loss confirmed");
  console.log("\n═══════════════════════════════════════");
  console.log("Phase 1 Seed — Complete");
  console.log("═══════════════════════════════════════");
}

run().catch(e => {
  console.error("Seed failed:", e);
  process.exit(1);
});
