import { useState } from 'react';
import { setRegistrationPassword } from '../api/registration-password.api.js';
import type { SetRegistrationPasswordResponse } from '../api/registration-password.api.js';

interface RegistrationPasswordSetupProps {
  onConfigured: (response: SetRegistrationPasswordResponse) => void;
}

export function RegistrationPasswordSetup({ onConfigured }: RegistrationPasswordSetupProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordLongEnough = password.length >= 12;
  const passwordsMatch =
    password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;

  async function handleSubmit(): Promise<void> {
    if (!passwordLongEnough) {
      setError('Password must contain at least 12 characters.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await setRegistrationPassword(password, confirmPassword);
      setPassword('');
      setConfirmPassword('');
      onConfigured(response);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to configure your password.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="dashboard-card password-action-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Required action</p>
          <h2>Create your password</h2>
        </div>
      </div>

      <p className="password-description">
        Create a secure password for your Revaltrix account. Your password must contain at least 12
        characters.
      </p>

      <div className="password-fields">
        <label>
          <span>Password</span>

          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />

            <button
              type="button"
              className="password-visibility-button"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>

        <label>
          <span>Confirm password</span>

          <div className="password-input-wrapper">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your password"
            />

            <button
              type="button"
              className="password-visibility-button"
              onClick={() => setShowConfirmPassword((current) => !current)}
            >
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
      </div>

      <div className="password-requirements">
        <div className={passwordLongEnough ? 'requirement-met' : ''}>
          <span>{passwordLongEnough ? '✓' : '○'}</span>
          <span>At least 12 characters</span>
        </div>

        <div className={passwordsMatch ? 'requirement-met' : ''}>
          <span>{passwordsMatch ? '✓' : '○'}</span>
          <span>Passwords match</span>
        </div>
      </div>

      <button
        type="button"
        className="primary-button"
        disabled={submitting || !passwordLongEnough || !passwordsMatch}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Creating password...' : 'Create password'}
      </button>

      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
