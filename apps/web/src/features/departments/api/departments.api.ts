import { authenticatedApiRequest } from '../../../lib/auth-api.js';
import type {
  CreateDepartmentInput,
  Department,
  UpdateDepartmentInput,
} from '../types/department.types.js';

export async function getDepartments(): Promise<Department[]> {
  return authenticatedApiRequest<Department[]>('/v1/departments');
}

export async function getDepartment(departmentId: string): Promise<Department> {
  return authenticatedApiRequest<Department>(`/v1/departments/${departmentId}`);
}

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  return authenticatedApiRequest<Department>('/v1/departments', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateDepartment(
  departmentId: string,
  input: UpdateDepartmentInput,
): Promise<Department> {
  return authenticatedApiRequest<Department>(`/v1/departments/${departmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deactivateDepartment(departmentId: string): Promise<{
  id: string;
  status: string;
  deletedAt: string;
}> {
  return authenticatedApiRequest<{
    id: string;
    status: string;
    deletedAt: string;
  }>(`/v1/departments/${departmentId}`, {
    method: 'DELETE',
  });
}

export interface DepartmentAccessResponse {
  departmentAccessToken: string;
  expiresInSeconds: number;
  department: {
    id: string;
    name: string;
    code: string;
    type: string | null;
    category: string | null;
  };
  assignment: {
    role: string;
    accessLevel: string;
  };
}

export async function accessDepartment(
  departmentId: string,
  password: string,
): Promise<DepartmentAccessResponse> {
  return authenticatedApiRequest<DepartmentAccessResponse>(
    `/v1/departments/${departmentId}/access`,
    {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    },
  );
}

export interface DepartmentWorkspaceResponse {
  department: {
    id: string;
    name: string;
    code: string;
    type: string | null;
    category: string | null;
    dashboardConfig: unknown;
    sidebarConfig: unknown;
    workflowConfig: unknown;
  };
  staff: {
    firstName: string;
    lastName: string;
    role: string;
    accessLevel: string;
  };
  metrics: {
    assignedStaff: number;
    activeServices: number;
    activeQueues: number;
    waitingQueueEntries: number;
    appointments: number;
  };
}

export async function getDepartmentWorkspace(
  departmentId: string,
  departmentAccessToken: string,
): Promise<DepartmentWorkspaceResponse> {
  return authenticatedApiRequest<DepartmentWorkspaceResponse>(
    `/v1/departments/${departmentId}/workspace`,
    {
      headers: {
        'X-Department-Access-Token': departmentAccessToken,
      },
    },
  );
}
