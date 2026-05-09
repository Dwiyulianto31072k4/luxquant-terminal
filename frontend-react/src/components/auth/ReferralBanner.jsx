// frontend-react/src/components/auth/ReferralBanner.jsx
import { useEffect, useState } from 'react';
import { getStoredRefValidated } from '../../utils/referralStorage';

/**
 * Banner yang muncul kalau user mendarat dengan ?ref=XYZ valid.
 *
 * Usage:
 *   <ReferralBanner />     // auto-detect dari localStorage
 *
 * Atau dengan custom styling:
 *   <ReferralBanner className="my-4" />
 *
 * Banner cuma render kalau ref valid. Otherwise return null.
 */
export default function ReferralBanner({ className = '' }) {
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getStoredRefValidated();
      if (!cancelled) {
        setRefData(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || !refData || !refData.valid) return null;

  const username = refData.referrer_username || 'a friend';
  const discount = refData.discount_pct || 10;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(212,168,83,0.12) 0%, rgba(212,168,83,0.04) 100%)',
        borderColor: 'rgba(212,168,83,0.3)',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base"
        style={{ background: 'rgba(212,168,83,0.2)' }}
      >
        🎉
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#d4a853' }}>
          Referred by @{username}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#b8a89a' }}>
          You'll get {discount}% off your first subscription. Sign in below to claim it.
        </p>
      </div>
    </div>
  );
}
