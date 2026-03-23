# Anomaly Detail Page — V1 Implementation Notes

## What is fully wired in V1

- **9 anomaly definitions** in `lib/anomalies/anomaly-definitions.ts` with complete copy, napkin math, and next steps
- **Storage key mapping**: `resolveAnomalyDefinition()` maps both threshold config keys (e.g. `coil_freeze_temp_f`) and event type keys (e.g. `coil_freeze`) to canonical route keys
- **Threshold data**: Read from `a_hvac_zones.anomaly_thresholds` JSONB for the first managed zone at the site
- **Event history**: Queries `b_anomaly_events` for most recent event matching the anomaly type + site
- **Clickthrough links**: Anomaly names in the threshold panel are now `<Link>` elements pointing to `/sites/[siteId]/anomalies/[key]`
- **All 7 page sections render**: Header, Summary Cards, Math Card, Trend (placeholder), Why It Matters, Next Steps, Technical Accordion

## What is placeholder / fallback

| Area | Location | Status |
|------|----------|--------|
| **Trend chart** | `components/anomalies/AnomalyTrendSection.tsx` | Placeholder with range selector and series labels. Needs real telemetry query. |
| **Observed value** | `lib/anomalies/get-anomaly-detail-view-model.ts` | Falls back to `isPlaceholder: true` when no `b_anomaly_events` match exists. UI shows "No recent event" badge. |
| **Min Efficiency Ratio formula** | `lib/anomalies/anomaly-definitions.ts` | napkinMath contains "TBD" placeholder. technicalNotes states formula is pending. |
| **Historical status** | `get-anomaly-detail-view-model.ts` | V1 only distinguishes active/cleared/unknown. No "historical" state logic yet. |
| **Equipment context** | `get-anomaly-detail-view-model.ts` | Equipment name is fetched if `equipmentId` query param is provided, but the threshold panel doesn't pass it yet. |

## Obvious V2 enhancements

1. **Real trend chart**: Wire `AnomalyTrendSection` to telemetry queries (b_thermostat_state or similar) using the `chartConfig.series` list
2. **Alert drillthrough**: Use `alertId` query param to show specific alert context, not just the most recent event
3. **Per-equipment detail**: Pass equipmentId from zone/equipment context for equipment-specific anomaly views
4. **Multi-zone comparison**: Show anomaly status across all zones at a site, not just the first managed zone
5. **Threshold editing from detail page**: Allow adjusting the threshold directly from the anomaly detail page
6. **Event timeline**: Show historical trigger/clear events as a timeline below the trend chart

## Anomaly definitions needing formula review

- **min-efficiency-ratio**: Formula pending backend finalization. napkinMath is a placeholder.
- **compressor-current-threshold**: Not a fault condition — it's a detection gate. Copy clarifies this but may need product review.

## Key mapping reference

| Canonical Route Key | Threshold Config Key | Event Type Key |
|---|---|---|
| coil-freeze | coil_freeze_temp_f | coil_freeze |
| delayed-response | delayed_response_min | delayed_temp_response |
| idle-heat-gain | idle_heat_gain_f | idle_heat_gain |
| long-cycle-duration | long_cycle_min | long_cycle |
| short-cycle-count | short_cycle_count_1h | short_cycling |
| filter-restriction-dt | filter_restriction_delta_t_max | filter_restriction |
| refrigerant-low-dt | refrigerant_low_delta_t_min | refrigerant_low |
| min-efficiency-ratio | efficiency_ratio_min_pct | low_efficiency |
| compressor-current-threshold | compressor_current_threshold_a | compressor_current |
