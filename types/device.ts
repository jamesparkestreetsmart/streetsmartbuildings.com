export interface NewDevice {
  device_name: string;
  serial_number: string;
  protocol: string;
  connection_type: string;
  firmware_version: string;
  ip_address: string;
  site_id: string;
  equipment_id: string;
  status: string;
  smartstart_dsk?: string;
  inclusion_pin?: string;
}

export type PairingStatus = "unpaired" | "pairing" | "paired" | "failed";

export {}; // <-- keep this line
