import { FormEvent, useEffect, useState } from 'react';
import { getOrganization } from '../../organization/api/organization.api.js';
import { getBranches } from '../../branches/api/branches.api.js';
import {
  createDepartment,
  deactivateDepartment,
  getDepartments,
  updateDepartment,
} from '../api/departments.api.js';
import type { Branch } from '../../branches/types/branch.types.js';
import type { OrganizationResponse } from '../../organization/types/organization.types.js';
import type { Department } from '../types/department.types.js';

interface DepartmentsPageProps {
  onNavigate: (path: string) => void;
}

interface DepartmentFormState {
  name: string;
  code: string;
  shortName: string;
  type: string;
  category: string;
  description: string;
  departmentPassword: string;
  requiresDepartmentPassword: boolean;
  status: string;
  organizationId: string;
  branchId: string;
  parentId: string;
  headOfDepartment: string;
  contactEmail: string;
  contactPhone: string;
  extensionNumber: string;
  appointmentBookingEnabled: boolean;
  walkInRegistrationEnabled: boolean;
  queueManagementEnabled: boolean;
}

const EMPTY_FORM: DepartmentFormState = {
  name: '',
  code: '',
  shortName: '',
  type: 'OPD',
  category: 'CLINICAL',
  description: '',
  departmentPassword: '',
  requiresDepartmentPassword: true,
  status: 'ACTIVE',
  organizationId: '',
  branchId: '',
  parentId: '',
  headOfDepartment: '',
  contactEmail: '',
  contactPhone: '',
  extensionNumber: '',
  appointmentBookingEnabled: true,
  walkInRegistrationEnabled: true,
  queueManagementEnabled: true,
};

function generateDepartmentCode(name: string, departments: Department[]): string {
  const base =
    name
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/[^a-zA-Z0-9]/g, ''))
      .filter(Boolean)
      .join('_')
      .toUpperCase()
      .slice(0, 50) || 'DEPT';
  const existingCodes = new Set(departments.map((department) => department.code.toUpperCase()));
  if (!existingCodes.has(base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base.slice(0, 46)}_${suffix}`;
  while (existingCodes.has(candidate)) {
    suffix += 1;
    const suffixText = `_${suffix}`;
    candidate = `${base.slice(0, 50 - suffixText.length)}${suffixText}`;
  }
  return candidate;
}

export function DepartmentsPage({ onNavigate }: DepartmentsPageProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [organization, setOrganization] = useState<OrganizationResponse | null>(null);

  const [form, setForm] = useState<DepartmentFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadData(): Promise<void> {
    try {
      setLoading(true);
      setError(null);

      const [organizationResult, branchesResult, departmentsResult] = await Promise.all([
        getOrganization(),
        getBranches(),
        getDepartments(),
      ]);

      setOrganization(organizationResult);
      setBranches(branchesResult);
      setDepartments(departmentsResult);

      if (!editingId && organizationResult.tenant.id) {
        setForm((current) => ({
          ...current,
          organizationId: organizationResult.tenant.id,
        }));
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load department configuration.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!editingId && !codeManuallyEdited && form.name.trim()) {
      setForm((current) => ({
        ...current,
        code: generateDepartmentCode(current.name, departments),
      }));
    }
  }, [editingId, codeManuallyEdited, form.name, departments]);

  function resetForm(): void {
    setEditingId(null);
    setCodeManuallyEdited(false);

    setForm({
      ...EMPTY_FORM,
      organizationId: organization?.tenant.id ?? '',
    });
  }

  function beginEdit(department: Department): void {
    setEditingId(department.id);
    setCodeManuallyEdited(true);

    setForm({
      name: department.name,
      code: department.code,
      shortName: department.shortName ?? '',
      type: department.type ?? 'OPD',
      category: department.category ?? 'CLINICAL',
      description: department.description ?? '',
      departmentPassword: '',
      requiresDepartmentPassword: department.requiresDepartmentPassword ?? true,
      status: department.status ?? 'ACTIVE',
      organizationId: department.organizationId ?? '',
      branchId: department.branchId ?? '',
      parentId: department.parentId ?? '',
      headOfDepartment: department.headOfDepartment ?? '',
      contactEmail: department.contactEmail ?? '',
      contactPhone: department.contactPhone ?? '',
      extensionNumber: department.extensionNumber ?? '',
      appointmentBookingEnabled: department.appointmentBookingEnabled ?? true,
      walkInRegistrationEnabled: department.walkInRegistrationEnabled ?? true,
      queueManagementEnabled: department.queueManagementEnabled ?? true,
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function updateField(field: keyof DepartmentFormState, value: string): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const name = form.name.trim();
    const code = form.code.trim().toUpperCase() || generateDepartmentCode(name, departments);

    if (!name) {
      setError('Department name is required.');
      return;
    }

    if (!code) {
      setError('Department code could not be generated automatically.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const organizationId = form.organizationId || undefined;

      const branchId = form.branchId || undefined;

      const parentId = form.parentId || undefined;

      const departmentPassword = form.departmentPassword.trim();

      if (editingId) {
        await updateDepartment(editingId, {
          name,
          code,
          shortName: form.shortName.trim() || null,
          type: form.type || null,
          category: form.category || null,
          description: form.description.trim() || null,
          ...(departmentPassword ? { departmentPassword } : {}),
          requiresDepartmentPassword: form.requiresDepartmentPassword,
          status: form.status || 'ACTIVE',
          organizationId: organizationId ?? null,
          branchId: branchId ?? null,
          parentId: parentId ?? null,
          headOfDepartment: form.headOfDepartment.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          extensionNumber: form.extensionNumber.trim() || null,
          appointmentBookingEnabled: form.appointmentBookingEnabled,
          walkInRegistrationEnabled: form.walkInRegistrationEnabled,
          queueManagementEnabled: form.queueManagementEnabled,
        });
      } else {
        await createDepartment({
          name,
          code,
          shortName: form.shortName.trim() || null,
          type: form.type || 'OPD',
          category: form.category || 'CLINICAL',
          description: form.description.trim() || null,
          departmentPassword: departmentPassword || null,
          requiresDepartmentPassword: form.requiresDepartmentPassword,
          status: form.status || 'ACTIVE',
          ...(organizationId ? { organizationId } : {}),
          ...(branchId ? { branchId } : {}),
          ...(parentId ? { parentId } : {}),
          headOfDepartment: form.headOfDepartment.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          contactPhone: form.contactPhone.trim() || null,
          extensionNumber: form.extensionNumber.trim() || null,
          appointmentBookingEnabled: form.appointmentBookingEnabled,
          walkInRegistrationEnabled: form.walkInRegistrationEnabled,
          queueManagementEnabled: form.queueManagementEnabled,
        });
      }

      resetForm();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save department.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(department: Department): Promise<void> {
    const confirmed = window.confirm(`Deactivate the "${department.name}" department?`);

    if (!confirmed) {
      return;
    }

    try {
      setError(null);

      await deactivateDepartment(department.id);

      if (editingId === department.id) {
        resetForm();
      }

      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to deactivate department.',
      );
    }
  }

  const availableParentDepartments = departments.filter(
    (department) => department.id !== editingId,
  );

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Loading department configuration...</p>
      </main>
    );
  }

  return (
    <main className="branches-layout">
      <section className="dashboard-page-header">
        <div>
          <p className="dashboard-eyebrow">ORGANIZATION</p>

          <h1>Departments</h1>

          <p>
            Configure departments, branch assignment, and department hierarchy for{' '}
            <strong>{organization?.tenant.name ?? 'your organization'}</strong>.
          </p>
        </div>
      </section>

      {error && (
        <div className="registration-error" role="alert">
          {error}
        </div>
      )}

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>{editingId ? 'Edit department' : 'Add department'}</h2>

            <p>Departments can be organization-wide or assigned to a specific branch.</p>
          </div>
        </div>

        <form className="tenant-form" onSubmit={handleSubmit}>
          <div className="tenant-form-grid">
            <label>
              Department name
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. Outpatient Department"
                maxLength={200}
                required
              />
            </label>

            <label>
              Department code
              <input
                type="text"
                value={form.code}
                onChange={(event) => {
                  setCodeManuallyEdited(true);
                  updateField('code', event.target.value);
                }}
                placeholder="e.g. OPD"
                maxLength={50}
                required
              />
            </label>

            <label>
              Department type
              <select
                value={form.type}
                onChange={(event) => updateField('type', event.target.value)}
              >
                <option value="OPD">OPD</option>
                <option value="ICU">ICU</option>
                <option value="HDU">HDU</option>
                <option value="NICU">NICU</option>
                <option value="SURGERY_OT">Surgery OT</option>
                <option value="RADIOLOGY">Radiology</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="AMBULANCE_TRANSPORT">Ambulance</option>
                <option value="BILLING_FINANCE">Billing & Finance</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>

            <label>
              Department category
              <select
                value={form.category}
                onChange={(event) => updateField('category', event.target.value)}
              >
                <option value="CLINICAL">Clinical</option>
                <option value="CRITICAL_CARE">Critical Care</option>
                <option value="DIAGNOSTICS">Diagnostics</option>
                <option value="CLINICAL_SUPPORT">Clinical Support</option>
                <option value="SURGICAL">Surgical</option>
                <option value="ADMINISTRATIVE">Administrative</option>
                <option value="SUPPORT">Support</option>
              </select>
            </label>

            <label>
              Department access password
              <input
                type="password"
                value={form.departmentPassword}
                onChange={(event) => updateField('departmentPassword', event.target.value)}
                placeholder="Minimum 6 characters"
                minLength={6}
                maxLength={128}
                required={form.requiresDepartmentPassword && !editingId}
              />
              {editingId && (
                <span className="form-helper-text">
                  Leave blank to keep the current password. Enter a new value to replace it.
                </span>
              )}
            </label>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.requiresDepartmentPassword}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requiresDepartmentPassword: event.target.checked,
                  }))
                }
              />
              Require department password for access
            </label>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                rows={4}
                placeholder="Describe department workflows and scope"
              />
            </label>

            <label>
              Organization
              <select
                value={form.organizationId}
                onChange={(event) => updateField('organizationId', event.target.value)}
              >
                <option value="">Organization-wide</option>

                {organization && (
                  <option value={organization.tenant.id}>{organization.tenant.name}</option>
                )}
              </select>
            </label>

            <label>
              Branch
              <select
                value={form.branchId}
                onChange={(event) => updateField('branchId', event.target.value)}
              >
                <option value="">Organization-wide</option>

                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Parent department
              <select
                value={form.parentId}
                onChange={(event) => updateField('parentId', event.target.value)}
              >
                <option value="">Top-level department</option>

                {availableParentDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="branches-form-actions">
            <button type="submit" className="dashboard-primary-button" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create department'}
            </button>

            {editingId && (
              <button
                type="button"
                className="dashboard-secondary-button"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Department directory</h2>

            <p>
              {departments.length} active department
              {departments.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {departments.length === 0 ? (
          <div className="branches-empty-state">
            <h3>No departments configured</h3>

            <p>Create your first department to continue configuring the organization.</p>
          </div>
        ) : (
          <div className="branches-list">
            {departments.map((department) => (
              <article key={department.id} className="branch-list-item">
                <div className="branch-list-main">
                  <div>
                    <h3>{department.name}</h3>

                    <span className="branch-status">{department.code}</span>
                  </div>

                  <div className="branch-list-meta">
                    <span>
                      Organization: {department.organization?.name ?? 'Organization-wide'}
                    </span>

                    <span>Branch: {department.branch?.name ?? 'Organization-wide'}</span>

                    <span>Parent: {department.parent?.name ?? 'Top level'}</span>

                    <span>Services: {department._count?.services ?? 0}</span>

                    <span>Members: {department._count?.memberships ?? 0}</span>

                    <span>Child departments: {department._count?.children ?? 0}</span>
                  </div>
                </div>

                <div className="branch-list-actions">
                  <button
                    type="button"
                    className="dashboard-secondary-button"
                    onClick={() => beginEdit(department)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="dashboard-danger-button"
                    onClick={() => void handleDeactivate(department)}
                  >
                    Deactivate
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="branches-footer-actions">
        <button
          type="button"
          className="dashboard-secondary-button"
          onClick={() => onNavigate('/tenant/branches')}
        >
          Back to branches
        </button>

        <button
          type="button"
          className="dashboard-secondary-button"
          onClick={() => onNavigate('/tenant/organization')}
        >
          Organization profile
        </button>
      </div>
    </main>
  );
}
