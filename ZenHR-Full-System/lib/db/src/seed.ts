import { db } from "./index";
import {
  companiesTable,
  usersTable,
  departmentsTable,
  jobTitlesTable,
  nationalitiesTable,
  citiesTable,
  banksTable,
  documentTypesTable,
  leaveTypesTable,
  assetCategoriesTable,
  leavePoliciesTable,
  employeesTable,
} from "./schema";
import crypto from "crypto";
import { eq } from "drizzle-orm";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "zenjo_salt").digest("hex");
}

async function seed() {
  console.log("Seeding database...");

  // Company
  const [company] = await db
    .insert(companiesTable)
    .values({
      nameAr: "\u0634\u0631\u0643\u0629 \u0632\u0646\u062c\u0648 \u0644\u0644\u062a\u0642\u0646\u064a\u0629",
      nameEn: "ZenJO Technology Company",
      commercialRegNo: "12345",
      taxNumber: "7654321",
      city: "Amman",
      phone: "+962 6 5555555",
      email: "info@zenjo.jo",
      currency: "JOD",
      industryType: "technology",
    })
    .onConflictDoNothing()
    .returning();

  const companyId = company?.id ?? 1;
  console.log(`Company ID: ${companyId}`);

  await db.insert(nationalitiesTable).values([
    { nameAr: "Jordanian", nameEn: "Jordanian", countryCode: "JO" },
    { nameAr: "Syrian", nameEn: "Syrian", countryCode: "SY" },
    { nameAr: "Egyptian", nameEn: "Egyptian", countryCode: "EG" },
    { nameAr: "Palestinian", nameEn: "Palestinian", countryCode: "PS" },
    { nameAr: "Lebanese", nameEn: "Lebanese", countryCode: "LB" },
    { nameAr: "Iraqi", nameEn: "Iraqi", countryCode: "IQ" },
    { nameAr: "Saudi", nameEn: "Saudi", countryCode: "SA" },
    { nameAr: "Emirati", nameEn: "Emirati", countryCode: "AE" },
    { nameAr: "British", nameEn: "British", countryCode: "GB" },
    { nameAr: "American", nameEn: "American", countryCode: "US" },
    { nameAr: "Indian", nameEn: "Indian", countryCode: "IN" },
    { nameAr: "Pakistani", nameEn: "Pakistani", countryCode: "PK" },
    { nameAr: "Filipino", nameEn: "Filipino", countryCode: "PH" },
    { nameAr: "Bangladeshi", nameEn: "Bangladeshi", countryCode: "BD" },
    { nameAr: "Sri Lankan", nameEn: "Sri Lankan", countryCode: "LK" },
  ]).onConflictDoNothing();

  await db.insert(citiesTable).values([
    { nameAr: "Amman", nameEn: "Amman", governorate: "Amman" },
    { nameAr: "Zarqa", nameEn: "Zarqa", governorate: "Zarqa" },
    { nameAr: "Irbid", nameEn: "Irbid", governorate: "Irbid" },
    { nameAr: "Aqaba", nameEn: "Aqaba", governorate: "Aqaba" },
    { nameAr: "Salt", nameEn: "Salt", governorate: "Balqa" },
    { nameAr: "Mafraq", nameEn: "Mafraq", governorate: "Mafraq" },
    { nameAr: "Karak", nameEn: "Karak", governorate: "Karak" },
    { nameAr: "Ma'an", nameEn: "Ma'an", governorate: "Ma'an" },
    { nameAr: "Tafilah", nameEn: "Tafilah", governorate: "Tafilah" },
    { nameAr: "Madaba", nameEn: "Madaba", governorate: "Madaba" },
    { nameAr: "Jerash", nameEn: "Jerash", governorate: "Jerash" },
    { nameAr: "Ajloun", nameEn: "Ajloun", governorate: "Ajloun" },
  ]).onConflictDoNothing();

  await db.insert(banksTable).values([
    { nameAr: "Jordan Bank", nameEn: "Jordan Bank", swiftCode: "JRJBJOAMXXX" },
    { nameAr: "Bank of Jordan", nameEn: "Bank of Jordan", swiftCode: "BOJOJO11XXX" },
    { nameAr: "Arab Bank", nameEn: "Arab Bank", swiftCode: "ARABJOAXXX" },
    { nameAr: "Jordan Ahli Bank", nameEn: "Jordan Ahli Bank", swiftCode: "NBJOJOAMXXX" },
    { nameAr: "Housing Bank", nameEn: "Housing Bank", swiftCode: "HBJOJOAMXXX" },
    { nameAr: "Capital Bank", nameEn: "Capital Bank", swiftCode: "CAPBJOA1XXX" },
    { nameAr: "Union Bank", nameEn: "Union Bank", swiftCode: "UNIBJOA1XXX" },
    { nameAr: "Mashreq Bank", nameEn: "Mashreq Bank", swiftCode: "BOMLJOA1XXX" },
    { nameAr: "Standard Chartered", nameEn: "Standard Chartered", swiftCode: "SCBLJOA1XXX" },
    { nameAr: "HSBC Bank", nameEn: "HSBC Bank", swiftCode: "HSBCJOA1XXX" },
    { nameAr: "Jordan Kuwait Bank", nameEn: "Jordan Kuwait Bank", swiftCode: "JKUBJOA1XXX" },
  ]).onConflictDoNothing();

  await db.insert(documentTypesTable).values([
    { nameAr: "National ID", nameEn: "National ID", category: "identity", requiresExpiry: false },
    { nameAr: "Passport", nameEn: "Passport", category: "identity", requiresExpiry: true, alertDaysBefore: 90 },
    { nameAr: "Work Permit", nameEn: "Work Permit", category: "employment", requiresExpiry: true, alertDaysBefore: 60 },
    { nameAr: "Residency Permit", nameEn: "Residency Permit", category: "employment", requiresExpiry: true, alertDaysBefore: 60 },
    { nameAr: "Driving License", nameEn: "Driving License", category: "other", requiresExpiry: true, alertDaysBefore: 30 },
    { nameAr: "Citizenship Certificate", nameEn: "Citizenship Certificate", category: "identity", requiresExpiry: false },
    { nameAr: "University Degree", nameEn: "University Degree", category: "education", requiresExpiry: false },
    { nameAr: "Employment Certificate", nameEn: "Employment Certificate", category: "employment", requiresExpiry: false },
    { nameAr: "Experience Certificate", nameEn: "Experience Certificate", category: "employment", requiresExpiry: false },
    { nameAr: "Health Insurance", nameEn: "Health Insurance", category: "insurance", requiresExpiry: true, alertDaysBefore: 30 },
  ]).onConflictDoNothing();

  await db.insert(leaveTypesTable).values([
    { nameAr: "Annual Leave", nameEn: "Annual Leave", code: "annual", color: "green" },
    { nameAr: "Sick Leave", nameEn: "Sick Leave", code: "sick", color: "red" },
    { nameAr: "Emergency Leave", nameEn: "Emergency Leave", code: "emergency", color: "orange" },
    { nameAr: "Maternity Leave", nameEn: "Maternity Leave", code: "maternity", color: "pink" },
    { nameAr: "Paternity Leave", nameEn: "Paternity Leave", code: "paternity", color: "blue" },
    { nameAr: "Hajj Leave", nameEn: "Hajj Leave", code: "hajj", color: "purple" },
    { nameAr: "Unpaid Leave", nameEn: "Unpaid Leave", code: "unpaid", color: "gray" },
    { nameAr: "Bereavement Leave", nameEn: "Bereavement Leave", code: "bereavement", color: "black" },
  ]).onConflictDoNothing();

  await db.insert(assetCategoriesTable).values([
    { nameAr: "Computers", nameEn: "Computers" },
    { nameAr: "Mobile Phones", nameEn: "Mobile Phones" },
    { nameAr: "Office Furniture", nameEn: "Office Furniture" },
    { nameAr: "Vehicles", nameEn: "Vehicles" },
    { nameAr: "Printers", nameEn: "Printers" },
    { nameAr: "Monitors", nameEn: "Monitors" },
    { nameAr: "Electronics", nameEn: "Electronics" },
    { nameAr: "Other", nameEn: "Other" },
  ]).onConflictDoNothing();

  const [hrDept, itDept, financeDept, opsDept] = await db
    .insert(departmentsTable)
    .values([
      { companyId, nameAr: "Human Resources", nameEn: "Human Resources", code: "HR" },
      { companyId, nameAr: "Information Technology", nameEn: "Information Technology", code: "IT" },
      { companyId, nameAr: "Finance", nameEn: "Finance", code: "FIN" },
      { companyId, nameAr: "Operations", nameEn: "Operations", code: "OPS" },
      { companyId, nameAr: "Sales", nameEn: "Sales", code: "SAL" },
      { companyId, nameAr: "Customer Service", nameEn: "Customer Service", code: "CS" },
    ])
    .onConflictDoNothing()
    .returning();

  const [hrMgrTitle, hrSpecTitle, devTitle, senEngTitle, pmTitle, accountantTitle] = await db
    .insert(jobTitlesTable)
    .values([
      { companyId, titleAr: "HR Manager", titleEn: "HR Manager", jobGrade: "G5" },
      { companyId, titleAr: "HR Specialist", titleEn: "HR Specialist", jobGrade: "G3" },
      { companyId, titleAr: "Software Developer", titleEn: "Software Developer", jobGrade: "G4" },
      { companyId, titleAr: "Senior Engineer", titleEn: "Senior Engineer", jobGrade: "G5" },
      { companyId, titleAr: "Project Manager", titleEn: "Project Manager", jobGrade: "G6" },
      { companyId, titleAr: "Accountant", titleEn: "Accountant", jobGrade: "G3" },
      { companyId, titleAr: "Finance Manager", titleEn: "Finance Manager", jobGrade: "G6" },
      { companyId, titleAr: "General Manager", titleEn: "General Manager", jobGrade: "G9" },
    ])
    .onConflictDoNothing()
    .returning();

  await db.insert(leavePoliciesTable).values([
    {
      companyId, leaveType: "annual", nameAr: "Annual Leave", nameEn: "Annual Leave",
      daysPerYear: "14", maxCarryForwardDays: "14", minServiceMonths: 0, isPaid: true, gender: "all",
    },
    {
      companyId, leaveType: "sick", nameAr: "Sick Leave", nameEn: "Sick Leave",
      daysPerYear: "14", maxCarryForwardDays: "0", minServiceMonths: 0, requiresMedicalCertificate: true, isPaid: true, gender: "all",
    },
    {
      companyId, leaveType: "maternity", nameAr: "Maternity Leave", nameEn: "Maternity Leave",
      daysPerYear: "70", maxCarryForwardDays: "0", minServiceMonths: 0, isPaid: true, gender: "female",
    },
    {
      companyId, leaveType: "paternity", nameAr: "Paternity Leave", nameEn: "Paternity Leave",
      daysPerYear: "3", maxCarryForwardDays: "0", minServiceMonths: 0, isPaid: true, gender: "male",
    },
    {
      companyId, leaveType: "hajj", nameAr: "Hajj Leave", nameEn: "Hajj Leave",
      daysPerYear: "14", maxCarryForwardDays: "0", minServiceMonths: 24, isPaid: true, gender: "all",
    },
    {
      companyId, leaveType: "emergency", nameAr: "Emergency Leave", nameEn: "Emergency Leave",
      daysPerYear: "3", maxCarryForwardDays: "0", minServiceMonths: 0, isPaid: true, gender: "all",
    },
    {
      companyId, leaveType: "unpaid", nameAr: "Unpaid Leave", nameEn: "Unpaid Leave",
      daysPerYear: "30", maxCarryForwardDays: "0", minServiceMonths: 12, isPaid: false, gender: "all",
    },
  ]).onConflictDoNothing();

  // Demo employees
  const [emp1, emp2, emp3, emp4, emp5, emp6] = await db
    .insert(employeesTable)
    .values([
      {
        companyId, employeeCode: "EMP-0001",
        firstNameAr: "Ahmed", lastNameAr: "Al-Ali", firstNameEn: "Ahmed", lastNameEn: "Al-Ali",
        gender: "male", dateOfBirth: "1980-01-15", hireDate: "2018-01-01",
        basicSalary: "3000.000", housingAllowance: "500.000", transportAllowance: "200.000",
        employmentStatus: "active", departmentId: hrDept?.id, jobTitleId: hrMgrTitle?.id,
        workEmail: "ahmed@zenjo.jo", nationalId: "9801234567",
        bankName: "Arab Bank", iban: "JO94ARAB0210000000000123456789",
      },
      {
        companyId, employeeCode: "EMP-0002",
        firstNameAr: "Sara", lastNameAr: "Mahmoud", firstNameEn: "Sara", lastNameEn: "Mahmoud",
        gender: "female", dateOfBirth: "1990-07-22", hireDate: "2021-03-15",
        basicSalary: "1200.000", housingAllowance: "200.000", transportAllowance: "75.000",
        employmentStatus: "active", departmentId: itDept?.id, jobTitleId: devTitle?.id,
        workEmail: "sara@zenjo.jo", nationalId: "9012345678",
        bankName: "Housing Bank", iban: "JO66HBJO3800000000001234567890",
      },
      {
        companyId, employeeCode: "EMP-0003",
        firstNameAr: "Mohammad", lastNameAr: "Al-Khatib", firstNameEn: "Mohammad", lastNameEn: "Al-Khatib",
        gender: "male", dateOfBirth: "1985-11-05", hireDate: "2019-06-01",
        basicSalary: "1800.000", housingAllowance: "400.000", transportAllowance: "150.000", mealAllowance: "100.000",
        employmentStatus: "active", departmentId: financeDept?.id, jobTitleId: accountantTitle?.id,
        workEmail: "mohammad@zenjo.jo", nationalId: "8812345678",
        bankName: "Jordan Bank", iban: "JO71JRJB3200000000001234567890",
      },
      {
        companyId, employeeCode: "EMP-0004",
        firstNameAr: "Khaled", lastNameAr: "Al-Nemer", firstNameEn: "Khaled", lastNameEn: "Al-Nemer",
        gender: "male", dateOfBirth: "1983-05-20", hireDate: "2017-09-01",
        basicSalary: "2500.000", housingAllowance: "450.000", transportAllowance: "180.000",
        employmentStatus: "active", departmentId: itDept?.id, jobTitleId: pmTitle?.id,
        workEmail: "khaled@zenjo.jo", nationalId: "8312345678",
        bankName: "Capital Bank", iban: "JO94CAPB0210000000000234567890",
      },
      {
        companyId, employeeCode: "EMP-0005",
        firstNameAr: "Layla", lastNameAr: "Haddad", firstNameEn: "Layla", lastNameEn: "Haddad",
        gender: "female", dateOfBirth: "1992-03-10", hireDate: "2022-01-10",
        basicSalary: "900.000", housingAllowance: "150.000", transportAllowance: "50.000",
        employmentStatus: "active", departmentId: hrDept?.id, jobTitleId: hrSpecTitle?.id,
        workEmail: "layla@zenjo.jo", nationalId: "9212345678",
        bankName: "Arab Bank", iban: "JO94ARAB0210000000000345678901",
      },
      {
        companyId, employeeCode: "EMP-0006",
        firstNameAr: "Yousef", lastNameAr: "Al-Rashid", firstNameEn: "Yousef", lastNameEn: "Al-Rashid",
        gender: "male", dateOfBirth: "1988-08-15", hireDate: "2020-05-01",
        basicSalary: "1400.000", housingAllowance: "250.000", transportAllowance: "100.000",
        employmentStatus: "active", departmentId: opsDept?.id,
        workEmail: "yousef@zenjo.jo", nationalId: "8812348678",
        bankName: "Housing Bank", iban: "JO66HBJO3800000000001234578890",
      },
    ])
    .onConflictDoNothing()
    .returning();

  // Assign emp4 (Khaled, Manager) as direct manager for emp2 and emp5
  if (emp4?.id && emp2?.id) {
    await db.update(employeesTable).set({ directManagerId: emp4.id }).where(eq(employeesTable.id, emp2.id));
  }
  if (emp4?.id && emp5?.id) {
    await db.update(employeesTable).set({ directManagerId: emp4.id }).where(eq(employeesTable.id, emp5.id));
  }

  // Migrate existing users to new role names
  await db.update(usersTable)
    .set({ role: "superadmin", passwordHash: hashPassword("Admin@1234"), employeeId: emp1?.id ?? null })
    .where(eq(usersTable.username, "admin"));

  await db.update(usersTable)
    .set({ role: "hradmin", passwordHash: hashPassword("Hr@1234"), employeeId: emp2?.id ?? null })
    .where(eq(usersTable.username, "hr"));

  // Insert new demo users (skip if username already exists)
  const newUsers = [
    {
      companyId, employeeId: emp1?.id ?? null,
      username: "admin", passwordHash: hashPassword("Admin@1234"),
      email: "admin@zenjo.jo", role: "superadmin", isActive: true,
    },
    {
      companyId, employeeId: emp2?.id ?? null,
      username: "hr", passwordHash: hashPassword("Hr@1234"),
      email: "hr@zenjo.jo", role: "hradmin", isActive: true,
    },
    {
      companyId, employeeId: emp3?.id ?? null,
      username: "payroll", passwordHash: hashPassword("Payroll@1234"),
      email: "payroll@zenjo.jo", role: "payrolladmin", isActive: true,
    },
    {
      companyId, employeeId: emp4?.id ?? null,
      username: "manager", passwordHash: hashPassword("Manager@1234"),
      email: "manager@zenjo.jo", role: "manager", isActive: true,
    },
    {
      companyId, employeeId: emp5?.id ?? null,
      username: "employee", passwordHash: hashPassword("Employee@1234"),
      email: "employee@zenjo.jo", role: "employee", isActive: true,
    },
    {
      companyId, employeeId: emp6?.id ?? null,
      username: "recruiter", passwordHash: hashPassword("Recruiter@1234"),
      email: "recruiter@zenjo.jo", role: "recruiter", isActive: true,
    },
  ];

  for (const u of newUsers) {
    await db.insert(usersTable).values(u).onConflictDoNothing();
  }

  console.log("\n=== Seeding Complete ===");
  console.log("Demo accounts (all at localhost/zenjo):");
  console.log("  superadmin:   admin    / Admin@1234");
  console.log("  hradmin:      hr       / Hr@1234");
  console.log("  payrolladmin: payroll  / Payroll@1234");
  console.log("  manager:      manager  / Manager@1234");
  console.log("  employee:     employee / Employee@1234");
  console.log("  recruiter:    recruiter/ Recruiter@1234");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
