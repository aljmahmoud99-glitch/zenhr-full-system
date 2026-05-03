export interface User {
  id: number; username: string; role: string; email?: string;
  employeeId?: number; employee?: Employee;
  companyId?: number;
  mustChangePassword?: boolean;
  isActive?: boolean;
}

export interface Company {
  id: number; nameAr: string; nameEn: string;
  commercialRegNo?: string; taxNumber?: string;
  email?: string; adminEmail?: string; subdomainSlug?: string;
  phone?: string; website?: string; industryType?: string;
  isActive: boolean; planType: string; maxEmployees: number;
  planExpiryDate?: string; createdAt?: string;
  employeeCount?: number; userCount?: number; branchCount?: number;
}

export interface PlatformStats {
  totalCompanies: number; activeCompanies: number;
  trialCompanies: number; expiredCompanies: number;
  pendingRegistrations: number; totalUsers: number;
  totalEmployees?: number;
}

export interface CompanyRegistration {
  id: number; companyNameAr: string; companyNameEn: string;
  contactEmail: string; contactPhone?: string;
  commercialRegNo?: string; planType: string;
  status: string; requestedAt: string; reviewedAt?: string; notes?: string;
}

export interface Employee {
  id: number; employeeCode: string; companyId: number;
  firstNameAr: string; lastNameAr: string; firstNameEn: string; lastNameEn: string;
  middleNameAr?: string; middleNameEn?: string;
  fullNameAr: string; fullNameEn: string;
  gender: string; dateOfBirth?: string; nationalId?: string; bloodType?: string;
  nationality?: string; nationalityCode?: string; maritalStatus?: string;
  religion?: string; numberOfDependents?: number;
  workEmail?: string; personalEmail?: string;
  personalPhone?: string; workPhone?: string;
  emergencyContactName?: string; emergencyContactPhone?: string; emergencyContactRelation?: string;
  addressAr?: string; city?: string; governorate?: string;
  departmentId?: number; departmentNameAr?: string; departmentNameEn?: string;
  orgNodeId?: number; orgNodeNameAr?: string; orgNodeNameEn?: string; orgNodeType?: string;
  branchId?: number; branchNameAr?: string; branchNameEn?: string;
  orgBreadcrumb?: string;
  jobTitleId?: number; jobTitleAr?: string; jobTitleEn?: string;
  directManagerId?: number; directManagerName?: string; directManagerNameAr?: string;
  employmentType: string; contractType?: string; contractEndDate?: string;
  hireDate?: string; probationEndDate?: string;
  employmentStatus: string;
  terminationDate?: string; terminationReason?: string;
  basicSalary: number; housingAllowance: number; transportAllowance: number;
  mobileAllowance: number; mealAllowance: number; otherAllowances: number; grossSalary: number;
  sscNumber?: string; isSscEnrolled?: boolean; isSscExempt?: boolean;
  sscRegistrationMonth?: number; sscRegistrationYear?: number;
  workPermitNumber?: string; workPermitExpiry?: string;
  residencyNumber?: string; residencyExpiry?: string;
  passportNumber?: string; passportExpiry?: string;
  healthCertificateNumber?: string; healthCertificateExpiry?: string;
  bankName?: string; bankAccountNumber?: string; iban?: string;
  educationLevel?: string; yearsOfExperience?: number;
  profilePhoto?: string;
  createdAt: string; updatedAt: string;
}

export interface EmployeeQualification {
  id: number; employeeId: number;
  qualificationType: string; dataJson: string;
  createdAt: string;
}

export interface ProbationEvaluation {
  id: number;
  employeeId: number;
  evaluationStage: 'month1' | 'month2' | 'final';
  evaluationDate: string;
  commitmentScore: number;
  workQualityScore: number;
  learningScore: number;
  behaviorScore: number;
  teamworkScore: number;
  commitmentNotes?: string;
  workQualityNotes?: string;
  learningNotes?: string;
  behaviorNotes?: string;
  teamworkNotes?: string;
  overallComments?: string;
  evaluatedBy?: string;
  recommendation: 'continue' | 'needs_improvement' | 'confirm' | 'not_recommended';
  averageScore: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ProbationAlert {
  employeeId: number;
  employeeCode: string;
  fullNameAr: string;
  fullNameEn: string;
  departmentNameAr?: string;
  departmentNameEn?: string;
  hireDate?: string;
  probationEndDate: string;
  daysLeft: number;
  alertLevel: 'warning' | 'critical' | 'overdue';
}

export interface Department {
  id: number; companyId: number; nameAr: string; nameEn: string;
  code?: string; managerEmployeeId?: number; isActive: boolean; createdAt: string;
}

export interface JobTitle {
  id: number; companyId: number; titleAr: string; titleEn: string;
  code?: string; grade?: string; minSalary?: number; maxSalary?: number; isActive: boolean;
}

export interface LeaveType {
  id: number; nameAr: string; nameEn: string; code: string;
  isPaid: boolean; defaultDaysPerYear: number; maxCarryForward: number;
  genderRestriction: string; onceInCareer: boolean; requiresMedicalCert: boolean; isActive: boolean;
}

export interface LeavePolicy {
  id?: number;
  companyId?: number;
  leaveTypeId: number;
  leaveTypeNameAr?: string;
  leaveTypeNameEn?: string;
  leaveTypeCode?: string;
  daysPerYear: number;
  maxCarryForward: number;
  accrualType?: string;
  minServiceMonths: number;
  requiresManagerApproval: boolean;
  requiresHrApproval: boolean;
  noticeDaysRequired: number;
  maxConsecutiveDays?: number | null;
  requiresAttachment: boolean;
  carryOverExpiresAfterDays?: number | null;
  isActive?: boolean;
}

export interface LeaveRequest {
  id: number; employeeId: number; employeeCode?: string; fullNameAr?: string; fullNameEn?: string;
  leaveTypeId: number; leaveTypeNameAr?: string; leaveTypeNameEn?: string;
  jobTitleAr?: string; jobTitleEn?: string;
  startDate: string; endDate: string; totalDays: number; reason?: string;
  departmentAr?: string; departmentEn?: string;
  orgNodeId?: number; orgNodeNameAr?: string; orgNodeNameEn?: string; orgNodeType?: string;
  attachmentUrl?: string;
  requiresAttachment?: boolean;
  status: string; rejectionReason?: string; rejectionStep?: string;
  managerApprovedAt?: string; hrApprovedAt?: string;
  managerApproverName?: string; hrApproverName?: string;
  managerDecisionLabelAr?: string; managerDecisionLabelEn?: string;
  hrDecisionLabelAr?: string; hrDecisionLabelEn?: string;
  createdAt: string; updatedAt: string;
}

export interface OvertimeRequest {
  id: number; employeeId: number; employeeCode?: string; fullNameAr?: string; fullNameEn?: string;
  date: string; hours: number; reason?: string;
  overtimeType: string; compensationType: string; status: string;
  rejectionReason?: string; createdAt: string;
}

export interface AttendanceRecord {
  id: number; employeeId: number; employeeCode?: string; fullNameAr?: string; fullNameEn?: string;
  date: string; clockIn?: string; clockOut?: string; status: string;
  lateMinutes: number; workedMinutes: number; overtimeMinutes: number; notes?: string;
}

export interface PayrollRun {
  id: number; companyId: number; runMonth: number; runYear: number;
  status: string; totalGross: number; totalNet: number; totalDeductions: number;
  employeeCount: number; notes?: string; createdAt: string; updatedAt: string;
}

export interface Payslip {
  id: number; payrollRunId: number; employeeId: number;
  employeeCode?: string; fullNameAr?: string; fullNameEn?: string;
  departmentNameAr?: string; departmentNameEn?: string;
  jobTitleAr?: string; jobTitleEn?: string;
  periodMonth: number; periodYear: number;
  basicSalary: number; housingAllowance: number; transportAllowance: number;
  mobileAllowance: number; mealAllowance: number; otherAllowances: number;
  overtimeAmount: number; bonusAmount: number; grossSalary: number;
  sscDeduction: number; incomeTaxDeduction: number; absenceDeduction: number;
  lateDeduction: number; advanceDeduction: number; otherDeductions: number; totalDeductions: number;
  netSalary: number; workedDays: number; absentDays: number;
  paymentStatus: string; paidAt?: string; createdAt: string;
}

export interface LeaveBalance {
  id: number; leaveTypeId: number; leaveTypeNameAr?: string; leaveTypeNameEn?: string;
  leaveTypeCode?: string;
  year: number; totalDays: number; usedDays: number; pendingDays: number; remainingDays: number;
  policy?: {
    daysPerYear: number;
    maxCarryForward: number;
    requiresManagerApproval: boolean;
    requiresHrApproval: boolean;
    noticeDaysRequired: number;
    maxConsecutiveDays?: number | null;
    requiresAttachment: boolean;
  } | null;
}

export interface DashboardSummary {
  totalEmployees: number; presentToday: number; onLeaveToday: number; absentToday: number;
  pendingLeaves: number; pendingOvertimes: number; pendingAdvances: number; pendingPreEmployment: number;
  pendingDisciplinary: number; activeResignations: number; pendingClearances: number;
  sscNotEnrolled: number; wpExpiringSoon: number; healthExpiringSoon: number; assetsAssigned: number;
}

export interface ApiResponse<T> { success: boolean; data: T; message?: string; total?: number; }

export type Role = 'superadmin' | 'hradmin' | 'payrolladmin' | 'manager' | 'employee';

export const ROLE_LABELS: Record<string, string> = {
  superadmin: 'مدير النظام',
  hradmin: 'مدير الموارد البشرية',
  payrolladmin: 'مدير الرواتب',
  manager: 'مدير القسم',
  employee: 'موظف'
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  manager_approved: 'موافقة المدير',
  approved: 'موافق عليه',
  rejected: 'مرفوض',
  cancelled: 'ملغي',
  active: 'نشط',
  inactive: 'غير نشط',
  probation: 'تحت التجربة',
  suspended: 'موقوف',
  terminated: 'منتهي الخدمة',
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  on_leave: 'إجازة',
  draft: 'مسودة',
  paid: 'مدفوع',
  unpaid: 'غير مدفوع'
};

export const MONTHS_AR = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const MONTHS_EN = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
