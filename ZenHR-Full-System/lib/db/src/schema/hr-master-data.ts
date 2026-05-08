import { pgTable, serial, integer, varchar, text, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { usersTable } from "./users";

const auditFields = {
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  isDeleted: boolean("is_deleted").notNull().default(false),
};

const baseFields = {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id),
  code: varchar("code", { length: 80 }).notNull(),
  nameAr: varchar("name_ar", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }).notNull(),
  descriptionAr: text("description_ar"),
  descriptionEn: text("description_en"),
  ...auditFields,
};

export const responsibilityGroupsTable = pgTable("responsibility_groups", {
  ...baseFields,
});

export const responsibilitiesTable = pgTable("responsibilities", {
  ...baseFields,
  responsibilityGroupId: integer("responsibility_group_id").references(() => responsibilityGroupsTable.id),
  priorityOrder: integer("priority_order").notNull().default(0),
});

export const jobGradesTable = pgTable("job_grades", {
  ...baseFields,
  gradeCode: varchar("grade_code", { length: 40 }).notNull(),
  salaryBandMin: numeric("salary_band_min", { precision: 12, scale: 3 }),
  salaryBandMax: numeric("salary_band_max", { precision: 12, scale: 3 }),
  levelOrder: integer("level_order").notNull().default(0),
});

export const educationalQualificationsTable = pgTable("educational_qualifications", {
  ...baseFields,
  levelOrder: integer("level_order").notNull().default(0),
});

export const specializationsTable = pgTable("specializations", {
  ...baseFields,
});

export const universitiesTable = pgTable("universities", {
  ...baseFields,
  country: varchar("country", { length: 100 }).notNull().default("Jordan"),
  city: varchar("city", { length: 100 }),
});

export const trainingCoursesTable = pgTable("training_courses", {
  ...baseFields,
  providerAr: varchar("provider_ar", { length: 200 }),
  providerEn: varchar("provider_en", { length: 200 }),
  durationHours: integer("duration_hours"),
});

export const skillsTable = pgTable("skills", {
  ...baseFields,
  skillCategory: varchar("skill_category", { length: 80 }),
});

export const languagesTable = pgTable("languages", {
  ...baseFields,
  proficiencyLevelsJson: jsonb("proficiency_levels_json"),
  isRtl: boolean("is_rtl").notNull().default(false),
});

export const experienceLevelsTable = pgTable("experience_levels", {
  ...baseFields,
  minYears: integer("min_years"),
  maxYears: integer("max_years"),
  levelOrder: integer("level_order").notNull().default(0),
});

export const insertResponsibilityGroupSchema = createInsertSchema(responsibilityGroupsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertResponsibilitySchema = createInsertSchema(responsibilitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobGradeSchema = createInsertSchema(jobGradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEducationalQualificationSchema = createInsertSchema(educationalQualificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSpecializationSchema = createInsertSchema(specializationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUniversitySchema = createInsertSchema(universitiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTrainingCourseSchema = createInsertSchema(trainingCoursesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSkillSchema = createInsertSchema(skillsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertLanguageSchema = createInsertSchema(languagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExperienceLevelSchema = createInsertSchema(experienceLevelsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type ResponsibilityGroup = typeof responsibilityGroupsTable.$inferSelect;
export type Responsibility = typeof responsibilitiesTable.$inferSelect;
export type JobGrade = typeof jobGradesTable.$inferSelect;
export type EducationalQualification = typeof educationalQualificationsTable.$inferSelect;
export type Specialization = typeof specializationsTable.$inferSelect;
export type University = typeof universitiesTable.$inferSelect;
export type TrainingCourse = typeof trainingCoursesTable.$inferSelect;
export type Skill = typeof skillsTable.$inferSelect;
export type Language = typeof languagesTable.$inferSelect;
export type ExperienceLevel = typeof experienceLevelsTable.$inferSelect;

export type InsertResponsibilityGroup = z.infer<typeof insertResponsibilityGroupSchema>;
export type InsertResponsibility = z.infer<typeof insertResponsibilitySchema>;
export type InsertJobGrade = z.infer<typeof insertJobGradeSchema>;
export type InsertEducationalQualification = z.infer<typeof insertEducationalQualificationSchema>;
export type InsertSpecialization = z.infer<typeof insertSpecializationSchema>;
export type InsertUniversity = z.infer<typeof insertUniversitySchema>;
export type InsertTrainingCourse = z.infer<typeof insertTrainingCourseSchema>;
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type InsertLanguage = z.infer<typeof insertLanguageSchema>;
export type InsertExperienceLevel = z.infer<typeof insertExperienceLevelSchema>;
