
export const WAND_GATT = {
  TARGET_NAME: "MCW",
  
  // BLE UUIDs
  SERVICE_UUID: "57420001-587e-48a0-974c-544d6163c577",
  WRITE_UUID: "57420002-587e-48a0-974c-544d6163c577", // Command/VFX Bus
  NOTIFY_UUID: "57420003-587e-48a0-974c-544d6163c577", // Event/Spell Data Bus
  BATTERY_SERVICE_UUID: "0000180f-0000-1000-8000-00805f9b34fb",
  BATTERY_LEVEL_UUID: "00002a19-0000-1000-8000-00805f9b34fb",
  
  // Confirmed Operational Commands (Control Stream)
  KEEPALIVE_INTERVAL: 5000, // ms
  KEEPALIVE_COMMAND: new Uint8Array([0x01]),
  CMD_START_STREAM: new Uint8Array([0x01, 0x02]),
  CMD_STOP_STREAM: new Uint8Array([0x00]),

  // BLE Packet Size limit for chunking commands
  MTU_PAYLOAD_SIZE: 20,
};
