/*
 * Phase 1 — Organizational Structure
 *
 * Analysis findings:
 * - departments table exists (6 rows, all root-level, company_id=1)
 * - employees has departmentId FK → departments (KEPT, not dropped)
 * - This table adds a multi-level tree: Company→Branch→Department→Section→Unit
 * - Existing departments seeded as org_nodes of type 'department'
 * - employees.orgNodeId added as nullable alongside departmentId
 */
import { pgTable, serial, timestamp, integer, boolean, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const orgNodesTable = pgTable("org_nodes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  parentId: integer("parent_id"), // self-referencing, nullable = root node
  // node_type: company | branch | department | section | unit
  nodeType: varchar("node_type", { length: 20 }).notNull().default("department"),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  code: varchar("code", { length: 20 }),
  managerEmployeeId: integer("manager_employee_id"),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").default(false).notNull(),
}, (t) => [
  index("org_nodes_company_idx").on(t.companyId),
  index("org_nodes_parent_idx").on(t.parentId),
  index("org_nodes_company_type_idx").on(t.companyId, t.nodeType),
]);

export const insertOrgNodeSchema = createInsertSchema(orgNodesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrgNode = z.infer<typeof insertOrgNodeSchema>;
export type OrgNode = typeof orgNodesTable.$inferSelect;
