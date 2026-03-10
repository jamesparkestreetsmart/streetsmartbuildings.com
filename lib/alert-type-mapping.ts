/**
 * Maps a b_alert_definitions row to a canonical alert_type_id from library_alert_types.
 * Returns null if the definition cannot be mapped (override lookup is skipped).
 *
 * Fields read from `def`:
 *   - derived_metric  (b_alert_definitions.derived_metric)
 *   - condition_type   (b_alert_definitions.condition_type)
 *   - anomaly_type     (b_alert_definitions.anomaly_type)
 */
export function mapDefinitionToAlertTypeId(
  def: { derived_metric: string | null; condition_type: string; anomaly_type: string | null }
): string | null {
  // Threshold-based: derived_metric + condition_type
  if (def.derived_metric && def.condition_type) {
    if (def.derived_metric === "temperature" && def.condition_type === "above_threshold") return "high_temperature";
    if (def.derived_metric === "temperature" && def.condition_type === "below_threshold") return "low_temperature";
    if (def.derived_metric === "humidity" && def.condition_type === "above_threshold") return "high_humidity";
  }

  // Anomaly-based: anomaly_type
  if (def.anomaly_type) {
    const anomalyMap: Record<string, string> = {
      short_cycle: "short_cycling",
      long_cycle: "long_cycle",
      delayed_temp_response: "delayed_temp_response",
      idle_heat_gain: "idle_heat_gain",
      sensor_offline: "sensor_offline",
      gateway_offline: "gateway_offline",
    };
    return anomalyMap[def.anomaly_type] ?? null;
  }

  return null;
}
