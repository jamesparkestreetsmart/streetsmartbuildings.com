// app/f/[siteSlug]/[equipmentSlug]/[spaceSlug]/page.tsx
//
// Public QR Comfort Feedback Page
// URL: /f/{site_slug}/{equipment_slug}/{space_slug}
// Example: /f/wksr-0024/house-hvac/kitchen
//
// Data source: b_zone_setpoint_log (via resolve API)
// Same fields as SpaceHvacTable component

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// ─── Types ───

interface ResolvedData {
  organization: { org_id: string; org_name: string; org_identifier: string };
  site: { site_id: string; site_name: string; site_slug: string; address: string; latitude: number | null; longitude: number | null };
  equipment: { equipment_id: string; equipment_name: string; slug: string; equipment_group: string; equipment_type_id: string };
  zone: {
    hvac_zone_id: string; name: string; zone_type: string;
    control_scope: string; is_override: boolean; smart_start_enabled: boolean;
  } | null;
  // From b_zone_setpoint_log — same fields as SpaceHvacTable
  zone_snapshot: {
    recorded_at: string;
    phase: string | null;
    active_heat_f: number | null;
    active_cool_f: number | null;
    profile_heat_f: number | null;
    profile_cool_f: number | null;
    feels_like_adj: number | null;
    occupancy_adj: number | null;
    manager_adj: number | null;
    smart_start_adj: number | null;
    zone_temp_f: number | null;
    zone_humidity: number | null;
    feels_like_temp_f: number | null;
    hvac_action: string | null;
    fan_mode: string | null;
    supply_temp_f: number | null;
    return_temp_f: number | null;
    delta_t: number | null;
    power_kw: number | null;
    comp_on: boolean | null;
    occupied_sensor_count: number | null;
  } | null;
  temp_source: string;
  spaces: { space_id: string; name: string; slug: string; space_type: string; hvac_zone_id: string | null; zone_weight: number | null }[];
  default_space: { space_id: string; name: string; slug: string } | null;
  qr_space_slug: string;
}

type Rating = 'too_hot' | 'comfortable' | 'too_cold';

const RATINGS: { id: Rating; emoji: string; label: string; sub: string; color: string; bg: string }[] = [
  { id: 'too_hot', emoji: '\uD83E\uDD75', label: 'Too Hot', sub: 'Uncomfortably warm', color: '#EF4444', bg: '#FEF2F2' },
  { id: 'comfortable', emoji: '\uD83D\uDE0A', label: 'Feels Great', sub: 'Comfortable', color: '#10B981', bg: '#ECFDF5' },
  { id: 'too_cold', emoji: '\uD83E\uDD76', label: 'Too Cold', sub: 'Uncomfortably cold', color: '#3B82F6', bg: '#EFF6FF' },
];

// ─── Score Badge (matches AdjBadge logic from SpaceHvacTable) ───

function ScoreBadge({ label, value, icon }: { label: string; value: number | null; icon: string }) {
  const v = value ?? 0;
  let color = '#10B981', bg = '#ECFDF5', border = '#A7F3D0'; // 0 = green/neutral
  if (v > 0) { color = '#EA580C'; bg = '#FFF7ED'; border = '#FED7AA'; }      // positive = orange (warming)
  else if (v < 0) { color = '#2563EB'; bg = '#EFF6FF'; border = '#BFDBFE'; }  // negative = blue (cooling)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center', lineHeight: 1.2 }}>
        <span style={{ marginRight: 2 }}>{icon}</span>{label}
      </span>
      <div style={{
        padding: '4px 10px', borderRadius: 8, backgroundColor: bg,
        border: `1px solid ${border}`, fontSize: 15, fontWeight: 800,
        color, letterSpacing: '-0.02em', minWidth: 36, textAlign: 'center',
      }}>
        {v === 0 ? '0' : v > 0 ? `+${v}` : `${v}`}
      </div>
    </div>
  );
}

// ─── Main Page Component ───

export default function ComfortFeedbackPage() {
  const params = useParams();
  const siteSlug = params.siteSlug as string;
  const equipmentSlug = params.equipmentSlug as string;
  const spaceSlug = params.spaceSlug as string;

  const [data, setData] = useState<ResolvedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<string>('general');
  const [rating, setRating] = useState<Rating | null>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // ─── Resolve on mount ───
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/public/comfort-feedback/resolve?site=${encodeURIComponent(siteSlug)}&equipment=${encodeURIComponent(equipmentSlug)}&space=${encodeURIComponent(spaceSlug)}`
        );
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || 'Failed to load location data');
          return;
        }
        const resolved: ResolvedData = await res.json();
        setData(resolved);
        if (resolved.default_space) setSelectedSpace(resolved.default_space.space_id);
      } catch {
        setError('Unable to connect to server');
      } finally {
        setLoading(false);
      }
    })();
  }, [siteSlug, equipmentSlug, spaceSlug]);

  // ─── Silent GPS ───
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return;
    navigator.permissions.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') {
        navigator.geolocation.getCurrentPosition(
          (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {}
        );
      }
    }).catch(() => {});
  }, []);

  // ─── Submit ───
  const handleSubmit = useCallback(async () => {
    if (!rating || !data) return;
    setSubmitting(true);
    setSubmitError(null);
    const isGeneral = selectedSpace === 'general';
    const snap = data.zone_snapshot;

    try {
      const res = await fetch('/api/public/comfort-feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: data.organization.org_id,
          site_id: data.site.site_id,
          equipment_id: data.equipment.equipment_id,
          space_id: isGeneral ? null : selectedSpace,
          hvac_zone_id: data.zone?.hvac_zone_id || null,
          rating,
          note: note.trim() || null,
          qr_default_space_id: data.default_space?.space_id || null,
          // Snapshot zone scores at time of feedback (from b_zone_setpoint_log)
          zone_scores: snap ? {
            feels_like_adj: snap.feels_like_adj,
            occupancy_adj: snap.occupancy_adj,
            manager_adj: snap.manager_adj,
            smart_start_adj: snap.smart_start_adj,
            active_heat_f: snap.active_heat_f,
            active_cool_f: snap.active_cool_f,
            zone_temp_f: snap.zone_temp_f,
            zone_humidity: snap.zone_humidity,
            feels_like_temp_f: snap.feels_like_temp_f,
          } : null,
          screen_width: window.innerWidth,
          screen_height: window.innerHeight,
          browser_language: navigator.language,
          referrer: document.referrer || 'direct/qr',
          latitude: coords?.lat || null,
          longitude: coords?.lng || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSubmitError(res.status === 429
          ? 'You\'ve already submitted feedback recently. Please try again later.'
          : err.error || 'Failed to submit feedback');
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError('Unable to connect. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [rating, data, selectedSpace, note, coords]);

  // ─── Loading ───
  if (loading) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={{ ...S.card, textAlign: 'center', marginTop: 60, padding: '48px 24px' }}>
          <div style={{ width: 32, height: 32, margin: '0 auto', border: '3px solid #E2E8F0', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#94A3B8', fontSize: 14, marginTop: 16 }}>Loading location data...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div></div>
    );
  }

  // ─── Error ───
  if (error || !data) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={{ ...S.card, textAlign: 'center', marginTop: 60, padding: '48px 24px' }}>
          <span style={{ fontSize: 48, display: 'block', marginBottom: 16 }}>{'\uD83D\uDE15'}</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>Location Not Found</h2>
          <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>{error || 'The QR code may be outdated.'}</p>
        </div>
      </div><Footer /></div>
    );
  }

  const snap = data.zone_snapshot;
  const selectedSpaceObj = data.spaces.find((s) => s.space_id === selectedSpace);

  // ─── Success ───
  if (submitted) {
    return (
      <div style={S.page}><div style={S.wrap}>
        <div style={{ ...S.card, textAlign: 'center', marginTop: 50, padding: '44px 22px' }}>
          <div style={{ color: '#10B981', marginBottom: 14, display: 'flex', justifyContent: 'center' }}>
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>Thanks for your feedback!</h2>
          <p style={{ fontSize: 13.5, color: '#64748B', lineHeight: 1.6, margin: '0 0 18px' }}>
            Your comfort rating has been recorded and sent to the building management team.
          </p>
          <div style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#475569', backgroundColor: '#F1F5F9', borderRadius: 8, padding: '6px 14px', marginBottom: 14 }}>
            {selectedSpace === 'general' ? `${data.equipment.equipment_name} \u00B7 General` : `${selectedSpaceObj?.name} \u00B7 ${data.equipment.equipment_name}`}
          </div>
          <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0 }}>
            {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} \u00B7 {data.site.site_name}
          </p>
        </div>
      </div><Footer /></div>
    );
  }

  // ─── Main Form ───
  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* Header */}
        <div style={{ textAlign: 'center', paddingTop: 20, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #FDE68A' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" fill="#F59E0B"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#1E293B' }}>Eagle Eyes</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#64748B', backgroundColor: '#FFF', border: '1px solid #E2E8F0', borderRadius: 20, padding: '5px 12px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span>{data.site.site_name} {'\u2014'} {data.site.address}</span>
          </div>
        </div>

        {/* ─── Zone Conditions Card ─── */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                {data.equipment.equipment_name} {'\u00B7'} {data.equipment.equipment_group || data.equipment.equipment_type_id || 'HVAC'}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {data.zone?.name || 'Zone'}
                {data.zone?.zone_type && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8', marginLeft: 8, textTransform: 'capitalize' }}>
                    {data.zone.zone_type}
                  </span>
                )}
              </h2>
            </div>
            {snap && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#10B981', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '3px 10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10B981' }}/>
                Last: {new Date(snap.recorded_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>

          {snap ? (
            <>
              {/* Setpoints Row */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, backgroundColor: '#F8FAFC', borderRadius: 10, border: '1px solid #F1F5F9', overflow: 'hidden' }}>
                <div style={{ flex: 1, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Active Setpoint</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
                    {snap.active_heat_f ?? '\u2014'}{'\u00B0'} {'\u2013'} {snap.active_cool_f ?? '\u2014'}{'\u00B0'}F
                  </div>
                </div>
                <div style={{ width: 1, height: 40, backgroundColor: '#E2E8F0', flexShrink: 0 }}/>
                <div style={{ flex: 1, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Profile Setpoint</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#94A3B8', letterSpacing: '-0.02em' }}>
                    {snap.profile_heat_f ?? '\u2014'}{'\u00B0'} {'\u2013'} {snap.profile_cool_f ?? '\u2014'}{'\u00B0'}F
                    <span style={{ fontSize: 10, marginLeft: 4, color: '#CBD5E1' }}>
                      ({snap.phase === 'occupied' ? 'occ' : 'unocc'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Four Scores — matches AdjBadge from SpaceHvacTable */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                <ScoreBadge label="Feels Like" value={snap.feels_like_adj} icon={'\uD83C\uDF21'} />
                <ScoreBadge label="Occupancy" value={snap.occupancy_adj} icon={'\uD83D\uDC65'} />
                <ScoreBadge label="Manager" value={snap.manager_adj} icon={'\uD83D\uDC64'} />
                <ScoreBadge label="Smart Start" value={snap.smart_start_adj} icon={'\u26A1'} />
              </div>

              {/* Zone Readings */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #F1F5F9' }}>
                {[
                  { label: 'Zone Temp', value: snap.zone_temp_f != null ? `${snap.zone_temp_f}\u00B0F` : '\u2014', color: '#12723A' },
                  { label: 'Humidity', value: snap.zone_humidity != null ? `${snap.zone_humidity}%` : '\u2014', color: '#80B52C' },
                  { label: 'Feels Like', value: snap.feels_like_temp_f != null ? `${snap.feels_like_temp_f}\u00B0F` : '\u2014',
                    color: (snap.zone_temp_f != null && snap.feels_like_temp_f != null && Math.abs(snap.feels_like_temp_f - snap.zone_temp_f) >= 2) ? '#DC2626' : '#64748B' },
                  { label: 'Source', value: data.temp_source, color: '#64748B' },
                ].map((r, i) => (
                  <React.Fragment key={r.label}>
                    {i > 0 && <div style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: '#E2E8F0', flexShrink: 0 }}/>}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' }}>
              Awaiting first zone snapshot...
            </p>
          )}
        </div>

        {/* ─── Feedback Card ─── */}
        <div style={S.card}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '0 0 3px' }}>How does it feel right now?</h2>
          <p style={{ fontSize: 12.5, color: '#94A3B8', margin: '0 0 14px', lineHeight: 1.4 }}>
            Your anonymous feedback helps optimize comfort in this space.
          </p>

          {/* Space Selector */}
          {data.spaces.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                <span>Where are you?</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                {data.spaces.map((sp) => {
                  const active = selectedSpace === sp.space_id;
                  const isDefault = data.default_space?.space_id === sp.space_id;
                  return (
                    <button key={sp.space_id} onClick={() => setSelectedSpace(sp.space_id)} style={{
                      padding: '7px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s ease', display: 'flex',
                      alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                      backgroundColor: active ? '#0F172A' : '#FFF',
                      color: active ? '#FFF' : '#475569',
                      borderColor: active ? '#0F172A' : '#E2E8F0',
                    }}>
                      {sp.name}
                      {isDefault && !active && <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block' }}/>}
                    </button>
                  );
                })}
                <button onClick={() => setSelectedSpace('general')} style={{
                  padding: '7px 14px', borderRadius: 20, border: '1.5px solid', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic', whiteSpace: 'nowrap',
                  backgroundColor: selectedSpace === 'general' ? '#0F172A' : '#FFF',
                  color: selectedSpace === 'general' ? '#FFF' : '#94A3B8',
                  borderColor: selectedSpace === 'general' ? '#0F172A' : '#E2E8F0',
                }}>General</button>
              </div>
            </>
          )}

          {/* Rating Buttons */}
          <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
            {RATINGS.map((r) => {
              const active = rating === r.id;
              return (
                <button key={r.id} onClick={() => setRating(r.id)} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '14px 6px', borderRadius: 13, border: '2px solid', cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.13s ease',
                  backgroundColor: active ? r.bg : '#FFF',
                  borderColor: active ? r.color : '#E5E7EB',
                  boxShadow: active ? `0 0 0 3px ${r.color}22` : '0 1px 3px rgba(0,0,0,0.05)',
                  transform: active ? 'scale(1.03)' : 'scale(1)',
                }}>
                  <span style={{ fontSize: 30, lineHeight: 1 }}>{r.emoji}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? r.color : '#374151' }}>{r.label}</span>
                  <span style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>{r.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Optional Note */}
          {rating && !showNote && (
            <button onClick={() => setShowNote(true)} style={{
              width: '100%', background: 'none', border: '1px dashed #CBD5E1', borderRadius: 9,
              padding: 9, fontSize: 12.5, color: '#64748B', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14,
            }}>
              + Add a comment <span style={{ color: '#CBD5E1' }}>(optional)</span>
            </button>
          )}
          {showNote && (
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <textarea style={{
                width: '100%', border: '1px solid #E2E8F0', borderRadius: 9, padding: '9px 11px',
                fontSize: 13.5, fontFamily: 'inherit', color: '#1E293B', resize: 'vertical',
                outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
              }}
                placeholder='e.g. "Drafty near the windows" or "Perfect today!"'
                maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              />
              <span style={{ position: 'absolute', bottom: 7, right: 10, fontSize: 11, color: '#CBD5E1' }}>{note.length}/500</span>
            </div>
          )}

          {/* Submit Error */}
          {submitError && (
            <div style={{ padding: '10px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 13, color: '#DC2626', marginBottom: 12 }}>
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!rating || submitting} style={{
            width: '100%', padding: 13, borderRadius: 11, border: 'none', backgroundColor: '#0F172A',
            color: '#FFF', fontSize: 14.5, fontWeight: 700, cursor: rating ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: rating ? 1 : 0.4,
          }}>
            {submitting
              ? <span style={{ display: 'inline-block', width: 17, height: 17, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#FFF', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }}/>
              : 'Submit Feedback'}
          </button>

          <p style={{ fontSize: 11, color: '#CBD5E1', textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
            {'\uD83D\uDD12'} Anonymous {'\u00B7'} No login {'\u00B7'} No personal data stored
          </p>
        </div>
      </div>
      <Footer />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ marginTop: 24, fontSize: 12, color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 24 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B, #EF4444)', display: 'inline-block' }}/>
      Powered by <strong style={{ marginLeft: 3 }}>Eagle Eyes</strong>&nbsp;Building Solutions
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: "'DM Sans', 'Segoe UI', system-ui, -apple-system, sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: 32 },
  wrap: { width: '100%', maxWidth: 440, padding: '0 14px' },
  card: { backgroundColor: '#FFF', borderRadius: 14, border: '1px solid #E2E8F0', padding: '18px 18px 16px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
};
