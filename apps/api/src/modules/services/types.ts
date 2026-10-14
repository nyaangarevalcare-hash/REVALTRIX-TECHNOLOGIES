export interface CreateServiceDto {
  name: string;
  price: number;
  description?: string;
  category?: string;
  durationMin?: number;
  departmentId?: string;
  branchId?: string;
}

export interface UpdateServiceDto {
  name?: string;
  price?: number;
  description?: string;
  category?: string;
  durationMin?: number;
  departmentId?: string | null;
  branchId?: string | null;
}
