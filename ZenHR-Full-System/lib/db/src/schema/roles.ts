/*
 * Phase 1 — Dynamic Roles & Permissions
 *
 * Analysis findings:
 * - users.role is a varchar(30) string ('superadmin','hradmin','payrolladmin','manager','employee','recruiter')
 * - No existing roles/permissions tables
 * - This adds roles, permissions, role_permissions tables
 * - users.roleId added as nullable FK (role string column kept for backward compat)
 * - Screens: employees, leave, overtime, attendance, payroll, advances, compliance,
 *   documents, assets, disciplinary, resignations, clearance, reports, forms,
 *   users, settings, pre-employment, job-descriptions
 * - Actions: view | create | update | delete | approve | export
 * - Data scopes: own | department | org_node | branch | company
 */
import { pgTable, serial, timestamp, integer, boolean, varchar, text, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

// ─── Roles ────────────────────────────────────────────────────────────────────
export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  name: varchar("name", { length: 50 }).notNull(),        // machine name e.g. 'hradmin'
  nameAr: varchar("name_ar", { length: 100 }).notNull(),  // Arabic display name
  isSystemRole: boolean("is_system_role").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("roles_company_idx").on(t.companyId),
  unique("roles_company_name_uniq").on(t.companyId, t.name),
]);

// ─── Permissions ──────────────────────────────────────────────────────────────
export const permissionsTable = pgTable("permissions", {
  id: serial("id").primaryKey(),
  screen: varchar("screen", { length: 50 }).notNull(),
  // action: view | create | update | delete | approve | export
  action: varchar("action", { length: 20 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("permissions_screen_action_uniq").on(t.screen, t.action),
]);

// ─── Role ↔ Permission mapping ────────────────────────────────────────────────
export const rolePermissionsTable = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => rolesTable.id),
  permissionId: integer("permission_id").notNull().references(() => permissionsTable.id),
  // data_scope: own | department | org_node | branch | company
  dataScope: varchar("data_scope", { length: 20 }).notNull().default("company"),
  customNodeIds: text("custom_node_ids"), // nullable JSON array of org_node ids
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("role_permissions_role_idx").on(t.roleId),
  index("role_permissions_perm_idx").on(t.permissionId),
  unique("role_permissions_uniq").on(t.roleId, t.permissionId),
]);

export const insertRoleSchema = createInsertSchema(rolesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPermissionSchema = createInsertSchema(permissionsTable).omit({ id: true, createdAt: true });
export const insertRolePermissionSchema = createInsertSchema(rolePermissionsTable).omit({ id: true, createdAt: true });

export type Role = typeof rolesTable.$inferSelect;
export type Permission = typeof permissionsTable.$inferSelect;
export type RolePermission = typeof rolePermissionsTable.$inferSelect;
