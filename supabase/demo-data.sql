-- ============================================================
-- Demo Sites: Equipment, Spaces, HVAC Zones
-- Run after demo sites exist in a_sites.
-- ============================================================

-- Gather demo site info into a temp table for reference
DO $$
DECLARE
  v_org_id uuid;
  v_site record;
  v_eq_id uuid;
  v_space_id uuid;
BEGIN

-- Get org_id from the first demo site
SELECT org_id INTO v_org_id FROM a_sites WHERE site_name LIKE 'Demo%' LIMIT 1;
IF v_org_id IS NULL THEN
  RAISE EXCEPTION 'No demo sites found. Create demo sites in a_sites first.';
END IF;

-- ============================================================
-- HELPER: For each demo site, insert equipment + spaces + zones
-- ============================================================

FOR v_site IN
  SELECT site_id, site_name
  FROM a_sites
  WHERE site_name LIKE 'Demo%'
  ORDER BY site_name
LOOP

  RAISE NOTICE 'Populating: %', v_site.site_name;

  -- ──────────────────────────────────────────────────────────
  -- Quick Service Restaurant (Wendy's pattern)
  -- ──────────────────────────────────────────────────────────
  IF v_site.site_name ILIKE '%wendy%' OR v_site.site_name ILIKE '%qsr%' OR v_site.site_name ILIKE '%quick service%' THEN

    -- Equipment
    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Dining HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Kitchen HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Walk-in Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Walk-in Freezer', 'Refrigeration', 'active'),
      (v_site.site_id, 'Reach-in Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Interior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Drive-Thru Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Kitchen Sink', 'Plumbing', 'active'),
      (v_site.site_id, 'Restroom Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Mop Sink', 'Plumbing', 'active'),
      (v_site.site_id, 'Fryer', 'Kitchen', 'active'),
      (v_site.site_id, 'Grill', 'Kitchen', 'active');

    -- Spaces
    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Dining Room', 'customer'),
      (v_site.site_id, 'Kitchen', 'employee'),
      (v_site.site_id, 'Drive-Thru', 'customer'),
      (v_site.site_id, 'Walk-in Area', 'storage'),
      (v_site.site_id, 'Office', 'employee'),
      (v_site.site_id, 'Restroom', 'customer');

    -- HVAC Zones
    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Dining HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Dining Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Kitchen HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Kitchen Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Full Service Restaurant (Texas Roadhouse pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%roadhouse%' OR v_site.site_name ILIKE '%full service%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Dining HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Bar HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Kitchen HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Walk-in Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Walk-in Freezer', 'Refrigeration', 'active'),
      (v_site.site_id, 'Prep Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Dessert Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Dining Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Bar Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Kitchen Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Kitchen Sink', 'Plumbing', 'active'),
      (v_site.site_id, 'Bar Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Restroom Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Mop Sink', 'Plumbing', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Dining Room', 'customer'),
      (v_site.site_id, 'Bar Area', 'customer'),
      (v_site.site_id, 'Kitchen', 'employee'),
      (v_site.site_id, 'Walk-in Area', 'storage'),
      (v_site.site_id, 'Office', 'employee'),
      (v_site.site_id, 'Restroom', 'customer'),
      (v_site.site_id, 'Patio', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Dining HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Dining Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Bar HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Bar Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Kitchen HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Kitchen Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Grocery (Kroger pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%kroger%' OR v_site.site_name ILIKE '%grocery%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Sales Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Bakery HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Deli HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Back of House HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Produce Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Dairy Case', 'Refrigeration', 'active'),
      (v_site.site_id, 'Meat Case', 'Refrigeration', 'active'),
      (v_site.site_id, 'Frozen Section', 'Refrigeration', 'active'),
      (v_site.site_id, 'Beer Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Pharmacy Fridge', 'Refrigeration', 'active'),
      (v_site.site_id, 'Sales Floor Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Bakery Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Deli Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Lot Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Back of House Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Signage', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Sales Floor', 'customer'),
      (v_site.site_id, 'Bakery', 'employee'),
      (v_site.site_id, 'Deli', 'employee'),
      (v_site.site_id, 'Meat Department', 'employee'),
      (v_site.site_id, 'Dairy Department', 'customer'),
      (v_site.site_id, 'Back of House', 'employee'),
      (v_site.site_id, 'Office', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Sales Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Sales Floor Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Bakery HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Bakery Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Deli HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Deli Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Back of House HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Back of House Zone', v_eq_id, 'storage', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Hospitality / Hotel (Hilton pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%hilton%' OR v_site.site_name ILIKE '%hotel%' OR v_site.site_name ILIKE '%hospitality%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Lobby HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Conference HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Lobby Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Conference Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Garage Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Lobby Restroom', 'Plumbing', 'active'),
      (v_site.site_id, 'Kitchen Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Pool Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Fitness Center Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Laundry Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Boiler Room Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Central Boiler', 'HVAC', 'active'),
      (v_site.site_id, 'Central Chiller', 'HVAC', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Lobby', 'customer'),
      (v_site.site_id, 'Conference Room A', 'customer'),
      (v_site.site_id, 'Conference Room B', 'customer'),
      (v_site.site_id, 'Restaurant', 'customer'),
      (v_site.site_id, 'Pool Area', 'customer'),
      (v_site.site_id, 'Fitness Center', 'customer'),
      (v_site.site_id, 'Back of House', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Lobby HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Lobby Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Conference HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Conference Zone', v_eq_id, 'customer', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Healthcare (HCA pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%hca%' OR v_site.site_name ILIKE '%tristar%' OR v_site.site_name ILIKE '%healthcare%' OR v_site.site_name ILIKE '%hospital%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'ER HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Surgery HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Patient Rooms HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Admin HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Pharmacy Refrigerator', 'Refrigeration', 'active'),
      (v_site.site_id, 'Lab Refrigerator', 'Refrigeration', 'active'),
      (v_site.site_id, 'Blood Bank Refrigerator', 'Refrigeration', 'active'),
      (v_site.site_id, 'Kitchen Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'ER Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Surgery Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Patient Wing Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Admin Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Hallway Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Garage Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Emergency Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Emergency Room', 'customer'),
      (v_site.site_id, 'Surgery Suite', 'employee'),
      (v_site.site_id, 'Patient Wing A', 'customer'),
      (v_site.site_id, 'Patient Wing B', 'customer'),
      (v_site.site_id, 'Admin Office', 'employee'),
      (v_site.site_id, 'Pharmacy', 'employee'),
      (v_site.site_id, 'Lab', 'employee'),
      (v_site.site_id, 'Cafeteria', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'ER HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'ER Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Surgery HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Surgery Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Patient Rooms HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Patient Rooms Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Admin HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Admin Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Retail (AutoZone pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%autozone%' OR v_site.site_name ILIKE '%retail%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Sales Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Stockroom HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Display Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Sales Floor Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Sales Floor', 'customer'),
      (v_site.site_id, 'Stockroom', 'storage'),
      (v_site.site_id, 'Office', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Sales Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Sales Floor Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Stockroom HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Stockroom Zone', v_eq_id, 'storage', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Convenience Store (Buc-ee's pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%buc%' OR v_site.site_name ILIKE '%convenience%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Sales Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Kitchen HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Walk-in Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Beverage Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Ice Cream Freezer', 'Refrigeration', 'active'),
      (v_site.site_id, 'Deli Case', 'Refrigeration', 'active'),
      (v_site.site_id, 'Interior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Fuel Canopy Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Sales Floor', 'customer'),
      (v_site.site_id, 'Kitchen/Deli', 'employee'),
      (v_site.site_id, 'Walk-in Area', 'storage'),
      (v_site.site_id, 'Restroom', 'customer'),
      (v_site.site_id, 'Office', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Sales Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Sales Floor Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Kitchen HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Kitchen Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Fast Casual (Chipotle pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%chipotle%' OR v_site.site_name ILIKE '%fast casual%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Dining HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Kitchen HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Walk-in Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Prep Cooler', 'Refrigeration', 'active'),
      (v_site.site_id, 'Interior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Kitchen Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Restroom Plumbing', 'Plumbing', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Dining Room', 'customer'),
      (v_site.site_id, 'Kitchen', 'employee'),
      (v_site.site_id, 'Walk-in Area', 'storage'),
      (v_site.site_id, 'Restroom', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Dining HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Dining Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Kitchen HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Kitchen Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Fitness (Planet Fitness pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%planet%' OR v_site.site_name ILIKE '%fitness%' OR v_site.site_name ILIKE '%gym%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Gym Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Locker Room HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Office HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Gym Floor Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Locker Room Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Lot Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Men Locker Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Women Locker Plumbing', 'Plumbing', 'active'),
      (v_site.site_id, 'Men Showers', 'Plumbing', 'active'),
      (v_site.site_id, 'Women Showers', 'Plumbing', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Gym Floor', 'customer'),
      (v_site.site_id, 'Men Locker Room', 'customer'),
      (v_site.site_id, 'Women Locker Room', 'customer'),
      (v_site.site_id, 'Office', 'employee'),
      (v_site.site_id, 'Lobby', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Gym Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Gym Floor Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Locker Room HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Locker Room Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Office HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Office Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Education (Vanderbilt pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%vanderbilt%' OR v_site.site_name ILIKE '%education%' OR v_site.site_name ILIKE '%university%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Lecture Hall HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Lab HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Office HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Common Area HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Lecture Hall Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Lab Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Office Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Common Area Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Lot Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Lab Refrigerator A', 'Refrigeration', 'active'),
      (v_site.site_id, 'Lab Refrigerator B', 'Refrigeration', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Lecture Hall', 'customer'),
      (v_site.site_id, 'Lab A', 'employee'),
      (v_site.site_id, 'Lab B', 'employee'),
      (v_site.site_id, 'Faculty Office', 'employee'),
      (v_site.site_id, 'Common Area', 'customer'),
      (v_site.site_id, 'Library', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Lecture Hall HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Lecture Hall Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Lab HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Lab Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Office HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Office Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Common Area HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Common Area Zone', v_eq_id, 'customer', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Industrial (Precision Stamping pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%precision%' OR v_site.site_name ILIKE '%stamping%' OR v_site.site_name ILIKE '%industrial%' OR v_site.site_name ILIKE '%manufactur%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Production Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Office HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Production Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Office Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Compressed Air System', 'Other', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Production Floor', 'employee'),
      (v_site.site_id, 'Office', 'employee'),
      (v_site.site_id, 'Shipping/Receiving', 'storage'),
      (v_site.site_id, 'Break Room', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Production Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Production Zone', v_eq_id, 'employee', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Office HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Office Zone', v_eq_id, 'employee', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Office (WeWork pattern)
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%wework%' OR v_site.site_name ILIKE '%office%' OR v_site.site_name ILIKE '%cowork%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Open Floor HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Conference Rooms HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Server Room HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Open Floor Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Conference Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Lobby Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Open Floor', 'customer'),
      (v_site.site_id, 'Conference Room A', 'customer'),
      (v_site.site_id, 'Conference Room B', 'customer'),
      (v_site.site_id, 'Server Room', 'storage'),
      (v_site.site_id, 'Kitchen/Break Room', 'employee'),
      (v_site.site_id, 'Lobby', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Open Floor HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Open Floor Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Conference Rooms HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Conference Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Server Room HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Server Room Zone', v_eq_id, 'storage', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Church / Worship
  -- ──────────────────────────────────────────────────────────
  ELSIF v_site.site_name ILIKE '%church%' OR v_site.site_name ILIKE '%worship%' OR v_site.site_name ILIKE '%sanctuary%' THEN

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Sanctuary HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Fellowship Hall HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Sanctuary Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Fellowship Hall Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Parking Lot Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Sanctuary', 'customer'),
      (v_site.site_id, 'Fellowship Hall', 'customer'),
      (v_site.site_id, 'Kitchen', 'employee'),
      (v_site.site_id, 'Office', 'employee'),
      (v_site.site_id, 'Nursery', 'customer');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Sanctuary HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Sanctuary Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Fellowship Hall HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Fellowship Hall Zone', v_eq_id, 'customer', 'open');

  -- ──────────────────────────────────────────────────────────
  -- Fallback: Generic site (2 HVAC + 2 Lighting)
  -- ──────────────────────────────────────────────────────────
  ELSE
    RAISE NOTICE 'Using generic template for: %', v_site.site_name;

    INSERT INTO a_equipments (site_id, equipment_name, equipment_group, status) VALUES
      (v_site.site_id, 'Main HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Secondary HVAC', 'HVAC', 'active'),
      (v_site.site_id, 'Interior Lighting', 'Lighting', 'active'),
      (v_site.site_id, 'Exterior Lighting', 'Lighting', 'active');

    INSERT INTO a_spaces (site_id, name, space_type) VALUES
      (v_site.site_id, 'Main Area', 'customer'),
      (v_site.site_id, 'Back of House', 'employee'),
      (v_site.site_id, 'Office', 'employee');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Main HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Main Zone', v_eq_id, 'customer', 'open');

    SELECT equipment_id INTO v_eq_id FROM a_equipments WHERE site_id = v_site.site_id AND equipment_name = 'Secondary HVAC';
    INSERT INTO a_hvac_zones (site_id, org_id, name, equipment_id, zone_type, control_scope)
    VALUES (v_site.site_id, v_org_id, 'Secondary Zone', v_eq_id, 'employee', 'open');

  END IF;

END LOOP;

RAISE NOTICE 'Done populating demo sites.';
END $$;
