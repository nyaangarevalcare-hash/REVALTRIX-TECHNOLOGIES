export interface ServiceDepartment {
  id: string;
  name: string;
  code: string;
}

export interface ServiceBranch {
  id: string;
  name: string;
  code: string;
}

export interface Service {
  id: string;
  tenantId: string;
  departmentId: string | null;
  branchId: string | null;
  name: string;
  code: string;
  price: number | string;
  description: string | null;
  category: string | null;
  durationMin: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  department: ServiceDepartment | null;
  branch: ServiceBranch | null;
}

export interface CreateServiceInput {
  name: string;
  price: number;
  description?: string;
  category?: string;
  durationMin?: number;
  departmentId?: string;
  branchId?: string;
}

export interface UpdateServiceInput {
  name?: string;
  price?: number;
  description?: string;
  category?: string;
  durationMin?: number;
  departmentId?: string | null;
  branchId?: string | null;
}
