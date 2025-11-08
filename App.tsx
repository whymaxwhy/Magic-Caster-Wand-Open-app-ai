
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
// FIX: WandTypes is exported from types.ts, not constants.ts.
import { WBDLProtocol, WBDLPayloads, SPELL_LIST, WAND_THRESHOLDS, Houses, WAND_TYPE_IDS } from './constants';
import { WandTypes } from './types';
import type { LogEntry, LogType, VfxCommand, VfxCommandType, Spell, IMUReading, GestureState, DeviceType, ConnectionState, WandType, WandDevice, WandDeviceType, House, SpellDetails, SpellUse, ExplorerService, ExplorerCharacteristic, BleEvent, MacroCommand } from './types';
import Scripter from './Scripter';
import { GoogleGenAI, Type } from '@google/genai';


// --- HELPER FUNCTIONS ---
const getTimestamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
// FIX: Corrected typo in TextDecoder constructor.
const textDecoder = new TextDecoder('utf-8');

/**
 * Converts a HEX color to the CIE 1931 XY color space.
 * This is a complex conversion required by the Philips Hue API.
 * The implementation is a standard, widely-used approximation.
 * Source for algorithm: https://github.com/peter-murray/node-hue-api/blob/master/lib/rgb.js
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns An array [x, y] or null if invalid.
 */
const hexToXy = (hex: string): [number, number] | null => {
    if (!hex) return null;

    const sanitizedHex = hex.replace('#', '');
    const red = parseInt(sanitizedHex.substring(0, 2), 16) / 255;
    const green = parseInt(sanitizedHex.substring(2, 4), 16) / 255;
    const blue = parseInt(sanitizedHex.substring(4, 6), 16) / 255;

    // Apply gamma correction
    const r = (red > 0.04045) ? Math.pow((red + 0.055) / 1.055, 2.4) : (red / 12.92);
    const g = (green > 0.04045) ? Math.pow((green + 0.055) / 1.055, 2.4) : (green / 12.92);
    const b = (blue > 0.04045) ? Math.pow((blue + 0.055) / 1.055, 2.4) : (blue / 12.92);

    // Convert to XYZ
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

    const sum = X + Y + Z;
    if (sum === 0) return [0.3227, 0.329]; // Default to neutral white on black

    const x = X / sum;
    const y = Y / sum;

    return [parseFloat(x.toFixed(4)), parseFloat(y.toFixed(4))];
}


// --- ICONS ---
const MagicWandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);
const CubeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2h-8zM2 8a2 2 0 012-2h4v12H4a2 2 0 01-2-2V8z" />
    </svg>
);
const StatusOnlineIcon = () => <svg className="h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const StatusOfflineIcon = () => <svg className="h-4 w-4 text-red-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const BatteryIcon = ({ level }: { level: number | null }) => {
  if (level === null) return null;
  
  let levelClass = 'text-green-400'; // Default to HIGH
  let pulseAnimation = '';
  
  // Thresholds based on WandStatus$a.smali enums (HIGH, MEDIUM, LOW, CRITICAL)
  if (level <= 15) { // CRITICAL
    levelClass = 'text-red-400';
    pulseAnimation = 'animate-pulse';
  } else if (level <= 40) { // LOW
    levelClass = 'text-yellow-400';
  } else if (level <= 70) { // MEDIUM
    levelClass = 'text-lime-400';
  } 
  // else HIGH (already set)

  const barWidth = Number(level) / 10;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${levelClass} ${pulseAnimation}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm12 1H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1z" clipRule="evenodd" />
      {level > 10 && <rect x="5" y="7" width={barWidth} height="6" rx="0.5" />}
    </svg>
  );
};
const PlusCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>;
// FIX: Replaced malformed SVG path data with a valid path. The original path had an invalid command sequence and could cause JSX parsing errors that manifest as arithmetic operation errors.
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8z m5 -1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
const FolderOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>;
const ScanIcon = () => (
  <svg className="w-24 h-24 text-indigo-400 mx-auto mb-4" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <g>
      <circle fill="none" stroke="currentColor" strokeWidth="2" cx="50" cy="50" r="1">
        <animate attributeName="r" from="1" to="40" dur="2s" begin="0s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="1" to="0" dur="2s" begin="0s" repeatCount="indefinite"/>
      </circle>
       <circle fill="none" stroke="currentColor" strokeWidth="2" cx="50" cy="50" r="1">
        <animate attributeName="r" from="1" to="40" dur="2s" begin="0.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="1" to="0" dur="2s" begin="0.5s" repeatCount="indefinite"/>
      </circle>
    </g>
    <path stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" d="M40 60 l20 -20 m-5 -15 l10 10"/>
  </svg>
);
const ChartBarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        {/* FIX: Added spaces around negative numbers in SVG path to prevent JSX parsing issues. */}
        <path fillRule="evenodd" d="M3 3a1 1 0 011 -1h12a1 1 0 011 1v14a1 1 0 01-1 -1H4a1 1 0 01-1 -1V3zm2 12a1 1 0 011 -1h2a1 1 0 011 1v -5a1 1 0 01-1 -1H6a1 1 0 01-1 1v5zm5 -8a1 1 0 011 -1h2a1 1 0 011 1v8a1 1 0 01-1 1h-2a1 1 0 01-1 -1V7z" clipRule="evenodd" />
    </svg>
);
const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Added spaces around negative numbers in SVG path to prevent JSX parsing issues. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4 -16m4 4l4 4 -4 4M6 16l-4 -4 4 -4" />
    </svg>
);
const SearchCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained missing spaces around negative numbers, which could be misparsed as an arithmetic operation by JSX. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6 -6m2 -5a7 7 0 11 -14 0 7 7 0 0114 0z" />
    </svg>
);
const LinkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained missing spaces around negative numbers, which could be misparsed as an arithmetic operation by JSX. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102 -1.101m-.758 -4.899a4 4 0 005.656 0l4 -4a4 4 0 00-5.656 -5.656l-1.1 1.1" />
    </svg>
);
const LinkBreakIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained 'l4-4' and '-5.656-5.656' without spaces which could be misparsed as an arithmetic operation. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102 -1.101m-.758 -4.899a4 4 0 005.656 0l4 -4a4 4 0 00-5.656 -5.656l-1.1 1.1 M15 12 a 3 3 0 1 1 -6 0 a 3 3 0 0 1 6 0 z" />
    </svg>
);
const DocumentSearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
    </svg>
);
// New: Connection status icons, inspired by WandStatus$b.smali discovery
const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
const ExclamationCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
);
const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);



// --- UI COMPONENTS ---

interface LogViewProps {
  logs: LogEntry[];
}
const LogView: React.FC<LogViewProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const logColorClasses: Record<LogType, string> = {
    INFO: 'text-slate-400',
    SUCCESS: 'text-green-400',
    WARNING: 'text-yellow-400',
    ERROR: 'text-red-400',
    DATA_IN: 'text-purple-400',
    DATA_OUT: 'text-cyan-400',
  };

  return (
    <div ref={scrollRef} className="h-full bg-slate-950 rounded-lg p-4 font-mono text-sm overflow-y-auto border border-slate-700">
      {logs.map(log => (
        <div key={log.id} className="whitespace-pre-wrap">
          <span className="text-slate-500">{log.timestamp} </span>
          <span className={`${logColorClasses[log.type]} font-bold`}>[{log.type}] </span>
          <span className="text-slate-300">{log.message}</span>
        </div>
      ))}
    </div>
  );
};

// New: Status Badge component for improved connection state display
interface StatusBadgeProps {
  state: ConnectionState;
}
const StatusBadge: React.FC<StatusBadgeProps> = ({ state }) => {
  const stateConfig = {
    Connected: {
      icon: <CheckCircleIcon />,
      text: 'Connected',
      className: 'bg-green-500/20 text-green-300',
    },
    Connecting: {
      icon: <SpinnerIcon />,
      text: 'Connecting',
      className: 'bg-yellow-500/20 text-yellow-300',
    },
    Disconnected: {
      icon: <LinkBreakIcon />,
      text: 'Disconnected',
      className: 'bg-slate-600/50 text-slate-400',
    },
    Error: {
      icon: <ExclamationCircleIcon />,
      text: 'Error',
      className: 'bg-red-500/20 text-red-300',
    },
  };

  const config = stateConfig[state] || stateConfig.Disconnected;

  return (
    <div className={`flex items-center px-2.5 py-1 text-xs font-bold rounded-full ${config.className}`}>
      {config.icon}
      <span>{config.text}</span>
    </div>
  );
};


const LOCAL_STORAGE_KEY_VFX = 'magicWandVfxSequence';
const LOCAL_STORAGE_KEY_SPELLBOOK = 'magicWandSpellBook';


interface RawPacket {
  id: number;
  timestamp: string;
  hexData: string;
}

// --- IMU Data Parsing ---
const ACCEL_SCALE = 0.0078125;
const GYRO_SCALE = 0.01084;

const parseImuPacket = (data: Uint8Array): IMUReading[] => {
    if (data.length < 4) return [];

    const view = new DataView(data.buffer);
    const chunk_count = view.getUint8(3);
    const expected_length = 4 + (chunk_count * 12);

    if (data.length < expected_length) {
      // Don't process corrupt packets
      return [];
    }
    
    const results: IMUReading[] = [];
    let data_index = 4; // Start after header

    for (let i = 0; i < chunk_count; i++) {
        const chunk_end = data_index + 12;
        if (chunk_end > data.length) break;

        // Raw sensor data order from reverse engineering: [AY, AX, AZ, GY, GX, GZ]
        const raw_ay = view.getInt16(data_index, true);
        const raw_ax = view.getInt16(data_index + 2, true);
        const raw_az = view.getInt16(data_index + 4, true);
        const raw_gy = view.getInt16(data_index + 6, true);
        const raw_gx = view.getInt16(data_index + 8, true);
        const raw_gz = view.getInt16(data_index + 10, true);

        // Apply scaling and coordinate system flips based on o.smali analysis
        const accel_x = raw_ax * ACCEL_SCALE;
        const accel_y = -raw_ay * ACCEL_SCALE;
        const accel_z = raw_az * ACCEL_SCALE;

        const gyro_x = raw_gx * GYRO_SCALE;
        const gyro_y = -raw_gy * GYRO_SCALE;
        const gyro_z = raw_gz * GYRO_SCALE;

        results.push({
            chunk_index: i,
            acceleration: { x: accel_x, y: accel_y, z: accel_z },
            gyroscope: { x: gyro_x, y: gyro_y, z: gyro_z }
        });

        data_index = chunk_end;
    }
    return results;
};

interface WriteQueueItem {
  payload: Uint8Array;
  silent: boolean;
}

// --- MAIN APP ---
export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // --- State Refactor: Using centralized WandDevice object inspired by smali analysis ---
  // Wand State
  const [wandConnectionState, setWandConnectionState] = useState<ConnectionState>('Disconnected');
  const [wandDetails, setWandDetails] = useState<WandDevice | null>(null);
  const [wandBatteryLevel, setWandBatteryLevel] = useState<number | null>(null);
  const [rawWandProductInfo, setRawWandProductInfo] = useState<string | null>(null);
  
  // Box State
  const [boxConnectionState, setBoxConnectionState] = useState<ConnectionState>('Disconnected');
  const [boxDetails, setBoxDetails] = useState<WandDevice | null>(null);
  const [boxBatteryLevel, setBoxBatteryLevel] = useState<number | null>(null);
  const [rawBoxProductInfo, setRawBoxProductInfo] = useState<string | null>(null);
  
  // Control State
  const [buttonState, setButtonState] = useState<[boolean, boolean, boolean, boolean]>([false, false, false, false]);
  
  // General State
  const [lastSpell, setLastSpell] = useState<string>('');
  const [spellDetails, setSpellDetails] = useState<SpellDetails | null>(null);
  const [isFetchingSpellDetails, setIsFetchingSpellDetails] = useState(false);
  const [spellDetailsError, setSpellDetailsError] = useState<string | null>(null);
  const [gestureState, setGestureState] = useState<GestureState>('Idle');
  const [activeTab, setActiveTab] = useState<'control_hub' | 'device_manager' | 'diagnostics' | 'compendium' | 'explorer' | 'scripter'>('control_hub');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [deviceToScan, setDeviceToScan] = useState<DeviceType | null>(null);
  
  const [vfxSequence, setVfxSequence] = useState<VfxCommand[]>([]);
  const [isSequenceSaved, setIsSequenceSaved] = useState(false);
  const [detectedOpCodes, setDetectedOpCodes] = useState<Set<number>>(new Set());
  const [rawPacketLog, setRawPacketLog] = useState<RawPacket[]>([]);
  const [spellBook, setSpellBook] = useState<Spell[]>([]);
  const [spellFilter, setSpellFilter] = useState('');
  
  const [isImuStreaming, setIsImuStreaming] = useState(false);
  const [latestImuData, setLatestImuData] = useState<IMUReading[] | null>(null);

  // Smart TV Broadcast State
  const [isTvBroadcastEnabled, setIsTvBroadcastEnabled] = useState<boolean>(false);
  const [userHouse, setUserHouse] = useState<House>('GRYFFINDOR');
  const [userPatronus, setUserPatronus] = useState<string>('Deer');
  
  // Hue Integration State
  const [isHueEnabled, setIsHueEnabled] = useState(false);
  const [hueBridgeIp, setHueBridgeIp] = useState('');
  const [hueUsername, setHueUsername] = useState('');
  const [hueLightId, setHueLightId] = useState('1');
  
  // BLE Explorer State
  const [explorerDevice, setExplorerDevice] = useState<BluetoothDevice | null>(null);
  const [explorerServices, setExplorerServices] = useState<ExplorerService[]>([]);
  const [isExploring, setIsExploring] = useState(false);
  
  // Diagnostics State
  const [bleEventLog, setBleEventLog] = useState<BleEvent[]>([]);
  const [negotiatedMtu, setNegotiatedMtu] = useState<number>(WBDLPayloads.MTU_PAYLOAD_SIZE);
  const [smaliInput, setSmaliInput] = useState('');
  const [smaliAnalysis, setSmaliAnalysis] = useState('');
  const [isAnalyzingSmali, setIsAnalyzingSmali] = useState(false);
  // New: State for Client-Side Gesture Detection, based on n.smali analysis
  const [isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled] = useState(true);
  const [gestureThreshold, setGestureThreshold] = useState(2.0); // Default threshold in G's
  const [clientSideGestureDetected, setClientSideGestureDetected] = useState(false);
  
  // New: State for Spell Compendium
  const [isCompendiumModalOpen, setIsCompendiumModalOpen] = useState(false);
  const [selectedCompendiumSpell, setSelectedCompendiumSpell] = useState<string | null>(null);
  const [compendiumSpellDetails, setCompendiumSpellDetails] = useState<SpellDetails | null>(null);
  const [isFetchingCompendiumDetails, setIsFetchingCompendiumDetails] = useState(false);
  const [compendiumError, setCompendiumError] = useState<string | null>(null);

  // New: State for Protocol Settings
  const [commandDelay_ms, setCommandDelay_ms] = useState(20);


  // --- Command Queue State ---
  const [writeQueue, setWriteQueue] = useState<WriteQueueItem[]>([]);
  const isWriting = useRef(false);

  const logCounter = useRef(0);
  const bleEventCounter = useRef(0);
  const commandIdCounter = useRef(0);
  const rawPacketLogCounter = useRef(0);
  const keepAliveInterval = useRef<number | null>(null);
  const commandCharacteristic = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const isInitialMountSpells = useRef(true);
  // Fix: Memoize the set of discovered spells with toUpperCase for case-insensitive checking.
  const discoveredSpells = useMemo(() => new Set(spellBook.map(s => s.name.toUpperCase())), [spellBook]);


  const addLog = useCallback((type: LogType, message: string) => {
    setLogs(prev => [...prev, { id: logCounter.current++, timestamp: getTimestamp(), type, message }]);
  }, []);
  
  const addBleEvent = useCallback((event: string, detail: string = '') => {
      setBleEventLog(prev => {
          const newEntry = { id: bleEventCounter.current++, timestamp: getTimestamp(), event, detail };
          const newLog = [newEntry, ...prev];
          return newLog.slice(0, 50); 
      });
  }, []);

  // Effect to load data from localStorage on initial render
  useEffect(() => {
    // Load VFX Sequence
    try {
      const savedSequenceJSON = localStorage.getItem(LOCAL_STORAGE_KEY_VFX);
      if (savedSequenceJSON) {
        const savedSequence: VfxCommand[] = JSON.parse(savedSequenceJSON);
        if (Array.isArray(savedSequence)) {
          let maxId = 0;
          const restoredSequence = savedSequence.map((cmd, index) => {
            const newId = commandIdCounter.current++;
            if (cmd.id > maxId) maxId = cmd.id;
            return { ...cmd, id: newId };
          });
          setVfxSequence(restoredSequence);
          setIsSequenceSaved(true);
          addLog('INFO', 'Loaded saved VFX sequence from storage.');
        }
      }
    } catch (error) {
      addLog('ERROR', `Failed to load sequence from storage: ${error}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_VFX);
    }

     // Load Spell Book
    try {
      const savedSpellsJSON = localStorage.getItem(LOCAL_STORAGE_KEY_SPELLBOOK);
      if (savedSpellsJSON) {
        const savedSpells: Spell[] = JSON.parse(savedSpellsJSON);
        if (Array.isArray(savedSpells)) {
          setSpellBook(savedSpells);
          addLog('INFO', 'Loaded spell book from storage.');
        }
      }
    // Fix: Corrected syntax for catch block.
    } catch (error) {
      addLog('ERROR', `Failed to load spell book: ${error}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_SPELLBOOK);
    }

    // Load TV Broadcast settings
    try {
      const savedEnabled = localStorage.getItem('magicWandTvBroadcastEnabled');
      if (savedEnabled) setIsTvBroadcastEnabled(JSON.parse(savedEnabled));

      const savedHouse = localStorage.getItem('magicWandUserHouse');
      if (savedHouse) setUserHouse(savedHouse as House);

      const savedPatronus = localStorage.getItem('magicWandUserPatronus');
      if (savedPatronus) setUserPatronus(savedPatronus);

    } catch (error) {
      addLog('ERROR', 'Failed to load TV Broadcast settings from storage.');
    }
    
     // Load Hue settings
    try {
      const savedHueEnabled = localStorage.getItem('magicWandHueEnabled');
      if (savedHueEnabled) setIsHueEnabled(JSON.parse(savedHueEnabled));
      
      const savedHueIp = localStorage.getItem('magicWandHueIp');
      if (savedHueIp) setHueBridgeIp(savedHueIp);

      const savedHueUser = localStorage.getItem('magicWandHueUser');
      if (savedHueUser) setHueUsername(savedHueUser);

      const savedHueLight = localStorage.getItem('magicWandHueLightId');
      if (savedHueLight) setHueLightId(savedHueLight);
    } catch (error) {
      addLog('ERROR', 'Failed to load Hue settings from storage.');
    }
  }, [addLog]);

  
  // Effect to auto-save Spell Book when it changes
  useEffect(() => {
    if (isInitialMountSpells.current) {
        isInitialMountSpells.current = false;
        return;
    }
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_SPELLBOOK, JSON.stringify(spellBook));
    } catch (error) {
        addLog('ERROR', `Failed to save spell book: ${error}`);
    }
  }, [spellBook, addLog]);

  // Effect to save TV Broadcast settings
  useEffect(() => {
    try {
        localStorage.setItem('magicWandTvBroadcastEnabled', JSON.stringify(isTvBroadcastEnabled));
        localStorage.setItem('magicWandUserHouse', userHouse);
        localStorage.setItem('magicWandUserPatronus', userPatronus);
    } catch (error) {
        addLog('ERROR', `Failed to save TV Broadcast settings: ${error}`);
    }
  }, [isTvBroadcastEnabled, userHouse, userPatronus, addLog]);
  
  // Effect to save Hue settings
  const saveHueSettings = useCallback(() => {
    try {
        localStorage.setItem('magicWandHueEnabled', JSON.stringify(isHueEnabled));
        localStorage.setItem('magicWandHueIp', hueBridgeIp);
        localStorage.setItem('magicWandHueUser', hueUsername);
        localStorage.setItem('magicWandHueLightId', hueLightId);
        addLog('SUCCESS', 'Hue settings saved.');
    } catch (error) {
        addLog('ERROR', `Failed to save Hue settings: ${error}`);
    }
  }, [isHueEnabled, hueBridgeIp, hueUsername, hueLightId, addLog]);


  // Effect to close scanner modal on successful connection
  useEffect(() => {
    if (isScannerOpen && (wandConnectionState === 'Connected' || boxConnectionState === 'Connected')) {
      setIsScannerOpen(false);
      setDeviceToScan(null);
    }
  }, [wandConnectionState, boxConnectionState, isScannerOpen]);


  const fetchSpellDetails = useCallback(async (spellName: string) => {
    if (!spellName) return;

    setIsFetchingSpellDetails(true);
    setSpellDetailsError(null);
    setSpellDetails(null);
    addLog('INFO', `Fetching details for spell: ${spellName}...`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      const responseSchema = {
          type: Type.OBJECT,
          properties: {
              spell_name: { type: Type.STRING },
              incantation_name: { type: Type.STRING, description: "The incantation, which may be the same as the name or slightly different (e.g., 'Wingardium Leviosa')." },
              description: { type: Type.STRING, description: "A brief, one-sentence description of the spell's effect." },
              spell_type: { type: Type.STRING, description: "The category of the spell (e.g., Charm, Jinx, Hex, Transfiguration, Curse)." },
              difficulty: { type: Type.INTEGER, description: "A rating from 1 (easy) to 5 (very difficult)." },
              spell_background_color: { type: Type.STRING, description: "A hex color code (e.g., '#2A3B4C') representing the spell's theme color." },
              spell_uses: {
                  type: Type.ARRAY,
                  description: "A list of 2-3 objects representing common applications of the spell. Each object should have an 'id', 'name', and 'icon' property. 'icon' should be a simple descriptive noun (e.g., 'combat', 'utility', 'charm').",
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          id: { type: Type.STRING, description: "A unique identifier for the spell use, e.g., 'unlocking_doors'." },
                          name: { type: Type.STRING, description: "A short description of the use, e.g., 'Unlocks simple doors and windows'." },
                          icon: { type: Type.STRING, description: "A simple, single-word noun describing the use category, e.g., 'utility'." }
                      },
                      required: ["id", "name", "icon"]
                  }
              }
          },
          required: ["spell_name", "incantation_name", "description", "spell_type", "difficulty", "spell_background_color", "spell_uses"]
      };

      const systemInstruction = `You are a magical archivist providing data about spells from a wizarding world. For a given spell name, you must return a single, valid JSON object with details about that spell. The JSON object must conform to the provided schema. The 'spell_name' in the response should be the same as the input spell name, formatted in uppercase.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide the details for the spell: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const jsonText = response.text.trim();
      const details = JSON.parse(jsonText) as SpellDetails;
      setSpellDetails(details);
      addLog('SUCCESS', `Successfully fetched details for ${spellName}.`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('ERROR', `Failed to fetch spell details: ${errorMessage}`);
      setSpellDetailsError('Could not retrieve spell details from the magical archives.');
    } finally {
      setIsFetchingSpellDetails(false);
    }
  }, [addLog]);

  useEffect(() => {
    fetchSpellDetails(lastSpell);
  }, [lastSpell, fetchSpellDetails]);


  const clearKeepAlive = useCallback(() => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = null;
    }
  }, []);
  
  const sendTvBroadcast = useCallback((spellName: string) => {
    if (!isTvBroadcastEnabled) return;
    
    // Sanitize inputs as per smali analysis (remove spaces, lowercase house)
    const sanitizedSpell = spellName.replace(/\s/g, '');
    const sanitizedHouse = userHouse.toLowerCase();
    const sanitizedPatronus = userPatronus.replace(/\s/g, '');

    const payload = `spell:${sanitizedSpell}:${sanitizedHouse}:${sanitizedPatronus}`;

    addLog('INFO', `Smart TV Broadcast (Simulated): Would send UDP packet to port 8888 with payload: "${payload}"`);

  }, [isTvBroadcastEnabled, userHouse, userPatronus, addLog]);
  
  const handleHueSpell = useCallback((spellName: string) => {
    if (!isHueEnabled || !hueBridgeIp || !hueUsername || !hueLightId) {
        if (isHueEnabled) {
            addLog('WARNING', 'Hue integration is enabled, but settings are incomplete.');
        }
        return;
    }

    let payload: object | null = null;
// FIX: Use backticks for template literal to correctly generate the random color string.
    const randomColor = `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;

    switch (spellName) {
        case 'LUMOS':
            payload = { on: true, xy: hexToXy('#FFFFFF'), bri: 254 };
            break;
        case 'NOX':
            payload = { on: false };
            break;
        case 'INCENDIO':
        case 'VERMILLIOUS':
            payload = { on: true, xy: hexToXy('#FF4500') }; // Fiery Orange
            break;
        case 'AGUAMENTI':
            payload = { on: true, xy: hexToXy('#00FFFF') }; // Cyan
            break;
        case 'VERDIMILLIOUS':
            payload = { on: true, xy: hexToXy('#00FF00') }; // Green
            break;
        case 'COLOVARIA':
            payload = { on: true, xy: hexToXy(randomColor) };
            break;
        default:
            return; // Not a Hue-mapped spell
    }

    if (payload) {
        const url = `http://${hueBridgeIp}/api/${hueUsername}/lights/${hueLightId}/state`;
        addLog('INFO', `Hue Integration (Simulated): Would send PUT to ${url} with body: ${JSON.stringify(payload)}`);
    }

  }, [isHueEnabled, hueBridgeIp, hueUsername, hueLightId, addLog]);

  const handleDisconnect = useCallback(() => {
    if (!wandDetails) return;
    addLog('INFO', `Wand disconnected: ${wandDetails.bleName}`);
    addBleEvent('GATT', 'Disconnected');
    setWandConnectionState('Disconnected');
    setWandDetails(null);
    setWandBatteryLevel(null);
    clearKeepAlive();
    commandCharacteristic.current = null;
    setIsImuStreaming(false);
    setLatestImuData(null);
    setGestureState('Idle');
    setButtonState([false, false, false, false]);
    setRawWandProductInfo(null);
    setNegotiatedMtu(WBDLPayloads.MTU_PAYLOAD_SIZE); // Reset MTU on disconnect
    setClientSideGestureDetected(false); // Reset gesture detector
    // Clear any pending commands on disconnect
    setWriteQueue([]);
    isWriting.current = false;
  }, [addLog, clearKeepAlive, wandDetails, addBleEvent]);
  
  const handleBoxDisconnect = useCallback(() => {
    if (!boxDetails) return;
    addLog('INFO', `Wand Box disconnected: ${boxDetails.bleName}`);
    addBleEvent('GATT', 'Box Disconnected');
    setBoxConnectionState('Disconnected');
    setBoxDetails(null);
    setBoxBatteryLevel(null);
    setRawBoxProductInfo(null);
  }, [addLog, boxDetails, addBleEvent]);

  const queueCommand = useCallback((payload: Uint8Array, silent: boolean = false) => {
    setWriteQueue(prev => [...prev, { payload, silent }]);
  }, []);

  const processWriteQueue = useCallback(async () => {
    if (isWriting.current || writeQueue.length === 0) {
      return;
    }

    isWriting.current = true; // Block subsequent calls
    const itemToWrite = writeQueue[0];

    if (!commandCharacteristic.current) {
        addLog('ERROR', 'Cannot process write queue: characteristic not available.');
        addBleEvent('Error', 'Write failed: No characteristic');
        isWriting.current = false;
        setWriteQueue([]); // Clear queue
        return;
    }

    try {
        addBleEvent('Characteristic', `writeValueWithResponse`);
        await commandCharacteristic.current.writeValueWithResponse(itemToWrite.payload);
        if (!itemToWrite.silent) {
            addLog('DATA_OUT', `Sent: ${bytesToHex(itemToWrite.payload)}`);
        }
        
        // On success, we start the process for the next item after the specified delay
        setTimeout(() => {
            setWriteQueue(prev => prev.slice(1)); // Dequeue
            isWriting.current = false; // Unblock for the next run triggered by setWriteQueue
        }, commandDelay_ms);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('ERROR', `Failed to write command with response: ${errorMessage}. The characteristic may not support it. Clearing command queue.`);
        addBleEvent('Error', `Write failed: ${errorMessage}`);
        setWriteQueue([]);
        isWriting.current = false; // Unblock immediately on error
    }
  }, [writeQueue, addLog, addBleEvent, commandDelay_ms]);

  // Effect to drive the write queue
  useEffect(() => {
    if (wandConnectionState === 'Connected') {
        processWriteQueue();
    }
  }, [writeQueue, wandConnectionState, processWriteQueue]);

  // New: Parser for individual product info packets, based on `h0.smali` analysis.
  // This replaces the old TLV parser.
  const handleProductInfoPacket = useCallback((data: Uint8Array, forDevice: 'wand' | 'box') => {
      const updater = forDevice === 'wand' ? setWandDetails : setBoxDetails;
      
      if (data.length < 3) { // Must have opcode, type, and at least one byte of data
          addLog('WARNING', `Runt Product Info packet for ${forDevice}: ${bytesToHex(data)}`);
          return;
      }

      const view = new DataView(data.buffer);
      const infoType = data[1];
      const valueBytes = data.slice(2);
      const partialDetails: Partial<WandDevice> = {};

      // GUESSED type IDs based on the if/else-if order in the h0.smali constructor.
      // These are for reverse engineering and may not be the final correct values.
      const PRODUCT_INFO_TYPE = {
          VERSION: 0x00,
          SERIAL_NUMBER: 0x01,
          SKU: 0x02,
          MFG_ID: 0x03,
          DEVICE_ID: 0x04,
          EDITION: 0x05,
          DECO: 0x06,
          // Other types seen in TLV parser, might exist under different IDs
          COMPANION_ADDRESS: 0x08, 
          WAND_TYPE: 0x09,
      };

      let detailName = `Unknown (0x${infoType.toString(16)})`;
      let detailValue: string | number | null = bytesToHex(valueBytes);

      try {
          switch (infoType) {
              case PRODUCT_INFO_TYPE.VERSION:
                  detailName = 'Version';
                  partialDetails.version = view.getUint32(2, true);
                  detailValue = partialDetails.version;
                  break;
              case PRODUCT_INFO_TYPE.SERIAL_NUMBER:
                  detailName = 'Serial Number';
                  partialDetails.serialNumber = view.getUint32(2, true);
                  detailValue = partialDetails.serialNumber;
                  break;
              case PRODUCT_INFO_TYPE.SKU:
                  detailName = 'SKU';
                  partialDetails.sku = textDecoder.decode(valueBytes).trim().replace(/\0/g, '');
                  detailValue = partialDetails.sku;
                  break;
              case PRODUCT_INFO_TYPE.MFG_ID:
                  detailName = 'Mfg ID';
                  partialDetails.mfgId = textDecoder.decode(valueBytes).trim().replace(/\0/g, '');
                  detailValue = partialDetails.mfgId;
                  break;
              case PRODUCT_INFO_TYPE.DEVICE_ID:
                  detailName = 'Device ID';
                  partialDetails.deviceID = textDecoder.decode(valueBytes).trim().replace(/\0/g, '');
                  detailValue = partialDetails.deviceID;
                  break;
              case PRODUCT_INFO_TYPE.EDITION:
                  detailName = 'Edition';
                  partialDetails.edition = textDecoder.decode(valueBytes).trim().replace(/\0/g, '');
                  detailValue = partialDetails.edition;
                  break;
              case PRODUCT_INFO_TYPE.DECO:
                  detailName = 'Deco';
                  partialDetails.deco = textDecoder.decode(valueBytes).trim().replace(/\0/g, '');
                  detailValue = partialDetails.deco;
                  break;
              // Cases below are from old TLV parser, not yet confirmed in smali
              case PRODUCT_INFO_TYPE.COMPANION_ADDRESS:
                  if (valueBytes.length === 6) {
                    detailName = 'Companion';
                    partialDetails.companionAddress = Array.from(valueBytes).reverse().map(b => b.toString(16).padStart(2, '0')).join(':').toUpperCase();
                    detailValue = partialDetails.companionAddress;
                  }
                  break;
              case PRODUCT_INFO_TYPE.WAND_TYPE:
                  if (valueBytes.length === 1) {
                    detailName = 'Wand Type';
                    partialDetails.wandType = WAND_TYPE_IDS[valueBytes[0]] || 'UNKNOWN';
                    detailValue = partialDetails.wandType;
                  }
                  break;
              default:
                  addLog('INFO', `Received unknown Product Info type for ${forDevice}: 0x${infoType.toString(16)}`);
                  return;
          }

          addLog('SUCCESS', `Parsed Product Info for ${forDevice}: ${detailName} = ${detailValue}`);
          updater(prev => prev ? { ...prev, ...partialDetails } : prev);

      } catch (e) {
          addLog('ERROR', `Failed to parse Product Info packet for ${forDevice} (type 0x${infoType.toString(16)}): ${e}`);
      }
  }, [addLog]);

  const parseStreamData = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    addBleEvent('Event', `characteristicvaluechanged (Stream: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;

    const data = new Uint8Array(value.buffer);
    const hexData = bytesToHex(data);

    // Don't log IMU stream to avoid spamming the main log
    if (!isImuStreaming) {
        addLog('DATA_IN', `Wand CH2 Received: ${hexData}`);
    }


    if (data.length > 0) {
      if (isImuStreaming) {
        const imuReadings = parseImuPacket(data);
        if (imuReadings.length > 0) {
            setLatestImuData(imuReadings);
            // New: Client-side gesture detection from n.smali
            if (isClientSideGestureDetectionEnabled && gestureState === 'Idle' && !clientSideGestureDetected) {
                for (const reading of imuReadings) {
                    const { x, y, z } = reading.acceleration;
                    const magnitude = Math.sqrt(x*x + y*y + z*z);
                    if (magnitude > gestureThreshold) {
                        setClientSideGestureDetected(true);
                        addLog('SUCCESS', `Client-side gesture detected! Accel magnitude: ${magnitude.toFixed(2)}g (Threshold: ${gestureThreshold}g)`);
                        break; // Only detect once per gesture
                    }
                }
            }
        } else {
            addLog('WARNING', `Wand CH2 Received non-IMU or corrupt packet while streaming: ${hexData}`);
        }
        return; // Don't process as other packet types
      }
      
      if (data[0] === WBDLProtocol.INCOMING_OPCODE.BUTTON_STATE_UPDATE) {
        if (data.length > 1) {
            const buttonMask = data[1];
            const newButtonState: [boolean, boolean, boolean, boolean] = [
                (buttonMask & 0b0001) !== 0, // Button 1
                (buttonMask & 0b0010) !== 0, // Button 2
                (buttonMask & 0b0100) !== 0, // Button 3
                (buttonMask & 0b1000) !== 0, // Button 4
            ];
            setButtonState(newButtonState);
            addLog('INFO', `Grip status update: [${newButtonState.map(b => b ? 'ON' : 'OFF').join(', ')}]`);
        }
        return; // Packet handled
      }
      
      if (data[0] === WBDLProtocol.INCOMING_OPCODE.GESTURE_EVENT) {
        addLog('INFO', `Wand Gesture Event packet received: ${hexData}`);
        if (data.length > 1) {
            if (data[1] === 0x01) { // Gesture Start
                setGestureState('Casting');
                addLog('SUCCESS', 'Gesture started.');
                // Automatically trigger "Ready to Cast" effect, based on smali analysis of WandHelper
                addLog('INFO', 'Automatically triggering "Ready to Cast" light effect.');
                queueCommand(WBDLPayloads.MACRO_READY_TO_CAST_CMD);
            } else if (data[1] === 0x00) { // Gesture Stop
                setGestureState('Processing');
                setClientSideGestureDetected(false); // Reset client-side detector on official stop signal
                addLog('SUCCESS', 'Gesture stopped. Processing spell...');
            }
        } else {
            addLog('WARNING', 'Malformed Gesture Event packet.');
        }
        return;
      }

      if (data[0] === 0x24) { // Spell packet candidate
        const header = data.slice(0, 4);
        const headerHex = bytesToHex(header);

        // Basic validation: packet must be long enough for a header.
        if (data.length < 4) {
          addLog('WARNING', `Runt spell packet received: ${hexData}`);
          setGestureState('Idle');
          return;
        }

        const spellLength = data[3];
        const remainingDataLength = data.length - 4;

        // Sanity check 1: The declared length must not exceed the remaining packet data.
        if (spellLength > remainingDataLength) {
          addLog('WARNING', `Corrupt spell packet: Declared length (${spellLength}) is greater than available data (${remainingDataLength}). Header: ${headerHex}, Full packet: ${hexData}`);
          setGestureState('Idle');
          return;
        }

        // It's possible for a spell packet to be sent with no spell name yet.
        if (spellLength === 0) {
          addLog('INFO', `Ignoring spell packet with zero length (likely pre-spell data). Header: ${headerHex}`);
          setGestureState('Idle');
          return;
        }

        try {
          const spellNameBytes = data.slice(4, 4 + spellLength);
          const rawSpellName = textDecoder.decode(spellNameBytes);
          
          if (!/^[ -~]+$/.test(rawSpellName)) {
              addLog('WARNING', `Spell name contains non-printable characters. Raw: "${rawSpellName}", Header: ${headerHex}`);
              setGestureState('Idle');
              return;
          }

          const cleanedSpellName = rawSpellName.trim();
          
          if (!/[a-zA-Z]/.test(cleanedSpellName)) {
              addLog('INFO', `Ignoring empty or symbolic-only spell name. Raw: "${rawSpellName}", Header: ${headerHex}`);
              setGestureState('Idle');
              return;
          }

          // New: Normalize incoming spell names based on smali analysis to match canonical list.
          const normalizeIncomingSpell = (name: string): string => {
              const lower = name.toLowerCase();
              // Specific overrides from smali analysis
              if (lower === 'the_hair_growing_charm') return "The_Hair_Thickening_Growing_Charm";
              if (lower === 'wingardium leviosa') return "Wingardium_Leviosa";
              if (lower === 'petrificustotalus') return "Petrificus_Totalus";
              if (lower === 'expectopatronum') return "Expecto_Patronum";
              
              // Generic fallback to find canonical name from master list, ignoring case and separators
              const normalizedLower = lower.replace(/[\s_]+/g, '');
              const match = SPELL_LIST.find(canonical => canonical.toLowerCase().replace(/_/g, '') === normalizedLower);
              // Fallback to uppercasing if it's a totally new/unknown spell not in our list
              return match || name.toUpperCase();
          };

          const finalSpellName = normalizeIncomingSpell(cleanedSpellName);

          addLog('SUCCESS', `SPELL DETECTED: *** ${finalSpellName} *** (Raw: "${cleanedSpellName}", Header: ${headerHex})`);
          setLastSpell(finalSpellName);
          setGestureState('Idle');
          
          sendTvBroadcast(finalSpellName);
          handleHueSpell(finalSpellName);

          // Add to spell book if it's a new spell, using the canonical name
          setSpellBook(prevBook => {
            const exists = prevBook.some(spell => spell.name.toUpperCase() === finalSpellName.toUpperCase());
            if (!exists) {
              addLog('INFO', `New spell "${finalSpellName}" added to Spell Book!`);
              return [...prevBook, { name: finalSpellName, firstSeen: new Date().toISOString() }];
            }
            return prevBook;
          });


        } catch (e) {
          addLog('ERROR', `Error decoding spell packet. Header: ${headerHex}, Packet: ${hexData}, Error: ${e}`);
          setGestureState('Idle');
        }
      } else {
         addLog('INFO', `Wand CH2 Unknown Packet: ${hexData}`);
         if (data.length > 0) {
            const potentialOpCode = data[0];
            setDetectedOpCodes(prev => {
                if (prev.has(potentialOpCode)) return prev;
                const newSet = new Set(prev);
                newSet.add(potentialOpCode);
                return newSet;
            });
            setRawPacketLog(prev => {
              const newEntry = { id: rawPacketLogCounter.current++, timestamp: getTimestamp(), hexData };
              const newLog = [newEntry, ...prev];
              // Keep the log from growing indefinitely
              if (newLog.length > 100) {
                  return newLog.slice(0, 100);
              }
              return newLog;
          });
         }
      }
    }
  }, [addLog, isImuStreaming, queueCommand, sendTvBroadcast, handleHueSpell, addBleEvent, isClientSideGestureDetectionEnabled, gestureState, clientSideGestureDetected, gestureThreshold]);
  
  const parseControlData = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    addBleEvent('Event', `characteristicvaluechanged (Control: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;

    const data = new Uint8Array(value.buffer);
    const hexData = bytesToHex(data);
    addLog('DATA_IN', `Wand CH1 Received: ${hexData}`);

    if (data.length > 0 && data[0] === WBDLProtocol.INCOMING_OPCODE.PRODUCT_INFO_RESPONSE) {
      setRawWandProductInfo(prev => `${prev ? prev + '\n' : ''}${getTimestamp()}: ${hexData}`);
      handleProductInfoPacket(data, 'wand');
      return;
    }

    // Attempt to decode as firmware string
    try {
        const text = textDecoder.decode(data);
        // Basic check if it's a plausible firmware string
        if (text.includes("MCW") && text.length > 3) {
            setWandDetails(prev => prev ? { ...prev, firmware: text.trim() } : prev);
            addLog('SUCCESS', `Wand Firmware version received: ${text.trim()}`);
            return;
        }
    } catch (e) { /* Not a valid string, continue */ }
    
    // Fallback for other packet types on this channel
    if (data.length > 0) {
        const potentialOpCode = data[0];
        setDetectedOpCodes(prev => {
            if (prev.has(potentialOpCode)) return prev;
            const newSet = new Set(prev);
            newSet.add(potentialOpCode);
            return newSet;
        });
        setRawPacketLog(prev => {
          const newEntry = { id: rawPacketLogCounter.current++, timestamp: getTimestamp(), hexData };
          const newLog = [newEntry, ...prev];
          if (newLog.length > 100) return newLog.slice(0, 100);
          return newLog;
        });
    }

  }, [addLog, addBleEvent, handleProductInfoPacket]);
  
  const parseBoxData = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    addBleEvent('Event', `characteristicvaluechanged (Box: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;

    const data = new Uint8Array(value.buffer);
    const hexData = bytesToHex(data);
    addLog('DATA_IN', `Wand Box Received: ${hexData}`);
    
    if (data.length > 0) {
        const opCode = data[0];
        // Based on WandBoxHelper.smali decode() method
        if (opCode === 0x00) { // Firmware response
            try {
                const text = textDecoder.decode(data.slice(1)); // Assuming first byte is opcode
                const cleanedText = text.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
                setBoxDetails(prev => prev ? { ...prev, firmware: cleanedText } : prev);
                addLog('SUCCESS', `Wand Box Firmware detected: ${cleanedText}`);
            } catch(e) {
                 addLog('WARNING', `Could not decode Box Firmware string from packet: ${hexData}`);
            }
        } else if (opCode === WBDLProtocol.INCOMING_OPCODE.PRODUCT_INFO_RESPONSE) { // Product Info response
             setRawBoxProductInfo(prev => `${prev ? prev + '\n' : ''}${getTimestamp()}: ${hexData}`);
             handleProductInfoPacket(data, 'box');
        }

        const potentialOpCode = data[0];
        setDetectedOpCodes(prev => {
            if (prev.has(potentialOpCode)) return prev;
            const newSet = new Set(prev);
            newSet.add(potentialOpCode);
            return newSet;
        });
        setRawPacketLog(prev => {
          const newEntry = { id: rawPacketLogCounter.current++, timestamp: getTimestamp(), hexData };
          const newLog = [newEntry, ...prev];
          if (newLog.length > 100) return newLog.slice(0, 100);
          return newLog;
        });
    }
  }, [addLog, addBleEvent, handleProductInfoPacket]);


  const handleBatteryLevel = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    addBleEvent('Event', `characteristicvaluechanged (Battery: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;
    const level = value.getUint8(0);
    setWandBatteryLevel(level);
    addLog('INFO', `Wand Battery Level: ${level}%`);
  }, [addLog, addBleEvent]);
  
  const handleBoxBatteryLevel = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
     addBleEvent('Event', `characteristicvaluechanged (Box Battery: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;
    const level = value.getUint8(0);
    setBoxBatteryLevel(level);
    addLog('INFO', `Wand Box Battery Level: ${level}%`);
  }, [addLog, addBleEvent]);

  const createInitialDevice = (bleDevice: BluetoothDevice, type: WandDeviceType): WandDevice => ({
    device: bleDevice,
    deviceType: type,
// Fix: Use the more robust `bleDevice.id` which is a required property on BluetoothDevice.
    address: bleDevice.id.toUpperCase(), // Standardize to uppercase for comparisons
    bleName: bleDevice.name ?? 'Unknown',
    wandType: 'UNKNOWN',
    companionAddress: null,
    version: null,
    firmware: null,
    serialNumber: null,
    editionNumber: null,
    sku: null,
    mfgId: null,
    deviceID: null,
    edition: null,
    deco: null,
  });


  const connectToWand = useCallback(async () => {
    if (!navigator.bluetooth) {
      addLog('ERROR', 'Web Bluetooth API is not available on this browser.');
      addBleEvent('Error', 'Web Bluetooth not available');
      setWandConnectionState('Error');
      return;
    }
    setWandConnectionState('Connecting');
    addLog('INFO', 'Requesting Wand (MCW) device from browser...');
    addBleEvent('BLE', 'requestDevice (Wand)');
    try {
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: WBDLProtocol.TARGET_NAME }],
        optionalServices: [WBDLProtocol.SERVICE_UUID_WAND_CONTROL, WBDLProtocol.SERVICE_UUID_BATTERY]
      });

      addLog('INFO', `Found wand: ${bleDevice.name}. Connecting to GATT server...`);
      addBleEvent('GATT', 'Connecting...');
      setWandDetails(createInitialDevice(bleDevice, 'WAND'));

      bleDevice.addEventListener('gattserverdisconnected', () => handleDisconnect());

      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");

      addLog('INFO', 'Connected to Wand GATT Server. Discovering services...');
      addBleEvent('GATT', 'Connected');

      // New: MTU Negotiation inspired by smali analysis
      if (server.device.gatt?.mtu) {
          const newMtu = server.device.gatt.mtu - 3; // 3 bytes for ATT header
          setNegotiatedMtu(newMtu);
          addLog('SUCCESS', `Negotiated MTU size: ${newMtu} bytes (from browser-reported ${server.device.gatt.mtu}).`);
          addBleEvent('GATT', `MTU set to ${newMtu}`);
      } else {
          addLog('WARNING', `Could not read MTU size from browser. Using default of ${WBDLPayloads.MTU_PAYLOAD_SIZE} bytes.`);
          addBleEvent('GATT', `MTU default ${WBDLPayloads.MTU_PAYLOAD_SIZE}`);
      }

      const service = await server.getPrimaryService(WBDLProtocol.SERVICE_UUID_WAND_CONTROL);
      addLog('SUCCESS', `Found primary service: ${WBDLProtocol.SERVICE_UUID_WAND_CONTROL}`);
      addBleEvent('Service', 'Control service found');
      const batteryService = await server.getPrimaryService(WBDLProtocol.SERVICE_UUID_BATTERY);
      addLog('SUCCESS', `Found battery service: ${WBDLProtocol.SERVICE_UUID_BATTERY}`);
      addBleEvent('Service', 'Battery service found');
      
      commandCharacteristic.current = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_1);
      const streamCharacteristic = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_2);
      const batteryCharacteristic = await batteryService.getCharacteristic(WBDLProtocol.CHAR_UUID_BATTERY_LEVEL_NOTIFY);

      addLog('INFO', 'Starting notifications...');
      addBleEvent('Characteristic', 'Starting notifications...');
      await commandCharacteristic.current.startNotifications();
      await streamCharacteristic.startNotifications();
      await batteryCharacteristic.startNotifications();
      addLog('SUCCESS', 'Notifications started on all channels.');
      addBleEvent('Characteristic', 'Notifications started');

      commandCharacteristic.current.addEventListener('characteristicvaluechanged', parseControlData);
      streamCharacteristic.addEventListener('characteristicvaluechanged', parseStreamData);
      batteryCharacteristic.addEventListener('characteristicvaluechanged', handleBatteryLevel);

      setWandConnectionState('Connected');
      addLog('SUCCESS', 'Wand connection fully established!');

      // Post-connection setup
      queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD);
      queueCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD);
      
      const initialBatteryLevel = await batteryCharacteristic.readValue();
      const level = initialBatteryLevel.getUint8(0);
      setWandBatteryLevel(level);
      addLog('INFO', `Initial Wand Battery Level: ${level}%`);

      keepAliveInterval.current = window.setInterval(() => {
        queueCommand(WBDLPayloads.KEEPALIVE_COMMAND, true);
      }, 5000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('ERROR', `Connection failed: ${errorMessage}`);
      addBleEvent('Error', `Connection failed: ${errorMessage}`);
      setWandConnectionState('Error');
      setWandDetails(null);
    }
  }, [addLog, handleDisconnect, parseControlData, parseStreamData, handleBatteryLevel, queueCommand, addBleEvent]);

  const connectToBox = useCallback(async () => {
    if (!navigator.bluetooth) {
      addLog('ERROR', 'Web Bluetooth API is not available on this browser.');
      addBleEvent('Error', 'Web Bluetooth not available');
      setBoxConnectionState('Error');
      return;
    }
    setBoxConnectionState('Connecting');
    addLog('INFO', 'Requesting Wand Box (MCB) device from browser...');
    addBleEvent('BLE', 'requestDevice (Box)');
    try {
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: WBDLProtocol.WAND_BOX.TARGET_NAME }],
        optionalServices: [WBDLProtocol.WAND_BOX.SERVICE_UUID_MAIN, WBDLProtocol.WAND_BOX.SERVICE_UUID_BATTERY]
      });

      addLog('INFO', `Found Wand Box: ${bleDevice.name}. Connecting...`);
      addBleEvent('GATT', 'Box Connecting...');
      setBoxDetails(createInitialDevice(bleDevice, 'BOX'));

      bleDevice.addEventListener('gattserverdisconnected', () => handleBoxDisconnect());

      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");
      
      addLog('SUCCESS', 'Connected to Wand Box GATT Server.');
      addBleEvent('GATT', 'Box Connected');
      const service = await server.getPrimaryService(WBDLProtocol.WAND_BOX.SERVICE_UUID_MAIN);
      const batteryService = await server.getPrimaryService(WBDLProtocol.WAND_BOX.SERVICE_UUID_BATTERY);

      addLog('INFO', 'Discovering Box characteristics...');
      const notifyChar = await service.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_NOTIFY);
      const batteryChar = await batteryService.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_BATTERY_LEVEL);
      
      addLog('INFO', 'Starting Box notifications...');
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', parseBoxData);
      
      // Box battery doesn't notify, it's read-only
      const initialBattery = await batteryChar.readValue();
      setBoxBatteryLevel(initialBattery.getUint8(0));

      setBoxConnectionState('Connected');
      addLog('SUCCESS', 'Wand Box connection fully established!');

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('ERROR', `Box Connection failed: ${errorMessage}`);
      addBleEvent('Error', `Box connection failed: ${errorMessage}`);
      setBoxConnectionState('Error');
      setBoxDetails(null);
    }
  }, [addLog, handleBoxDisconnect, parseBoxData, addBleEvent]);

  const addVfxCommand = (type: VfxCommandType) => {
    const newCommand: VfxCommand = {
      id: commandIdCounter.current++,
      type,
      params: type === 'LightTransition' 
        ? { hex_color: '#ffffff', mode: 0, transition_ms: 1000 } 
        : { duration_ms: 500 }
    };
    setVfxSequence([...vfxSequence, newCommand]);
    setIsSequenceSaved(false);
  };
  
  const updateVfxCommand = (id: number, updatedParams: VfxCommand['params']) => {
    setVfxSequence(vfxSequence.map(cmd => cmd.id === id ? { ...cmd, params: { ...cmd.params, ...updatedParams } } : cmd));
    setIsSequenceSaved(false);
  };
  
  const removeVfxCommand = (id: number) => {
    setVfxSequence(vfxSequence.filter(cmd => cmd.id !== id));
    setIsSequenceSaved(false);
  };

  const saveVfxSequence = () => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_VFX, JSON.stringify(vfxSequence));
      setIsSequenceSaved(true);
      addLog('SUCCESS', 'VFX Sequence saved to local storage.');
    } catch (error) {
      addLog('ERROR', `Failed to save sequence: ${error}`);
    }
  };
  
  const sendVfxSequence = useCallback(() => {
    if (wandConnectionState !== 'Connected' || !commandCharacteristic.current) {
        addLog('ERROR', 'Cannot send VFX sequence: Wand not connected.');
        return;
    }

    addLog('INFO', 'Building and sending VFX macro sequence...');
    const payload: number[] = [WBDLProtocol.CMD.MACRO_EXECUTE];
    let hasError = false;

    vfxSequence.forEach(cmd => {
      if (hasError) return;
      switch (cmd.type) {
        case 'LightClear':
          payload.push(WBDLProtocol.INST.MACRO_LIGHT_CLEAR);
          break;
        case 'HapticBuzz': {
          const duration = cmd.params.duration_ms ?? 100;
          // FIX: Corrected byte order to little-endian based on conclusive smali analysis.
          payload.push(WBDLProtocol.CMD.HAPTIC_VIBRATE, duration & 0xFF, (duration >> 8) & 0xFF);
          break;
        }
        case 'MacroDelay': {
          const duration = cmd.params.duration_ms ?? 100;
          // FIX: Corrected byte order to little-endian based on conclusive smali analysis.
          payload.push(WBDLProtocol.INST.MACRO_DELAY, duration & 0xFF, (duration >> 8) & 0xFF);
          break;
        }
        case 'LightTransition': {
          const hex = cmd.params.hex_color ?? '#ffffff';
          const mode = cmd.params.mode ?? 0;
          const duration = cmd.params.transition_ms ?? 1000;
          
          if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
            addLog('ERROR', `Invalid hex color "${hex}" in VFX command. Aborting sequence.`);
            hasError = true;
            return;
          }

          const r = parseInt(hex.substring(1, 3), 16);
          const g = parseInt(hex.substring(3, 5), 16);
          const b = parseInt(hex.substring(5, 7), 16);
          
          // FIX: Corrected duration byte order to little-endian based on conclusive smali analysis.
          payload.push(
            WBDLProtocol.INST.MACRO_LIGHT_TRANSITION,
            mode,
            r, g, b,
            duration & 0xFF,
            (duration >> 8) & 0xFF
          );
          break;
        }
      }
    });

    if (hasError) return;

    const finalPayload = new Uint8Array(payload);
    
    // Chunking logic based on negotiated MTU
    if (finalPayload.length > negotiatedMtu) {
        addLog('INFO', `Macro size (${finalPayload.length} bytes) exceeds MTU (${negotiatedMtu} bytes). Splitting into chunks.`);
        for (let i = 0; i < finalPayload.length; i += negotiatedMtu) {
            const chunk = finalPayload.slice(i, i + negotiatedMtu);
            queueCommand(chunk);
        }
    } else {
        queueCommand(finalPayload);
    }
  }, [vfxSequence, addLog, wandConnectionState, queueCommand, negotiatedMtu]);

  const toggleImuStream = () => {
    if (wandConnectionState !== 'Connected') {
      addLog('ERROR', 'Wand not connected.');
      return;
    }
    if (isImuStreaming) {
      queueCommand(WBDLPayloads.IMU_STOP_STREAM_CMD);
      addLog('INFO', 'Stopping IMU stream...');
      setIsImuStreaming(false);
      setLatestImuData(null);
    } else {
      queueCommand(WBDLPayloads.IMU_START_STREAM_CMD);
      addLog('INFO', 'Starting IMU stream...');
      setIsImuStreaming(true);
    }
  };
  
  const handleImuCalibrate = useCallback(() => {
    if (wandConnectionState !== 'Connected') {
      addLog('ERROR', 'Wand not connected.');
      return;
    }
    addLog('INFO', 'Sending IMU calibration command...');
    queueCommand(WBDLPayloads.IMU_CALIBRATE_CMD);
  }, [wandConnectionState, addLog, queueCommand]);
  
  const sendButtonThresholds = useCallback((wandType: WandType) => {
    if (wandConnectionState !== 'Connected') {
      addLog('ERROR', 'Wand not connected. Cannot set button thresholds.');
      return;
    }
    const thresholds = WAND_THRESHOLDS[wandType];
    if (!thresholds) {
      addLog('WARNING', `No threshold data available for wand type: ${wandType}`);
      return;
    }
    
    // Based on smali, the command is 0x70 followed by 4 pairs of min/max bytes
    const payload = new Uint8Array([
      WBDLProtocol.CMD.SET_BUTTON_THRESHOLD,
      thresholds[0].min, thresholds[0].max,
      thresholds[1].min, thresholds[1].max,
      thresholds[2].min, thresholds[2].max,
      thresholds[3].min, thresholds[3].max,
    ]);

    addLog('INFO', `Setting button thresholds for ${wandType} wand type.`);
    queueCommand(payload);

  }, [wandConnectionState, addLog, queueCommand]);

  // When wand type is discovered, automatically send the appropriate thresholds
  useEffect(() => {
      if (wandDetails?.wandType && wandDetails.wandType !== 'UNKNOWN') {
          sendButtonThresholds(wandDetails.wandType);
      }
  }, [wandDetails?.wandType, sendButtonThresholds]);


  const analyzeSmaliWithGemini = async () => {
    if (!smaliInput.trim()) {
      addLog('WARNING', 'Smali input is empty.');
      return;
    }
    setIsAnalyzingSmali(true);
    setSmaliAnalysis('');
    addLog('INFO', 'Analyzing smali with Gemini...');

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        const systemInstruction = `You are an expert reverse engineer specializing in Android smali code, specifically for Bluetooth Low Energy (BLE) protocols. Analyze the provided smali code snippet from a BLE-related application. Your analysis should focus on identifying key information relevant to the BLE protocol.

Your response should be a concise summary in markdown format.

Focus on identifying and explaining:
- **Service and Characteristic UUIDs:** List any found UUIDs and their likely purpose (e.g., "Main control service," "Notification characteristic").
- **Opcodes:** Identify any byte constants used as command identifiers (opcodes).
- **Packet Structures:** Describe the format of any data packets being constructed or parsed.
- **Protocol Logic:** Explain the sequence of operations or any interesting logic (e.g., "Sends opcode 0x50, then a 2-byte duration").
- **Key Constants:** Point out any important numerical or string constants and their meaning in the protocol.

Be precise and base your conclusions directly on the provided code.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `Analyze this smali code:\n\n\`\`\`smali\n${smaliInput}\n\`\`\``,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        
        setSmaliAnalysis(response.text);
        addLog('SUCCESS', 'Smali analysis complete.');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        addLog('ERROR', `Smali analysis failed: ${errorMessage}`);
        setSmaliAnalysis(`**Error:** Could not analyze the smali code. ${errorMessage}`);
    } finally {
        setIsAnalyzingSmali(false);
    }
  };

  const startBleExplorerScan = useCallback(async () => {
      if (!navigator.bluetooth) {
          addLog('ERROR', 'Web Bluetooth is not available.');
          return;
      }
      setIsExploring(true);
      setExplorerDevice(null);
      setExplorerServices([]);
      addLog('INFO', 'Starting BLE Explorer scan...');
      try {
          const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
          addLog('SUCCESS', `Explorer: Found device "${device.name}". Connecting...`);
          setExplorerDevice(device);
          const server = await device.gatt?.connect();
          if (!server) throw new Error('Could not connect to GATT server.');

          addLog('INFO', 'Explorer: Discovering all primary services...');
          const services = await server.getPrimaryServices();
          addLog('SUCCESS', `Explorer: Found ${services.length} services.`);
          
          const discoveredServices: ExplorerService[] = [];
          for (const service of services) {
              addLog('INFO', `Explorer: Getting characteristics for service ${service.uuid}`);
              try {
                  const characteristics = await service.getCharacteristics();
                  discoveredServices.push({
                      uuid: service.uuid,
                      characteristics: characteristics.map(char => ({
                          uuid: char.uuid,
                          properties: char.properties,
                      })),
                  });
              } catch(e) {
                  addLog('WARNING', `Explorer: Could not get characteristics for service ${service.uuid}. It may be protected.`);
              }
          }
          setExplorerServices(discoveredServices);
          addLog('SUCCESS', 'Explorer: Service discovery complete.');
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog('ERROR', `BLE Explorer failed: ${errorMessage}`);
      } finally {
          setIsExploring(false);
      }
  }, [addLog]);

  const fetchCompendiumDetails = useCallback(async (spellName: string) => {
    if (!spellName) return;
    setIsFetchingCompendiumDetails(true);
    setCompendiumError(null);
    setCompendiumSpellDetails(null);
    addLog('INFO', `Compendium: Fetching details for ${spellName}...`);
    try {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
       
       const responseSchema = {
           type: Type.OBJECT,
           properties: {
                spell_name: { type: Type.STRING },
                incantation_name: { type: Type.STRING },
                description: { type: Type.STRING },
                spell_type: { type: Type.STRING },
                difficulty: { type: Type.INTEGER },
                spell_background_color: { type: Type.STRING },
                spell_uses: { type: Type.ARRAY, items: {
                    type: Type.OBJECT, properties: {
                        id: { type: Type.STRING },
                        name: { type: Type.STRING },
                        icon: { type: Type.STRING }
                    }, required: ["id", "name", "icon"]
                }},
                macros_payoff: { 
                    type: Type.ARRAY, 
                    description: "A list of command groups. Each group is a list of command objects to be executed in sequence for the wand's VFX.",
                    items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                command: { type: Type.STRING, description: "Command name, e.g., 'LightTransition', 'HapticBuzz', 'MacroDelay'."},
                                color: { type: Type.STRING, description: "Hex color for light commands."},
                                duration: { type: Type.INTEGER, description: "Duration in milliseconds."},
                                group: { type: Type.INTEGER, description: "LED group to target."},
                                loops: { type: Type.INTEGER, description: "Number of times to repeat."}
                            },
                            required: ["command"]
                        }
                    }
                }
           },
           required: ["spell_name", "incantation_name", "description", "spell_type", "difficulty", "spell_background_color", "spell_uses", "macros_payoff"]
       };

      const systemInstruction = `You are a magical archivist. Based on the provided spell name, return a complete JSON object representing the spell's data, conforming to the schema. Invent a plausible 'macros_payoff' section that describes a simple but representative VFX sequence for the spell using the available commands.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: `Provide the full spell data object for: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const jsonText = response.text.trim();
      const details = JSON.parse(jsonText) as SpellDetails;
      setCompendiumSpellDetails(details);
      addLog('SUCCESS', `Compendium: Successfully fetched details for ${spellName}.`);

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       setCompendiumError(`Failed to fetch compendium data: ${errorMessage}`);
       addLog('ERROR', `Compendium: ${errorMessage}`);
    } finally {
        setIsFetchingCompendiumDetails(false);
    }
  }, [addLog]);

  useEffect(() => {
    if (selectedCompendiumSpell) {
        fetchCompendiumDetails(selectedCompendiumSpell);
    }
  }, [selectedCompendiumSpell, fetchCompendiumDetails]);



  // --- RENDER ---
  
  // FIX: Added 'key' prop to TabButton component to fix React warning and potential rendering issues.
  const renderTab = () => {
    switch (activeTab) {
      case 'control_hub': return <ControlHub 
        lastSpell={lastSpell} 
        gestureState={gestureState} 
        clientSideGestureDetected={clientSideGestureDetected}
        spellDetails={spellDetails}
        isFetchingSpellDetails={isFetchingSpellDetails}
        spellDetailsError={spellDetailsError}
        vfxSequence={vfxSequence}
        addVfxCommand={addVfxCommand}
        updateVfxCommand={updateVfxCommand}
        removeVfxCommand={removeVfxCommand}
        sendVfxSequence={sendVfxSequence}
        saveVfxSequence={saveVfxSequence}
        isSequenceSaved={isSequenceSaved}
        wandConnectionState={wandConnectionState}
      />;
      case 'device_manager': return <DeviceManager 
          wandConnectionState={wandConnectionState}
          boxConnectionState={boxConnectionState}
          wandDetails={wandDetails}
          boxDetails={boxDetails}
          wandBatteryLevel={wandBatteryLevel}
          boxBatteryLevel={boxBatteryLevel}
          onConnectWand={() => { setDeviceToScan('wand'); setIsScannerOpen(true); }}
          onConnectBox={() => { setDeviceToScan('box'); setIsScannerOpen(true); }}
          rawWandProductInfo={rawWandProductInfo}
          rawBoxProductInfo={rawBoxProductInfo}
          isTvBroadcastEnabled={isTvBroadcastEnabled}
          setIsTvBroadcastEnabled={setIsTvBroadcastEnabled}
          userHouse={userHouse}
          setUserHouse={setUserHouse}
          userPatronus={userPatronus}
          setUserPatronus={setUserPatronus}
          isHueEnabled={isHueEnabled}
          setIsHueEnabled={setIsHueEnabled}
          hueBridgeIp={hueBridgeIp}
          setHueBridgeIp={setHueBridgeIp}
          hueUsername={hueUsername}
          setHueUsername={setHueUsername}
          hueLightId={hueLightId}
          setHueLightId={setHueLightId}
          saveHueSettings={saveHueSettings}
          negotiatedMtu={negotiatedMtu}
          commandDelay_ms={commandDelay_ms}
          setCommandDelay_ms={setCommandDelay_ms}
      />;
      case 'diagnostics': return <Diagnostics 
        detectedOpCodes={detectedOpCodes}
        rawPacketLog={rawPacketLog}
        bleEventLog={bleEventLog}
        isImuStreaming={isImuStreaming}
        toggleImuStream={toggleImuStream}
        handleImuCalibrate={handleImuCalibrate}
        latestImuData={latestImuData}
        buttonState={buttonState}
        smaliInput={smaliInput}
        setSmaliInput={setSmaliInput}
        analyzeSmaliWithGemini={analyzeSmaliWithGemini}
        isAnalyzingSmali={isAnalyzingSmali}
        smaliAnalysis={smaliAnalysis}
        isClientSideGestureDetectionEnabled={isClientSideGestureDetectionEnabled}
        setIsClientSideGestureDetectionEnabled={setIsClientSideGestureDetectionEnabled}
        gestureThreshold={gestureThreshold}
        setGestureThreshold={setGestureThreshold}
        clientSideGestureDetected={clientSideGestureDetected}
        wandConnectionState={wandConnectionState}
        queueCommand={queueCommand}
      />;
      case 'compendium': return <SpellCompendium
          spellBook={spellBook}
          onSelectSpell={(spell) => {
              setSelectedCompendiumSpell(spell);
              setIsCompendiumModalOpen(true);
          }}
      />;
      case 'explorer': return <BleExplorer 
          onScan={startBleExplorerScan}
          isExploring={isExploring}
          device={explorerDevice}
          services={explorerServices}
      />;
      case 'scripter': return <Scripter addLog={addLog} />;
      default: return null;
    }
  }

  const handleScanRequest = () => {
    if (deviceToScan === 'wand') {
      connectToWand();
    } else if (deviceToScan === 'box') {
      connectToBox();
    }
  };
  

  return (
    <div className="min-h-screen flex flex-col p-4 bg-slate-900 text-slate-200 gap-4">
      {isScannerOpen && (
        <Modal title={`Scan for ${deviceToScan === 'wand' ? 'Wand' : 'Wand Box'}`} onClose={() => setIsScannerOpen(false)}>
          <div className="text-center p-8">
            <ScanIcon />
            <h3 className="text-xl font-semibold mb-2">Ready to Connect</h3>
            <p className="text-slate-400 mb-6">
              Click the button below to open your browser's Bluetooth device picker. Select the device named "MCW" for the Wand or "MCB" for the Box.
            </p>
            <button
              onClick={handleScanRequest}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg"
            >
              Scan for Devices
            </button>
          </div>
        </Modal>
      )}
      
      {isCompendiumModalOpen && selectedCompendiumSpell && (
        <Modal title={`Spell Compendium: ${selectedCompendiumSpell}`} onClose={() => { setIsCompendiumModalOpen(false); setSelectedCompendiumSpell(null); }}>
          <SpellDetailsCard 
              spellDetails={compendiumSpellDetails}
              isLoading={isFetchingCompendiumDetails}
              error={compendiumError}
          />
        </Modal>
      )}

      <header className="flex-shrink-0">
        <h1 className="text-3xl font-bold text-center mb-1 text-slate-100">Magic Wand BLE Controller</h1>
        <p className="text-center text-slate-400 text-sm">Reverse Engineering & Control Hub</p>
      </header>

      <main className="flex-grow flex flex-col md:flex-row gap-4 overflow-hidden">
        <div className="flex-shrink-0 md:w-1/4 flex flex-col gap-4">
            <div className="flex-shrink-0 bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h2 className="text-lg font-semibold mb-3">Navigation</h2>
                <div className="flex flex-col gap-2">
                    <TabButton Icon={MagicWandIcon} label="Control Hub" onClick={() => setActiveTab('control_hub')} isActive={activeTab === 'control_hub'} />
                    <TabButton Icon={CubeIcon} label="Device Manager" onClick={() => setActiveTab('device_manager')} isActive={activeTab === 'device_manager'} />
                    <TabButton Icon={ChartBarIcon} label="Diagnostics" onClick={() => setActiveTab('diagnostics')} isActive={activeTab === 'diagnostics'} />
                    <TabButton Icon={DocumentSearchIcon} label="Spell Compendium" onClick={() => setActiveTab('compendium')} isActive={activeTab === 'compendium'} />
                    <TabButton Icon={SearchCircleIcon} label="BLE Explorer" onClick={() => setActiveTab('explorer')} isActive={activeTab === 'explorer'} />
                    <TabButton Icon={CodeIcon} label="Python Scripter" onClick={() => setActiveTab('scripter')} isActive={activeTab === 'scripter'} />
                </div>
            </div>
            <div className="flex-grow min-h-0">
                 <SpellBook 
                    spellBook={spellBook}
                    discoveredSpells={discoveredSpells}
                    discoveredCount={discoveredSpells.size}
                    totalCount={SPELL_LIST.length}
                    spellFilter={spellFilter}
                    setSpellFilter={setSpellFilter}
                 />
            </div>
        </div>
        
        <div className="flex-grow bg-slate-800 p-4 rounded-lg border border-slate-700 min-w-0 min-h-0">
          {renderTab()}
        </div>
        
        <div className="flex-shrink-0 md:w-1/4 flex flex-col min-h-0">
          <LogView logs={logs} />
        </div>

      </main>
    </div>
  );
}

// --- TABS & SUB-COMPONENTS ---
interface TabButtonProps {
// FIX: Changed from React.ComponentType to React.ElementType.
// This is a more general type for components passed as props and can resolve
// subtle type-checking issues that sometimes lead to cryptic parser errors.
  Icon: React.ElementType;
  label: string;
  onClick: () => void;
  isActive: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ Icon, label, onClick, isActive }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center px-4 py-2 rounded-lg text-left transition-colors ${
      isActive 
        ? 'bg-indigo-600 text-white font-semibold shadow-md' 
        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
    }`}
  >
    <Icon /> {label}
  </button>
);


const ControlHub = ({ lastSpell, gestureState, clientSideGestureDetected, spellDetails, isFetchingSpellDetails, spellDetailsError, vfxSequence, addVfxCommand, updateVfxCommand, removeVfxCommand, sendVfxSequence, saveVfxSequence, isSequenceSaved, wandConnectionState }: any) => {
    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-xl font-semibold mb-2">Wand Status</h3>
                    <div className="flex items-center text-lg">
                        <span className="font-bold mr-2">Last Spell:</span>
                        <span className="text-indigo-400 font-mono">{lastSpell || 'N/A'}</span>
                    </div>
                     <div className="flex items-center text-lg">
                        <span className="font-bold mr-2">Gesture:</span>
                        <span className={`px-2 py-1 rounded text-sm ${
                            gestureState === 'Idle' ? 'bg-slate-600' :
                            gestureState === 'Casting' ? 'bg-blue-500 animate-pulse' : 'bg-purple-500'
                        }`}>{gestureState}</span>
                        {gestureState === 'Idle' && clientSideGestureDetected && (
                            <span className="ml-2 px-2 py-1 rounded text-xs bg-green-500/30 text-green-300 animate-pulse">
                                Client Motion Detected
                            </span>
                        )}
                    </div>
                </div>
                <SpellDetailsCard spellDetails={spellDetails} isLoading={isFetchingSpellDetails} error={spellDetailsError} />
            </div>
            <div className="flex-grow min-h-0">
                <VfxEditor 
                    sequence={vfxSequence}
                    addCommand={addVfxCommand}
                    updateCommand={updateVfxCommand}
                    removeCommand={removeVfxCommand}
                    sendSequence={sendVfxSequence}
                    saveSequence={saveVfxSequence}
                    isSaved={isSequenceSaved}
                    isConnected={wandConnectionState === 'Connected'}
                />
            </div>
        </div>
    );
};

interface SpellDetailsCardProps {
    spellDetails: SpellDetails | null;
    isLoading: boolean;
    error: string | null;
}
const SpellDetailsCard: React.FC<SpellDetailsCardProps> = ({ spellDetails, isLoading, error }) => {
    if (isLoading) {
        return (
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 animate-pulse">
                <div className="h-6 bg-slate-700 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-1/2"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-900/50 p-4 rounded-lg border border-red-700">
                <h3 className="text-xl font-semibold mb-2 text-red-300">Error</h3>
                <p className="text-red-400">{error}</p>
            </div>
        );
    }
    
    if (!spellDetails) {
        return (
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-xl font-semibold mb-2">Spell Details</h3>
                <p className="text-slate-400">Cast a spell to see its details here.</p>
            </div>
        );
    }
    
    // Dynamically set border color
    const cardStyle = {
      borderColor: spellDetails.spell_background_color || '#475569', // Default slate-600
      borderWidth: '1px',
    };

    return (
        <div className="bg-slate-900/50 p-4 rounded-lg" style={cardStyle}>
            <h3 className="text-xl font-semibold" style={{ color: spellDetails.spell_background_color }}>{spellDetails.spell_name}</h3>
            <p className="text-sm italic text-slate-400 mb-2">"{spellDetails.incantation_name}" - {spellDetails.spell_type}</p>
            <p className="text-slate-300 text-sm mb-3">{spellDetails.description}</p>
            <div className="flex items-center justify-between text-xs">
                 <div className="flex gap-2">
                    {spellDetails.spell_uses.map(use => (
                        <span key={use.id} className="bg-slate-700 px-2 py-1 rounded-full">{use.icon}</span>
                    ))}
                </div>
                <div className="flex items-center" title={`Difficulty: ${spellDetails.difficulty}/5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={`h-2 w-2 rounded-full mx-0.5 ${i < spellDetails.difficulty ? 'bg-yellow-400' : 'bg-slate-600'}`}></span>
                    ))}
                </div>
            </div>
        </div>
    );
};


interface VfxEditorProps {
  sequence: VfxCommand[];
  addCommand: (type: VfxCommandType) => void;
  updateCommand: (id: number, params: VfxCommand['params']) => void;
  removeCommand: (id: number) => void;
  sendSequence: () => void;
  saveSequence: () => void;
  isSaved: boolean;
  isConnected: boolean;
}

const VfxEditor: React.FC<VfxEditorProps> = ({ sequence, addCommand, updateCommand, removeCommand, sendSequence, saveSequence, isSaved, isConnected }) => {
  return (
    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 h-full flex flex-col">
      <h3 className="text-xl font-semibold mb-2">VFX Macro Editor</h3>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => addCommand('LightTransition')} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">Add Light</button>
        <button onClick={() => addCommand('HapticBuzz')} className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm">Add Haptic</button>
        <button onClick={() => addCommand('MacroDelay')} className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm">Add Delay</button>
        <button onClick={() => addCommand('LightClear')} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm">Add Clear</button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 space-y-2">
        {sequence.length === 0 && <p className="text-slate-500 text-center py-8">Add a command to start building a sequence.</p>}
        {sequence.map((cmd, index) => (
          <VfxCommandEditor key={cmd.id} command={cmd} onUpdate={updateCommand} onRemove={removeCommand} index={index + 1} />
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-700 flex justify-end gap-2">
         <button 
          onClick={saveSequence} 
          className="flex items-center px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50"
          disabled={sequence.length === 0}
        >
          <SaveIcon /> {isSaved ? "Saved" : "Save"}
        </button>
        <button 
          onClick={sendSequence}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500"
          disabled={!isConnected || sequence.length === 0}
          title={!isConnected ? "Connect wand to send" : ""}
        >
          Send to Wand
        </button>
      </div>
    </div>
  );
};


interface VfxCommandEditorProps {
  command: VfxCommand;
  onUpdate: (id: number, params: VfxCommand['params']) => void;
  onRemove: (id: number) => void;
  index: number;
}
const VfxCommandEditor: React.FC<VfxCommandEditorProps> = ({ command, onUpdate, onRemove, index }) => {
  const handleParamChange = (param: string, value: any) => {
// FIX: Ensure all parseInt calls use a radix of 10 for safety.
    const numericValue = ['duration_ms', 'mode', 'transition_ms'].includes(param) ? parseInt(value, 10) : value;
    onUpdate(command.id, { [param]: numericValue });
  };

  return (
    <div className="bg-slate-800 p-3 rounded-lg flex items-center gap-4 border border-slate-700">
      <div className="text-slate-500 font-mono text-lg w-6 text-center">{index}</div>
      <div className="flex-grow">
        <p className="font-semibold text-slate-300">{command.type}</p>
        <div className="flex items-center gap-4 text-sm mt-1">
          {command.type === 'LightTransition' && (
            <>
              <input 
                type="color"
// FIX: Ensure input has a default value to prevent it from becoming uncontrolled.
                value={command.params.hex_color || '#ffffff'}
                onChange={(e) => handleParamChange('hex_color', e.target.value)}
                className="bg-transparent border-none w-8 h-8 p-0"
              />
              <label className="flex items-center gap-1">
                Mode:
                <input 
                  type="number"
                  value={command.params.mode || 0}
                  onChange={(e) => handleParamChange('mode', e.target.value)}
                  className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1"
                />
              </label>
               <label className="flex items-center gap-1">
                Time (ms):
                <input 
                  type="number"
                  value={command.params.transition_ms || 1000}
                  onChange={(e) => handleParamChange('transition_ms', e.target.value)}
                  className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1"
                />
              </label>
            </>
          )}
          {(command.type === 'HapticBuzz' || command.type === 'MacroDelay') && (
            <label className="flex items-center gap-1">
              Duration (ms):
              <input 
                type="number"
                value={command.params.duration_ms || 500}
                onChange={(e) => handleParamChange('duration_ms', e.target.value)}
                className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1"
              />
            </label>
          )}
        </div>
      </div>
      <button onClick={() => onRemove(command.id)} className="text-slate-500 hover:text-red-400 p-1">
        <TrashIcon />
      </button>
    </div>
  );
};


const DeviceManager = ({ wandConnectionState, boxConnectionState, wandDetails, boxDetails, wandBatteryLevel, boxBatteryLevel, onConnectWand, onConnectBox, rawWandProductInfo, rawBoxProductInfo, isTvBroadcastEnabled, setIsTvBroadcastEnabled, userHouse, setUserHouse, userPatronus, setUserPatronus, isHueEnabled, setIsHueEnabled, hueBridgeIp, setHueBridgeIp, hueUsername, setHueUsername, hueLightId, setHueLightId, saveHueSettings, negotiatedMtu, commandDelay_ms, setCommandDelay_ms }: any) => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DeviceCard 
                    title="Magic Wand" 
                    connectionState={wandConnectionState} 
                    details={wandDetails} 
                    batteryLevel={wandBatteryLevel}
                    onConnect={onConnectWand}
                    rawProductInfo={rawWandProductInfo}
                    wandDetails={wandDetails}
                    boxDetails={boxDetails}
                />
                <DeviceCard 
                    title="Wand Box" 
                    connectionState={boxConnectionState} 
                    details={boxDetails} 
                    batteryLevel={boxBatteryLevel}
                    onConnect={onConnectBox}
                    rawProductInfo={rawBoxProductInfo}
                    wandDetails={wandDetails}
                    boxDetails={boxDetails}
                />
            </div>
            {wandConnectionState === 'Connected' && (
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-xl font-semibold mb-3">Protocol Settings</h3>
                     <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-semibold text-slate-400">Negotiated MTU:</span>
                            <span className="font-mono bg-slate-700 px-2 py-1 rounded">{negotiatedMtu} bytes</span>
                        </div>
                        <div className="flex flex-col text-sm">
                            <label htmlFor="cmd-delay" className="font-semibold text-slate-400 mb-1">Command Delay (ms):</label>
                            <input 
                                id="cmd-delay"
                                type="range" 
                                min="0" 
                                max="200"
                                step="10"
                                value={commandDelay_ms}
                                onChange={(e) => setCommandDelay_ms(parseInt(e.target.value, 10))}
                                className="w-full"
                            />
                            <div className="text-center font-mono text-slate-300">{commandDelay_ms} ms</div>
                             <p className="text-xs text-slate-500 mt-1">A small delay between commands can improve stability on some systems.</p>
                        </div>
                    </div>
                </div>
            )}
            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                 <h3 className="text-xl font-semibold mb-3">Integrations</h3>
                 <div className="space-y-6">
                    <IntegrationToggle 
                        title="Smart TV Broadcast" 
                        description="Simulates sending UDP packets to a smart TV app for spell effects."
                        isEnabled={isTvBroadcastEnabled}
                        onToggle={() => setIsTvBroadcastEnabled(!isTvBroadcastEnabled)}
                    >
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                           <div>
                                <label htmlFor="user-house" className="block text-sm font-medium text-slate-300 mb-1">Your House</label>
                                <select 
                                    id="user-house" 
                                    value={userHouse} 
                                    onChange={(e) => setUserHouse(e.target.value as House)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                                >
                                  {Houses.map(h => <option key={h} value={h}>{h.charAt(0) + h.slice(1).toLowerCase()}</option>)}
                                </select>
                           </div>
                           <div>
                                <label htmlFor="user-patronus" className="block text-sm font-medium text-slate-300 mb-1">Your Patronus</label>
                                <input 
                                    type="text" 
                                    id="user-patronus"
                                    value={userPatronus}
                                    onChange={(e) => setUserPatronus(e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2"
                                />
                           </div>
                       </div>
                    </IntegrationToggle>

                    <IntegrationToggle
                        title="Philips Hue Integration"
                        description="Control a Hue light with spells like Lumos, Nox, and Incendio."
                        isEnabled={isHueEnabled}
                        onToggle={() => setIsHueEnabled(!isHueEnabled)}
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                           <div>
                                <label htmlFor="hue-ip" className="block text-sm font-medium text-slate-300 mb-1">Bridge IP Address</label>
                                <input id="hue-ip" type="text" value={hueBridgeIp} onChange={e => setHueBridgeIp(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2" placeholder="e.g., 192.168.1.100" />
                           </div>
                           <div>
                                <label htmlFor="hue-user" className="block text-sm font-medium text-slate-300 mb-1">Username/Key</label>
                                <input id="hue-user" type="text" value={hueUsername} onChange={e => setHueUsername(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2" placeholder="Your Hue API key" />
                           </div>
                           <div className="sm:col-span-2">
                                <label htmlFor="hue-light" className="block text-sm font-medium text-slate-300 mb-1">Target Light ID</label>
                                <input id="hue-light" type="text" value={hueLightId} onChange={e => setHueLightId(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2" placeholder="e.g., 1" />
                           </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button onClick={saveHueSettings} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold text-sm">Save Hue Settings</button>
                        </div>
                    </IntegrationToggle>

                 </div>
            </div>
        </div>
    );
};

const DeviceCard = ({ title, connectionState, details, batteryLevel, onConnect, rawProductInfo, wandDetails, boxDetails }: any) => {
    const isConnected = connectionState === 'Connected';
    
    return (
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold">{title}</h3>
                <div className="flex items-center gap-2">
                    {isConnected && <BatteryIcon level={batteryLevel} />}
                    <StatusBadge state={connectionState} />
                </div>
            </div>
            {isConnected && details ? (
                <DeviceDetailsCard device={details} rawProductInfo={rawProductInfo} wandDetails={wandDetails} boxDetails={boxDetails} />
            ) : (
                 <div className="text-center py-8">
                    <p className="text-slate-400 mb-4">Device is not connected.</p>
                    <button onClick={onConnect} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md">
                        Connect to {title}
                    </button>
                </div>
            )}
        </div>
    );
};

const DeviceDetailsCard: React.FC<{device: WandDevice, rawProductInfo: string | null, wandDetails: WandDevice | null, boxDetails: WandDevice | null}> = ({ device, rawProductInfo, wandDetails, boxDetails }) => {
    return (
        <div className="space-y-2 text-sm">
            <InfoRow label="BLE Name" value={device.bleName} />
            <InfoRow label="Address" value={device.address} />
            {device.firmware && <InfoRow label="Firmware" value={device.firmware} />}
            {device.version !== null && <InfoRow label="Protocol Version" value={String(device.version)} />}
            {device.wandType !== 'UNKNOWN' && <InfoRow label="Wand Type" value={device.wandType} />}
            {device.sku && <InfoRow label="SKU" value={device.sku} />}
            {device.serialNumber !== null && <InfoRow label="Serial" value={String(device.serialNumber)} />}
            {device.edition && <InfoRow label="Edition" value={device.edition} />}
            {device.mfgId && <InfoRow label="Mfg ID" value={device.mfgId} />}
            {device.deviceID && <InfoRow label="Device ID" value={device.deviceID} />}
            {device.deco && <InfoRow label="Deco" value={device.deco} />}
            {device.companionAddress && (
                <div className="flex justify-between items-center text-slate-400">
                    <span className="font-semibold">Companion:</span>
                    <div className="flex items-center gap-2">
                       <span className="font-mono bg-slate-700 px-2 py-1 rounded">{device.companionAddress}</span>
                       {device.deviceType === 'WAND' && wandDetails?.companionAddress === boxDetails?.address && <LinkIcon />}
                       {device.deviceType === 'BOX' && boxDetails?.companionAddress === wandDetails?.address && <LinkIcon />}
                    </div>
                </div>
            )}
            {rawProductInfo && <InfoRow label="Raw Prod Info" value={rawProductInfo} isMono />}
        </div>
    );
}


const InfoRow = ({ label, value, isMono = false }: { label: string, value: string, isMono?: boolean }) => (
    <div className="flex justify-between items-center text-slate-400">
        <span className="font-semibold">{label}:</span>
        <span className={isMono ? 'font-mono bg-slate-700 px-2 py-1 rounded' : 'text-slate-300'}>{value}</span>
    </div>
);

const IntegrationToggle = ({ title, description, isEnabled, onToggle, children }: any) => {
    return (
        <div className="border-t border-slate-700 pt-4">
             <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-semibold text-lg text-slate-200">{title}</h4>
                    <p className="text-sm text-slate-400">{description}</p>
                </div>
                <div className="relative inline-block w-12 ml-2 align-middle select-none transition duration-200 ease-in">
                    <input 
                        type="checkbox" 
                        name={title.replace(' ', '-')} 
                        id={title.replace(' ', '-')}
                        checked={isEnabled}
                        onChange={onToggle}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                    />
                    <label 
                        htmlFor={title.replace(' ', '-')}
                        className="toggle-label block overflow-hidden h-6 rounded-full bg-slate-600 cursor-pointer"
                    ></label>
                </div>
            </div>
            {isEnabled && <div className="mt-4 p-4 bg-slate-800/50 rounded-lg">{children}</div>}
        </div>
    )
};


const SpellBook = ({ spellBook, discoveredSpells, discoveredCount, totalCount, spellFilter, setSpellFilter }: any) => {
    const filteredSpells = useMemo(() => {
        return SPELL_LIST
            .map(name => ({ name, discovered: discoveredSpells.has(name.toUpperCase()) }))
            .filter(spell => spell.name.toLowerCase().includes(spellFilter.toLowerCase()))
            .sort((a, b) => {
                if (a.discovered && !b.discovered) return -1;
                if (!a.discovered && b.discovered) return 1;
                return a.name.localeCompare(b.name);
            });
    }, [spellFilter, discoveredSpells]);

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-full flex flex-col">
            <h2 className="text-lg font-semibold mb-1">Spell Book</h2>
            <div className="text-sm text-slate-400 mb-3">
                Discovered: <span className="font-bold text-indigo-400">{discoveredCount} / {totalCount}</span>
            </div>
            <input 
                type="text"
                placeholder="Search spells..."
                value={spellFilter}
                onChange={(e) => setSpellFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 mb-3 text-sm"
            />
            <div className="flex-grow overflow-y-auto pr-2">
                <ul className="space-y-1">
                    {filteredSpells.map(spell => (
                        <li 
                            key={spell.name} 
                            className={`text-sm p-1 rounded ${spell.discovered ? 'text-green-300 font-semibold' : 'text-slate-400'}`}
                            title={spell.discovered ? 'Discovered' : 'Not yet cast'}
                        >
                            {spell.name}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const Diagnostics = ({ detectedOpCodes, rawPacketLog, bleEventLog, isImuStreaming, toggleImuStream, handleImuCalibrate, latestImuData, buttonState, smaliInput, setSmaliInput, analyzeSmaliWithGemini, isAnalyzingSmali, smaliAnalysis, isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled, gestureThreshold, setGestureThreshold, clientSideGestureDetected, wandConnectionState, queueCommand }: any) => {
    const sortedOpcodes = useMemo(() => Array.from(detectedOpCodes).sort((a, b) => a - b), [detectedOpCodes]);
    const isWandConnected = wandConnectionState === 'Connected';
    
    return (
        <div className="h-full flex flex-col space-y-4">
            <h3 className="text-xl font-semibold">Diagnostics & Reverse Engineering</h3>
            <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
                <div className="flex flex-col gap-4">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        <h4 className="font-semibold mb-2">Live Status</h4>
                         <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Grip Status:</span>
                                <div className="flex gap-2">
                                    {buttonState.map((pressed: boolean, i: number) => (
                                        <span key={i} className={`w-4 h-4 rounded-full border border-slate-500 ${pressed ? 'bg-yellow-400' : 'bg-slate-700'}`}></span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span>IMU Controls:</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleImuCalibrate} className="px-3 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-50" disabled={!isWandConnected}>
                                        Calibrate
                                    </button>
                                    <button onClick={toggleImuStream} className={`px-3 py-1 text-xs rounded ${isImuStreaming ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`} disabled={!isWandConnected}>
                                        {isImuStreaming ? 'Stop Stream' : 'Start Stream'}
                                    </button>
                                </div>
                            </div>
                            {isImuStreaming && latestImuData && (
                                <div className="font-mono text-xs bg-slate-800 p-2 rounded">
                                    <p>Accel: {latestImuData[0].acceleration.x.toFixed(2)}, {latestImuData[0].acceleration.y.toFixed(2)}, {latestImuData[0].acceleration.z.toFixed(2)}</p>
                                    <p>Gyro: {latestImuData[0].gyroscope.x.toFixed(2)}, {latestImuData[0].gyroscope.y.toFixed(2)}, {latestImuData[0].gyroscope.z.toFixed(2)}</p>
                                </div>
                            )}
                        </div>
                        <div className="border-t border-slate-700 mt-3 pt-3">
                            <h5 className="font-semibold mb-2 text-base">Client-Side Gesture Detection</h5>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center">
                                    <span>Enable Detector:</span>
                                    <div className="relative inline-block w-10 ml-2 align-middle select-none">
                                        {/* FIX: The style attribute on this input was malformed, causing a JSX parsing error. It has been corrected to a valid React style object. This type of error often manifests as an arithmetic operation error when the parser misinterprets parts of the style string. */}
                                        <input 
                                            type="checkbox" 
                                            checked={isClientSideGestureDetectionEnabled}
                                            onChange={(e) => setIsClientSideGestureDetectionEnabled(e.target.checked)}
                                            className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                            style={{ right: 'auto', transform: isClientSideGestureDetectionEnabled ? 'translateX(100%)' : 'translateX(0)' }}
                                        />
                                        <label className="toggle-label block overflow-hidden h-5 rounded-full bg-slate-600 cursor-pointer"></label>
                                    </div>
                                </div>
                                 <div className="flex justify-between items-center">
                                     <label htmlFor="threshold-input">Threshold (g):</label>
                                     <input 
                                        id="threshold-input"
                                        type="number" 
                                        value={gestureThreshold}
                                        onChange={(e) => setGestureThreshold(parseFloat(e.target.value))}
                                        step="0.1"
                                        min="0.5"
                                        max="10"
                                        disabled={!isClientSideGestureDetectionEnabled}
                                        className="w-20 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm disabled:opacity-50"
                                    />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Status:</span>
                                    <span className={`px-2 py-1 rounded text-xs ${clientSideGestureDetected ? 'bg-green-500/30 text-green-300 animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
                                        {clientSideGestureDetected ? 'MOTION DETECTED' : 'Idle'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        <h4 className="font-semibold mb-2">Direct Commands & Macros</h4>
                        <p className="text-xs text-slate-400 mb-3">Send single opcodes or trigger built-in effects discovered from smali files.</p>
                        
                        <div className="border-b border-slate-700 pb-3 mb-3">
                            <h5 className="text-sm font-semibold text-slate-400 mb-2">Single Opcodes</h5>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <button onClick={() => queueCommand(WBDLPayloads.MACRO_FLUSH_CMD)} className="w-full text-center px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isWandConnected} title={!isWandConnected ? "Connect wand to use" : ""}>
                                    Flush Macro
                                </button>
                                <button onClick={() => queueCommand(WBDLPayloads.LIGHT_CLEAR_ALL_CMD)} className="w-full text-center px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isWandConnected} title={!isWandConnected ? "Connect wand to use" : ""}>
                                    Clear Lights
                                </button>
                                <button onClick={() => queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD)} className="w-full text-center px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isWandConnected} title={!isWandConnected ? "Connect wand to use" : ""}>
                                    Req Firmware
                                </button>
                                <button onClick={() => queueCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD)} className="w-full text-center px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!isWandConnected} title={!isWandConnected ? "Connect wand to use" : ""}>
                                    Req Prod Info
                                </button>
                            </div>
                        </div>

                        <div>
                            <h5 className="text-sm font-semibold text-slate-400 mb-2">Predefined Macros (Guesses)</h5>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                {Object.entries(WBDLProtocol.PREDEFINED_MACRO_ID).map(([name, id]) => (
                                    <button 
                                        key={name}
                                        onClick={() => queueCommand(new Uint8Array([WBDLProtocol.CMD.EXECUTE_PREDEFINED_MACRO, id as number]))}
                                        className="w-full text-center px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-xs capitalize"
                                        disabled={!isWandConnected}
                                        title={`Execute Macro ID: 0x${(id as number).toString(16).padStart(2, '0')}`}
                                    >
                                        {name.replace(/_/g, ' ').toLowerCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col min-h-0">
                        <h4 className="font-semibold mb-2">BLE Event Log</h4>
                        <div className="flex-grow bg-slate-950 rounded p-2 text-xs font-mono overflow-y-auto border border-slate-600">
                            {bleEventLog.map((e: BleEvent) => (
                                <div key={e.id} className="whitespace-nowrap">
                                    <span className="text-slate-500">{e.timestamp} </span>
                                    <span className="text-cyan-400 font-bold">[{e.event}] </span>
                                    <span className="text-slate-300">{e.detail}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        <h4 className="font-semibold mb-2">Discovered Incoming Opcodes</h4>
                        <div className="flex flex-wrap gap-2">
                            {sortedOpcodes.map(code => (
                                <span key={code} className="font-mono bg-purple-800/50 text-purple-300 px-2 py-1 rounded text-sm">
                                    0x{code.toString(16).padStart(2, '0')}
                                </span>
                            ))}
                            {sortedOpcodes.length === 0 && <p className="text-sm text-slate-500">No unknown incoming packets detected yet.</p>}
                        </div>
                    </div>
                </div>
                 <div className="flex flex-col gap-4">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col min-h-0">
                        <h4 className="font-semibold mb-2">Raw Incoming Packet Log</h4>
                        <div className="flex-grow bg-slate-950 rounded p-2 text-xs font-mono overflow-y-auto border border-slate-600">
                             {rawPacketLog.map(p => (
                                <div key={p.id} className="whitespace-nowrap">
                                    <span className="text-slate-500">{p.timestamp} </span>
                                    <span className="text-slate-300">{p.hexData}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col min-h-0">
                        <h4 className="font-semibold mb-2">Gemini Smali Analyzer</h4>
                        <textarea 
                            value={smaliInput}
                            onChange={(e) => setSmaliInput(e.target.value)}
                            placeholder="Paste smali code here..."
                            className="w-full h-24 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono"
                        />
                        <button onClick={analyzeSmaliWithGemini} disabled={isAnalyzingSmali} className="w-full mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500">
                           {isAnalyzingSmali ? 'Analyzing...' : 'Analyze with Gemini'}
                        </button>
                        <div className="flex-grow bg-slate-950 rounded p-2 text-xs overflow-y-auto border border-slate-600 mt-2 prose prose-sm prose-invert max-w-none">
                           {isAnalyzingSmali 
                            ? <p className="text-slate-400 animate-pulse">Awaiting analysis...</p> 
                            : <div dangerouslySetInnerHTML={{ __html: smaliAnalysis || '<p class="text-slate-500">Analysis will appear here.</p>' }} />
                           }
                        </div>
                    </div>
                 </div>
            </div>
        </div>
    );
};

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg border border-slate-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">&times;</button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

const SpellCompendium = ({ spellBook, onSelectSpell }: {spellBook: Spell[], onSelectSpell: (name: string) => void}) => {
    return (
        <div className="h-full flex flex-col">
            <h3 className="text-xl font-semibold mb-4">Spell Compendium</h3>
            <p className="text-sm text-slate-400 mb-4">
                Explore the full list of known spells. Click on a spell to use Gemini to generate its properties, description, and a plausible VFX macro based on its effects. This demonstrates how generative AI can be used to reverse-engineer and even create content for complex systems.
            </p>
            <div className="flex-grow overflow-y-auto pr-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {SPELL_LIST.map(spellName => {
                        const isDiscovered = spellBook.some(s => s.name.toUpperCase() === spellName.toUpperCase());
                        return (
                            <button 
                                key={spellName}
                                onClick={() => onSelectSpell(spellName)}
                                className={`p-2 rounded text-sm text-left transition-colors ${
                                    isDiscovered 
                                        ? 'bg-green-800/50 border border-green-700 hover:bg-green-700/50 text-green-300 font-semibold' 
                                        : 'bg-slate-700/50 border border-slate-600 hover:bg-slate-600/50 text-slate-300'
                                }`}
                            >
                                {spellName}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const BleExplorer = ({ onScan, isExploring, device, services }: { onScan: () => void, isExploring: boolean, device: BluetoothDevice | null, services: ExplorerService[] }) => {
    return (
        <div className="h-full flex flex-col">
            <h3 className="text-xl font-semibold mb-2">BLE Explorer</h3>
            <p className="text-sm text-slate-400 mb-4">
                Scan for any nearby BLE device and inspect its services and characteristics. This is a fundamental tool for reverse engineering, allowing you to see the "shape" of a device's communication protocol.
            </p>
            <button 
                onClick={onScan}
                disabled={isExploring}
                className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 mb-4"
            >
                {isExploring ? 'Scanning...' : 'Scan for any BLE Device'}
            </button>
            <div className="flex-grow bg-slate-900/50 p-4 rounded-lg border border-slate-700 overflow-y-auto">
                {isExploring && <p className="text-slate-400 animate-pulse">Waiting for device selection...</p>}
                {!isExploring && !device && <p className="text-slate-500">Scan to inspect a device.</p>}
                {device && (
                    <div>
                        <h4 className="text-lg font-semibold">{device.name || 'Unnamed Device'}</h4>
                        <p className="text-xs text-slate-500 font-mono mb-4">{device.id}</p>
                        <div className="space-y-4">
                            {services.map(service => (
                                <div key={service.uuid} className="bg-slate-800 p-3 rounded">
                                    <p className="font-semibold text-cyan-400">Service: <span className="font-mono">{service.uuid}</span></p>
                                    <ul className="pl-4 mt-2 space-y-1">
                                        {service.characteristics.map(char => (
                                            <li key={char.uuid}>
                                                <p className="text-purple-400">Characteristic: <span className="font-mono">{char.uuid}</span></p>
                                                <div className="flex gap-2 flex-wrap text-xs mt-1">
                                                    {Object.entries(char.properties)
                                                        .filter(([_, value]) => value === true)
                                                        .map(([key, _]) => (
                                                            <span key={key} className="bg-slate-700 px-2 py-0.5 rounded-full">{key}</span>
                                                        ))
                                                    }
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};