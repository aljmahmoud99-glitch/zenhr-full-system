import { pgTable, text, serial, timestamp, integer, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemConfigurationsTable = pgTable("system_configurations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value").notNull(),
  description: varchar("description", { length: 500 }),
  category: varchar("category", { length: 50 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedByUserId: integer("updated_by_user_id"),
});

export const insertSystemConfigurationSchema = createInsertSchema(systemConfigurationsTable).omit({ id: true, updatedAt: true });
export type InsertSystemConfiguration = z.infer<typeof insertSystemConfigurationSchema>;
export type SystemConfiguration = typeof systemConfigurationsTable.$inferSelect;
