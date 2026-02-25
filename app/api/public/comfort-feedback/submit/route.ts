// app/api/public/comfort-feedback/submit/route.ts
//
// Submits comfort feedback → writes to b_records_log
// PUBLIC endpoint - no auth required.
// Rate limited: 1 submission per device fingerprint per equipment per 60 min.
//
// POST /api/public/comfort-feedback/submit

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rating labels for the message field
const RATING_LABELS: Record<string, string> = {
  too_hot: 'Too Hot',
  comfortable: 'Feels Great',
  too_cold: 'Too Cold',
};

// Generate a device fingerprint hash from request data
function generateFingerprint(data: {
  ip: string;
  userAgent: string;
  screenWidth?: number;
  screenHeight?: number;
  language?: string;
}): string {
  const raw = [data.ip, data.userAgent, data.screenWidth, data.screenHeight, data.language]
    .filter(Boolean)
    .join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // --- Validate required fields ---
    const {
      org_id,
      site_id,
      equipment_id,
      space_id,           // null if "General" selected
      hvac_zone_id,
      rating,
      note,
      qr_default_space_id,
      // Device info from client
      screen_width,
      screen_height,
      browser_language,
      referrer,
    } = body;

    if (!org_id || !site_id || !equipment_id || !rating) {
      return NextResponse.json(
        { error: 'Missing required fields: org_id, site_id, equipment_id, rating' },
        { status: 400 }
      );
    }

    if (!['too_hot', 'comfortable', 'too_cold'].includes(rating)) {
      return NextResponse.json(
        { error: 'Invalid rating. Must be: too_hot, comfortable, or too_cold' },
        { status: 400 }
      );
    }

    // Sanitize note
    const sanitizedNote = note ? String(note).trim().slice(0, 500) : null;

    // --- Get request metadata ---
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Parse device info from user agent
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';
    let os = 'unknown';
    if (/iphone|ipad|mac/i.test(userAgent)) os = 'iOS/macOS';
    else if (/android/i.test(userAgent)) os = 'Android';
    else if (/windows/i.test(userAgent)) os = 'Windows';
    else if (/linux/i.test(userAgent)) os = 'Linux';

    let browser = 'unknown';
    if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) browser = 'Chrome';
    else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
    else if (/firefox/i.test(userAgent)) browser = 'Firefox';
    else if (/edge/i.test(userAgent)) browser = 'Edge';

    // --- Device fingerprint for rate limiting ---
    const fingerprint = generateFingerprint({
      ip,
      userAgent,
      screenWidth: screen_width,
      screenHeight: screen_height,
      language: browser_language,
    });

    // --- Rate limit check ---
    // Check if this fingerprint has submitted for this equipment in the last 60 minutes
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recentSubmission } = await supabase
      .from('b_records_log')
      .select('id')
      .eq('event_type', 'comfort_feedback')
      .eq('equipment_id', equipment_id)
      .gte('created_at', oneHourAgo)
      .filter('metadata->>device_fingerprint', 'eq', fingerprint)
      .limit(1);

    if (recentSubmission && recentSubmission.length > 0) {
      return NextResponse.json(
        { error: 'Feedback already submitted recently. Please wait before submitting again.' },
        { status: 429 }
      );
    }

    // --- Silent GPS check (from client, only if already granted) ---
    // latitude/longitude come from client only if permission was pre-granted
    const latitude = body.latitude || null;
    const longitude = body.longitude || null;

    // --- Capture zone scores at time of feedback ---
    // These get snapshotted in metadata for later correlation
    const zoneScores = body.zone_scores || null;

    // --- Build the message (description) ---
    const ratingLabel = RATING_LABELS[rating] || rating;
    const messageParts = [`Comfort Feedback: ${ratingLabel}`];
    if (sanitizedNote) messageParts.push(`— ${sanitizedNote}`);
    const message = messageParts.join(' ');

    // --- Build metadata JSONB ---
    const metadata: Record<string, any> = {
      rating,
      note: sanitizedNote,
      qr_default_space_id: qr_default_space_id || null,
      selected_space_id: space_id || null,
      hvac_zone_id: hvac_zone_id || null,
      device_fingerprint: fingerprint,
      device_type: deviceType,
      os,
      browser,
      browser_language: browser_language || null,
      screen_width: screen_width || null,
      screen_height: screen_height || null,
      referrer: referrer || null,
      user_agent: userAgent,
      ip_geo_lat: latitude,
      ip_geo_lng: longitude,
    };

    // Snapshot zone scores if provided
    if (zoneScores) {
      metadata.zone_scores_at_feedback = zoneScores;
    }

    // --- Get current date/time for event_date and event_time ---
    const now = new Date();
    const eventDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const eventTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // --- Write to b_records_log ---
    const { data: record, error: insertError } = await supabase
      .from('b_records_log')
      .insert({
        org_id,
        site_id,
        equipment_id,
        space_id: space_id || null,       // null if "General" selected
        device_id: null,                   // no device context for public feedback
        event_type: 'comfort_feedback',
        source: 'public_qr',
        message,
        metadata,
        created_by: 'qr_visitor',         // anonymous public user
        created_by_user: null,             // no authenticated user
        event_date: eventDate,
        event_time: eventTime,
        ha_device_id: null,
      })
      .select('id, created_at')
      .single();

    if (insertError) {
      console.error('Failed to insert comfort feedback:', insertError);
      return NextResponse.json(
        { error: 'Failed to save feedback' },
        { status: 500 }
      );
    }

    // --- TODO: Emit alert event for future alert engine ---
    // await emitAlertEvent('comfort_feedback', {
    //   org_id, site_id, equipment_id, space_id, hvac_zone_id,
    //   rating, record_id: record.id
    // });

    return NextResponse.json({
      success: true,
      record_id: record.id,
      created_at: record.created_at,
    });

  } catch (err) {
    console.error('Comfort feedback submit error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
