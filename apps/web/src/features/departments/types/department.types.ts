export interface Department {
  id: string;
  name: string;
  code: string;
  shortName?: string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  departmentPassword?: string | null;
  requiresDepartmentPassword?: boolean | null;
  status: string;
  organizationId?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  headOfDepartment?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  extensionNumber?: string | null;
  appointmentBookingEnabled?: boolean;
  walkInRegistrationEnabled?: boolean;
  queueManagementEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
  organization?: { id: string; name: string };
  branch?: { id: string; name: string } | null;
  parent?: { id: string; name: string } | null;
  _count?: {
    children?: number;
    staff?: number;
    beds?: number;
    services?: number;
    memberships?: number;
  };
}

export interface CreateDepartmentInput {
  name: string;
  code: string;
  shortName?: string | null;
  type?: string | null;
  category?: string | null;
  description?: string | null;
  departmentPassword?: string | null;
  requiresDepartmentPassword?: boolean | null;
  status?: string | null;
  organizationId?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  headOfDepartment?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  extensionNumber?: string | null;
  appointmentBookingEnabled?: boolean;
  walkInRegistrationEnabled?: boolean;
  queueManagementEnabled?: boolean;
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {}
