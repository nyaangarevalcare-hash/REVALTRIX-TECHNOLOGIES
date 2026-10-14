import { useEffect, useState } from 'react';
import { getRegistrationDashboard } from '../api/registration-dashboard.api.js';
import type { RegistrationDashboardResponse } from '../types/registration-dashboard.types.js';
import { RegistrationHeader } from '../components/RegistrationHeader.js';
import { RegistrationProgress } from '../components/RegistrationProgress.js';
import { VerificationStatusCard } from '../components/VerificationStatusCard.js';
import { ProfileStatusCard } from '../components/ProfileStatusCard.js';
import { RegistrationVerification } from '../components/RegistrationVerification.js';
import { RegistrationPasswordSetup } from '../components/RegistrationPasswordSetup.js';
import { completeOnboarding } from '../api/onboarding.api.js';
import { setAuthSession } from '../../auth/api/auth-session.js';
import { clearRegistrationToken } from '../api/registration-dashboard.api.js';

export function RegistrationDashboardPage() {
  const [dashboard, setDashboard] = useState<RegistrationDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await getRegistrationDashboard();
      setDashboard(response);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load registration dashboard.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  if (loading) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-loading">
          <div className="loading-spinner" />
          <p>Loading your registration dashboard...</p>
        </div>
      </main>
    );
  }

  if (error || !dashboard) {
    return (
      <main className="dashboard-shell">
        <div className="dashboard-error">
          <p className="eyebrow">Registration dashboard</p>
          <h1>We could not load your registration</h1>
          <p>{error ?? 'No registration information is available.'}</p>
          <button type="button" className="primary-button" onClick={() => void loadDashboard()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const verificationRequired = !dashboard.verification.complete;
  const passwordRequired = dashboard.steps.password.required && !dashboard.steps.password.complete;

  const onboardingReady =
    dashboard.verification.complete &&
    dashboard.steps.profile.complete &&
    dashboard.steps.password.complete &&
    !dashboard.steps.onboarding.complete;

  async function handleCompleteOnboarding(): Promise<void> {
    setCompleting(true);
    setCompletionError(null);

    try {
      const response = await completeOnboarding();

      setAuthSession(response.authentication);
      clearRegistrationToken();

      window.location.assign(
        dashboard?.profile.type === 'STAFF'
          ? '/staff/dashboard'
          : dashboard?.profile.type === 'PATIENT'
            ? '/patient/dashboard'
            : '/dashboard',
      );
    } catch (requestError) {
      setCompletionError(
        requestError instanceof Error ? requestError.message : 'Unable to complete onboarding.',
      );
    } finally {
      setCompleting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-container">
        <RegistrationHeader registration={dashboard.registration} account={dashboard.account} />

        <div className="dashboard-grid">
          <RegistrationProgress steps={dashboard.steps} progress={dashboard.progress} />

          {verificationRequired && (
            <RegistrationVerification
              email={dashboard.verification.email.address}
              emailChallengeId={dashboard.verification.email.challengeId ?? null}
              emailChallengeExpiresAt={dashboard.verification.email.challengeExpiresAt ?? null}
              phone={dashboard.verification.phone.number}
              emailVerified={dashboard.verification.email.verified}
              phoneVerified={dashboard.verification.phone.verified}
              onVerified={() => void loadDashboard()}
            />
          )}

          <VerificationStatusCard verification={dashboard.verification} />

          {dashboard.verification.complete && passwordRequired && (
            <RegistrationPasswordSetup onConfigured={() => void loadDashboard()} />
          )}

          <ProfileStatusCard profile={dashboard.profile} onUpdated={() => void loadDashboard()} />

          {onboardingReady && (
            <section className="dashboard-card onboarding-completion-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">Final step</p>
                  <h2>Complete onboarding</h2>
                </div>
              </div>

              <p>
                Your account verification, profile, and password setup are complete. Finish
                onboarding to activate your registration.
              </p>

              {completionError && (
                <p role="alert" className="dashboard-error-message">
                  {completionError}
                </p>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={() => void handleCompleteOnboarding()}
                disabled={completing}
              >
                {completing ? 'Completing onboarding...' : 'Complete onboarding'}
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
