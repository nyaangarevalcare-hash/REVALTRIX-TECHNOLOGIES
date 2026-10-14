export type RegistrationType = 'TENANT' | 'PATIENT';

export type RegistrationStatus =
  'INITIATED' | 'VERIFICATION_REQUIRED' | 'ONBOARDING' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type VerificationStatus = 'PENDING' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'FAILED';

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';

export interface RegistrationIdentity {
  type: string;
  value: string;
  verifiedAt: string | null;
  status: string;
}

export interface RegistrationTenant {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  code: string;
  status: string;
}

export interface PatientProfile {
  id: string;
  firstName: string;
  secondName: string;
  location: string | null;
}

export interface RegistrationDashboardResponse {
  staffApprovalPending: boolean;
  registration: {
    id: string;
    type: RegistrationType;
    status: RegistrationStatus;
    verificationStatus: VerificationStatus;
    onboardingStatus: OnboardingStatus;
    completedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  };

  account: {
    id: string;
    displayName: string;
    status: string;
  };

  verification: {
    email: {
      address: string | null;
      verified: boolean;
      challengeId?: string | null;
      challengeExpiresAt?: string | null;
    };
    phone: {
      number: string | null;
      verified: boolean;
    };
    complete: boolean;
  };

  profile:
    | {
        type: 'PATIENT';
        data: PatientProfile | null;
        complete: boolean;
      }
    | {
        type: 'STAFF';
        data: {
          firstName: string;
          lastName: string;
          email: string;
          jobTitle: string | null;
          staffNumber: string | null;
        } | null;
        complete: boolean;
      }
    | {
        type: 'TENANT';
        data: RegistrationTenant | null;
        complete: boolean;
      };

  steps: {
    verification: {
      required: boolean;
      complete: boolean;
    };
    profile: {
      required: boolean;
      complete: boolean;
    };
    password: {
      required: boolean;
      complete: boolean;
    };
    onboarding: {
      required: boolean;
      complete: boolean;
    };
  };

  progress: {
    completed: number;
    total: number;
  };
}
