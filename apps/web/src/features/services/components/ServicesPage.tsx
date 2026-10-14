import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getBranches } from '../../branches/api/branches.api.js';
import type { Branch } from '../../branches/types/branch.types.js';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';
import { getOrganization } from '../../organization/api/organization.api.js';
import type { OrganizationResponse } from '../../organization/types/organization.types.js';
import {
  createService,
  deactivateService,
  getServices,
  updateService,
} from '../api/services.api.js';
import type {
  CreateServiceInput,
  Service,
  UpdateServiceInput,
} from '../types/service.types.js';

interface ServiceFormState {
  name: string;
  code: string;
  price: string;
  description: string;
  category: string;
  durationMin: string;
  departmentId: string;
  branchId: string;
}

const emptyForm: ServiceFormState = {
  name: '',
  code: '',
  price: '0',
  description: '',
  category: '',
  durationMin: '',
  departmentId: '',
  branchId: '',
};

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organization, setOrganization] =
    useState<OrganizationResponse | null>(null);

  const [form, setForm] =
    useState<ServiceFormState>(emptyForm);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  const editingService = useMemo(
    () =>
      editingId
        ? services.find(
            (service) => service.id === editingId,
          ) ?? null
        : null,
    [editingId, services],
  );

  const generatedCodePreview = useMemo(() => {
    const base = form.name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'SERVICE';
    let attempt = 0;
    let candidate = base;
    while (services.some((service) => service.code === candidate && service.id !== editingId)) {
      attempt += 1;
      const suffix = `-${attempt + 1}`;
      candidate = `${base.slice(0, 50 - suffix.length)}${suffix}`;
    }
    return candidate;
  }, [form.name, services, editingId]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [
        servicesResult,
        branchesResult,
        departmentsResult,
        organizationResult,
      ] = await Promise.all([
        getServices(),
        getBranches(),
        getDepartments(),
        getOrganization(),
      ]);

      setServices(servicesResult);
      setBranches(branchesResult);
      setDepartments(departmentsResult);
      setOrganization(organizationResult);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load services',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setSuccess(null);
  }

  function startEdit(service: Service) {
    setEditingId(service.id);
    setSuccess(null);

    setForm({
      name: service.name,
      code: service.code,
      price: Number(service.price).toFixed(2),
      description:
        service.description ?? '',
      category:
        service.category ?? '',
      durationMin:
        service.durationMin?.toString() ?? '',
      departmentId:
        service.departmentId ?? '',
      branchId:
        service.branchId ?? '',
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const duration =
        form.durationMin.trim() !== ''
          ? Number(form.durationMin)
          : undefined;

      if (
        duration !== undefined &&
        (!Number.isInteger(duration) ||
          duration < 1 ||
          duration > 1440)
      ) {
        throw new Error(
          'Duration must be a whole number between 1 and 1440 minutes',
        );
      }

      const price = Number(form.price);
      if (!Number.isFinite(price) || price < 0 || price > 9999999999.99) {
        throw new Error('Price must be a nonnegative amount with up to two decimal places');
      }

      if (
        form.departmentId &&
        form.branchId
      ) {
        const department =
          departments.find(
            (item) =>
              item.id ===
              form.departmentId,
          );

        if (
          department?.branchId &&
          department.branchId !==
            form.branchId
        ) {
          throw new Error(
            'The selected branch must match the department branch',
          );
        }
      }

      if (editingId) {
        const input: UpdateServiceInput = {
          name: form.name,
          price,
          description:
            form.description,
          category: form.category,
          durationMin: duration,
          departmentId:
            form.departmentId || null,
          branchId:
            form.branchId || null,
        };

        await updateService(
          editingId,
          input,
        );

        setSuccess(
          'Service updated successfully.',
        );
      } else {
        const input: CreateServiceInput = {
          name: form.name,
          price,
          description:
            form.description || undefined,
          category:
            form.category || undefined,
          durationMin: duration,
          departmentId:
            form.departmentId || undefined,
          branchId:
            form.branchId || undefined,
        };

        await createService(input);

        setSuccess(
          'Service created successfully.',
        );
      }

      resetForm();
      await loadData();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to save service',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(
    service: Service,
  ) {
    const confirmed = window.confirm(
      `Deactivate "${service.name}"?`,
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await deactivateService(
        service.id,
      );

      if (editingId === service.id) {
        resetForm();
      }

      setSuccess(
        'Service deactivated successfully.',
      );

      await loadData();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : 'Failed to deactivate service',
      );
    }
  }

  function updateField(
    field: keyof ServiceFormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  if (loading) {
    return (
      <section className="tenant-page">
        <div className="tenant-page-header">
          <div>
            <p className="tenant-page-eyebrow">
              Clinical Services
            </p>
            <h1>Services</h1>
            <p>
              Loading service catalogue...
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tenant-page">
      <div className="tenant-page-header">
        <div>
          <p className="tenant-page-eyebrow">
            Clinical Services
          </p>
          <h1>Services</h1>
          <p>
            Configure the services offered by{' '}
            {organization?.tenant.name ??
              'your organization'}.
          </p>
        </div>

        <div className="tenant-page-actions">
          <button
            type="button"
            className="tenant-button secondary"
            onClick={() =>
              void loadData()
            }
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="tenant-alert error">
          {error}
        </div>
      )}

      {success && (
        <div className="tenant-alert success">
          {success}
        </div>
      )}

      <div className="tenant-content-grid">
        <section className="tenant-card">
          <div className="tenant-card-header">
            <div>
              <h2>
                {editingService
                  ? 'Edit service'
                  : 'Add service'}
              </h2>
              <p>
                Define the service identity,
                ownership and scheduling
                duration.
              </p>
            </div>

            {editingId && (
              <button
                type="button"
                className="tenant-button secondary"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>

          <form
            className="tenant-form"
            onSubmit={handleSubmit}
          >
            <div className="tenant-form-grid">
              <label>
                Service name
                <input
                  value={form.name}
                  onChange={(event) =>
                    updateField(
                      'name',
                      event.target.value,
                    )
                  }
                  minLength={2}
                  maxLength={200}
                  required
                />
              </label>

              <label>
                Service code (generated)
                <input
                  value={editingId ? form.code : generatedCodePreview}
                  readOnly
                  aria-readonly="true"
                />
              </label>

              <label>
                Price
                <input
                  type="number"
                  min={0}
                  max={9999999999.99}
                  step="0.01"
                  value={form.price}
                  onChange={(event) => updateField('price', event.target.value)}
                  required
                />
              </label>

              <label>
                Category
                <input
                  value={form.category}
                  onChange={(event) =>
                    updateField(
                      'category',
                      event.target.value,
                    )
                  }
                  maxLength={100}
                  placeholder="e.g. Outpatient"
                />
              </label>

              <label>
                Duration (minutes)
                <input
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={form.durationMin}
                  onChange={(event) =>
                    updateField(
                      'durationMin',
                      event.target.value,
                    )
                  }
                  placeholder="e.g. 30"
                />
              </label>

              <label>
                Branch
                <select
                  value={form.branchId}
                  onChange={(event) =>
                    updateField(
                      'branchId',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    All branches / not assigned
                  </option>
                  {branches.map(
                    (branch) => (
                      <option
                        key={branch.id}
                        value={branch.id}
                      >
                        {branch.name} (
                        {branch.code})
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                Department
                <select
                  value={form.departmentId}
                  onChange={(event) =>
                    updateField(
                      'departmentId',
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    No department
                  </option>
                  {departments.map(
                    (department) => (
                      <option
                        key={
                          department.id
                        }
                        value={
                          department.id
                        }
                      >
                        {department.name} (
                        {department.code})
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>

            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField(
                    'description',
                    event.target.value,
                  )
                }
                maxLength={1000}
                rows={4}
                placeholder="Describe what this service provides."
              />
            </label>

            <div className="tenant-form-actions">
              <button
                type="submit"
                className="tenant-button primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Update service'
                    : 'Create service'}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="tenant-button secondary"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="tenant-card">
          <div className="tenant-card-header">
            <div>
              <h2>
                Service catalogue
              </h2>
              <p>
                {services.length}{' '}
                active service
                {services.length === 1
                  ? ''
                  : 's'}
              </p>
            </div>
          </div>

          {services.length === 0 ? (
            <div className="tenant-empty-state">
              <h3>
                No services configured
              </h3>
              <p>
                Add the first service to
                continue configuring
                clinical operations.
              </p>
            </div>
          ) : (
            <div className="tenant-table-wrapper">
              <table className="tenant-table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Category</th>
                    <th>Department</th>
                    <th>Branch</th>
                    <th>Duration</th>
                    <th>Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {services.map(
                    (service) => (
                      <tr
                        key={service.id}
                      >
                        <td>
                          <strong>
                            {service.name}
                          </strong>
                          <span className="tenant-table-secondary">
                            {service.code}
                          </span>
                        </td>

                        <td>
                          {service.category ??
                            '—'}
                        </td>

                        <td>
                          {service.department
                            ? `${service.department.name} (${service.department.code})`
                            : '—'}
                        </td>

                        <td>
                          {service.branch
                            ? `${service.branch.name} (${service.branch.code})`
                            : '—'}
                        </td>

                        <td>
                          {service.durationMin
                            ? `${service.durationMin} min`
                            : '—'}
                        </td>

                        <td>{Number(service.price).toFixed(2)}</td>

                        <td>
                          <div className="tenant-table-actions">
                            <button
                              type="button"
                              className="tenant-button secondary small"
                              onClick={() =>
                                startEdit(
                                  service,
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="tenant-button danger small"
                              onClick={() =>
                                void handleDeactivate(
                                  service,
                                )
                              }
                            >
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
