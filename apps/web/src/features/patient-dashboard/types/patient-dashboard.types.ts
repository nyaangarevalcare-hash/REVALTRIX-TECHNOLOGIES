export interface PatientDashboardIdentity {
  type: string;
  verified: boolean;
  verifiedAt: string | null;
}

export interface PatientDashboardFacility {
  patientRecordId: string;
  patientNumber: string;
  relationshipStatus: string;
  registeredAt: string;
  facility: {
    id: string;
    name: string;
    legalName: string | null;
    code: string;
    type: string;
    status: string;
  };
}

export interface PatientRelationshipRequest {
  id: string;
  status: string;
  reason: string | null;
  requestedAt: string;
  patientRecord: {
    id: string;
    patientNumber: string;
    status: string;
  };
  facility: {
    id: string;
    name: string;
    legalName: string | null;
    code: string;
    type: string;
    status: string;
  };
  requestedBy: {
    displayName: string;
  };
}

export interface PatientDashboardResponse {
  patient: {
    profileId: string;
    platformPatientId: string;
    userId: string;
    displayName: string;
    firstName: string;
    secondName: string;
    location: string | null;
    createdAt: string;
    updatedAt: string;
  };
  identities: PatientDashboardIdentity[];
  facilities: PatientDashboardFacility[];
  pendingRelationshipRequests: PatientRelationshipRequest[];
}

export interface PatientJourneyStep {
  id: string;
  sequence: number;
  type: string;
  status: string;
  name: string;
  description: string | null;
  location: string | null;
  instruction: string | null;
  estimatedWaitMinutes: number | null;
  estimatedDurationMinutes: number | null;
  readyAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  queue: {
    id: string;
    name: string;
    code: string;
  } | null;
  queueEntry: {
    id: string;
    queueNumber: string;
    priority: string;
    status: string;
    position: number | null;
    checkedInAt: string | null;
    calledAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    reason?: string | null;
  } | null;
  handoffsTo?: Array<{
    id: string;
    status: string;
    reason: string | null;
    instruction: string | null;
    createdAt: string;
    acceptedAt: string | null;
    fromDepartment: {
      id: string;
      name: string;
    } | null;
    toDepartment: {
      id: string;
      name: string;
    } | null;
  }>;
}

export interface PatientJourney {
  journey: {
    id: string;
    status: string;
    startedAt: string;
    encounterId: string | null;
    facility: {
      id: string;
      name: string;
      legalName: string | null;
      code: string;
    };
  };
  current: PatientJourneyStep | null;
  next: PatientJourneyStep | null;
  future: PatientJourneyStep[];
  steps: PatientJourneyStep[];
}

export interface PatientJourneyResponse {
  data: PatientJourney[];
}

export interface CareHistoryAttachment {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

export interface CareHistoryRecord {
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  note: string | null;
  procedures: string | null;
  recordedAt: string;
  updatedAt: string;
  attachments: CareHistoryAttachment[];
}

export interface CareHistoryReferral {
  status: string;
  fromDepartment: string | null;
  toDepartment: string | null;
  reason: string | null;
  instruction: string | null;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
}

export interface CareHistoryDepartment {
  sequence: number;
  type: string;
  status: string;
  name: string;
  description: string | null;
  location: string | null;
  instruction: string | null;
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  care: CareHistoryRecord[];
  referrals: CareHistoryReferral[];
}

export interface CareHistoryClinicalNote {
  type: string;
  status: string;
  chiefComplaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  signedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  versions: Array<{
    versionNumber: number;
    chiefComplaint: string | null;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    amendmentReason: string | null;
    signedAt: string | null;
    finalizedAt: string | null;
    createdAt: string;
  }>;
}

export interface CareHistoryItem {
  journeyId: string;
  facility: {
    name: string;
    legalName: string | null;
    code: string;
  };
  date: string;
  status: string;
  clinicalNotes: CareHistoryClinicalNote[];
  departments: CareHistoryDepartment[];
  referrals: CareHistoryReferral[];
}

export interface CareHistoryResponse {
  data: CareHistoryItem[];
}

