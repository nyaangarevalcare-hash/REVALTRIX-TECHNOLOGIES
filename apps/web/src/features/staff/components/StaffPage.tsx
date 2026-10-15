import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getBranches } from '../../branches/api/branches.api.js';
import type { Branch } from '../../branches/types/branch.types.js';
import { getDepartments } from '../../departments/api/departments.api.js';
import type { Department } from '../../departments/types/department.types.js';
import {
  assignStaffDepartment,
  createStaffTimeOff,
  createStaffShift,
  downloadStaffDocument,
  getStaff,
  getStaffAccessHistory,
  listStaffDocuments,
  listStaffTimeOff,
  revokeStaffDepartment,
  removeStaffProfilePhoto,
  removeStaffDocument,
  reviewStaffDocument,
  reviewStaffTimeOff,
  uploadStaffDocument,
  updateStaffStatus,
} from '../api/staff.api.js';
import type { StaffAccessAttempt, StaffDocument, StaffMember, StaffTimeOff } from '../types/staff.types.js';
import { StaffRegistrationForm, cropStaffPhoto } from './StaffRegistrationForm.js';
import { StaffProfileEditor } from './StaffProfileEditor.js';
import { StaffAvatar } from './StaffAvatar.js';
import { StaffDialog } from './StaffDialog.js';

interface StaffPageProps {
  onNavigate?: (path: string) => void;
}

const WEEKDAYS = [
  ['MON', 'Mon'],
  ['TUE', 'Tue'],
  ['WED', 'Wed'],
  ['THU', 'Thu'],
  ['FRI', 'Fri'],
  ['SAT', 'Sat'],
  ['SUN', 'Sun'],
] as const;

const STAFF_TABS = [
  ['directory', 'Staff Directory'],
  ['assignments', 'Department Assignments'],
  ['roster', 'Shifts & Roster'],
  ['documents', 'Verification & Documents'],
  ['history', 'Access History'],
  ['analytics', 'Staff Analytics'],
] as const;
type StaffTab = (typeof STAFF_TABS)[number][0];

interface StaffConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  onConfirm: (reason?: string) => Promise<void>;
}

function displayStatus(status: string): string {
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function downloadCsv(staff: StaffMember[]): void {
  const columns = [
    'Staff number',
    'First name',
    'Last name',
    'Email',
    'Phone',
    'Job title',
    'Status',
    'Branch',
    'Departments',
    'Roles',
  ];
  const rows = staff.map((member) => [
    member.staffNumber ?? '',
    member.firstName,
    member.lastName,
    member.email,
    member.phone ?? '',
    member.jobTitle ?? '',
    member.status,
    member.branch?.name ?? '',
    member.assignments.map((assignment) => assignment.department.name).join('; '),
    member.assignments.map((assignment) => assignment.role).join('; '),
  ]);
  const csv = [columns, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'revaltrix-staff.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function StaffPage({ onNavigate }: StaffPageProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeTab, setActiveTab] = useState<StaffTab>('directory');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [timeOff, setTimeOff] = useState<StaffTimeOff[]>([]);
  const [rosterView, setRosterView] = useState<'DAY' | 'WEEK' | 'MONTH'>('WEEK');
  const [branchFilter, setBranchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState('');
  const [bulkRole, setBulkRole] = useState('Staff member');
  const [newDocumentType, setNewDocumentType] = useState('OTHER');
  const [timeOffForm, setTimeOffForm] = useState({ startsAt: '', endsAt: '', reason: '' });
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [accessFilter, setAccessFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [showAssignmentFor, setShowAssignmentFor] = useState<string | null>(null);
  const [showShiftFor, setShowShiftFor] = useState<string | null>(null);
  const [assignment, setAssignment] = useState({
    departmentId: '',
    branchId: '',
    role: '',
    accessLevel: 'OPERATE' as 'VIEW' | 'OPERATE' | 'MANAGE' | 'ADMIN',
    isPrimaryDepartment: false,
    canAccessDashboard: false,
    startsAt: '',
    endsAt: '',
  });
  const [shift, setShift] = useState({
    departmentId: '',
    branchId: '',
    shiftName: '',
    startTime: '09:00',
    endTime: '17:00',
    breakStartTime: '',
    breakEndTime: '',
    daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  });
  const [accessHistory, setAccessHistory] = useState<StaffAccessAttempt[] | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<StaffConfirmation | null>(null);
  const [confirmationReason, setConfirmationReason] = useState('');
  const [confirmationSaving, setConfirmationSaving] = useState(false);

  async function loadData(): Promise<void> {
    try {
      setLoading(true);
      setError(null);
      const [staffResult, departmentResult, branchResult] = await Promise.allSettled([
        getStaff(),
        getDepartments(),
        getBranches(),
      ]);
      const failures: string[] = [];
      if (staffResult.status === 'fulfilled') setStaff(staffResult.value);
      else {
        const reason = staffResult.reason;
        const message = reason instanceof Error ? reason.message : 'Unable to load staff.';
        failures.push(/P2022|staff_profiles\.[A-Za-z]+.*does not exist/i.test(message)
          ? 'The staff database migration is not applied. Run `pnpm --filter @revaltrix/database migrate:deploy` from the repository root, then restart the API.'
          : message);
      }
      if (departmentResult.status === 'fulfilled') setDepartments(departmentResult.value);
      else failures.push(departmentResult.reason instanceof Error ? departmentResult.reason.message : 'Unable to load departments.');
      if (branchResult.status === 'fulfilled') setBranches(branchResult.value);
      else failures.push(branchResult.reason instanceof Error ? branchResult.reason.message : 'Unable to load branches.');
      if (failures.length) setError(failures.join(' '));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load staff management data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function clearNotifications(): void {
    setError(null);
    setMessage(null);
  }

  function askForConfirmation(action: StaffConfirmation): void {
    setConfirmationReason('');
    setConfirmation(action);
  }

  async function confirmPendingAction(): Promise<void> {
    if (!confirmation || (confirmation.reasonRequired && !confirmationReason.trim())) return;
    setConfirmationSaving(true);
    try {
      await confirmation.onConfirm(confirmationReason.trim() || undefined);
      setConfirmation(null);
      setConfirmationReason('');
    } finally {
      setConfirmationSaving(false);
    }
  }

  function changeStatus(member: StaffMember): void {
    const nextStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    askForConfirmation({
      title: `${nextStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} staff`,
      message: `${member.firstName} ${member.lastName}${nextStatus === 'SUSPENDED' ? ' will lose department access until reactivated.' : ' will regain their active department access.'}`,
      confirmLabel: nextStatus === 'SUSPENDED' ? 'Suspend staff' : 'Reactivate staff',
      destructive: nextStatus === 'SUSPENDED',
      onConfirm: async () => {
        clearNotifications();
        setActionFor(member.id);
        try {
          await updateStaffStatus(member.id, nextStatus);
          setMessage(`${member.firstName} ${member.lastName} is now ${displayStatus(nextStatus)}.`);
          await loadData();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to update staff status.');
        } finally {
          setActionFor(null);
        }
      },
    });
  }

  function offboardStaff(member: StaffMember): void {
    askForConfirmation({
      title: 'Offboard staff',
      message: `Offboard ${member.firstName} ${member.lastName}? Department access and shifts will be revoked.`,
      confirmLabel: 'Offboard staff',
      destructive: true,
      onConfirm: async () => {
        clearNotifications();
        setActionFor(member.id);
        try {
          await updateStaffStatus(member.id, 'OFFBOARDED');
          setMessage(`${member.firstName} ${member.lastName} was offboarded.`);
          await loadData();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to offboard staff.');
        } finally {
          setActionFor(null);
        }
      },
    });
  }

  async function submitAssignment(
    event: FormEvent<HTMLFormElement>,
    member: StaffMember,
  ): Promise<void> {
    event.preventDefault();
    clearNotifications();
    setSaving(true);
    try {
      await assignStaffDepartment(member.id, {
        ...assignment,
        branchId: assignment.branchId || undefined,
        role: assignment.role.trim(),
        startsAt: assignment.startsAt || undefined,
        endsAt: assignment.endsAt || undefined,
      });
      setShowAssignmentFor(null);
      setAssignment({
        departmentId: '',
        branchId: '',
        role: '',
        accessLevel: 'OPERATE',
        isPrimaryDepartment: false,
        canAccessDashboard: false,
        startsAt: '',
        endsAt: '',
      });
      setMessage(`Department assignment saved for ${member.firstName} ${member.lastName}.`);
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to assign department.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitShift(
    event: FormEvent<HTMLFormElement>,
    member: StaffMember,
  ): Promise<void> {
    event.preventDefault();
    clearNotifications();
    setSaving(true);
    try {
      await createStaffShift(member.id, {
        ...shift,
        branchId: shift.branchId || undefined,
        breakStartTime: shift.breakStartTime || undefined,
        breakEndTime: shift.breakEndTime || undefined,
      });
      setShowShiftFor(null);
      setMessage(`Shift assigned to ${member.firstName} ${member.lastName}.`);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to assign shift.');
    } finally {
      setSaving(false);
    }
  }

  async function showAccessHistory(member: StaffMember): Promise<void> {
    clearNotifications();
    setActionFor(member.id);
    try {
      const entries = await getStaffAccessHistory(member.id);
      setHistoryFor(member.id);
      setAccessHistory(entries);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to load access history.',
      );
    } finally {
      setActionFor(null);
    }
  }

  async function showDocuments(staffProfileId: string): Promise<void> {
    setSelectedProfileId(staffProfileId);
    clearNotifications();
    try {
      const entries = await listStaffDocuments(staffProfileId);
      setDocuments(entries);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load staff documents.');
    }
  }

  function removeSelectedPhoto(): void {
    if (!selectedProfileId || !documents.some((entry) => entry.type === 'PROFILE_PHOTO')) return;
    askForConfirmation({
      title: 'Remove profile photo',
      message: 'The private photo will be deleted from storage.',
      confirmLabel: 'Remove photo',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeStaffProfilePhoto(selectedProfileId);
          setMessage('Profile photo removed from private storage.');
          await showDocuments(selectedProfileId);
          await loadData();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to remove profile photo.');
        }
      },
    });
  }

  async function showTimeOff(staffProfileId: string): Promise<void> {
    setSelectedProfileId(staffProfileId);
    clearNotifications();
    try {
      setTimeOff(await listStaffTimeOff(staffProfileId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load leave records.');
    }
  }

  function removeAssignment(member: StaffMember, assignmentId: string, isPrimary: boolean): void {
    askForConfirmation({
      title: isPrimary ? 'Change primary department' : 'Remove department access',
      message: isPrimary
        ? 'The next active assignment will become primary. Department access will be revoked immediately.'
        : 'Department access will be revoked immediately and the change will be recorded.',
      confirmLabel: isPrimary ? 'Remove and promote next' : 'Remove access',
      destructive: true,
      onConfirm: async () => {
        clearNotifications();
        setActionFor(member.id);
        try {
          await revokeStaffDepartment(member.id, assignmentId);
          setMessage('Department access was revoked and recorded.');
          await loadData();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to remove department access.');
        } finally {
          setActionFor(null);
        }
      },
    });
  }

  async function uploadDocumentForSelected(file?: File): Promise<void> {
    if (!file || !selectedProfileId) return;
    clearNotifications();
    setSaving(true);
    try {
      if (newDocumentType === 'PROFILE_PHOTO' && file.size > 5 * 1024 * 1024) {
        throw new Error('Profile photos must be 5 MB or smaller.');
      }
      const uploadFile = newDocumentType === 'PROFILE_PHOTO' ? await cropStaffPhoto(file) : file;
      await uploadStaffDocument(selectedProfileId, newDocumentType, uploadFile);
      setMessage(`${file.name} uploaded privately and queued for review.`);
      await showDocuments(selectedProfileId);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to upload this document.');
    } finally {
      setSaving(false);
    }
  }

  async function applyDocumentReview(memberId: string, entry: StaffDocument, status: 'VERIFIED' | 'REJECTED', notes?: string): Promise<void> {
    clearNotifications();
    setActionFor(entry.id);
    try {
      await reviewStaffDocument(memberId, entry.id, status, notes);
      setMessage(`${entry.fileName} marked ${displayStatus(status)}.`);
      await showDocuments(memberId);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to review this document.');
    } finally {
      setActionFor(null);
    }
  }

  function reviewDocument(memberId: string, entry: StaffDocument, status: 'VERIFIED' | 'REJECTED'): void {
    if (status === 'VERIFIED') {
      void applyDocumentReview(memberId, entry, status);
      return;
    }
    askForConfirmation({
      title: 'Reject document',
      message: `Add a reason before rejecting ${entry.fileName}.`,
      confirmLabel: 'Reject document',
      destructive: true,
      reasonRequired: true,
      onConfirm: (reason) => applyDocumentReview(memberId, entry, 'REJECTED', reason),
    });
  }

  function deleteDocument(memberId: string, entry: StaffDocument): void {
    askForConfirmation({
      title: 'Delete staff document',
      message: `Delete ${entry.fileName} from private storage? This cannot be undone.`,
      confirmLabel: 'Delete document',
      destructive: true,
      onConfirm: async () => {
        clearNotifications();
        try {
          await removeStaffDocument(memberId, entry.id);
          setMessage(`${entry.fileName} was deleted.`);
          await showDocuments(memberId);
          await loadData();
        } catch (requestError) {
          setError(requestError instanceof Error ? requestError.message : 'Unable to delete this document.');
        }
      },
    });
  }

  async function downloadDocument(memberId: string, entry: StaffDocument): Promise<void> {
    try {
      const blob = await downloadStaffDocument(memberId, entry.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = entry.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to download this document.');
    }
  }

  async function submitTimeOff(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedProfileId) return;
    clearNotifications();
    setSaving(true);
    try {
      const result = await createStaffTimeOff(selectedProfileId, timeOffForm);
      setMessage(result.scheduleConflicts?.length
        ? `Time-off request recorded with shift conflicts: ${result.scheduleConflicts.join(', ')}.`
        : 'Time-off request recorded.');
      setTimeOffForm({ startsAt: '', endsAt: '', reason: '' });
      await showTimeOff(selectedProfileId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to record time off.');
    } finally {
      setSaving(false);
    }
  }

  async function decideTimeOff(entry: StaffTimeOff, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    if (!selectedProfileId) return;
    clearNotifications();
    try {
      await reviewStaffTimeOff(selectedProfileId, entry.id, status);
      setMessage(`Time off ${status.toLowerCase()}.`);
      await showTimeOff(selectedProfileId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to update leave status.');
    }
  }

  async function handleStaffCreated(staffProfileId: string, createdMessage: string): Promise<void> {
    setMessage(createdMessage);
    setAddDialogOpen(false);
    setSelectedProfileId(staffProfileId);
    await loadData();
    setActiveTab('documents');
    await showDocuments(staffProfileId);
  }

  async function runBulkAction(action: 'SUSPEND' | 'REACTIVATE' | 'ASSIGN' | 'REMOVE'): Promise<void> {
    if (!selectedStaffIds.length) return;
    if (action === 'REMOVE') {
      askForConfirmation({
        title: 'Remove department access',
        message: `Remove ${bulkDepartmentId ? departments.find((department) => department.id === bulkDepartmentId)?.name : 'the selected department'} access from ${selectedStaffIds.length} selected staff member(s)?`,
        confirmLabel: 'Remove access',
        destructive: true,
        onConfirm: () => executeBulkAction(action),
      });
      return;
    }
    await executeBulkAction(action);
  }

  async function executeBulkAction(action: 'SUSPEND' | 'REACTIVATE' | 'ASSIGN' | 'REMOVE'): Promise<void> {
    clearNotifications();
    setSaving(true);
    try {
      await Promise.all(selectedStaffIds.map(async (staffId) => {
        const member = staff.find((item) => item.id === staffId);
        if (!member) return;
        if (action === 'SUSPEND') return updateStaffStatus(staffId, 'SUSPENDED');
        if (action === 'REACTIVATE') return updateStaffStatus(staffId, 'ACTIVE');
        if (action === 'ASSIGN' && bulkDepartmentId) {
          return assignStaffDepartment(staffId, {
            departmentId: bulkDepartmentId,
            branchId: undefined,
            role: bulkRole,
            accessLevel: 'VIEW',
            isPrimaryDepartment: false,
          });
        }
        if (action === 'REMOVE' && bulkDepartmentId) {
          const assignment = member.assignments.find((item) => item.department.id === bulkDepartmentId && item.status === 'ACTIVE');
          if (assignment) return revokeStaffDepartment(staffId, assignment.id);
        }
      }));
      setMessage(`Bulk ${action.toLowerCase()} completed for ${selectedStaffIds.length} staff record(s).`);
      setSelectedStaffIds([]);
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'A bulk action could not be completed for every selected staff member.');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  const filteredStaff = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return staff.filter((member) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          member.firstName,
          member.lastName,
          member.email,
          member.staffNumber,
          member.jobTitle,
          member.phone,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      const matchesDepartment =
        !departmentFilter ||
        member.assignments.some((assignment) => assignment.department.id === departmentFilter);
      const matchesStatus = !statusFilter || member.status === statusFilter;
      const matchesBranch = !branchFilter || member.branchId === branchFilter;
      const matchesCategory = !categoryFilter || member.professionalCategory === categoryFilter;
      const matchesVerification = !verificationFilter || member.verificationStatus === verificationFilter;
      const matchesRole = !roleFilter || member.assignments.some((assignment) => assignment.role === roleFilter);
      const matchesAccess = !accessFilter || member.assignments.some((assignment) => assignment.accessLevel === accessFilter);
      return matchesSearch && matchesDepartment && matchesStatus && matchesBranch && matchesCategory && matchesVerification && matchesRole && matchesAccess;
    });
  }, [staff, search, departmentFilter, statusFilter, branchFilter, categoryFilter, verificationFilter, roleFilter, accessFilter]);

  const activeCount = staff.filter((member) => member.status === 'ACTIVE').length;
  const clinicianCount = staff.filter((member) => member.professionalCategory && !['ADMIN', 'RECEPTIONIST', 'OTHER'].includes(member.professionalCategory)).length;
  const verifiedClinicianCount = staff.filter((member) => member.verificationStatus === 'VERIFIED' && member.professionalCategory && !['ADMIN', 'RECEPTIONIST', 'OTHER'].includes(member.professionalCategory)).length;
  const bookingClinicianCount = staff.filter((member) => member.status === 'ACTIVE' && member.acceptsOnlineBookings).length;
  const suspendedCount = staff.filter((member) => ['SUSPENDED', 'OFFBOARDED'].includes(member.status)).length;
  const todayCode = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];
  const onDutyCount = staff.filter((member) => member.status === 'ACTIVE' && member.shifts.some((item) => item.status === 'ACTIVE' && item.daysOfWeek?.includes(todayCode))).length;
  const protectedDepartmentCount = departments.filter(
    (department) => department.requiresDepartmentPassword,
  ).length;

  if (loading) {
    return (
      <main className="registration-loading">
        <p>Loading staff and departments...</p>
      </main>
    );
  }

  return (
    <main className="branches-layout">
      <section className="dashboard-page-header staff-management-header">
        <div>
          <p className="dashboard-eyebrow">PEOPLE</p>
          <h1>Staff Management</h1>
          <p>
            Manage verified staff accounts, department and branch assignments, shift schedules, and
            department access history.
          </p>
        </div>
        <div className="branches-form-actions">
          <button type="button" className="dashboard-primary-button" onClick={() => setAddDialogOpen(true)}>Add staff</button>
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={() => downloadCsv(filteredStaff)}
            disabled={!filteredStaff.length}
          >
            Export filtered staff
          </button>
          <button
            type="button"
            className="dashboard-secondary-button"
            onClick={() => onNavigate?.('/tenant/departments')}
          >
            Manage departments
          </button>
        </div>
      </section>

      {error && (
        <div className="registration-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="form-success" role="status">
          {message}
        </div>
      )}

      <section className="staff-stat-grid" aria-label="Staff summary">
        {[
          ['Total staff', staff.length],
          ['Active staff', activeCount],
          ['Protected departments', protectedDepartmentCount],
          ['Doctors / clinicians', clinicianCount],
          ['Verified clinicians', verifiedClinicianCount],
          ['On duty today', onDutyCount],
          ['Accept online bookings', bookingClinicianCount],
          ['Suspended / offboarded', suspendedCount],
        ].map(([label, value]) => (
          <div key={label} className="staff-stat">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <nav className="staff-tabs" aria-label="Staff management views" role="tablist">
        {STAFF_TABS.map(([id, label]) => (
          <button
            key={id}
            id={`staff-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`staff-panel-${id}`}
            className={activeTab === id ? 'is-active' : ''}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {addDialogOpen && (departments.length ? (
        <StaffDialog title="Add staff" size="wide" onClose={() => setAddDialogOpen(false)}>
          <StaffRegistrationForm departments={departments} branches={branches} onCreated={(id, note) => void handleStaffCreated(id, note)} />
        </StaffDialog>
      ) : (
        <StaffDialog title="Add staff" onClose={() => setAddDialogOpen(false)}>
          <div className="branches-empty-state"><h3>Create a department first</h3><p>Staff profiles need a department assignment.</p><button type="button" className="dashboard-primary-button" onClick={() => { setAddDialogOpen(false); onNavigate?.('/tenant/departments'); }}>Open departments</button></div>
        </StaffDialog>
      ))}

      {activeTab === 'assignments' && (
        <section id="staff-panel-assignments" role="tabpanel" aria-labelledby="staff-tab-assignments" className="dashboard-card">
          <header className="dashboard-card-header"><div><h2>Department assignments</h2><p>Access is explicit per department and revocation takes effect immediately.</p></div></header>
          {staff.some((member) => member.assignments.length) ? (
            <div className="staff-record-list">
              {staff.flatMap((member) => member.assignments.map((assignment) => ({ member, assignment }))).map(({ member, assignment }) => (
                <article className="staff-record" key={assignment.id}>
                  <div><strong>{member.firstName} {member.lastName}</strong><span>{member.staffNumber} · {assignment.role}</span></div>
                  <div><strong>{assignment.department.name}{assignment.isPrimaryDepartment ? ' · Primary' : ''}</strong><span>{assignment.branch?.name ?? member.branch?.name ?? 'No branch'}</span></div>
                  <div><span>Access: {assignment.accessLevel}</span><span>Dashboard: {assignment.canAccessDashboard ? 'Enabled' : 'Disabled'}</span></div>
                  <div><span>{displayStatus(assignment.status ?? 'ACTIVE')}</span><span>{assignment.startsAt ? new Date(assignment.startsAt).toLocaleDateString() : 'No start date'}{assignment.endsAt ? ` – ${new Date(assignment.endsAt).toLocaleDateString()}` : ''}</span></div>
                  {(assignment.status ?? 'ACTIVE') === 'ACTIVE' && <button type="button" className="dashboard-secondary-button" disabled={actionFor === member.id} onClick={() => void removeAssignment(member, assignment.id, Boolean(assignment.isPrimaryDepartment))}>Remove access</button>}
                </article>
              ))}
            </div>
          ) : <div className="branches-empty-state"><h3>No department assignments.</h3></div>}
        </section>
      )}

      {activeTab === 'roster' && (
        <section id="staff-panel-roster" role="tabpanel" aria-labelledby="staff-tab-roster" className="dashboard-card">
          <header className="dashboard-card-header"><div><h2>Shifts & roster</h2><p>Recurring assignments show schedule overlap; leave entries are stored and reviewed here.</p></div>
            <div className="staff-segmented" role="group" aria-label="Roster view">{(['DAY', 'WEEK', 'MONTH'] as const).map((view) => <button type="button" key={view} className={rosterView === view ? 'is-active' : ''} aria-pressed={rosterView === view} onClick={() => setRosterView(view)}>{displayStatus(view)}</button>)}</div>
          </header>
          <div className="tenant-form-grid"><label>Staff member<select value={selectedProfileId} onChange={(event) => void showTimeOff(event.target.value)}><option value="">Select staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}</select></label></div>
          <h3>{displayStatus(rosterView)} shifts</h3>
          {staff.flatMap((member) => member.shifts.filter((item) => item.status === 'ACTIVE' && (rosterView !== 'DAY' || item.daysOfWeek?.includes(todayCode))).map((item) => ({ member, item }))).length ? (
            <div className="staff-record-list">{staff.flatMap((member) => member.shifts.filter((item) => item.status === 'ACTIVE' && (rosterView !== 'DAY' || item.daysOfWeek?.includes(todayCode))).map((item) => ({ member, item }))).map(({ member, item }) => <article className="staff-record" key={item.id}><div><strong>{member.firstName} {member.lastName}</strong><span>{member.staffNumber}</span></div><div><strong>{item.shiftName} · {item.department.name}</strong><span>{item.branch?.name ?? 'No branch'}</span></div><div><span>{item.startTime}–{item.endTime}</span><span>{item.breakStartTime && item.breakEndTime ? `Break ${item.breakStartTime}–${item.breakEndTime}` : 'No break recorded'}</span></div><div><span>{(item.daysOfWeek ?? []).join(', ')}</span></div></article>)}</div>
          ) : <div className="branches-empty-state"><h3>No shifts scheduled.</h3></div>}
          {selectedProfileId && <>
            <h3>Time off</h3>
            <form className="tenant-form" onSubmit={(event) => void submitTimeOff(event)}><div className="tenant-form-grid"><label>Starts<input required type="datetime-local" value={timeOffForm.startsAt} onChange={(event) => setTimeOffForm({ ...timeOffForm, startsAt: event.target.value })} /></label><label>Ends<input required type="datetime-local" value={timeOffForm.endsAt} onChange={(event) => setTimeOffForm({ ...timeOffForm, endsAt: event.target.value })} /></label><label>Reason<input maxLength={1000} value={timeOffForm.reason} onChange={(event) => setTimeOffForm({ ...timeOffForm, reason: event.target.value })} /></label></div><button type="submit" className="dashboard-primary-button" disabled={saving}>Record time off</button></form>
            {timeOff.length ? <div className="staff-record-list">{timeOff.map((entry) => <article className="staff-record" key={entry.id}><div><strong>{new Date(entry.startsAt).toLocaleString()} – {new Date(entry.endsAt).toLocaleString()}</strong><span>{entry.reason || 'No reason provided'}</span></div><span className="staff-status-badge">{displayStatus(entry.status)}</span>{entry.status === 'REQUESTED' && <div className="branch-list-actions"><button type="button" className="dashboard-primary-button" onClick={() => void decideTimeOff(entry, 'APPROVED')}>Approve</button><button type="button" className="dashboard-secondary-button" onClick={() => void decideTimeOff(entry, 'REJECTED')}>Reject</button></div>}</article>)}</div> : <p>No leave days or time-off requests.</p>}
          </>}
        </section>
      )}

      {activeTab === 'documents' && (
        <section id="staff-panel-documents" role="tabpanel" aria-labelledby="staff-tab-documents" className="dashboard-card">
          <header className="dashboard-card-header"><div><h2>Verification & documents</h2><p>Files are private; downloads are authenticated and audited.</p></div></header>
          <div className="tenant-form-grid"><label>Staff member<select value={selectedProfileId} onChange={(event) => void showDocuments(event.target.value)}><option value="">Select staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.staffNumber}</option>)}</select></label></div>
          {selectedProfileId && <>
            <div className="staff-upload-row"><label>Document type<select value={newDocumentType} onChange={(event) => setNewDocumentType(event.target.value)}>{[['PROFILE_PHOTO', 'Profile photo'], ['NATIONAL_ID', 'National ID'], ['PASSPORT', 'Passport'], ['CV', 'CV'], ['PROFESSIONAL_LICENSE', 'Professional license'], ['DEGREE_CERTIFICATE', 'Degree certificate'], ['GOOD_STANDING_CERTIFICATE', 'Good standing'], ['INSURANCE_INDEMNITY', 'Insurance / indemnity'], ['OTHER', 'Other']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Upload private file<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => void uploadDocumentForSelected(event.target.files?.[0])} /></label>{documents.some((entry) => entry.type === 'PROFILE_PHOTO') && <button type="button" className="dashboard-secondary-button" onClick={() => void removeSelectedPhoto()}>Remove profile photo</button>}</div>
            {documents.length ? <div className="staff-record-list">{documents.map((entry) => <article className="staff-record" key={entry.id}><div><strong>{entry.fileName}</strong><span>{displayStatus(entry.type)} · {(entry.sizeBytes / (1024 * 1024)).toFixed(2)} MB · {new Date(entry.createdAt).toLocaleDateString()}</span></div><div><span className="staff-status-badge">{displayStatus(entry.status)}</span><span>Uploaded by {entry.uploadedBy?.displayName ?? entry.uploadedById}</span></div><div><span>{entry.reviewedBy ? `Reviewed by ${entry.reviewedBy.displayName}` : 'Awaiting review'}</span><span>{entry.reviewNotes ?? ''}</span></div><div className="branch-list-actions"><button type="button" className="dashboard-secondary-button" onClick={() => void downloadDocument(selectedProfileId, entry)}>Download</button>{['UPLOADED', 'UNDER_REVIEW'].includes(entry.status) && <><button type="button" className="dashboard-primary-button" disabled={actionFor === entry.id} onClick={() => void reviewDocument(selectedProfileId, entry, 'VERIFIED')}>Verify</button><button type="button" className="dashboard-secondary-button" disabled={actionFor === entry.id} onClick={() => void reviewDocument(selectedProfileId, entry, 'REJECTED')}>Reject</button></>}<button type="button" className="dashboard-secondary-button" onClick={() => void deleteDocument(selectedProfileId, entry)}>Delete</button></div></article>)}</div> : <div className="branches-empty-state"><h3>No documents uploaded.</h3></div>}
          </>}
        </section>
      )}

      {activeTab === 'history' && (
        <section id="staff-panel-history" role="tabpanel" aria-labelledby="staff-tab-history" className="dashboard-card">
          <header className="dashboard-card-header"><div><h2>Access history</h2><p>Department access attempts are shown with time, branch context, IP, and device metadata.</p></div></header>
          <div className="tenant-form-grid"><label>Staff member<select value={selectedProfileId} onChange={(event) => { const id = event.target.value; setSelectedProfileId(id); const member = staff.find((item) => item.id === id); if (member) void showAccessHistory(member); }}><option value="">Select staff</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.staffNumber}</option>)}</select></label></div>
          {historyFor && accessHistory?.length ? <div className="staff-record-list">{accessHistory.map((entry) => <article className="staff-record" key={entry.id}><div><strong>{displayStatus(entry.action ?? entry.status)}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span></div><div><span>{entry.department?.name ?? entry.resource ?? 'Department unavailable'}</span><span>User {entry.userId}</span></div><div><span>{displayStatus(entry.status)} · {entry.ipAddress ?? 'IP unavailable'}</span><span>{entry.userAgent ?? 'Device unavailable'}</span></div></article>)}</div> : historyFor ? <div className="branches-empty-state"><h3>No access history available.</h3></div> : null}
        </section>
      )}

      {activeTab === 'analytics' && (
        <section id="staff-panel-analytics" role="tabpanel" aria-labelledby="staff-tab-analytics" className="dashboard-card">
          <header className="dashboard-card-header"><div><h2>Staff analytics</h2><p>Current workforce status and professional mix.</p></div></header>
          <div className="staff-analytics-grid">{[
            ['Active', activeCount], ['Clinicians', clinicianCount], ['Verified clinicians', verifiedClinicianCount], ['Accept online bookings', bookingClinicianCount], ['On duty today', onDutyCount], ['Protected departments', protectedDepartmentCount], ['Suspended / offboarded', suspendedCount],
          ].map(([label, value]) => <div className="staff-analytics-row" key={label}><span>{label}</span><strong>{value}</strong><meter min="0" max={Math.max(staff.length, 1)} value={Number(value)} /></div>)}</div>
          <h3>Professional category</h3><div className="staff-category-grid">{Array.from(new Set(staff.map((member) => member.professionalCategory).filter(Boolean))).map((category) => <div key={category}><span>{displayStatus(category!)}</span><strong>{staff.filter((member) => member.professionalCategory === category).length}</strong></div>)}</div>
        </section>
      )}

      {activeTab === 'directory' && (
      <section id="staff-panel-directory" role="tabpanel" aria-labelledby="staff-tab-directory" className="dashboard-card">
        <div className="dashboard-card-header">
          <div>
            <h2>Staff directory</h2>
            <p>
              Showing {filteredStaff.length} of {staff.length} staff members
            </p>
          </div>
        </div>
        <div className="tenant-form-grid">
          <label>
            Search staff
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, staff number, job title or phone"
            />
          </label>
          <label>
            Department
            <select
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Staff status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="OFFBOARDED">Offboarded</option>
            </select>
          </label>
          <label>Branch<select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label>Professional category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{Array.from(new Set(staff.map((member) => member.professionalCategory).filter(Boolean))).map((category) => <option key={category} value={category!}>{displayStatus(category!)}</option>)}</select></label>
          <label>Document verification<select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)}><option value="">All documents</option>{['PROFILE_INCOMPLETE', 'DOCUMENTS_PENDING', 'DOCUMENTS_UNDER_REVIEW', 'VERIFIED', 'REJECTED'].map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}</select></label>
          <label>Department role<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="">All roles</option>{Array.from(new Set(staff.flatMap((member) => member.assignments.map((item) => item.role)))).map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          <label>Department access<select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}><option value="">All access levels</option>{['VIEW', 'OPERATE', 'MANAGE', 'ADMIN'].map((level) => <option key={level} value={level}>{displayStatus(level)}</option>)}</select></label>
        </div>
        <div className="staff-bulk-actions">
          <label className="staff-toggle"><input type="checkbox" checked={filteredStaff.length > 0 && filteredStaff.every((member) => selectedStaffIds.includes(member.id))} onChange={(event) => setSelectedStaffIds(event.target.checked ? filteredStaff.map((member) => member.id) : [])} />Select filtered ({selectedStaffIds.length})</label>
          <button type="button" className="dashboard-secondary-button" disabled={!selectedStaffIds.length || saving} onClick={() => void runBulkAction('SUSPEND')}>Suspend selected</button>
          <button type="button" className="dashboard-secondary-button" disabled={!selectedStaffIds.length || saving} onClick={() => void runBulkAction('REACTIVATE')}>Reactivate selected</button>
          <select aria-label="Bulk department" value={bulkDepartmentId} onChange={(event) => setBulkDepartmentId(event.target.value)}><option value="">Department for bulk access</option>{departments.filter((department) => department.status === 'ACTIVE').map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <input aria-label="Department role for bulk access" value={bulkRole} onChange={(event) => setBulkRole(event.target.value)} maxLength={100} />
          <button type="button" className="dashboard-secondary-button" disabled={!selectedStaffIds.length || !bulkDepartmentId || saving} onClick={() => void runBulkAction('ASSIGN')}>Assign department</button>
          <button type="button" className="dashboard-secondary-button" disabled={!selectedStaffIds.length || !bulkDepartmentId || saving} onClick={() => void runBulkAction('REMOVE')}>Remove department</button>
        </div>
        {filteredStaff.length === 0 ? (
          <div className="branches-empty-state">
            <h3>{staff.length ? 'No staff match these filters' : 'No staff yet'}</h3>
            <p>Adjust your search or filters, or add a team member.</p>
          </div>
        ) : (
          <div className="branches-list">
            {filteredStaff.map((member) => {
              const expanded = expandedId === member.id;
              const assignments = member.assignments;
              return (
                <article key={member.id} className="branch-list-item">
                  <div className="branch-list-main">
                    <label className="staff-row-select" aria-label={`Select ${member.firstName} ${member.lastName}`}><input type="checkbox" checked={selectedStaffIds.includes(member.id)} onChange={(event) => setSelectedStaffIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /></label>
                    <StaffAvatar member={member} />
                    <div>
                      <h3>
                        {member.firstName} {member.lastName}
                      </h3>
                      <span className="branch-status">
                        {member.staffNumber ?? 'Staff ID pending'} · {member.status === 'INVITED' ? 'Pending activation' : displayStatus(member.status)}
                      </span>
                    </div>
                    <div className="branch-list-meta">
                      <span>{member.email}</span>
                      <span>
                        {member.jobTitle ?? 'No professional title'}
                      </span>
                      <span>{member.professionalCategory ? displayStatus(member.professionalCategory) : 'Category not set'} · {member.specialty ?? 'No specialty'}</span>
                      <span>
                        {member.branch ? `Branch: ${member.branch.name}` : 'No primary branch'}
                      </span>
                      <span>Documents: {displayStatus(member.verificationStatus)}</span>
                      <span>
                        {assignments
                          .map((item) => `${item.department.name} — ${item.role}`)
                          .join(', ') || 'No department assignment'}
                      </span>
                    </div>
                  </div>
                  <div className="branch-list-actions">
                    <button
                      type="button"
                      className="dashboard-secondary-button"
                      onClick={() => {
                        setExpandedId(expanded ? null : member.id);
                        setShowAssignmentFor(null);
                        setShowShiftFor(null);
                        setHistoryFor(null);
                        setAccessHistory(null);
                      }}
                    >
                      {expanded ? 'Hide profile' : 'View profile'}
                    </button>
                    <button type="button" className="dashboard-secondary-button" onClick={() => setEditingStaffId(member.id)}>Edit profile</button>
                    {member.status === 'ACTIVE' && <button type="button" className="dashboard-secondary-button" onClick={() => { setExpandedId(member.id); setShowShiftFor(member.id); setShift((current) => ({ ...current, departmentId: assignments.find((item) => item.status === 'ACTIVE')?.department.id ?? '' })); }}>Manage shifts</button>}
                    {member.status !== 'OFFBOARDED' && member.status !== 'INVITED' && (
                      <button
                        type="button"
                        className="dashboard-secondary-button"
                        disabled={actionFor === member.id}
                        onClick={() => void changeStatus(member)}
                      >
                        {member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                      </button>
                    )}
                    {member.status !== 'OFFBOARDED' && member.status !== 'INVITED' && <button type="button" className="dashboard-secondary-button" disabled={actionFor === member.id} onClick={() => void offboardStaff(member)}>Offboard</button>}
                    <button type="button" className="dashboard-secondary-button" onClick={() => { setActiveTab('documents'); void showDocuments(member.id); }}>Documents</button>
                  </div>
                  {expanded && (
                    <div style={{ flexBasis: '100%', width: '100%' }}>
                      <div className="staff-profile-heading"><StaffAvatar member={member} size="large" /><div><strong>{member.firstName} {member.middleName} {member.lastName}</strong><span>{member.professionalCategory ? displayStatus(member.professionalCategory) : member.jobTitle}</span></div></div>
                      <div className="detail-grid">
                        <div>
                          <span>Phone</span>
                          <strong>{member.phone ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>License</span>
                          <strong>{member.licenseNumber ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Specialty</span>
                          <strong>{member.specialty ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Qualifications</span>
                          <strong>{member.qualifications ?? 'Not provided'}</strong>
                        </div>
                        <div>
                          <span>Reports to</span>
                          <strong>
                            {member.reportsTo
                              ? `${member.reportsTo.firstName} ${member.reportsTo.lastName}`
                              : 'Not assigned'}
                          </strong>
                        </div>
                        <div>
                          <span>Joined</span>
                          <strong>
                            {member.joinedAt
                              ? new Date(member.joinedAt).toLocaleDateString()
                              : 'Not recorded'}
                          </strong>
                        </div>
                      </div>
                      <h4>Department assignments</h4>
                      {assignments.length ? (
                        <div className="branches-list">
                          {assignments.map((item) => (
                            <div key={item.id} className="branch-list-item">
                              <div className="branch-list-meta">
                                <strong>
                                  {item.department.name}
                                  {item.isPrimaryDepartment ? ' · Primary' : ''}
                                </strong>
                                <span>
                                  Role: {item.role} · Access: {item.accessLevel}
                                </span>
                                <span>Dashboard: {item.canAccessDashboard ? 'Enabled' : 'Disabled'} · {item.department.requiresDepartmentPassword ? 'Protected department' : 'Standard department'}</span>
                                <span>
                                  Branch: {item.branch?.name ?? 'Not assigned'} ·{' '}
                                  {displayStatus(item.status ?? 'ACTIVE')}
                                </span>
                              </div>
                              {(item.status ?? 'ACTIVE') === 'ACTIVE' && <button type="button" className="dashboard-secondary-button" disabled={actionFor === member.id} onClick={() => void removeAssignment(member, item.id, Boolean(item.isPrimaryDepartment))}>Remove access</button>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No department assignments.</p>
                      )}
                      <h4>Active shifts</h4>
                      {member.shifts.length ? (
                        <div className="branches-list">
                          {member.shifts.map((item) => (
                            <div key={item.id} className="branch-list-item">
                              <div className="branch-list-meta">
                                <strong>
                                  {item.shiftName} · {item.department.name}
                                </strong>
                                <span>
                                  {item.startTime}–{item.endTime} ·{' '}
                                  {(item.daysOfWeek ?? []).join(', ')}
                                </span>
                                <span>Branch: {item.branch?.name ?? 'Not assigned'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>No active shifts assigned.</p>
                      )}
                      <div className="branches-form-actions">
                        {member.status === 'ACTIVE' && (
                          <>
                            <button
                              type="button"
                              className="dashboard-secondary-button"
                              onClick={() => {
                                setShowAssignmentFor(
                                  showAssignmentFor === member.id ? null : member.id,
                                );
                                setAssignment((current) => ({
                                  ...current,
                                  departmentId:
                                    departments.find(
                                      (d) => !assignments.some((a) => a.department.id === d.id),
                                    )?.id ?? '',
                                }));
                              }}
                            >
                              Assign department and branch
                            </button>
                            <button
                              type="button"
                              className="dashboard-secondary-button"
                              onClick={() => {
                                setShowShiftFor(showShiftFor === member.id ? null : member.id);
                                setShift((current) => ({
                                  ...current,
                                  departmentId:
                                    assignments.find((a) => a.status === 'ACTIVE')?.department.id ??
                                    '',
                                }));
                              }}
                            >
                              Assign shift
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="dashboard-secondary-button"
                          disabled={actionFor === member.id}
                          onClick={() => void showAccessHistory(member)}
                        >
                          {actionFor === member.id ? 'Loading...' : 'View access history'}
                        </button>
                      </div>
                      {showAssignmentFor === member.id && (
                        <form
                          className="tenant-form"
                          onSubmit={(event) => void submitAssignment(event, member)}
                        >
                          <h4>Assign department</h4>
                          <div className="tenant-form-grid">
                            <label>
                              Department
                              <select
                                required
                                value={assignment.departmentId}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, departmentId: event.target.value })
                                }
                              >
                                <option value="">Select department</option>
                                {departments
                                  .filter((d) => d.status === 'ACTIVE')
                                  .map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              Branch
                              <select
                                value={assignment.branchId}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, branchId: event.target.value })
                                }
                              >
                                <option value="">Use department / staff branch</option>
                                {branches.map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Role
                              <input
                                required
                                minLength={2}
                                maxLength={100}
                                value={assignment.role}
                                onChange={(event) =>
                                  setAssignment({ ...assignment, role: event.target.value })
                                }
                              />
                            </label>
                            <label>
                              Access level
                              <select
                                value={assignment.accessLevel}
                                onChange={(event) =>
                                  setAssignment({
                                    ...assignment,
                                    accessLevel: event.target
                                      .value as typeof assignment.accessLevel,
                                  })
                                }
                              >
                                <option value="VIEW">View</option>
                                <option value="OPERATE">Operate</option>
                                <option value="MANAGE">Manage</option>
                                <option value="ADMIN">Administrator</option>
                              </select>
                            </label>
                            <label>Assignment starts<input type="date" value={assignment.startsAt} onChange={(event) => setAssignment({ ...assignment, startsAt: event.target.value })} /></label>
                            <label>Assignment ends<input type="date" value={assignment.endsAt} onChange={(event) => setAssignment({ ...assignment, endsAt: event.target.value })} /></label>
                            <label className="staff-toggle"><input type="checkbox" checked={assignment.canAccessDashboard} onChange={(event) => setAssignment({ ...assignment, canAccessDashboard: event.target.checked })} />Department dashboard access</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                              <input
                                type="checkbox"
                                checked={assignment.isPrimaryDepartment}
                                onChange={(event) =>
                                  setAssignment({
                                    ...assignment,
                                    isPrimaryDepartment: event.target.checked,
                                  })
                                }
                              />
                              Make primary department
                            </label>
                          </div>
                          <button
                            type="submit"
                            className="dashboard-primary-button"
                            disabled={saving || !assignment.departmentId}
                          >
                            {saving ? 'Saving...' : 'Save assignment'}
                          </button>
                        </form>
                      )}
                      {showShiftFor === member.id && (
                        <form
                          className="tenant-form"
                          onSubmit={(event) => void submitShift(event, member)}
                        >
                          <h4>Assign shift</h4>
                          {assignments.filter((item) => item.status === 'ACTIVE').length === 0 ? (
                            <p>Assign the staff member to a department before creating a shift.</p>
                          ) : (
                            <>
                              <div className="tenant-form-grid">
                                <label>
                                  Department
                                  <select
                                    required
                                    value={shift.departmentId}
                                    onChange={(event) =>
                                      setShift({ ...shift, departmentId: event.target.value })
                                    }
                                  >
                                    {assignments
                                      .filter((item) => item.status === 'ACTIVE')
                                      .map((item) => (
                                        <option key={item.id} value={item.department.id}>
                                          {item.department.name}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label>
                                  Shift name
                                  <input
                                    required
                                    maxLength={100}
                                    value={shift.shiftName}
                                    onChange={(event) =>
                                      setShift({ ...shift, shiftName: event.target.value })
                                    }
                                    placeholder="Day shift"
                                  />
                                </label>
                                <label>
                                  Branch
                                  <select
                                    value={shift.branchId}
                                    onChange={(event) =>
                                      setShift({ ...shift, branchId: event.target.value })
                                    }
                                  >
                                    <option value="">Use department / staff branch</option>
                                    {branches.map((branch) => (
                                      <option key={branch.id} value={branch.id}>
                                        {branch.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Starts
                                  <input
                                    type="time"
                                    required
                                    value={shift.startTime}
                                    onChange={(event) =>
                                      setShift({ ...shift, startTime: event.target.value })
                                    }
                                  />
                                </label>
                                <label>
                                  Ends
                                  <input
                                    type="time"
                                    required
                                    value={shift.endTime}
                                    onChange={(event) =>
                                      setShift({ ...shift, endTime: event.target.value })
                                    }
                                  />
                                </label>
                                <label>Break starts<input type="time" value={shift.breakStartTime} onChange={(event) => setShift({ ...shift, breakStartTime: event.target.value })} /></label>
                                <label>Break ends<input type="time" value={shift.breakEndTime} onChange={(event) => setShift({ ...shift, breakEndTime: event.target.value })} /></label>
                              </div>
                              <fieldset>
                                <legend>Days of week</legend>
                                <div className="branches-form-actions">
                                  {WEEKDAYS.map(([day, label]) => (
                                    <label
                                      key={day}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '.35rem',
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={shift.daysOfWeek.includes(day)}
                                        onChange={(event) =>
                                          setShift({
                                            ...shift,
                                            daysOfWeek: event.target.checked
                                              ? [...shift.daysOfWeek, day]
                                              : shift.daysOfWeek.filter(
                                                  (selected) => selected !== day,
                                                ),
                                          })
                                        }
                                      />
                                      {label}
                                    </label>
                                  ))}
                                </div>
                              </fieldset>
                              <button
                                type="submit"
                                className="dashboard-primary-button"
                                disabled={saving || !shift.daysOfWeek.length}
                              >
                                {saving ? 'Saving...' : 'Save shift'}
                              </button>
                            </>
                          )}
                        </form>
                      )}
                      {historyFor === member.id && accessHistory && (
                        <section>
                          <h4>Department access history (latest 100)</h4>
                          {accessHistory.length ? (
                            <div className="branches-list">
                              {accessHistory.map((attempt) => (
                                <div key={attempt.id} className="branch-list-item">
                                  <div className="branch-list-meta">
                                    <strong>
                                      {displayStatus(attempt.status)} ·{' '}
                                      {attempt.department?.name ?? 'Department unavailable'}
                                    </strong>
                                    <span>{new Date(attempt.createdAt).toLocaleString()}</span>
                                    <span>
                                      {attempt.ipAddress ?? 'IP unavailable'} ·{' '}
                                      {attempt.userAgent ?? 'Device unavailable'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p>No department access attempts have been recorded.</p>
                          )}
                        </section>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}
      {editingStaffId && staff.find((member) => member.id === editingStaffId) && (
        <StaffDialog
          title={`Edit ${staff.find((member) => member.id === editingStaffId)?.firstName ?? 'staff'} profile`}
          size="wide"
          onClose={() => setEditingStaffId(null)}
        >
          <StaffProfileEditor
            member={staff.find((member) => member.id === editingStaffId)!}
            onCancel={() => setEditingStaffId(null)}
            onSaved={() => {
              setEditingStaffId(null);
              setMessage('Staff profile updated.');
              void loadData();
            }}
          />
        </StaffDialog>
      )}
      {confirmation && (
        <StaffDialog
          title={confirmation.title}
          onClose={() => { if (!confirmationSaving) setConfirmation(null); }}
        >
          <p className="staff-confirmation-message">{confirmation.message}</p>
          {confirmation.reasonRequired && (
            <label className="staff-confirmation-reason">
              Reason
              <textarea
                autoFocus
                required
                rows={3}
                maxLength={2000}
                value={confirmationReason}
                onChange={(event) => setConfirmationReason(event.target.value)}
              />
            </label>
          )}
          <div className="staff-dialog-actions">
            <button type="button" className="dashboard-secondary-button" disabled={confirmationSaving} onClick={() => setConfirmation(null)}>Cancel</button>
            <button
              type="button"
              className={`dashboard-primary-button staff-dialog-confirm${confirmation.destructive ? ' is-destructive' : ''}`}
              disabled={confirmationSaving || (confirmation.reasonRequired && !confirmationReason.trim())}
              onClick={() => void confirmPendingAction()}
            >
              {confirmationSaving ? 'Processing…' : confirmation.confirmLabel}
            </button>
          </div>
        </StaffDialog>
      )}
    </main>
  );
}
