export interface StaffMember {
  id: string;
  hospitalId: string | null;
  departmentId: string | null;
  branchId: string | null;
  reportsToId: string | null;
  staffNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  profilePhotoUrl: string | null;
  jobTitle: string | null;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'LOCUM' | 'CONTRACTOR' | 'VOLUNTEER';
  licenseNumber: string | null;
  specialty: string | null;
  qualifications: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'ON_LEAVE' | 'OFFBOARDED';
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  branch: { id: string; name: string; code: string } | null;
  reportsTo: { id: string; firstName: string; lastName: string } | null;
  emailVerified: boolean;
  passwordConfigured: boolean;
  assignments: StaffDepartmentAssignment[];
  shifts: StaffShift[];
}

export interface StaffDepartmentAssignment {
  id: string;
  role: string;
  accessLevel: string;
  isPrimaryDepartment?: boolean;
  status?: string;
  assignedById?: string;
  assignedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  branch?: { id: string; name: string; code: string } | null;
  department: {
    id: string;
    staffProfileId: string;
    name: string;
    code: string;
    type?: string | null;
    category?: string | null;
    requiresDepartmentPassword?: boolean;
  };
}

export interface StaffShift {
  id: string;
  departmentId: string;
  branchId: string | null;
  shiftName: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string[] | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  department: { id: string; name: string; code: string };
  branch: { id: string; name: string; code: string } | null;
}

export interface StaffAccessAttempt {
  id: string;
  userId: string;
  departmentId: string | null;
  status: 'SUCCESS' | 'FAILED_PASSWORD' | 'FAILED_MFA' | 'LOCKED' | 'UNAUTHORIZED';
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  department: { id: string; name: string; code: string } | null;
}

export interface StaffMeResponse {
  profile: {
    id: string;
    staffNumber: string | null;
    firstName: string;
    lastName: string;
    email: string;
    jobTitle: string | null;
    status: string;
    tenant: { id: string; name: string };
  } | null;
  assignments: StaffDepartmentAssignment[];
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
  departmentId: string;
  role: string;
  branchId?: string | undefined;
  accessLevel?: 'VIEW' | 'OPERATE' | 'MANAGE' | 'ADMIN';
  jobTitle?: string | undefined;
  employmentType?: StaffMember['employmentType'];
  reportsToId?: string | undefined;
  licenseNumber?: string | undefined;
  specialty?: string | undefined;
  qualifications?: string | undefined;
}

export interface CreateStaffResponse {
  id: string;
  staffNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  invitationStatus: 'VERIFICATION_EMAIL_SENT' | 'EMAIL_DELIVERY_FAILED';
}

export interface AssignStaffDepartmentInput {
  departmentId: string;
  branchId?: string | undefined;
  role: string;
  accessLevel: 'VIEW' | 'OPERATE' | 'MANAGE' | 'ADMIN';
  isPrimaryDepartment?: boolean;
}

export interface CreateStaffShiftInput {
  departmentId: string;
  branchId?: string | undefined;
  shiftName: string;
  startTime: string;
  endTime: string;
  daysOfWeek: string[];
}
