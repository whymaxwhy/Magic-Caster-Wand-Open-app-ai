// Fix: Moved Web Bluetooth API types here to make them globally available.
// Add minimal type definitions for Web Bluetooth API to resolve TypeScript errors.
// This is a workaround for the environment not having these types available.
// In a real project, this would be handled by including `@types/web-bluetooth`
// or adding "web-bluetooth" to the "lib" array in tsconfig.json.
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
    };
  }

  interface BluetoothDevice extends EventTarget {
    // FIX: Add missing 'id' property to BluetoothDevice interface.
    readonly id: string;
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    // Fix: Added missing 'device' property.
    readonly device: BluetoothDevice;
    readonly connected: boolean;
    // New: Add experimental `mtu` property for negotiation.
    readonly mtu?: number;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
    getPrimaryServices(service?: string): Promise<BluetoothRemoteGATTService[]>;
  }

  interface BluetoothRemoteGATTService {
    // FIX: Add missing 'uuid' property to BluetoothRemoteGATTService interface.
    readonly uuid: string;
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
    getCharacteristics(characteristic?: string): Promise<BluetoothRemoteGATTCharacteristic[]>;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    // FIX: Add missing 'uuid' property to BluetoothRemoteGATTCharacteristic interface.
    readonly uuid: string;
    readonly value?: DataView;
    readonly properties: BluetoothCharacteristicProperties;
    readValue(): Promise<DataView>;
    writeValueWithResponse(value: BufferSource): Promise<void>;
    writeValueWithoutResponse(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  
  interface BluetoothCharacteristicProperties {
    readonly broadcast: boolean;
    readonly read: boolean;
    readonly writeWithoutResponse: boolean;
    readonly write: boolean;
    readonly notify: boolean;
    readonly indicate: boolean;
    readonly authenticatedSignedWrites: boolean;
    readonly reliableWrite: boolean;
    readonly writableAuxiliaries: boolean;
  }

  interface RequestDeviceOptions {
    filters?: any[];
    optionalServices?: string[];
    acceptAllDevices?: boolean;
  }
}


export type LogType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'DATA_IN' | 'DATA_OUT';

export interface LogEntry {
  id: number;
  timestamp: string;
  type: LogType;
  message: string;
}

export interface BleEvent {
  id: number;
  timestamp: string;
  event: string;
  detail: string;
}

export type VfxCommandType = 'LightClear' | 'HapticBuzz' | 'LightTransition' | 'MacroDelay' | 'LoopStart' | 'LoopEnd';

export type GestureState = 'Idle' | 'Casting' | 'Processing';

export type DeviceType = 'wand' | 'box';

export type WandDeviceType = 'WAND' | 'BOX' | 'UNKNOWN';

// New: ConnectionState enum based on confirmed WandBoxHelper$Companion$WandBoxConnectionState.smali
export enum ConnectionState {
  DISCONNECTED = 'Disconnected',
  CONNECTING = 'Connecting',
  CONNECTED = 'Connected',
  ERROR = 'Error',
}

export const WandTypes = ['ADVENTUROUS', 'DEFIANT', 'HEROIC', 'HONOURABLE', 'LOYAL', 'WISE', 'UNKNOWN'] as const;
export type WandType = (typeof WandTypes)[number];

export type House = 'GRYFFINDOR' | 'HUFFLEPUFF' | 'RAVENCLAW' | 'SLYTHERIN';

export interface WandDevice {
    // Core BLE properties, always available after initial connection
    device: BluetoothDevice;
    deviceType: WandDeviceType;
    address: string;
    bleName: string;

    // Discovered properties, populated as data is received
    wandType: WandType;
    companionAddress: string | null;
    version: number | null;
    firmware: string | null;
    serialNumber: number | null;
    editionNumber: number | null;
    sku: string | null;
    mfgId: string | null;
    deviceID: string | null;
    edition: string | null;
    deco: string | null;
}

export interface VfxCommand {
  id: number;
  type: VfxCommandType;
  params: {
    duration_ms?: number;    // For HapticBuzz and MacroDelay
    hex_color?: string;      // For LightTransition
    mode?: number;           // For LightTransition
    transition_ms?: number;  // For LightTransition
    loops?: number;          // For LoopEnd
  };
}

export interface Spell {
  name: string;
  firstSeen: string;
}

export interface IMUVector {
    x: number;
    y: number;
    z: number;
}

export interface IMUReading {
    chunk_index: number;
    acceleration: IMUVector;
    gyroscope: IMUVector;
}

export interface SpellUse {
  id: string;
  name: string;
  icon: string;
}

export interface MacroCommand {
  command: string;
  color?: string;
  duration?: number;
  group?: number;
  loops?: number;
}


export interface SpellDetails {
  spell_name: string;
  incantation_name: string;
  description: string;
  spell_type: string;
  difficulty: number;
  spell_background_color: string;
  spell_uses: SpellUse[];
  config_wand?: {
    macros_payoff?: MacroCommand[][];
  };
  config_wandbox?: {
    macros_payoff?: MacroCommand[][];
  };
}

export interface ExplorerCharacteristic {
  uuid: string;
  properties: BluetoothCharacteristicProperties;
}

export interface ExplorerService {
  uuid: string;
  characteristics: ExplorerCharacteristic[];
}

// FIX: Added missing RawPacket type definition.
export interface RawPacket {
  id: number;
  timestamp: string;
  hexData: string;
}

// New: Type for button threshold data
export interface ButtonThresholds {
    min: number | null;
    max: number | null;
}

// New: Type for spell casting history
export interface CastingHistoryEntry {
  id: number;
  name: string;
  timestamp: string;
}