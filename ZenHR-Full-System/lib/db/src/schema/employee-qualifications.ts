import { pgTable, serial, timestamp, integer, text, varchar } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const employeeQualificationsTable = pgTable("employee_qualifications", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  qualificationType: varchar("qualification_type", { length: 50 }).notNull(),
  dataJson: text("data_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
