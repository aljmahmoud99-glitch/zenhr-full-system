import { boolean, pgTable, text, serial, timestamp, integer, varchar, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export const attendanceRecordsTable = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  date: date("date").notNull(),
  clockIn: timestamp("clock_in", { withTimezone: true }),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  workedMinutes: integer("worked_minutes"),
  status: varchar("status", { length: 20 }).default("absent").notNull(),
  lateMinutes: integer("late_minutes").default(0).notNull(),
  overtimeMinutes: integer("overtime_minutes").default(0).notNull(),
  attendanceType: varchar("attendance_type", { length: 20 }).default("office"),
  biometricDeviceId: integer("biometric_device_id"),
  biometricVerified: boolean("biometric_verified").default(false).notNull(),
  biometricVerifiedAt: timestamp("biometric_verified_at", { withTimezone: true }),
  geofenceStatus: varchar("geofence_status", { length: 40 }),
  geofenceDistanceMeters: integer("geofence_distance_meters"),
  geofenceLocationId: integer("geofence_location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAttendanceRecordSchema = createInsertSchema(attendanceRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendanceRecord = z.infer<typeof insertAttendanceRecordSchema>;
export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;

export const attendanceCorrectionsTable = pgTable("attendance_corrections", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  attendanceRecordId: integer("attendance_record_id").references(() => attendanceRecordsTable.id),
  correctionType: varchar("correction_type", { length: 30 }).notNull().default("time_correction"),
  requestDate: date("request_date").notNull(),
  currentClockIn: timestamp("current_clock_in", { withTimezone: true }),
  currentClockOut: timestamp("current_clock_out", { withTimezone: true }),
  requestedClockIn: timestamp("requested_clock_in", { withTimezone: true }),
  requestedClockOut: timestamp("requested_clock_out", { withTimezone: true }),
  reason: text("reason"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  managerApprovedById: integer("manager_approved_by_id").references(() => usersTable.id),
  managerApprovedAt: timestamp("manager_approved_at", { withTimezone: true }),
  managerNotes: text("manager_notes"),
  hrApprovedById: integer("hr_approved_by_id").references(() => usersTable.id),
  hrApprovedAt: timestamp("hr_approved_at", { withTimezone: true }),
  hrNotes: text("hr_notes"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AttendanceCorrection = typeof attendanceCorrectionsTable.$inferSelect;
