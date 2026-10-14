import {
  FormEvent,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createFamilyAccessGrant,
  registerDependent,
  cancelFamilyRequest,
  createFamilyRequest,
  getDependentVerificationStatus,
  getFamilyAccessActivity,
  getFamilyAccessGrants,
  reviewFamilyAccessGrant,
  getFamilyRequests,
  getFamilyRelationships,
  respondToFamilyRequest,
  revokeFamilyAccessGrant,
  revokeFamilyRelationship,
  updateFamilyAccessGrant,
  uploadDependentVerificationDocument,
} from '../api/patient-family.api.js';
import {
  FAMILY_ACCESS_PERMISSIONS,
  FAMILY_RELATIONSHIP_TYPES,
  type DependentVerificationStatus,
  type FamilyAccessGrant,
  type FamilyAccessPermission,
  type FamilyRelationship,
  type FamilyRelationshipRequest,
  type FamilyRelationshipType,
  type CreateDependentRegistrationRequest,
} from '../types/patient-family.types.js';
import { requestStepUpChallengeId } from '../../../lib/step-up.js';

const relationshipLabels: Record<FamilyRelationshipType, string> = {
  SPOUSE: 'Spouse',
  PARENT: 'Parent',
  CHILD: 'Child',
  SIBLING: 'Sibling',
  GRANDPARENT: 'Grandparent',
  GRANDCHILD: 'Grandchild',
  GUARDIAN: 'Guardian',
  DEPENDENT: 'Dependent',
  OTHER: 'Other',
};

function patientName(patient: { firstName: string; secondName: string | null }) {
  return [patient.firstName, patient.secondName].filter(Boolean).join(' ');
}

function formatDate(value: string | null) {
  if (!value) return '—';

  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getRelatedPatient(relationship: FamilyRelationship) {
  return relationship.direction === 'OUTGOING' ? relationship.relatedPatient : relationship.patient;
}

function getSelfPatient(relationship: FamilyRelationship) {
  return relationship.direction === 'OUTGOING' ? relationship.patient : relationship.relatedPatient;
}

function getAccessTarget(relationship: FamilyRelationship) {
  const self = getSelfPatient(relationship);
  const member = getRelatedPatient(relationship);
  return relationship.dependentRegistration
    ? { patientId: member.id, delegateId: self.id }
    : { patientId: self.id, delegateId: member.id };
}

function getAgeFromDateOfBirth(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  if (
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())
  ) {
    age -= 1;
  }
  return age;
}

function isChildRelationship(type: FamilyRelationshipType) {
  return type === 'CHILD' || type === 'DEPENDENT';
}

function handleVerificationFileChange(
  event: ChangeEvent<HTMLInputElement>,
  setFile: Dispatch<SetStateAction<File | null>>,
  label: string,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const file = event.target.files?.[0] ?? null;
  if (!file) {
    setFile(null);
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    event.target.value = '';
    setFile(null);
    setError(`${label} must be 10 MB or smaller.`);
    return;
  }
  setError(null);
  setFile(file);
}

const accessPermissionLabels: Record<FamilyAccessPermission, string> = {
  'profile.read': 'Read profile',
  'appointments.read': 'View appointments',
  'appointments.manage': 'Manage appointments',
  'reminders.read': 'View reminders',
  'documents.read': 'Read documents',
  'lab-results.read': 'Read lab results',
  'prescriptions.read': 'Read prescriptions',
  'billing.read': 'View billing',
  'billing.manage': 'Manage billing',
  'messages.send': 'Send messages',
};

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const familyNavigationItems = [
  { label: 'Overview', path: '/patient/dashboard', icon: 'OV' },
  { label: 'Care journey', path: '/patient/journey', icon: 'CJ' },
  { label: 'My profile', path: '/patient/profile', icon: 'PR' },
  { label: 'Family', path: '/patient/family', icon: 'FM' },
  { label: 'Facilities', path: '/patient/facilities', icon: 'FC' },
  { label: 'Requests', path: '/patient/requests', icon: 'RQ' },
  { label: 'Appointments', path: '/patient/appointments', icon: 'AP' },
  { label: 'Care history', path: '/patient/encounters', icon: 'CH' },
  { label: 'Laboratory', path: '/patient/laboratory', icon: 'LB' },
  { label: 'Prescriptions', path: '/patient/prescriptions', icon: 'RX' },
  { label: 'Documents', path: '/patient/documents', icon: 'DC' },
  { label: 'Data access', path: '/patient/access', icon: 'DA' },
] as const;

export function PatientFamilyPage({
  onNavigate,
  onLogout,
}: {
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [requests, setRequests] = useState<FamilyRelationshipRequest[]>([]);
  const [accessGrants, setAccessGrants] = useState<FamilyAccessGrant[]>([]);
  const [dependentVerification, setDependentVerification] = useState<
    Record<string, DependentVerificationStatus>
  >({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showChildRegistration, setShowChildRegistration] = useState(false);

  const [targetIdentifier, setTargetIdentifier] = useState('');
  const [relationshipType, setRelationshipType] = useState<FamilyRelationshipType>('OTHER');
  const [reason, setReason] = useState('');

  const [dependentFirstName, setDependentFirstName] = useState('');
  const [dependentSecondName, setDependentSecondName] = useState('');
  const [dependentDateOfBirth, setDependentDateOfBirth] = useState('');
  const [dependentRelationshipType, setDependentRelationshipType] = useState<'CHILD' | 'DEPENDENT'>(
    'CHILD',
  );
  const [dependentLocation, setDependentLocation] = useState('');
  const [dependentReason, setDependentReason] = useState('');
  const [dependentSubmitting, setDependentSubmitting] = useState(false);
  const [dependentUploadStage, setDependentUploadStage] = useState<string | null>(null);
  const [activeDependentRegistrationId, setActiveDependentRegistrationId] = useState<string | null>(
    null,
  );
  const [birthCertificateFile, setBirthCertificateFile] = useState<File | null>(null);
  const [guardianIdFile, setGuardianIdFile] = useState<File | null>(null);
  const [additionalProofFile, setAdditionalProofFile] = useState<File | null>(null);
  const [guardianIdDocumentType, setGuardianIdDocumentType] = useState<'NATIONAL_ID' | 'PASSPORT'>(
    'NATIONAL_ID',
  );
  const [replacementRegistrationId, setReplacementRegistrationId] = useState<string | null>(null);
  const [replacementBirthCertificateFile, setReplacementBirthCertificateFile] =
    useState<File | null>(null);
  const [replacementGuardianIdFile, setReplacementGuardianIdFile] = useState<File | null>(null);
  const [replacementAdditionalProofFile, setReplacementAdditionalProofFile] = useState<File | null>(
    null,
  );
  const [accessFormRelationship, setAccessFormRelationship] = useState<FamilyRelationship | null>(
    null,
  );
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<FamilyAccessPermission[]>([
    'appointments.read',
    'reminders.read',
  ]);
  const [accessExpiryDate, setAccessExpiryDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 90);
    return toDateInputValue(date);
  });
  const [activityGrant, setActivityGrant] = useState<FamilyAccessGrant | null>(null);
  const [activityRecords, setActivityRecords] = useState<
    Array<{ id: string; action: string; resourceType: string; createdAt: string }>
  >([]);
  const [reviewingGrantId, setReviewingGrantId] = useState<string | null>(null);
  const [adolescentMinimumAge, setAdolescentMinimumAge] = useState(13);
  const [adolescentRestrictedPermissions, setAdolescentRestrictedPermissions] = useState<string[]>([
    'lab-results.read',
    'prescriptions.read',
    'documents.read',
  ]);

  const dependentAge = useMemo(() => {
    if (!dependentDateOfBirth) {
      return null;
    }

    const birth = new Date(`${dependentDateOfBirth}T00:00:00`);
    const today = new Date();

    if (Number.isNaN(birth.getTime()) || birth > today) {
      return null;
    }

    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();

    if (today.getDate() < birth.getDate()) {
      months -= 1;
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return {
      years,
      months,
      isMinor: years < 18,
    };
  }, [dependentDateOfBirth]);

  const incomingRequests = useMemo(
    () => requests.filter((request) => request.direction === 'INCOMING'),
    [requests],
  );

  const outgoingRequests = useMemo(
    () => requests.filter((request) => request.direction === 'OUTGOING'),
    [requests],
  );

  const children = useMemo(
    () =>
      relationships.filter((relationship) => isChildRelationship(relationship.relationshipType)),
    [relationships],
  );

  const adults = useMemo(
    () =>
      relationships.filter((relationship) => !isChildRelationship(relationship.relationshipType)),
    [relationships],
  );

  const accessPatientDateOfBirth = accessFormRelationship
    ? accessFormRelationship.dependentRegistration
      ? accessFormRelationship.dependentRegistration.dateOfBirth
      : (getSelfPatient(accessFormRelationship).dateOfBirth ?? null)
    : null;
  const accessPatientAge = getAgeFromDateOfBirth(accessPatientDateOfBirth);
  const isAdolescentAccessPatient =
    accessPatientAge !== null && accessPatientAge >= adolescentMinimumAge && accessPatientAge < 18;
  const visibleAccessPermissions = FAMILY_ACCESS_PERMISSIONS.filter(
    (permission) =>
      !isAdolescentAccessPatient || !adolescentRestrictedPermissions.includes(permission),
  );

  function getGrantForRelationship(
    relationship: FamilyRelationship,
  ): FamilyAccessGrant | undefined {
    const target = getAccessTarget(relationship);
    return accessGrants.find(
      (grant) => grant.patientId === target.patientId && grant.delegateId === target.delegateId,
    );
  }

  function openAccessEditor(relationship: FamilyRelationship, grant?: FamilyAccessGrant) {
    setAccessFormRelationship(relationship);
    setEditingGrantId(grant?.id ?? null);
    const ownerDateOfBirth = relationship.dependentRegistration
      ? relationship.dependentRegistration.dateOfBirth
      : getSelfPatient(relationship).dateOfBirth;
    const ownerAge = getAgeFromDateOfBirth(ownerDateOfBirth);
    const restricted = ownerAge !== null && ownerAge >= adolescentMinimumAge && ownerAge < 18;
    const initialPermissions: FamilyAccessPermission[] = grant?.permissions ?? [
      'appointments.read',
      'reminders.read',
    ];
    setSelectedPermissions(
      initialPermissions.filter(
        (permission) => !restricted || !adolescentRestrictedPermissions.includes(permission),
      ),
    );
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 90);
    setAccessExpiryDate(grant ? grant.expiresAt.slice(0, 10) : toDateInputValue(defaultExpiry));
  }

  async function loadFamilyData() {
    setLoading(true);
    setError(null);

    try {
      const [relationshipResponse, requestResponse, grantResponse] = await Promise.all([
        getFamilyRelationships(),
        getFamilyRequests(),
        getFamilyAccessGrants(),
      ]);

      const dependentStatuses = await Promise.all(
        relationshipResponse.data
          .filter((relationship) => relationship.dependentRegistration)
          .map(async (relationship) => {
            const registrationId = relationship.dependentRegistration!.id;
            const response = await getDependentVerificationStatus(registrationId);
            return [registrationId, response.data] as const;
          }),
      );

      setRelationships(relationshipResponse.data);
      setRequests(requestResponse.data);
      setAccessGrants(grantResponse.data);
      if (grantResponse.adolescentPolicy) {
        setAdolescentMinimumAge(grantResponse.adolescentPolicy.minimumAge);
        setAdolescentRestrictedPermissions(grantResponse.adolescentPolicy.restrictedPermissions);
      }
      setDependentVerification(Object.fromEntries(dependentStatuses));
      setHasLoadedData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your family information.');
    } finally {
      setLoading(false);
    }
  }

  async function completeStepUp(): Promise<string> {
    return requestStepUpChallengeId();
  }

  useEffect(() => {
    void loadFamilyData();
  }, []);

  async function handleCreateRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const patientId = targetIdentifier.trim();
    const requestReason = reason.trim();

    if (!patientId) {
      setError('Enter the Revaltrix platform patient ID.');
      return;
    }

    if (patientId.length > 320) {
      setError('The search identifier cannot exceed 320 characters.');
      return;
    }

    if (requestReason.length > 1000) {
      setError('The reason cannot exceed 1,000 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await createFamilyRequest({
        targetIdentifier: patientId,
        relationshipType,
        ...(requestReason ? { reason: requestReason } : {}),
      });

      setTargetIdentifier('');
      setRelationshipType('OTHER');
      setReason('');
      setShowAddMember(false);
      setSuccess('Family relationship request sent.');
      await loadFamilyData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to send the family relationship request.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterDependent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const firstName = dependentFirstName.trim();
    const secondName = dependentSecondName.trim();
    const dateOfBirth = dependentDateOfBirth.trim();
    const location = dependentLocation.trim();
    const registrationReason = dependentReason.trim();

    if (!firstName || !secondName) {
      setError('First name and second name are required.');
      return;
    }

    if (firstName.length > 100 || secondName.length > 100) {
      setError('Names cannot exceed 100 characters.');
      return;
    }

    if (!dateOfBirth) {
      setError('Date of birth is required.');
      return;
    }

    const parsedDate = new Date(`${dateOfBirth}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      setError('Enter a valid date of birth.');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (parsedDate > today) {
      setError('Date of birth cannot be in the future.');
      return;
    }

    if (location.length > 300) {
      setError('Location cannot exceed 300 characters.');
      return;
    }

    if (registrationReason.length > 1000) {
      setError('The reason cannot exceed 1,000 characters.');
      return;
    }

    if (!birthCertificateFile || !guardianIdFile) {
      setError('Upload the child birth certificate and your national ID or passport.');
      return;
    }

    const payload: CreateDependentRegistrationRequest = {
      firstName,
      secondName,
      dateOfBirth,
      relationshipType: dependentRelationshipType,
      ...(location ? { location } : {}),
      ...(registrationReason ? { reason: registrationReason } : {}),
    };

    setDependentSubmitting(true);
    setError(null);
    setSuccess(null);
    let registrationId = activeDependentRegistrationId;
    let dependentName = [firstName, secondName].join(' ');

    try {
      if (!registrationId) {
        setDependentUploadStage('Saving the child registration…');
        const response = await registerDependent(payload);
        registrationId = response.data.registration.id;
        dependentName = [response.data.dependent.firstName, response.data.dependent.secondName]
          .filter(Boolean)
          .join(' ');
        setActiveDependentRegistrationId(registrationId);
      }

      setDependentUploadStage('Saving the birth certificate privately…');
      await uploadDependentVerificationDocument(
        registrationId,
        'BIRTH_CERTIFICATE',
        birthCertificateFile,
      );
      setDependentUploadStage('Saving the guardian identity document privately…');
      await uploadDependentVerificationDocument(
        registrationId,
        guardianIdDocumentType,
        guardianIdFile,
      );
      if (additionalProofFile) {
        setDependentUploadStage('Saving the additional proof privately…');
        await uploadDependentVerificationDocument(
          registrationId,
          'GUARDIANSHIP_ORDER',
          additionalProofFile,
        );
      }

      setDependentFirstName('');
      setDependentSecondName('');
      setDependentDateOfBirth('');
      setDependentRelationshipType('CHILD');
      setDependentLocation('');
      setDependentReason('');
      setBirthCertificateFile(null);
      setGuardianIdFile(null);
      setAdditionalProofFile(null);
      setActiveDependentRegistrationId(null);
      setShowChildRegistration(false);
      await loadFamilyData();
      setSuccess(
        `${dependentName} was registered and the required documents were saved for review. No medical access has been granted.`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to register the child or save the documents.';
      if (registrationId) {
        await loadFamilyData();
        setError(
          `The child registration is saved. Document upload did not finish; correct the issue and submit again to continue this same registration. ${message}`,
        );
      } else {
        setError(message);
      }
    } finally {
      setDependentUploadStage(null);
      setDependentSubmitting(false);
    }
  }

  async function handleRespond(request: FamilyRelationshipRequest, response: 'ACCEPT' | 'DECLINE') {
    const responseReason =
      response === 'DECLINE'
        ? (window.prompt('Optional reason for declining this request:') ?? '')
        : '';

    if (responseReason.length > 1000) {
      setError('The response reason cannot exceed 1,000 characters.');
      return;
    }

    setActionId(request.id);
    setError(null);
    setSuccess(null);

    try {
      await respondToFamilyRequest(request.id, {
        response,
        ...(responseReason.trim() ? { responseReason: responseReason.trim() } : {}),
      });

      setSuccess(
        response === 'ACCEPT'
          ? 'Family relationship request accepted.'
          : 'Family relationship request declined.',
      );

      await loadFamilyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to respond to this request.');
    } finally {
      setActionId(null);
    }
  }

  async function handleReuploadDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!replacementRegistrationId) return;
    if (!replacementBirthCertificateFile || !replacementGuardianIdFile) {
      setError('Upload the child birth certificate and your national ID or passport.');
      return;
    }
    setDependentSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadDependentVerificationDocument(
        replacementRegistrationId,
        'BIRTH_CERTIFICATE',
        replacementBirthCertificateFile,
      );
      await uploadDependentVerificationDocument(
        replacementRegistrationId,
        guardianIdDocumentType,
        replacementGuardianIdFile,
      );
      if (replacementAdditionalProofFile) {
        await uploadDependentVerificationDocument(
          replacementRegistrationId,
          'GUARDIANSHIP_ORDER',
          replacementAdditionalProofFile,
        );
      }
      setReplacementRegistrationId(null);
      setReplacementBirthCertificateFile(null);
      setReplacementGuardianIdFile(null);
      setReplacementAdditionalProofFile(null);
      setSuccess('Replacement verification documents were submitted for review.');
      await loadFamilyData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to upload replacement verification documents.',
      );
    } finally {
      setDependentSubmitting(false);
    }
  }

  async function handleCancel(request: FamilyRelationshipRequest) {
    if (!window.confirm('Cancel this pending family relationship request?')) {
      return;
    }

    setActionId(request.id);
    setError(null);
    setSuccess(null);

    try {
      await cancelFamilyRequest(request.id);
      setSuccess('Family relationship request cancelled.');
      await loadFamilyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel this request.');
    } finally {
      setActionId(null);
    }
  }

  async function handleRevoke(relationship: FamilyRelationship) {
    const patient = getRelatedPatient(relationship);

    if (!window.confirm(`Revoke the family relationship with ${patientName(patient)}?`)) {
      return;
    }

    const relatedGrant = getGrantForRelationship(relationship);
    let revokeActiveAccessGrants = false;
    if (relatedGrant?.status === 'ACTIVE' && new Date(relatedGrant.expiresAt) > new Date()) {
      revokeActiveAccessGrants = window.confirm(
        'This family link has separate active medical access. Select OK to revoke both the family relationship and medical access, or Cancel to revoke only the family relationship and leave medical access active.',
      );
    }

    const revokeReason = window.prompt('Optional reason for revoking this relationship:') ?? '';

    if (revokeReason.length > 500) {
      setError('The revoke reason cannot exceed 500 characters.');
      return;
    }

    setActionId(relationship.id);
    setError(null);
    setSuccess(null);

    try {
      const stepUpChallengeId = await completeStepUp();
      await revokeFamilyRelationship(
        relationship.id,
        {
          revokeActiveAccessGrants,
          ...(revokeReason.trim() ? { reason: revokeReason.trim() } : {}),
        },
        stepUpChallengeId,
      );

      setSuccess('Family relationship revoked.');
      await loadFamilyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke this relationship.');
    } finally {
      setActionId(null);
    }
  }

  async function handleSaveAccessGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessFormRelationship) return;
    if (selectedPermissions.length === 0) {
      setError('Select at least one specific permission.');
      return;
    }

    const expiry = new Date(`${accessExpiryDate}T23:59:59`);
    if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      setError('Choose a future expiry date.');
      return;
    }
    const maxExpiry = new Date();
    maxExpiry.setFullYear(maxExpiry.getFullYear() + 1);
    if (expiry > maxExpiry) {
      setError('Access cannot be granted for more than one year.');
      return;
    }

    const target = getAccessTarget(accessFormRelationship);
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const stepUpChallengeId = await completeStepUp();
      if (editingGrantId) {
        await updateFamilyAccessGrant(
          editingGrantId,
          {
            permissions: selectedPermissions,
            expiresAt: expiry.toISOString(),
          },
          stepUpChallengeId,
        );
        setSuccess('Delegated permissions updated.');
      } else {
        await createFamilyAccessGrant(
          {
            ...target,
            permissions: selectedPermissions,
            expiresAt: expiry.toISOString(),
          },
          stepUpChallengeId,
        );
        setSuccess('Explicit medical access granted.');
      }
      setAccessFormRelationship(null);
      setEditingGrantId(null);
      await loadFamilyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save delegated access.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeAccess(grant: FamilyAccessGrant) {
    if (
      !window.confirm('Revoke this medical access now? The family relationship will remain active.')
    ) {
      return;
    }
    setActionId(grant.id);
    setError(null);
    setSuccess(null);
    try {
      const stepUpChallengeId = await completeStepUp();
      await revokeFamilyAccessGrant(grant.id, stepUpChallengeId);
      setSuccess('Medical access revoked immediately. The family connection is unchanged.');
      await loadFamilyData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke medical access.');
    } finally {
      setActionId(null);
    }
  }

  async function handleViewActivity(grant: FamilyAccessGrant) {
    setError(null);
    setActivityGrant(grant);
    try {
      const response = await getFamilyAccessActivity(grant.id);
      setActivityRecords(response.data);
    } catch (err) {
      setActivityGrant(null);
      setError(err instanceof Error ? err.message : 'Unable to load access activity.');
    }
  }

  async function handleReviewAccess(grant: FamilyAccessGrant) {
    setActionId(grant.id);
    setError(null);
    try {
      await reviewFamilyAccessGrant(grant.id);
      const refreshed = await getFamilyAccessGrants();
      setAccessGrants(refreshed.data);
      setReviewingGrantId(grant.id);
      setSuccess('Access reviewed. Your next review reminder is due in 90 days.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to review access.');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div
      className={`patient-dashboard-shell ${sidebarCollapsed ? 'patient-sidebar-collapsed' : ''}`}
    >
      <aside className={`patient-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="patient-sidebar-brand">
          <div className="patient-brand-mark">R</div>
          <div className="patient-sidebar-brand-copy">
            <strong>REVALTRIX</strong>
            <span>Patient</span>
          </div>
          <button
            type="button"
            className="patient-sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="patient-sidebar-navigation" aria-label="Patient navigation">
          {familyNavigationItems.map((item) => {
            const active = window.location.pathname === item.path;

            return (
              <button
                type="button"
                key={item.path}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={`patient-nav-item ${active ? 'active' : ''}`}
                onClick={() => onNavigate(item.path)}
              >
                <span className="patient-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="patient-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="patient-sidebar-footer">
          <button type="button" className="patient-dashboard-button secondary" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="patient-dashboard-main">
        <header className="patient-dashboard-header">
          <div>
            <span className="patient-eyebrow">PATIENT ACCOUNT</span>
            <h1>My Family &amp; Care Circle</h1>
            <p>
              Keep the people you care about connected to Revaltrix. Register children, connect
              relatives, and manage family relationships safely from one place.
            </p>
          </div>

          <button
            type="button"
            className="patient-dashboard-button secondary"
            onClick={() => onNavigate('/patient/dashboard')}
          >
            Back to overview
          </button>
        </header>

        {error && (
          <div className="patient-alert error" role="alert">
            {error}
            {!loading ? (
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => void loadFamilyData()}
              >
                Reload family data
              </button>
            ) : null}
          </div>
        )}

        {success && (
          <div className="patient-alert success" role="status">
            {success}
          </div>
        )}

        <section className="patient-family-hero">
          <div>
            <span className="patient-eyebrow">YOUR CARE CIRCLE</span>
            <h2>Family care starts with a trusted connection.</h2>
            <p>
              Connect people who already have Revaltrix identities or start the process of
              registering a child or dependent. Family relationships and medical-data permissions
              remain separate.
            </p>
          </div>

          <div className="patient-family-hero-actions">
            <button
              type="button"
              className="patient-dashboard-button"
              onClick={() => {
                setShowAddMember(true);
                setShowChildRegistration(false);
              }}
            >
              + Add family member
            </button>

            <button
              type="button"
              className="patient-dashboard-button secondary"
              onClick={() => {
                setShowChildRegistration(true);
                setShowAddMember(false);
              }}
            >
              + Register a child
            </button>
          </div>
        </section>

        <section className="patient-family-security-notice">
          <strong>Family relationship is not medical-data access.</strong>
          <p>
            Connecting someone to your family circle does not automatically give either person
            access to the other's medical records, appointments, laboratory results, prescriptions,
            documents, or other protected health information. Delegated permissions are controlled
            separately.
          </p>
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">FAMILY OVERVIEW</span>
              <h2>Your care circle</h2>
            </div>
          </div>

          <div className="patient-family-stat-grid">
            <article className="patient-family-stat-card">
              <span>Family members</span>
              <strong>{loading || !hasLoadedData ? '—' : relationships.length}</strong>
              <small>Active relationships</small>
            </article>

            <article className="patient-family-stat-card">
              <span>Adults</span>
              <strong>{loading || !hasLoadedData ? '—' : adults.length}</strong>
              <small>Connected relatives</small>
            </article>

            <article className="patient-family-stat-card">
              <span>Children &amp; dependents</span>
              <strong>{loading || !hasLoadedData ? '—' : children.length}</strong>
              <small>Family members needing care</small>
            </article>

            <article className="patient-family-stat-card">
              <span>Delegated access</span>
              <strong>
                {loading || !hasLoadedData
                  ? '—'
                  : accessGrants.filter(
                      (grant) =>
                        grant.status === 'ACTIVE' && new Date(grant.expiresAt) > new Date(),
                    ).length}
              </strong>
              <small>Explicit active grants</small>
            </article>

            <article className="patient-family-stat-card">
              <span>Pending requests</span>
              <strong>
                {loading || !hasLoadedData
                  ? '—'
                  : incomingRequests.length + outgoingRequests.length}
              </strong>
              <small>Awaiting action</small>
            </article>
          </div>
        </section>

        {showAddMember && (
          <div
            className="patient-family-modal-backdrop"
            onClick={() => setShowAddMember(false)}
          >
          <section
            className="patient-family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-family-add-member-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">CONNECT</span>
                <h2 id="patient-family-add-member-title">Add someone who already uses Revaltrix</h2>
              </div>

              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => setShowAddMember(false)}
              >
                Close
              </button>
            </div>

            <p className="patient-family-helper">
              Search for the relative using their Revaltrix ID, phone number or email. They will
              receive a family relationship request and can accept or decline it from their own
              account.
            </p>

            <form className="patient-family-request-form" onSubmit={handleCreateRequest}>
              <label>
                <span>Revaltrix ID, phone number or email</span>
                <input
                  value={targetIdentifier}
                  onChange={(event) => setTargetIdentifier(event.target.value)}
                  maxLength={320}
                  placeholder="Enter the relative's Revaltrix ID, phone or email"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>Relationship</span>
                <select
                  value={relationshipType}
                  onChange={(event) =>
                    setRelationshipType(event.target.value as FamilyRelationshipType)
                  }
                >
                  {FAMILY_RELATIONSHIP_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {relationshipLabels[type]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="patient-family-full-width">
                <span>
                  Reason <small>(optional)</small>
                </span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Optional context for the relationship request"
                />
              </label>

              <div className="patient-family-form-actions">
                <button type="submit" className="patient-dashboard-button" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send family request'}
                </button>
              </div>
            </form>
          </section>
          </div>
        )}

        {showChildRegistration && (
          <div
            className="patient-family-modal-backdrop"
            onClick={() => setShowChildRegistration(false)}
          >
          <section
            className="patient-family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-family-child-registration-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">CHILD REGISTRATION</span>
                <h2 id="patient-family-child-registration-title">Register a child or dependent</h2>
              </div>

              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => setShowChildRegistration(false)}
              >
                Close
              </button>
            </div>

            <div className="patient-family-child-intro">
              <div className="patient-family-child-icon" aria-hidden="true">
                +
              </div>

              <div>
                <h3>Give your child their own Revaltrix identity</h3>
                <p>
                  A child should have their own platform patient identity. Your family relationship
                  and any delegated access are recorded separately so that access can be controlled
                  appropriately.
                </p>
              </div>
            </div>

            <div className="patient-family-feature-grid">
              <article>
                <strong>Child identity</strong>
                <p>
                  The child will have an individual Revaltrix patient identity rather than being
                  stored as a duplicate adult account.
                </p>
              </article>

              <article>
                <strong>Guardian relationship</strong>
                <p>
                  Parent or guardian relationships can be recorded separately from the child's
                  identity.
                </p>
              </article>

              <article>
                <strong>Controlled access</strong>
                <p>
                  A family relationship does not automatically unlock the child's protected medical
                  information.
                </p>
              </article>
            </div>

            <form className="patient-family-request-form" onSubmit={handleRegisterDependent}>
              {activeDependentRegistrationId ? (
                <div className="patient-family-full-width patient-family-registration-note">
                  <strong>Registration saved — finish document uploads</strong>
                  <p>
                    Your registration has already been saved. Submitting again will continue
                    uploading documents to that same registration.
                  </p>
                </div>
              ) : null}

              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Step 1 of 2 · Child details</strong>
                <p>Enter the child's identity details before attaching verification documents.</p>
              </div>

              <label>
                <span>First name</span>
                <input
                  value={dependentFirstName}
                  onChange={(event) => setDependentFirstName(event.target.value)}
                  maxLength={100}
                  autoComplete="given-name"
                  placeholder="Child's first name"
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                  required
                />
              </label>

              <label>
                <span>Second name</span>
                <input
                  value={dependentSecondName}
                  onChange={(event) => setDependentSecondName(event.target.value)}
                  maxLength={100}
                  autoComplete="family-name"
                  placeholder="Child's second name"
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                  required
                />
              </label>

              <label>
                <span>Date of birth</span>
                <input
                  type="date"
                  value={dependentDateOfBirth}
                  onChange={(event) => setDependentDateOfBirth(event.target.value)}
                  max={toDateInputValue(new Date())}
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                  required
                />
                {dependentAge ? (
                  <small className="patient-family-age-preview">
                    Age:{' '}
                    {dependentAge.years > 0
                      ? `${dependentAge.years} year${dependentAge.years === 1 ? '' : 's'}`
                      : `${dependentAge.months} month${dependentAge.months === 1 ? '' : 's'}`}
                    {' · '}
                    {dependentAge.isMinor ? 'Minor' : 'Adult'}
                  </small>
                ) : null}
              </label>

              <label>
                <span>Relationship</span>
                <select
                  value={dependentRelationshipType}
                  onChange={(event) =>
                    setDependentRelationshipType(event.target.value as 'CHILD' | 'DEPENDENT')
                  }
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                >
                  <option value="CHILD">Child</option>
                  <option value="DEPENDENT">Adult dependent</option>
                </select>
              </label>

              <label className="patient-family-full-width">
                <span>
                  Location <small>(optional)</small>
                </span>
                <input
                  value={dependentLocation}
                  onChange={(event) => setDependentLocation(event.target.value)}
                  maxLength={300}
                  autoComplete="off"
                  placeholder="Current location"
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                />
              </label>

              <label className="patient-family-full-width">
                <span>
                  Registration context <small>(optional)</small>
                </span>
                <textarea
                  value={dependentReason}
                  onChange={(event) => setDependentReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Optional context for registering this child or dependent"
                  disabled={dependentSubmitting || Boolean(activeDependentRegistrationId)}
                />
              </label>

              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Step 2 of 2 · Upload verification documents</strong>
                <p>
                  Upload the child birth certificate and your national ID or passport. Files must be
                  PDF, PNG, or JPEG and no larger than 10 MB each. Documents are saved to private
                  storage for authorized reviewers only.
                </p>
              </div>

              <label className="patient-family-full-width">
                <span>
                  Child birth certificate <strong>(required)</strong>
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setBirthCertificateFile,
                      'The birth certificate',
                      setError,
                    )
                  }
                  disabled={dependentSubmitting}
                  required
                />
                <small>
                  {birthCertificateFile?.name ?? 'No file selected · PDF, PNG, or JPEG · 10 MB max'}
                </small>
              </label>

              <label>
                <span>
                  Guardian ID type <strong>(required)</strong>
                </span>
                <select
                  value={guardianIdDocumentType}
                  onChange={(event) =>
                    setGuardianIdDocumentType(event.target.value as 'NATIONAL_ID' | 'PASSPORT')
                  }
                  disabled={dependentSubmitting}
                >
                  <option value="NATIONAL_ID">National ID</option>
                  <option value="PASSPORT">Passport</option>
                </select>
              </label>

              <label>
                <span>
                  Your national ID or passport <strong>(required)</strong>
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setGuardianIdFile,
                      'The guardian identity document',
                      setError,
                    )
                  }
                  disabled={dependentSubmitting}
                  required
                />
                <small>
                  {guardianIdFile?.name ?? 'No file selected · PDF, PNG, or JPEG · 10 MB max'}
                </small>
              </label>

              <label className="patient-family-full-width">
                <span>
                  Guardianship or other supporting proof <small>(optional)</small>
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setAdditionalProofFile,
                      'The supporting document',
                      setError,
                    )
                  }
                  disabled={dependentSubmitting}
                />
                <small>
                  {additionalProofFile?.name ?? 'No file selected · PDF, PNG, or JPEG · 10 MB max'}
                </small>
              </label>

              {dependentUploadStage ? (
                <p className="patient-family-full-width" role="status">
                  {dependentUploadStage}
                </p>
              ) : null}

              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Privacy and review</strong>
                <p>
                  Registration remains pending until an authorized reviewer verifies the documents.
                  Family connection does not provide medical access; any medical access must be
                  granted separately with specific permissions.
                </p>
              </div>

              <div className="patient-family-form-actions">
                <button
                  type="submit"
                  className="patient-dashboard-button"
                  disabled={dependentSubmitting}
                >
                  {dependentSubmitting
                    ? 'Saving registration and documents…'
                    : activeDependentRegistrationId
                      ? 'Continue saving documents'
                      : 'Save child registration and submit documents'}
                </button>
              </div>
            </form>
          </section>
          </div>
        )}

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">PEOPLE IN YOUR CARE</span>
              <h2>Family members</h2>
            </div>

            <span className="patient-section-count">
              {hasLoadedData ? relationships.length : '—'}
            </span>
          </div>

          {loading ? (
            <div className="patient-empty-state">Loading your family circle…</div>
          ) : !hasLoadedData ? (
            <div className="patient-empty-state">
              <strong>Family data could not be loaded.</strong>
              <p>Retry to view your connected family members and their relationship details.</p>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => void loadFamilyData()}
              >
                Reload family data
              </button>
            </div>
          ) : relationships.length === 0 ? (
            <div className="patient-empty-state">
              <strong>No family members connected yet.</strong>
              <p>
                Connect a relative who already uses Revaltrix, or register a child or dependent
                directly from your care circle.
              </p>
              <button
                type="button"
                className="patient-dashboard-button"
                onClick={() => setShowAddMember(true)}
              >
                Add family member
              </button>
            </div>
          ) : (
            <div className="patient-family-member-grid">
              {relationships.map((relationship) => {
                const patient = getRelatedPatient(relationship);
                const memberGrant = getGrantForRelationship(relationship);
                const child = isChildRelationship(relationship.relationshipType);
                const dependent = relationship.dependentRegistration;
                const verification = dependent ? dependentVerification[dependent.id] : undefined;
                const authority = relationship.guardianVerification;
                const grantIsActive =
                  memberGrant?.status === 'ACTIVE' && new Date(memberGrant.expiresAt) > new Date();
                const permissionSummary = memberGrant?.permissions
                  .map(
                    (permission) =>
                      accessPermissionLabels[permission as FamilyAccessPermission] ?? permission,
                  )
                  .join(', ');

                return (
                  <article className="patient-family-member-card" key={relationship.id}>
                    <div className="patient-family-member-avatar">
                      {patient.firstName.charAt(0).toUpperCase()}
                    </div>

                    <div className="patient-family-member-content">
                      <div className="patient-family-member-heading">
                        <div>
                          <strong>{patientName(patient)}</strong>
                          <span>{relationshipLabels[relationship.relationshipType]}</span>
                        </div>

                        <div className="patient-family-badges">
                          <span className="patient-family-badge patient-family-badge-active">
                            {formatStatus(relationship.status)}
                          </span>
                          {child ? (
                            <span className="patient-family-badge">
                              {dependent
                                ? formatStatus(dependent.relationshipType)
                                : 'Child / dependent'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <small>Revaltrix patient · ID {patient.platformPatientId}</small>

                      <small>Connected {formatDate(relationship.createdAt)}</small>

                      <small>
                        {relationship.direction === 'OUTGOING'
                          ? 'You connected this family member'
                          : 'This family member connected you'}
                      </small>

                      {dependent ? (
                        <div className="patient-family-dependent-details">
                          <strong>Dependent registration</strong>
                          <span>
                            Verification: {formatStatus(verification?.status ?? dependent.status)}
                          </span>
                          <span>Date of birth: {formatDate(dependent.dateOfBirth)}</span>
                          <span>Registered: {formatDate(dependent.createdAt)}</span>
                          {verification?.verificationNotes ? (
                            <span>Reviewer note: {verification.verificationNotes}</span>
                          ) : null}
                          {verification?.documents.length ? (
                            <ul>
                              {verification.documents.map((document) => (
                                <li key={document.id}>
                                  {formatStatus(document.documentType)} — {document.fileName}
                                  {' · '}
                                  {formatStatus(document.status)}
                                  {document.rejectionReason
                                    ? ` · Reviewer note: ${document.rejectionReason}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span>
                              No verification documents uploaded yet. Upload the birth certificate
                              and your national ID or passport to submit for review.
                            </span>
                          )}
                          {['DRAFT', 'REJECTED'].includes(
                            verification?.status ?? dependent.status,
                          ) ? (
                            <button
                              type="button"
                              className="patient-dashboard-button secondary"
                              onClick={() => setReplacementRegistrationId(dependent.id)}
                            >
                              Upload / re-upload documents
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {authority ? (
                        <div className="patient-family-guardian-details">
                          <strong>Guardian authority</strong>
                          <span>
                            {formatStatus(authority.authorityType)} ·{' '}
                            {formatStatus(authority.status)}
                          </span>
                          <span>Verification: {formatStatus(authority.verificationStatus)}</span>
                          <span>Valid from: {formatDate(authority.startsAt)}</span>
                          {authority.verifiedAt ? (
                            <span>Verified: {formatDate(authority.verifiedAt)}</span>
                          ) : null}
                          {authority.expiresAt ? (
                            <span>Expires: {formatDate(authority.expiresAt)}</span>
                          ) : null}
                        </div>
                      ) : dependent ? (
                        <div className="patient-family-guardian-details">
                          <strong>Guardian authority</strong>
                          <span>No guardian authority record is available.</span>
                        </div>
                      ) : null}

                      <div className="patient-family-guardian-details">
                        <strong>Medical access</strong>
                        <span>
                          {grantIsActive
                            ? `Limited — ${permissionSummary}`
                            : memberGrant?.status === 'EXPIRED'
                              ? 'Expired'
                              : memberGrant?.status === 'REVOKED'
                                ? 'Revoked'
                                : 'No access granted'}
                        </span>
                        {memberGrant ? (
                          <>
                            <span>Access expires: {formatDate(memberGrant.expiresAt)}</span>
                            <span>Next review due: {formatDate(memberGrant.reviewDueAt)}</span>
                            <span>Last accessed: {formatDateTime(memberGrant.lastAccessAt)}</span>
                          </>
                        ) : null}
                      </div>

                      <div className="patient-family-member-actions">
                        <button
                          type="button"
                          className="patient-dashboard-button secondary"
                          onClick={() =>
                            openAccessEditor(relationship, grantIsActive ? memberGrant : undefined)
                          }
                          disabled={Boolean(
                            !grantIsActive &&
                            (relationship.status !== 'ACTIVE' ||
                              (dependent &&
                                (dependent.status !== 'APPROVED' ||
                                  authority?.verificationStatus !== 'VERIFIED'))),
                          )}
                        >
                          {grantIsActive ? 'Edit permissions' : 'Grant access'}
                        </button>

                        {grantIsActive && memberGrant ? (
                          <>
                            <button
                              type="button"
                              className="patient-dashboard-button secondary"
                              disabled={actionId === memberGrant.id}
                              onClick={() => void handleReviewAccess(memberGrant)}
                            >
                              {actionId === memberGrant.id ? 'Reviewing…' : 'Review access'}
                            </button>
                            <button
                              type="button"
                              className="patient-dashboard-button danger"
                              disabled={actionId === memberGrant.id}
                              onClick={() => void handleRevokeAccess(memberGrant)}
                            >
                              {actionId === memberGrant.id ? 'Revoking…' : 'Revoke access'}
                            </button>
                            <button
                              type="button"
                              className="patient-dashboard-button secondary"
                              onClick={() => void handleViewActivity(memberGrant)}
                            >
                              View activity
                            </button>
                          </>
                        ) : null}

                        {relationship.patientCanRevoke && (
                          <button
                            type="button"
                            className="patient-dashboard-button danger"
                            disabled={actionId === relationship.id}
                            onClick={() => void handleRevoke(relationship)}
                          >
                            {actionId === relationship.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {replacementRegistrationId ? (
          <section className="patient-profile-section">
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">VERIFICATION DOCUMENTS</span>
                <h2>Upload or replace documents</h2>
              </div>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => setReplacementRegistrationId(null)}
              >
                Close
              </button>
            </div>
            <form className="patient-family-request-form" onSubmit={handleReuploadDocuments}>
              <label>
                <span>Child birth certificate</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setReplacementBirthCertificateFile,
                      'The birth certificate',
                      setError,
                    )
                  }
                  required
                  disabled={dependentSubmitting}
                />
              </label>
              <label>
                <span>Guardian document type</span>
                <select
                  value={guardianIdDocumentType}
                  onChange={(event) =>
                    setGuardianIdDocumentType(event.target.value as 'NATIONAL_ID' | 'PASSPORT')
                  }
                  disabled={dependentSubmitting}
                >
                  <option value="NATIONAL_ID">National ID</option>
                  <option value="PASSPORT">Passport</option>
                </select>
              </label>
              <label>
                <span>Guardian national ID or passport</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setReplacementGuardianIdFile,
                      'The guardian identity document',
                      setError,
                    )
                  }
                  required
                  disabled={dependentSubmitting}
                />
              </label>
              <label>
                <span>
                  Additional proof <small>(optional)</small>
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={(event) =>
                    handleVerificationFileChange(
                      event,
                      setReplacementAdditionalProofFile,
                      'The supporting document',
                      setError,
                    )
                  }
                  disabled={dependentSubmitting}
                />
              </label>
              <div className="patient-family-form-actions">
                <button
                  type="submit"
                  className="patient-dashboard-button"
                  disabled={dependentSubmitting}
                >
                  {dependentSubmitting ? 'Uploading…' : 'Submit replacement documents'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {accessFormRelationship ? (
          <div
            className="patient-family-modal-backdrop"
            onClick={() => setAccessFormRelationship(null)}
          >
          <section
            className="patient-family-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-family-delegated-access-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">MEDICAL ACCESS GRANTS</span>
                <h2 id="patient-family-delegated-access-title">
                  {editingGrantId ? 'Edit permissions' : 'Grant medical access'}
                </h2>
              </div>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => setAccessFormRelationship(null)}
              >
                Close
              </button>
            </div>
            <p className="patient-family-helper">
              Complete each step to grant or change this person's access. Family membership alone
              never provides medical access. Grants expire after 90 days by default and can be set
              for up to one year.
            </p>
            <div className="patient-family-registration-note">
              <strong>Step 1 of 4 · Confirm who receives access</strong>
              <p>
                {patientName(getRelatedPatient(accessFormRelationship))} ·{' '}
                {relationshipLabels[accessFormRelationship.relationshipType]}
                {' · '}Family connection: {formatStatus(accessFormRelationship.status)}
              </p>
            </div>
            {isAdolescentAccessPatient ? (
              <p className="patient-family-registration-note">
                Some sensitive permissions are hidden by the current adolescent privacy policy.
              </p>
            ) : null}
            <form className="patient-family-request-form" onSubmit={handleSaveAccessGrant}>
              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Step 2 of 4 · Select exact permissions</strong>
                <p>
                  Select only the specific information or actions this person needs. No permission
                  is selected on your behalf as full access.
                </p>
              </div>
              <div className="patient-family-feature-grid">
                {visibleAccessPermissions.map((permission) => (
                  <label key={permission} className="patient-family-access-scope">
                    <input
                      type="checkbox"
                      checked={selectedPermissions.includes(permission)}
                      onChange={(event) =>
                        setSelectedPermissions((current) =>
                          event.target.checked
                            ? [...current, permission]
                            : current.filter((item) => item !== permission),
                        )
                      }
                      disabled={submitting}
                    />
                    <span>
                      {accessPermissionLabels[permission]}
                      <small>{permission}</small>
                    </span>
                  </label>
                ))}
              </div>
              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Step 3 of 4 · Set an expiry date</strong>
                <p>The default is 90 days. Access cannot be set for more than one year.</p>
              </div>
              <label>
                <span>Access expires on</span>
                <input
                  type="date"
                  value={accessExpiryDate}
                  min={toDateInputValue(new Date())}
                  max={(() => {
                    const max = new Date();
                    max.setDate(max.getDate() + 365);
                    return toDateInputValue(max);
                  })()}
                  onChange={(event) => setAccessExpiryDate(event.target.value)}
                  disabled={submitting}
                  required
                />
              </label>
              <div className="patient-family-full-width patient-family-registration-note">
                <strong>Step 4 of 4 · Review and confirm</strong>
                <p>
                  Selected:{' '}
                  {selectedPermissions.length
                    ? selectedPermissions
                        .map((permission) => accessPermissionLabels[permission])
                        .join(', ')
                    : 'No permissions selected'}
                  {' · '}Expires: {accessExpiryDate ? formatDate(accessExpiryDate) : 'Not set'}. You
                  will complete an email security-code check before changes take effect. This grant
                  is separate from the family connection and can be revoked instantly.
                </p>
              </div>
              <div className="patient-family-form-actions">
                <button type="submit" className="patient-dashboard-button" disabled={submitting}>
                  {submitting
                    ? 'Verifying and saving grant…'
                    : editingGrantId
                      ? 'Verify and save grant changes'
                      : 'Verify and create medical access grant'}
                </button>
              </div>
            </form>
          </section>
          </div>
        ) : null}

        {reviewingGrantId ? (
          <section className="patient-profile-section">
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">ACCESS REVIEW</span>
                <h2>Current delegated permissions</h2>
              </div>
            </div>
            {(() => {
              const grant = accessGrants.find((item) => item.id === reviewingGrantId);
              return grant ? (
                <div className="patient-family-empty-feature">
                  <strong>
                    {patientName(grant.delegate)} · {formatStatus(grant.status)}
                  </strong>
                  <p>Expires: {formatDate(grant.expiresAt)}</p>
                  <p>Next access review: {formatDate(grant.reviewDueAt)}</p>
                  <ul>
                    {grant.permissions.map((permission) => (
                      <li key={permission}>
                        {accessPermissionLabels[permission as FamilyAccessPermission] ?? permission}
                      </li>
                    ))}
                  </ul>
                  <p>Last accessed: {formatDateTime(grant.lastAccessAt)}</p>
                </div>
              ) : null;
            })()}
          </section>
        ) : null}

        {activityGrant ? (
          <section className="patient-profile-section">
            <div className="patient-section-heading">
              <div>
                <span className="patient-eyebrow">ACCESS ACTIVITY</span>
                <h2>Recent access history</h2>
              </div>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => setActivityGrant(null)}
              >
                Close
              </button>
            </div>
            {activityRecords.length ? (
              <ul>
                {activityRecords.map((record) => (
                  <li key={record.id}>
                    {formatDateTime(record.createdAt)} · {formatStatus(record.action)} ·{' '}
                    {formatStatus(record.resourceType)}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="patient-family-empty-feature">
                <strong>No access activity recorded yet</strong>
              </div>
            )}
          </section>
        ) : null}

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">DELEGATED ACCESS MATRIX</span>
              <h2>Medical access grants</h2>
            </div>
          </div>
          {accessGrants.filter(
            (grant) => grant.status === 'ACTIVE' && new Date(grant.expiresAt) > new Date(),
          ).length ? (
            <div className="patient-family-list">
              {accessGrants
                .filter(
                  (grant) => grant.status === 'ACTIVE' && new Date(grant.expiresAt) > new Date(),
                )
                .map((grant) => (
                  <article className="patient-family-card" key={grant.id}>
                    <strong>{patientName(grant.delegate)}</strong>
                    <span>
                      {grant.permissions
                        .map(
                          (permission) =>
                            accessPermissionLabels[permission as FamilyAccessPermission] ??
                            permission,
                        )
                        .join(', ')}
                    </span>
                    <small>Expires {formatDate(grant.expiresAt)}</small>
                    <small>Last accessed {formatDateTime(grant.lastAccessAt)}</small>
                  </article>
                ))}
            </div>
          ) : (
            <div className="patient-family-empty-feature">
              <strong>No delegated access granted.</strong>
            </div>
          )}
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">THINGS TO REMEMBER</span>
              <h2>Family reminders</h2>
            </div>
          </div>

          <div className="patient-family-empty-feature">
            <strong>No family reminders available for your permitted access.</strong>
            <p>
              Appointment reminders, follow-ups, vaccination reminders and other family care tasks
              will appear here once the corresponding care data is available to your account.
            </p>
          </div>
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">FAMILY ACTIVITY</span>
              <h2>Recent care activity</h2>
            </div>
          </div>

          <div className="patient-family-empty-feature">
            <strong>No family reminders available for your permitted access.</strong>
            <p>
              Care activity will appear here when authorized family events, appointments and care
              interactions are available. Only information you are permitted to see will be shown.
            </p>
          </div>
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">FAMILY SAFETY</span>
              <h2>Keep important information ready</h2>
            </div>
          </div>

          <div className="patient-family-feature-grid">
            <article>
              <strong>Emergency information</strong>
              <p>
                Keep emergency contacts and relevant safety information current in each patient's
                profile.
              </p>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => onNavigate('/patient/profile')}
              >
                Open my profile
              </button>
            </article>

            <article>
              <strong>Insurance information</strong>
              <p>Insurance and coverage details should remain current before care is needed.</p>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => onNavigate('/patient/profile')}
              >
                Review profile
              </button>
            </article>

            <article>
              <strong>Privacy controls</strong>
              <p>Family relationships are separate from delegated medical-data permissions.</p>
              <button
                type="button"
                className="patient-dashboard-button secondary"
                onClick={() => onNavigate('/patient/access')}
              >
                Manage data access
              </button>
            </article>
          </div>
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">FAMILY REQUESTS</span>
              <h2>Requests needing attention</h2>
            </div>
          </div>

          <div className="patient-family-request-columns">
            <div>
              <h3>Incoming · {incomingRequests.length}</h3>

              {loading ? (
                <div className="patient-empty-state">Loading…</div>
              ) : !hasLoadedData ? (
                <div className="patient-empty-state">Reload family data to view requests.</div>
              ) : incomingRequests.length === 0 ? (
                <div className="patient-empty-state">No incoming family requests.</div>
              ) : (
                <div className="patient-family-list">
                  {incomingRequests.map((request) => (
                    <article className="patient-family-card" key={request.id}>
                      <div>
                        <strong>{patientName(request.requesterPatientProfile)}</strong>

                        <span>{relationshipLabels[request.relationshipType]}</span>

                        <small>ID: {request.requesterPatientProfile.platformPatientId}</small>

                        {request.reason && <p>{request.reason}</p>}

                        <small>
                          Requested {formatDate(request.requestedAt)}
                          {request.expiresAt ? ` · Expires ${formatDate(request.expiresAt)}` : ''}
                        </small>
                      </div>

                      {request.status === 'PENDING' ? (
                        <div className="patient-family-actions">
                          <button
                            type="button"
                            className="patient-dashboard-button"
                            disabled={actionId === request.id}
                            onClick={() => void handleRespond(request, 'ACCEPT')}
                          >
                            Accept
                          </button>

                          <button
                            type="button"
                            className="patient-dashboard-button secondary"
                            disabled={actionId === request.id}
                            onClick={() => void handleRespond(request, 'DECLINE')}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="patient-family-badge">{formatStatus(request.status)}</span>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3>Outgoing · {outgoingRequests.length}</h3>

              {loading ? (
                <div className="patient-empty-state">Loading…</div>
              ) : !hasLoadedData ? (
                <div className="patient-empty-state">Reload family data to view requests.</div>
              ) : outgoingRequests.length === 0 ? (
                <div className="patient-empty-state">No outgoing family requests.</div>
              ) : (
                <div className="patient-family-list">
                  {outgoingRequests.map((request) => (
                    <article className="patient-family-card" key={request.id}>
                      <div>
                        <strong>{patientName(request.targetPatientProfile)}</strong>

                        <span>{relationshipLabels[request.relationshipType]}</span>

                        <small>ID: {request.targetPatientProfile.platformPatientId}</small>

                        {request.reason && <p>{request.reason}</p>}

                        <small>
                          Requested {formatDate(request.requestedAt)}
                          {request.expiresAt ? ` · Expires ${formatDate(request.expiresAt)}` : ''}
                        </small>
                      </div>

                      {request.status === 'PENDING' ? (
                        <button
                          type="button"
                          className="patient-dashboard-button secondary"
                          disabled={actionId === request.id}
                          onClick={() => void handleCancel(request)}
                        >
                          {actionId === request.id ? 'Cancelling…' : 'Cancel request'}
                        </button>
                      ) : (
                        <span className="patient-family-badge">{formatStatus(request.status)}</span>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="patient-profile-section">
          <div className="patient-section-heading">
            <div>
              <span className="patient-eyebrow">YOUR FAMILY'S PRIVACY</span>
              <h2>Relationships and permissions stay separate</h2>
            </div>
          </div>

          <div className="patient-family-privacy-grid">
            <article>
              <span className="patient-family-privacy-icon">01</span>
              <strong>Family relationship</strong>
              <p>Confirms that two Revaltrix patients have an accepted family connection.</p>
            </article>

            <article>
              <span className="patient-family-privacy-icon">02</span>
              <strong>Delegated access</strong>
              <p>
                Determines whether another person may access specific protected information or
                perform permitted actions.
              </p>
            </article>

            <article>
              <span className="patient-family-privacy-icon">03</span>
              <strong>Your control</strong>
              <p>
                Access should be granted, reviewed and revoked through explicit authorization rather
                than inferred from a family relationship.
              </p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
