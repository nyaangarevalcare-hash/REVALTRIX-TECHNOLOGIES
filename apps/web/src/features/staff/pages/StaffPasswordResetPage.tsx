import { useState } from 'react';
import { apiRequest } from '../../../lib/api.js';
import {
  clearRegistrationToken,
  getRegistrationToken,
} from '../../registration/api/registration-dashboard.api.js';

export function StaffPasswordResetPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const token = getRegistrationToken();
    if (!token) {
      setError(
        'This password reset link is missing or has expired. Ask your administrator for a new one.',
      );
      return;
    }
    if (password.length < 12 || password.length > 128) {
      setError('Choose a password between 12 and 128 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest<{ passwordConfigured: boolean }>('/v1/registration/password/reset', {
        method: 'PATCH',
        headers: { 'X-Registration-Token': token },
        body: JSON.stringify({ password, confirmPassword }),
      });
      clearRegistrationToken();
      setPassword('');
      setConfirmPassword('');
      setComplete(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to reset your password.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <div className="dashboard-container">
        <section className="dashboard-card" style={{ maxWidth: 640, margin: '4rem auto' }}>
          <p className="dashboard-eyebrow">Staff account</p>
          <h1>{complete ? 'Password updated' : 'Reset your password'}</h1>
          {complete ? (
            <>
              <p>Your new password is ready. Sign in to continue to your staff dashboard.</p>
              <a className="dashboard-primary-button" href="/login">
                Go to sign in
              </a>
            </>
          ) : (
            <>
              <p>Use a new password of at least 12 characters.</p>
              <div className="tenant-form-grid">
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </label>
              </div>
              {error && (
                <p className="registration-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="dashboard-primary-button"
                disabled={submitting || password.length < 12 || password !== confirmPassword}
                onClick={() => void submit()}
              >
                {submitting ? 'Updating password...' : 'Update password'}
              </button>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
