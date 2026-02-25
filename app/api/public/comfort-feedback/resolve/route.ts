import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteSlug = searchParams.get('site');
    const equipmentSlug = searchParams.get('equipment');
    const spaceSlug = searchParams.get('space');

    if (!siteSlug || !equipmentSlug || !spaceSlug) {
      return NextResponse.json(
        { error: 'Missing required parameters: site, equipment, space' },
        { status: 400 }
      );
    }

    const { data: site } = await supabase
      .from('a_sites')
      .select('site_id, site_name, site_slug, org_id, address_line1, city, state, latitude, longitude')
      .eq('site_slug', siteSlug)
      .single();

    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    const { data: org } = await supabase
      .from('a_organizations')
      .select('org_id, org_name, org_identifier')
      .eq('org_id', site.org_id)
      .single();

    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 });

    const { data: equipment } = await supabase
      .from('a_equipments')
      .select('equipment_id, equipment_name, slug, equipment_group, equipment_type_id')
      .eq('site_id', site.site_id)
      .eq('slug', equipmentSlug)
      .single();

    if (!equipment) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

    const { data: zone } = await supabase
      .from('a_hvac_zones')
      .select('hvac_zone_id, name, zone_type, control_scope, is_override, thermostat_device_id')
      .eq('equipment_id', equipment.equipment_id)
      .single();

    let spaces: any[] = [];
    if (zone) {
      const { data: zoneSpaces } = await supabase
        .from('a_spaces')
        .select('space_id, name, slug, space_type, hvac_zone_id, zone_weight')
        .eq('hvac_zone_id', zone.hvac_zone_id)
        .neq('name', 'Unassigned')
        .neq('space_type', 'inventory_storage')
        .order('name');
      spaces = zoneSpaces || [];
    }

    const { data: servedSpaces } = await supabase
      .from('a_equipment_served_spaces')
      .select('space_id, a_spaces!inner(space_id, name, slug, space_type, hvac_zone_id, zone_weight)')
      .eq('equipment_id', equipment.equipment_id);

    if (servedSpaces) {
      const existingIds = new Set(spaces.map((s: any) => s.space_id));
      for (const ss of servedSpaces) {
        const sp = (ss as any).a_spaces;
        if (sp && !existingIds.has(sp.space_id) && sp.name !== 'Unassigned' && sp.space_type !== 'inventory_storage') {
          spaces.push(sp);
        }
      }
    }

    const defaultSpace = spaces.find((s: any) => s.slug === spaceSlug) || null;

    let zoneSnapshot = null;
    if (zone) {
      const { data: latestLog } = await supabase
        .from('b_zone_setpoint_log')
        .select(`
          recorded_at, phase,
          profile_heat_f, profile_cool_f,
          active_heat_f, active_cool_f,
          feels_like_adj, occupancy_adj, manager_adj, smart_start_adj,
          zone_temp_f, zone_humidity, feels_like_temp_f,
          hvac_action, fan_mode,
          supply_temp_f, return_temp_f, delta_t, power_kw, comp_on,
          occupied_sensor_count
        `)
        .eq('hvac_zone_id', zone.hvac_zone_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();

      zoneSnapshot = latestLog || null;
    }

    let tempSource = 'Thermostat';
    if (spaces.length > 0) {
      const spaceIds = spaces.map((s: any) => s.space_id);
      const { data: sensors } = await supabase
        .from('a_space_sensors')
        .select('space_id')
        .eq('site_id', site.site_id)
        .eq('sensor_type', 'temperature')
        .in('space_id', spaceIds)
        .not('entity_id', 'is', null)
        .limit(1);

      if (sensors && sensors.length > 0) tempSource = 'Zone Avg';
    }

    let smartStartEnabled = false;
    if (zone?.thermostat_device_id) {
      const { data: dev } = await supabase
        .from('a_devices')
        .select('smart_start_enabled')
        .eq('device_id', zone.thermostat_device_id)
        .single();
      smartStartEnabled = dev?.smart_start_enabled || false;
    }

    return NextResponse.json({
      organization: {
        org_id: org.org_id,
        org_name: org.org_name,
        org_identifier: org.org_identifier,
      },
      site: {
        site_id: site.site_id,
        site_name: site.site_name,
        site_slug: site.site_slug,
        address: [site.address_line1, site.city, site.state].filter(Boolean).join(', '),
        latitude: site.latitude,
        longitude: site.longitude,
      },
      equipment: {
        equipment_id: equipment.equipment_id,
        equipment_name: equipment.equipment_name,
        slug: equipment.slug,
        equipment_group: equipment.equipment_group,
        equipment_type_id: equipment.equipment_type_id,
      },
      zone: zone ? {
        hvac_zone_id: zone.hvac_zone_id,
        name: zone.name,
        zone_type: zone.zone_type,
        control_scope: zone.control_scope,
        is_override: zone.is_override,
        smart_start_enabled: smartStartEnabled,
      } : null,
      zone_snapshot: zoneSnapshot,
      temp_source: tempSource,
      spaces,
      default_space: defaultSpace,
      qr_space_slug: spaceSlug,
    });

  } catch (err) {
    console.error('Comfort feedback resolve error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
