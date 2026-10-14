export interface StaffMember {
  id: string;
  staffNumber: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  employmentType: string;
  status: string;
  joinedAt: string | null;
  createdAt: string;
  emailVerified: boolean;
  passwordConfigured: boolean;
  assignments: StaffDepartmentAssignment[];
}

export interface StaffDepartmentAssignment {
  id: string;
  role: string;
  accessLevel: string;
  isPrimaryDepartment?: boolean;
  status?: string;
  department: {
    id: string;
    name: string;
    code: string;
    type?: string | null;
    category?: string | null;
    requiresDepartmentPassword?: boolean;
  };
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
  phone?: string;
  departmentId: string;
  role: string;
  branchId?: string;
  accessLevel?: 'VIEW' | 'OPERATE' | 'MANAGE' | 'ADMIN';
  jobTitle?: string;
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
