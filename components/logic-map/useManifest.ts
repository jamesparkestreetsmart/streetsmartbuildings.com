"use client";

import { useEffect, useState, useCallback } from "react";

export interface SunTimesData {
  sunrise: number | null;
  sunset: number | null;
  civil_dawn: number | null;
  civil_dusk: number | null;
}

export interface SiteConfigData {
  default_lux_sensitivity: number;
  employee_pre_open_minutes: number;
  customer_pre_open_minutes: number;
  post_close_minutes: number;
  lat: number;
  lng: number;
}

export interface WeatherSnapshot {
  temperature: number;
  feels_like: number;
  humidity: number;
  cloud_cover: number;
  condition: string;
  lux_estimate: number;
  sun_elevation: number;
  wind_speed: number;
  recorded_at: string;
}

export interface SmartStartCalcData {
  indoor_temp: number;
  outdoor_temp: number | null;
  indoor_humidity: number | null;
  feels_like_indoor: number | null;
  occupied_heat_setpoint: number;
  occupied_cool_setpoint: number;
  target_temp: number;
  target_mode: "heat" | "cool";
  delta_needed: number;
  avg_ramp_rate: number | null;
  current_trend: number | null;
  rate_used: number;
  rate_source: "historical" | "current" | "default";
  humidity_feels_offset: number;
  humidity_time_adjustment: number;
  zone_occupancy_status: string | null;
  zone_no_motion_minutes: number | null;
  occupancy_override: boolean;
  base_lead_minutes: number;
  adjusted_lead_minutes: number;
  final_offset_minutes: number;
  start_time_minutes: number;
  confidence: "low" | "medium" | "high";
}

export interface ManifestData {
  date: string;
  store_hours: {
    open: string | null;
    close: string | null;
    is_closed: boolean;
  };
  thermostats: ThermostatEntry[];
  equipment: EquipmentEntry[];
  sun_times?: SunTimesData;
  site_config?: SiteConfigData;
  weather?: WeatherSnapshot;
  interior_lighting?: EquipmentEntry[];
  exterior_lighting?: EquipmentEntry[];
  generated_at: string;
  push_status: string;
  pushed_at: string;
}

export interface ThermostatEntry {
  entity_id: string;
  device_name: string;
  zone_name: string;
  zone_type: string;
  hvac_zone_id?: string | null;
  smart_start_enabled: boolean;
  smart_start_offset_minutes: number;
  smart_start_calc?: SmartStartCalcData;
  schedule: { on_time: string; off_time: string };
  occupied: {
    heat_setpoint: number;
    cool_setpoint: number;
    mode: string;
    fan: string;
  };
  unoccupied: {
    heat_setpoint: number;
    cool_setpoint: number;
    mode: string;
    fan: string;
  };
  guardrails?: {
    min_f: number;
    max_f: number;
  };
  manager_override?: {
    offset_up_f: number;
    offset_down_f: number;
    reset_minutes: number;
  };
}

export interface EquipmentEntry {
  equipment_id: string;
  name: string;
  group: string;
  zone_type: string | null;
  entity_id: string | null;
  on_time: string | null;
  off_time: string | null;
  action_on: string;
  action_off: string;
  schedule_source: string;
  schedule_category?: string;
  lux_sensitivity?: number | null;
  on_offset_minutes?: number | null;
  off_offset_minutes?: number | null;
  // Dual exterior windows
  morning_on_time?: string | null;
  morning_on_condition?: string;
  morning_off_time?: string | null;
  morning_off_trigger?: string;
  evening_on_time?: string | null;
  evening_on_trigger?: string;
  evening_off_time?: string | null;
}

export function useManifest(siteId: string, date?: string) {
  const [data, setData] = useState<ManifestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchManifest = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ site_id: siteId });
      if (date) params.set("date", date);

      const res = await fetch(`/api/store-hours/manifest?${params}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();

      if (!json.manifest) {
        setData(null);
        setError(null);
      } else {
        setData({
          date: json.date,
          store_hours: json.store_hours || json.manifest.store_hours,
          thermostats: json.manifest.thermostats || [],
          equipment: json.manifest.equipment || [],
          sun_times: json.manifest.sun_times || undefined,
          site_config: json.manifest.site_config || undefined,
          weather: json.manifest.weather || undefined,
          interior_lighting: json.manifest.interior_lighting || undefined,
          exterior_lighting: json.manifest.exterior_lighting || undefined,
          generated_at: json.manifest.generated_at,
          push_status: json.push_status,
          pushed_at: json.pushed_at,
        });
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [siteId, date]);

  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  return { data, loading, error, refetch: fetchManifest };
}
