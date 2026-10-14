import { useState } from 'react';
import {
  requestRegistrationVerification,
  verifyRegistrationCode,
  type VerificationChannel,
} from '../api/verification.api.js';

interface RegistrationVerificationProps {
  email: string | null;
  emailChallengeId?: string | null;
  emailChallengeExpiresAt?: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  onVerified: () => void;
}

export function RegistrationVerification({
  email,
  emailChallengeId = null,
  emailChallengeExpiresAt = null,
  phone,
  emailVerified,
  phoneVerified,
  onVerified,
}: RegistrationVerificationProps) {
  const [channel, setChannel] = useState<VerificationChannel>('EMAIL');
  const [challengeId, setChallengeId] = useState<string | null>(
    channel === 'EMAIL' ? emailChallengeId : null,
  );
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(
    channel === 'EMAIL' ? emailChallengeExpiresAt : null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const alreadyVerified = channel === 'EMAIL' ? emailVerified : phoneVerified;

  async function requestCode(): Promise<void> {
    setError(null);
    setMessage(null);
    setRequesting(true);

    try {
      const response = await requestRegistrationVerification(channel);

      setChallengeId(response.challengeId);
      setExpiresAt(response.expiresAt);
      setCode('');
      setMessage(
        channel === 'EMAIL'
          ? 'A verification code has been sent to your email address.'
          : 'A verification code has been requested for your phone number.',
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to request a verification code.',
      );
    } finally {
      setRequesting(false);
    }
  }

  async function verifyCode(): Promise<void> {
    if (!challengeId) {
      return;
    }

    setError(null);
    setMessage(null);
    setVerifying(true);

    try {
      await verifyRegistrationCode(challengeId, code);
      setMessage('Your account has been verified.');
      onVerified();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The verification code could not be verified.',
      );
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section className="dashboard-card verification-action-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Required action</p>
          <h2>Verify your account</h2>
        </div>
      </div>

      <div className="verification-channel-selector">
        <button
          type="button"
          className={channel === 'EMAIL' ? 'channel-active' : ''}
          onClick={() => {
            setChannel('EMAIL');
            setChallengeId(null);
            setError(null);
            setMessage(null);
          }}
        >
          Email
        </button>

        <button
          type="button"
          className={channel === 'PHONE' ? 'channel-active' : ''}
          disabled={!phone}
          onClick={() => {
            setChannel('PHONE');
            setChallengeId(null);
            setError(null);
            setMessage(null);
          }}
        >
          Phone
        </button>
      </div>

      <div className="verification-target">
        <span>{channel === 'EMAIL' ? 'Email address' : 'Phone number'}</span>

        <strong>
          {channel === 'EMAIL' ? (email ?? 'No email address') : (phone ?? 'No phone number')}
        </strong>
      </div>

      {alreadyVerified ? (
        <div className="verification-complete">This contact method is already verified.</div>
      ) : !challengeId ? (
        <button
          type="button"
          className="primary-button"
          disabled={requesting || (channel === 'EMAIL' ? !email : !phone)}
          onClick={() => void requestCode()}
        >
          {requesting ? 'Sending code...' : 'Send verification code'}
        </button>
      ) : (
        <div className="verification-code-form">
          <label>
            <span>Verification code</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
          </label>

          {expiresAt && (
            <p className="verification-expiry">
              Code expires at {new Date(expiresAt).toLocaleTimeString()}.
            </p>
          )}

          <div className="verification-actions">
            <button
              type="button"
              className="primary-button"
              disabled={verifying || code.length !== 6}
              onClick={() => void verifyCode()}
            >
              {verifying ? 'Verifying...' : 'Verify code'}
            </button>

            <button
              type="button"
              className="secondary-button"
              disabled={requesting}
              onClick={() => void requestCode()}
            >
              {requesting ? 'Sending...' : 'Send new code'}
            </button>
          </div>
        </div>
      )}

      {message && <div className="form-success">{message}</div>}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
