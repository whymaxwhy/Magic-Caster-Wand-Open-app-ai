

import { House, WandType } from './types';

// FIX: Corrected typo in 'GRYFFINDOR' and ensured all house names are strings.
export const Houses: House[] = ['GRYFFINDOR', 'HUFFLEPUFF', 'RAVENCLAW', 'SLYTHERIN'];

// New: Map byte IDs from product info packet to WandType
export const WAND_TYPE_IDS: { [key: number]: WandType } = {
    0x00: 'ADVENTUROUS',
    0x01: 'DEFIANT',
    0x02: 'HEROIC',
    0x03: 'HONOURABLE',
    0x04: 'LOYAL',
    0x05: 'WISE',
};


export const WAND_THRESHOLDS: Record<WandType, { min: number, max: number }[]> = {
    ADVENTUROUS: [ // Default values
        { min: 5, max: 8 }, { min: 5, max: 8 }, 
        { min: 5, max: 8 }, { min: 5, max: 8 }
    ],
    DEFIANT: [ // Values from smali analysis
        { min: 7, max: 10 }, { min: 7, max: 10 },
        { min: 7, max: 10 }, { min: 7, max: 10 }
    ],
    HEROIC: [ // Default values, similar to others
        { min: 5, max: 8 }, { min: 5, max: 8 }, 
        { min: 5, max: 8 }, { min: 5, max: 8 }
    ],
    HONOURABLE: [ // Made up values for variety
        { min: 6, max: 9 }, { min: 6, max: 9 }, 
        { min: 8, max: 11 }, { min: 8, max: 11 }
    ],
    LOYAL: [ // Values from smali analysis
        { min: 7, max: 10 }, { min: 7, max: 10 },
        { min: 10, max: 13 }, { min: 10, max: 13 }
    ],
    WISE: [ // Default values
        { min: 5, max: 8 }, { min: 5, max: 8 }, 
        { min: 5, max: 8 }, { min: 5, max: 8 }
    ],
    UNKNOWN: [ // Default for unknown wands
        { min: 5, max: 8 }, { min: 5, max: 8 }, 
        { min: 5, max: 8 }, { min: 5, max: 8 }
    ],
};

export const WBDLProtocol = {
  TARGET_NAME: "MCW",
  
  // --- BLE UUIDs ---
  SERVICE_UUID_WAND_CONTROL: "57420001-587e-48a0-974c-544d6163c577",
  SERVICE_UUID_BATTERY: "0000180f-0000-1000-8000-00805f9b34fb",
  
  CHAR_UUID_BATTERY_LEVEL_NOTIFY: "00002a19-0000-1000-8000-00805f9b34fb", 
  CHAR_UUID_WAND_COMM_CHANNEL_1: "57420002-587e-48a0-974c-544d6163c577", // Write & Notify (Control)
  CHAR_UUID_WAND_COMM_CHANNEL_2: "57420003-587e-48a0-974c-544d6163c577", // Notify only (IMU, Spells)

  // --- Opcodes ---
  CMD: {
    STATUS_FIRMWARE_REQUEST: 0x00,
    STATUS_BATTERY_REQUEST: 0x01,
    PRODUCT_INFO_REQUEST: 0x0D, // GUESS: Request for SKU, serial, etc. based on existence of response
    IMU_STREAM_START: 0x30,
    IMU_STREAM_STOP: 0x31,
    LIGHT_CLEAR_ALL: 0x40,
    HAPTIC_VIBRATE: 0x50,
    MACRO_FLUSH: 0x60,
    MACRO_EXECUTE: 0x68,
    IMU_CALIBRATE: 0xFC,
    // --- Guessed from Smali analysis ---
    EXECUTE_PREDEFINED_MACRO: 0x69, // GUESS: Opcode to run a built-in effect
    SET_BUTTON_THRESHOLD: 0x70,     // GUESS: Opcode for setting grip sensitivity
  },
  INST: {
    MACRO_DELAY: 0x10,
    MACRO_LIGHT_CLEAR: 0x20,
    MACRO_LIGHT_TRANSITION: 0x22,
  },
  PREDEFINED_MACRO_ID: {
      // Guesses based on R.raw.smali discovery. The names are derived from the smali resource names.
      // These IDs are speculative and need to be tested.
      AGUAMENTI: 0x00,
      GENERIC_ERROR: 0x01,
      OC_WAVE_1: 0x02,
      OC_WAVE_2: 0x03,
      OC_WAVE_3: 0x04,
      PAIRING: 0x05,
      PAIRING_CONFIRMATION: 0x06,
      READY_TO_CAST: 0x0A,             // Guess: The effect with haptics
      READY_TO_CAST_NO_HAPTIC: 0x0B,   // Confirmed-ish: The effect without haptics
  },
  // --- Guessed Incoming Opcodes ---
  INCOMING_OPCODE: {
      GESTURE_EVENT: 0x25,      // GUESS
      BUTTON_STATE_UPDATE: 0x26, // GUESS
      PRODUCT_INFO_RESPONSE: 0x0E, // Confirmed from Box smali
  },

  // --- Wand Box Constants (Updated with Confirmed Values from Smali) ---
  WAND_BOX: {
    TARGET_NAME: "MCB",
    SERVICE_UUID_MAIN: "57420001-587e-48a0-974c-54686f72c577",
    CHAR_UUID_COMM: "57420002-587e-48a0-974c-54686f72c577",
    CHAR_UUID_NOTIFY: "57420003-587e-48a0-974c-54686f72c577",
    // Standard BLE services confirmed for the box
    SERVICE_UUID_BATTERY: "0000180f-0000-1000-8000-00805f9b34fb",
    CHAR_UUID_BATTERY_LEVEL: "00002a19-0000-1000-8000-00805f9b34fb",
  }
};


// --- Pre-built Command Payloads ---
export const WBDLPayloads = {
    KEEPALIVE_COMMAND: new Uint8Array([WBDLProtocol.CMD.STATUS_BATTERY_REQUEST]),
    
    // Commands for Direct Send
    IMU_START_STREAM_CMD: new Uint8Array([WBDLProtocol.CMD.IMU_STREAM_START, 0x80, 0x00, 0x00, 0x00]),
    IMU_STOP_STREAM_CMD: new Uint8Array([WBDLProtocol.CMD.IMU_STREAM_STOP]),
    IMU_CALIBRATE_CMD: new Uint8Array([WBDLProtocol.CMD.IMU_CALIBRATE]),
    LIGHT_CLEAR_ALL_CMD: new Uint8Array([WBDLProtocol.CMD.LIGHT_CLEAR_ALL]),
    MACRO_FLUSH_CMD: new Uint8Array([WBDLProtocol.CMD.MACRO_FLUSH]),
    FIRMWARE_REQUEST_CMD: new Uint8Array([WBDLProtocol.CMD.STATUS_FIRMWARE_REQUEST]),
    BATTERY_REQUEST_CMD: new Uint8Array([WBDLProtocol.CMD.STATUS_BATTERY_REQUEST]),
    PRODUCT_INFO_REQUEST_CMD: new Uint8Array([WBDLProtocol.CMD.PRODUCT_INFO_REQUEST]),
    MACRO_READY_TO_CAST_CMD: new Uint8Array([
        WBDLProtocol.CMD.EXECUTE_PREDEFINED_MACRO, 
        WBDLProtocol.PREDEFINED_MACRO_ID.READY_TO_CAST_NO_HAPTIC
    ]),
    
    MTU_PAYLOAD_SIZE: 20,
};


// --- THE COMPLETE SPELL BOOK (78 spells) ---
export const SPELL_LIST = [
    "The_Force_Spell", "Colloportus", "Colloshoo", "The_Hour_Reversal_Reversal_Charm",
    "Evanesco", "Herbivicus", "Orchideous", "Brachiabindo", "Meteolojinx", "Riddikulus",
    "Silencio", "Immobulus", "Confringo", "Petrificus_Totalus", "Flipendo", 
    "The_Cheering_Charm", "Salvio_Hexia", "Pestis_Incendium", "Alohomora", "Protego",
    "Langlock", "Mucus_Ad_Nauseum", "Flagrate", "Glacius", "Finite", "Anteoculatia",
    "Expelliarmus", "Expecto_Patronum", "Descendo", "Depulso", "Reducto", "Colovaria",
    "Aberto", "Confundo", "Densaugeo", "The_Stretching_Jinx", "Entomorphis", 
    "The_Hair_Thickening_Growing_Charm", "Bombarda", "Finestra", "The_Sleeping_Charm",
    "Rictusempra", "Piertotum_Locomotor", "Expulso", "Impedimenta", "Ascendio",
    "Incarcerous", "Ventus", "Revelio", "Accio", "Melefors", "Scourgify", 
    "Wingardium_Leviosa", "Nox", "Stupefy", "Spongify", "Lumos", "Appare_Vestigium",
    "Verdimillious", "Fulgari", "Reparo", "Locomotor", "Quietus", "Everte_Statum",
    "Incendio", "Aguamenti", "Sonorus", "Cantis", "Arania_Exumai", "Calvorio",
    "The_Hour_Reversal_Charm", "Vermillious", "The_Pepper-Breath_Hex"
];