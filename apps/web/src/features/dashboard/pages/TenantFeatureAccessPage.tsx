import { useEffect, useState } from 'react';
import { getTenantFeatures, updateTenantFeature } from '../api/tenant-features.api.js';
import type { TenantFeatureState } from '../api/tenant-features.api.js';

interface TenantFeatureAccessPageProps {
  tenantId: string;
  onFeaturesChanged: (features: TenantFeatureState[]) => void;
}

function displayName(feature: string): string {
  return feature
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function TenantFeatureAccessPage({
  tenantId,
  onFeaturesChanged,
}: TenantFeatureAccessPageProps) {
  const [features, setFeatures] = useState<TenantFeatureState[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadFeatures(): Promise<void> {
    try {
      const currentFeatures = await getTenantFeatures();
      setFeatures(currentFeatures);
      onFeaturesChanged(currentFeatures);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to load tenant module settings.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeatures();
  }, [tenantId, onFeaturesChanged]);

  async function setFeature(feature: TenantFeatureState, enabled: boolean) {
    setSaving(feature.feature);
    setNotice(null);
    setError(null);
    try {
      await updateTenantFeature(tenantId, feature.feature, enabled);
      setNotice(`${displayName(feature.feature)} ${enabled ? 'enabled' : 'disabled'}.`);
      await loadFeatures();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update this module.',
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="tenant-features-page">
      <header>
        <p className="dashboard-eyebrow">PLATFORM ADMINISTRATION</p>
        <h1>Tenant modules</h1>
        <p>Manage modules supported for this organization type. Changes are saved and audited.</p>
      </header>
      {error && (
        <div className="shop-alert is-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="shop-alert is-success" role="status">
          {notice}
        </div>
      )}
      {loading ? (
        <p>Loading module settings...</p>
      ) : (
        <div className="tenant-feature-list">
          {features
            .filter((feature) => feature.supported)
            .map((feature) => (
              <label className="tenant-feature-option" key={feature.feature}>
                <span>
                  <strong>{displayName(feature.feature)}</strong>
                  <small>
                    {feature.overridden ? 'Explicit tenant setting' : 'Tenant-type default'}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={feature.enabled}
                  disabled={saving !== null}
                  onChange={(event) => void setFeature(feature, event.target.checked)}
                  aria-label={`Enable ${displayName(feature.feature)}`}
                />
              </label>
            ))}
        </div>
      )}
    </main>
  );
}
