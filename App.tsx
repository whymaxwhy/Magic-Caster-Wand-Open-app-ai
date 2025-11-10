
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
// FIX: WandTypes is exported from types.ts, not constants.ts.
import { WBDLProtocol, WBDLPayloads, SPELL_LIST, WAND_THRESHOLDS, Houses, WAND_TYPE_IDS } from './constants';
// FIX: Added RawPacket to the import list from types.ts.
import { WandTypes, RawPacket } from './types';
import type { LogEntry, LogType, VfxCommand, VfxCommandType, Spell, IMUReading, GestureState, DeviceType, ConnectionState, WandType, WandDevice, WandDeviceType, House, SpellDetails, SpellUse, ExplorerService, ExplorerCharacteristic, BleEvent, MacroCommand, ButtonThresholds } from './types';
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
// FIX: Corrected malformed SVG path data. The original path contained 'l-3-3' without a space which could be misparsed as an arithmetic operation by JSX.
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2V9a2 2 0 0 0 -2 -2h-3 m -1 4 l -3 3 m 0 0 l -3 -3 m 3 3V4" /></svg>;
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
    <path stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" d="M40 60 l 20 -20 m -5 -15 l 10 10"/>
  </svg>
);
const ChartBarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
        {/* FIX: Added spaces around negative numbers and between commands in SVG path to prevent JSX parsing issues. */}
        <path fillRule="evenodd" d="M3 3a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1H4a1 1 0 0 1 -1 -1V3zm2 12a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1 v -5 a1 1 0 0 1 -1 -1H6a1 1 0 0 1 -1 1v5zm5 -8a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1V7z" clipRule="evenodd" />
    </svg>
);
const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Added spaces around negative numbers in SVG path to prevent JSX parsing issues. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20 l 4 -16 m 4 4 l 4 4 -4 4 M 6 16 l -4 -4 4 -4" />
    </svg>
);
const SearchCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained missing spaces around negative numbers, which could be misparsed as an arithmetic operation by JSX. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21 l -6 -6 m 2 -5 a7 7 0 1 1 -14 0 7 7 0 0 1 14 0z" />
    </svg>
);
const LinkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained missing spaces around negative numbers, which could be misparsed as an arithmetic operation by JSX. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0 -5.656 0 l -4 4 a4 4 0 1 0 5.656 5.656 l 1.102 -1.101 m -.758 -4.899 a4 4 0 0 0 5.656 0 l 4 -4 a4 4 0 0 0 -5.656 -5.656 l -1.1 1.1" />
    </svg>
);
const LinkBreakIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data. The original path contained 'l4-4' and '-5.656-5.656' without spaces which could be misparsed as an arithmetic operation. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0 -5.656 0 l -4 4 a4 4 0 1 0 5.656 5.656 l 1.102 -1.101 m -.758 -4.899 a4 4 0 0 0 5.656 0 l 4 -4 a4 4 0 0 0 -5.656 -5.656 l -1.1 1.1 M15 12 a 3 3 0 1 1 -6 0 a 3 3 0 0 1 6 0 z" />
    </svg>
);
const DocumentSearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 0 0 2 -2V9.414a1 1 0 0 0 -.293 -.707l-5.414 -5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0 -2 2v11 m 0 5 l 4.879 -4.879 m 0 0 a3 3 0 1 0 4.243 -4.242 3 3 0 0 0 -4.243 4.242z" />
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

// New: Tutorial Modal, inspired by TutorialActivity.smali
interface TutorialModalProps {
  onFinish: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ onFinish }) => {
  const [step, setStep] = useState(1);
  const totalSteps = 6;

  const tutorialSteps = [
    {
      title: "Welcome to the Magic Wand Controller!",
      content: "This brief tour will guide you through the key features of this application. You can use it to connect to your wand, analyze its behavior, and even create your own custom light and haptic effects."
    },
    {
      title: "Step 1: Connect Your Devices",
      content: "The 'Device Manager' tab is your first stop. Here, you can scan for and connect to your Magic Wand and its companion Wand Box. Just click the 'Connect' button for each device to get started."
    },
    {
      title: "Step 2: Cast Spells",
      content: "Once your wand is connected, use it to cast a spell! The 'Control Hub' will show you the last spell you cast and display detailed information about it, powered by Gemini."
    },
    {
      title: "Step 3: Create Custom Effects",
      content: "The 'VFX Macro Editor' in the Control Hub lets you design your own sequences of light transitions, haptic feedback, and delays. Send them directly to your wand to see your creation come to life."
    },
    {
      title: "Step 4: Dive Deeper",
      content: "For advanced users and reverse engineers, the 'Diagnostics', 'BLE Explorer', and 'Python Scripter' tabs provide powerful tools to monitor raw data, inspect BLE services, and generate control scripts."
    },
    {
      title: "You're All Set!",
      content: "That's the end of the tour. You can re-open this guide anytime from the Device Manager tab. Enjoy exploring the magic of your wand!"
    }
  ];

  const currentStep = tutorialSteps[step - 1];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg border border-slate-700 m-4">
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl font-bold text-indigo-400">{currentStep.title}</h2>
            <div className="text-sm font-mono text-slate-500">{step}/{totalSteps}</div>
          </div>
          <p className="text-slate-300 mb-6">{currentStep.content}</p>
        </div>
        <div className="bg-slate-900/50 p-4 rounded-b-lg flex justify-between items-center">
          <button
            onClick={() => step > 1 && setStep(step - 1)}
            disabled={step === 1}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold"
            >
              Next
            </button>
          ) : (
            <button
              onClick={onFinish}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded font-semibold"
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


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
const LOCAL_STORAGE_KEY_TUTORIAL = 'magicWandTutorialCompleted';


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
  const [buttonThresholds, setButtonThresholds] = useState<ButtonThresholds[]>([
    { min: null, max: null }, { min: null, max: null },
    { min: null, max: null }, { min: null, max: null },
  ]);
  
  // New: State for Spell Compendium
  const [isCompendiumModalOpen, setIsCompendiumModalOpen] = useState(false);
  const [selectedCompendiumSpell, setSelectedCompendiumSpell] = useState<string | null>(null);
  const [compendiumSpellDetails, setCompendiumSpellDetails] = useState<SpellDetails | null>(null);
  const [isFetchingCompendiumDetails, setIsFetchingCompendiumDetails] = useState(false);
  const [compendiumError, setCompendiumError] = useState<string | null>(null);

  // New: State for Protocol Settings
  const [commandDelay_ms, setCommandDelay_ms] = useState(20);

  // New: State for Tutorial Modal
  const [showTutorial, setShowTutorial] = useState(false);


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

  // New: Ref to store macro indices, based on smali reverse engineering
  const macroIndexes = useRef<Record<string, number>>({});


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

  // New: useEffect to check for tutorial completion on mount
  useEffect(() => {
    try {
      const tutorialCompleted = localStorage.getItem(LOCAL_STORAGE_KEY_TUTORIAL);
      if (tutorialCompleted !== 'true') {
        setShowTutorial(true);
      }
    } catch (error) {
      addLog('ERROR', `Could not read tutorial status from storage: ${error}`);
      setShowTutorial(true); // Show tutorial if storage fails
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
      // FIX: Use new GoogleGenAI({apiKey: process.env.API_KEY})
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
      
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

      // FIX: Use ai.models.generateContent
const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide the details for the spell: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      // FIX: Use response.text to get the generated text
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
        // Improvement: Stricter length check based on smali analysis of ButtonPayloadMessage.
        if (data.length === 2) {
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
    
    // New: Handle button threshold response
    if (data.length === 4 && data[0] === WBDLProtocol.INCOMING_OPCODE.BUTTON_THRESHOLD_RESPONSE) {
        const buttonIndex = data[1];
        const minValue = data[2];
        const maxValue = data[3];
        if (buttonIndex >= 0 && buttonIndex < 4) {
            setButtonThresholds(prev => {
                const newThresholds = [...prev];
                newThresholds[buttonIndex] = { min: minValue, max: maxValue };
                return newThresholds;
            });
            addLog('SUCCESS', `Received threshold for button ${buttonIndex + 1}: Min=${minValue}, Max=${maxValue}`);
        } else {
            addLog('WARNING', `Received threshold response with invalid button index: ${buttonIndex}`);
        }
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
      
      const commandChar = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_1);
      commandCharacteristic.current = commandChar;
      const streamChar = await service.getCharacteristic(WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_2);
      const batteryChar = await batteryService.getCharacteristic(WBDLProtocol.CHAR_UUID_BATTERY_LEVEL_NOTIFY);

      addLog('INFO', 'Setting up characteristic notifications...');
      addBleEvent('Characteristic', 'Starting notifications...');

      if (commandChar.properties.notify) {
        await commandChar.startNotifications();
        commandChar.addEventListener('characteristicvaluechanged', parseControlData);
        addLog('SUCCESS', 'Notifications enabled for Command channel.');
      } else {
        addLog('WARNING', 'Command characteristic does not support notifications.');
      }
      
      if (streamChar.properties.notify) {
        await streamChar.startNotifications();
        streamChar.addEventListener('characteristicvaluechanged', parseStreamData);
        addLog('SUCCESS', 'Notifications enabled for Stream channel.');
      } else {
        addLog('WARNING', 'Stream characteristic does not support notifications.');
      }

      if (batteryChar.properties.notify) {
        await batteryChar.startNotifications();
        batteryChar.addEventListener('characteristicvaluechanged', handleBatteryLevel);
        addLog('SUCCESS', 'Notifications enabled for Battery level.');
      } else {
        addLog('WARNING', 'Battery characteristic does not support notifications.');
      }
      addBleEvent('Characteristic', 'Notifications started');

      setWandConnectionState('Connected');
      addLog('SUCCESS', 'Wand connection fully established!');

      // Post-connection setup
      queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD);
      queueCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD);
      
      if (batteryChar.properties.read) {
        const initialBatteryLevel = await batteryChar.readValue();
        const level = initialBatteryLevel.getUint8(0);
        setWandBatteryLevel(level);
        addLog('INFO', `Initial Wand Battery Level: ${level}%`);
      } else {
        addLog('INFO', 'Cannot read initial battery level (property not supported). Waiting for notification.');
      }

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
      
      if (notifyChar.properties.notify) {
        addLog('INFO', 'Starting Box notifications...');
        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', parseBoxData);
        addLog('SUCCESS', 'Notifications enabled for Box.');
      } else {
        addLog('WARNING', 'Box characteristic does not support notifications.');
      }
      
      if (batteryChar.properties.read) {
        addLog('INFO', 'Reading Box battery level...');
        const initialBattery = await batteryChar.readValue();
        const level = initialBattery.getUint8(0);
        setBoxBatteryLevel(level);
        addLog('SUCCESS', `Initial Box Battery Level: ${level}%`);
      } else {
        addLog('WARNING', 'Box battery characteristic does not support read.');
      }

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
    let params: VfxCommand['params'] = {};
    if (type === 'LightTransition') {
      params = { hex_color: '#ffffff', mode: 0, transition_ms: 1000 };
    } else if (type === 'HapticBuzz' || type === 'MacroDelay') {
      params = { duration_ms: 500 };
    } else if (type === 'LoopEnd') {
      params = { loops: 2 };
    }
    // LoopStart and LightClear have no params

    const newCommand: VfxCommand = {
      id: commandIdCounter.current++,
      type,
      params,
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
        case 'LoopStart':
          payload.push(WBDLProtocol.INST.MACRO_LOOP_START);
          break;
        case 'LoopEnd': {
          const loops = cmd.params.loops ?? 2;
          payload.push(WBDLProtocol.INST.MACRO_SET_LOOPS, loops);
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
  
  const handleReadButtonThresholds = useCallback(() => {
    if (wandConnectionState !== 'Connected') {
        addLog('ERROR', 'Wand not connected.');
        return;
    }
    addLog('INFO', 'Requesting button thresholds for all 4 buttons...');
    for (let i = 0; i < 4; i++) {
        queueCommand(new Uint8Array([WBDLProtocol.CMD.READ_BUTTON_THRESHOLD, i]));
    }
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
        // FIX: Use new GoogleGenAI({apiKey: process.env.API_KEY})
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const systemInstruction = `You are an expert reverse engineer specializing in Android smali code, specifically for Bluetooth Low Energy (BLE) protocols. Analyze the provided smali code snippet from a BLE-related application. Your analysis should focus on identifying key information relevant to the BLE protocol.

Your response should be a concise summary in markdown format.

Focus on identifying and explaining:
- **Service and Characteristic UUIDs:** List any found UUIDs and their likely purpose (e.g., "Main control service," "Notification characteristic").
- **Opcodes:** Identify any byte constants used as command identifiers (opcodes).
- **Packet Structures:** Describe the format of any data packets being constructed or parsed.
- **Protocol Logic:** Explain the sequence of operations or any interesting logic (e.g., "Sends opcode 0x50, then a 2-byte duration").
- **Key Constants:** Point out any important numerical or string constants and their meaning in the protocol.

Be precise and base your conclusions directly on the provided code.`;

        // FIX: Use ai.models.generateContent
const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `Analyze this smali code:\n\n\`\`\`smali\n${smaliInput}\n\`\`\``,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        
        // FIX: Use response.text to get the generated text
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
  
  const sendMacroSequenceFromCommands = useCallback((commands: MacroCommand[]) => {
    if (wandConnectionState !== 'Connected' || !commandCharacteristic.current) {
        addLog('ERROR', 'Cannot send macro sequence: Wand not connected.');
        return;
    }

    addLog('INFO', 'Building and sending spell VFX macro sequence...');
    const payload: number[] = [WBDLProtocol.CMD.MACRO_EXECUTE];
    let hasError = false;

    commands.forEach(cmd => {
        if (hasError) return;
        
        const loops = cmd.loops ?? 1;
        for (let i = 0; i < loops; i++) {
            switch (cmd.command) {
                case 'LightClear':
                    payload.push(WBDLProtocol.INST.MACRO_LIGHT_CLEAR);
                    break;
                case 'HapticBuzz': {
                    const duration = cmd.duration ?? 100;
                    payload.push(WBDLProtocol.CMD.HAPTIC_VIBRATE, duration & 0xFF, (duration >> 8) & 0xFF);
                    break;
                }
                case 'MacroDelay': {
                    const duration = cmd.duration ?? 100;
                    payload.push(WBDLProtocol.INST.MACRO_DELAY, duration & 0xFF, (duration >> 8) & 0xFF);
                    break;
                }
                case 'LightTransition': {
                    const hex = cmd.color ?? '#ffffff';
                    const mode = cmd.group ?? 0; // 'group' in MacroCommand maps to 'mode'
                    const duration = cmd.duration ?? 1000;
                    
                    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
                        addLog('ERROR', `Invalid hex color "${hex}" in macro command. Aborting sequence.`);
                        hasError = true;
                        return;
                    }

                    const r = parseInt(hex.substring(1, 3), 16);
                    const g = parseInt(hex.substring(3, 5), 16);
                    const b = parseInt(hex.substring(5, 7), 16);
                    
                    payload.push(
                        WBDLProtocol.INST.MACRO_LIGHT_TRANSITION,
                        mode, r, g, b,
                        duration & 0xFF, (duration >> 8) & 0xFF
                    );
                    break;
                }
                default:
                    addLog('WARNING', `Unknown command in macro sequence: ${cmd.command}`);
                    break;
            }
        }
    });

    if (hasError) return;

    const finalPayload = new Uint8Array(payload);
    
    if (finalPayload.length > negotiatedMtu) {
        addLog('INFO', `Macro size (${finalPayload.length} bytes) exceeds MTU (${negotiatedMtu} bytes). Splitting into chunks.`);
        for (let i = 0; i < finalPayload.length; i += negotiatedMtu) {
            const chunk = finalPayload.slice(i, i + negotiatedMtu);
            queueCommand(chunk);
        }
    } else {
        queueCommand(finalPayload);
    }
  }, [addLog, wandConnectionState, queueCommand, negotiatedMtu]);
  
  const castCompendiumSpell = useCallback((spellDetails: SpellDetails | null) => {
    if (wandConnectionState !== 'Connected') {
        addLog('ERROR', 'Wand not connected.');
        return;
    }
    if (!spellDetails || !spellDetails.macros_payoff || spellDetails.macros_payoff.length === 0) {
        addLog('WARNING', `No macro found for spell ${spellDetails?.spell_name}.`);
        return;
    }

    const deviceType = 'WAND'; // Assume WAND for now

    const currentIndex = macroIndexes.current[deviceType] ?? -1;
    const nextIndex = (currentIndex + 1) % spellDetails.macros_payoff.length;
    macroIndexes.current[deviceType] = nextIndex;

    const macroVariation = spellDetails.macros_payoff[nextIndex];

    addLog('INFO', `Casting '${spellDetails.spell_name}'. Executing macro variation ${nextIndex + 1}/${spellDetails.macros_payoff.length}.`);

    sendMacroSequenceFromCommands(macroVariation);
  }, [addLog, wandConnectionState, sendMacroSequenceFromCommands]);


  const fetchCompendiumDetails = useCallback(async (spellName: string) => {
    if (!spellName) return;
    setIsFetchingCompendiumDetails(true);
    setCompendiumError(null);
    setCompendiumSpellDetails(null);
    addLog('INFO', `Compendium: Fetching details for ${spellName}...`);
    try {
       // FIX: Use new GoogleGenAI({apiKey: process.env.API_KEY})
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
       
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

      // FIX: Use ai.models.generateContent
const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: `Provide the full spell data object for: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      // FIX: Use response.text to get the generated text
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
  
  const handleFinishTutorial = useCallback(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_TUTORIAL, 'true');
      setShowTutorial(false);
      addLog('INFO', 'Tutorial completed. Welcome!');
    } catch (error) {
      addLog('ERROR', `Failed to save tutorial status: ${error}`);
      setShowTutorial(false); // Hide it anyway
    }
  }, [addLog]);

  const handleResetTutorial = useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_TUTORIAL);
      setShowTutorial(true);
      addLog('INFO', 'Tutorial has been reset and will show again.');
    } catch (error) {
      addLog('ERROR', `Failed to reset tutorial status: ${error}`);
    }
  }, [addLog]);



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
          onResetTutorial={handleResetTutorial}
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
        buttonThresholds={buttonThresholds}
        handleReadButtonThresholds={handleReadButtonThresholds}
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
      {showTutorial && <TutorialModal onFinish={handleFinishTutorial} />}
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
              onCast={castCompendiumSpell}
              isWandConnected={wandConnectionState === 'Connected'}
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


interface ControlHubProps {
  lastSpell: string;
  gestureState: GestureState;
  clientSideGestureDetected: boolean;
  spellDetails: SpellDetails | null;
  isFetchingSpellDetails: boolean;
  spellDetailsError: string | null;
  vfxSequence: VfxCommand[];
  addVfxCommand: (type: VfxCommandType) => void;
  updateVfxCommand: (id: number, params: VfxCommand['params']) => void;
  removeVfxCommand: (id: number) => void;
  sendVfxSequence: () => void;
  saveVfxSequence: () => void;
  isSequenceSaved: boolean;
  wandConnectionState: ConnectionState;
}

const ControlHub: React.FC<ControlHubProps> = ({ lastSpell, gestureState, clientSideGestureDetected, spellDetails, isFetchingSpellDetails, spellDetailsError, vfxSequence, addVfxCommand, updateVfxCommand, removeVfxCommand, sendVfxSequence, saveVfxSequence, isSequenceSaved, wandConnectionState }) => {
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
    onCast?: (spellDetails: SpellDetails) => void;
    isWandConnected?: boolean;
}

const SpellDetailsCard: React.FC<SpellDetailsCardProps> = ({ spellDetails, isLoading, error, onCast, isWandConnected }) => {
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
            {onCast && spellDetails.macros_payoff && spellDetails.macros_payoff.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-600">
                    <button 
                        onClick={() => onCast(spellDetails)}
                        disabled={!isWandConnected}
                        className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-not-allowed"
                        title={!isWandConnected ? 'Connect wand to cast spell' : 'Execute spell VFX on wand'}
                    >
                        Cast Spell
                    </button>
                </div>
            )}
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
        <div className="border-l border-slate-600 mx-2"></div>
        <button onClick={() => addCommand('LoopStart')} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm">Add Loop Start</button>
        <button onClick={() => addCommand('LoopEnd')} className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm">Add Loop End</button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 space-y-2">
        {sequence.length === 0 && <p className="text-slate-500 text-center py-8">Add a command to start building a sequence.</p>}
        {(() => {
            let indentLevel = 0;
            return sequence.map((cmd, index) => {
                let currentIndent = indentLevel;
                if (cmd.type === 'LoopEnd' && indentLevel > 0) {
                    currentIndent = indentLevel - 1; // De-indent the 'end' command itself
                }
                
                const component = (
                    <VfxCommandEditor 
                        key={cmd.id} 
                        command={cmd} 
                        onUpdate={updateCommand} 
                        onRemove={removeCommand} 
                        index={index + 1} 
                        indent={currentIndent}
                    />
                );

                if (cmd.type === 'LoopStart') {
                    indentLevel++;
                }
                if (cmd.type === 'LoopEnd' && indentLevel > 0) {
                    indentLevel--;
                }
                return component;
            });
        })()}
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
  indent: number;
}
const VfxCommandEditor: React.FC<VfxCommandEditorProps> = ({ command, onUpdate, onRemove, index, indent }) => {
  const handleParamChange = (param: string, value: any) => {
// FIX: Ensure all parseInt calls use a radix of 10 for safety.
    const numericValue = ['duration_ms', 'mode', 'transition_ms', 'loops'].includes(param) ? parseInt(value, 10) : value;
    onUpdate(command.id, { [param]: numericValue });
  };
  
  const isLoopCommand = command.type === 'LoopStart' || command.type === 'LoopEnd';

  return (
    <div 
        className={`p-3 rounded-lg flex items-center gap-4 border transition-all duration-200 ${isLoopCommand ? 'bg-green-900/50 border-green-700' : 'bg-slate-800 border-slate-700'}`}
        style={{ marginLeft: `${indent * 24}px`, width: `calc(100% - ${indent * 24}px)` }}
    >
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
           {command.type === 'LoopEnd' && (
            <label className="flex items-center gap-1">
              Repeats:
              <input 
                type="number"
                value={command.params.loops || 2}
                onChange={(e) => handleParamChange('loops', e.target.value)}
                className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1"
                min="1"
                step="1"
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

interface DeviceManagerProps {
  wandConnectionState: ConnectionState;
  boxConnectionState: ConnectionState;
  wandDetails: WandDevice | null;
  boxDetails: WandDevice | null;
  wandBatteryLevel: number | null;
  boxBatteryLevel: number | null;
  onConnectWand: () => void;
  onConnectBox: () => void;
  rawWandProductInfo: string | null;
  rawBoxProductInfo: string | null;
  isTvBroadcastEnabled: boolean;
  setIsTvBroadcastEnabled: (enabled: boolean) => void;
  userHouse: House;
  setUserHouse: (house: House) => void;
  userPatronus: string;
  setUserPatronus: (patronus: string) => void;
  isHueEnabled: boolean;
  setIsHueEnabled: (enabled: boolean) => void;
  hueBridgeIp: string;
  setHueBridgeIp: (ip: string) => void;
  hueUsername: string;
  setHueUsername: (username: string) => void;
  hueLightId: string;
  setHueLightId: (id: string) => void;
  saveHueSettings: () => void;
  negotiatedMtu: number;
  commandDelay_ms: number;
  setCommandDelay_ms: (delay: number) => void;
  onResetTutorial: () => void;
}

const DeviceManager: React.FC<DeviceManagerProps> = ({ wandConnectionState, boxConnectionState, wandDetails, boxDetails, wandBatteryLevel, boxBatteryLevel, onConnectWand, onConnectBox, rawWandProductInfo, rawBoxProductInfo, isTvBroadcastEnabled, setIsTvBroadcastEnabled, userHouse, setUserHouse, userPatronus, setUserPatronus, isHueEnabled, setIsHueEnabled, hueBridgeIp, setHueBridgeIp, hueUsername, setHueUsername, hueLightId, setHueLightId, saveHueSettings, negotiatedMtu, commandDelay_ms, setCommandDelay_ms, onResetTutorial }) => {
    return (
        <div className="space-y-6 h-full overflow-y-auto pr-2">
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
// FIX: Corrected typo. It should be rawBoxProductInfo, not rawProductInfo.
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
             <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <h3 className="text-xl font-semibold mb-3">App Settings</h3>
                <div className="flex justify-between items-center">
                    <p className="text-sm text-slate-400">Show the introductory tutorial again.</p>
                    <button
                        onClick={onResetTutorial}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-semibold rounded-lg text-sm"
                    >
                        Reset Tutorial
                    </button>
                </div>
            </div>
        </div>
    );
};

interface DeviceCardProps {
    title: string;
    connectionState: ConnectionState;
    details: WandDevice | null;
    batteryLevel: number | null;
    onConnect: () => void;
    rawProductInfo: string | null;
    wandDetails: WandDevice | null;
    boxDetails: WandDevice | null;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ title, connectionState, details, batteryLevel, onConnect, rawProductInfo, wandDetails, boxDetails }) => {
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

interface IntegrationToggleProps {
    title: string;
    description: string;
    isEnabled: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

const IntegrationToggle: React.FC<IntegrationToggleProps> = ({ title, description, isEnabled, onToggle, children }) => {
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

interface SpellBookProps {
    spellBook: Spell[];
    discoveredSpells: Set<string>;
    discoveredCount: number;
    totalCount: number;
    spellFilter: string;
    setSpellFilter: (filter: string) => void;
}

const SpellBook: React.FC<SpellBookProps> = ({ spellBook, discoveredSpells, discoveredCount, totalCount, spellFilter, setSpellFilter }) => {
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

interface DiagnosticsProps {
  detectedOpCodes: Set<number>;
  rawPacketLog: RawPacket[];
  bleEventLog: BleEvent[];
  isImuStreaming: boolean;
  toggleImuStream: () => void;
  handleImuCalibrate: () => void;
  latestImuData: IMUReading[] | null;
  buttonState: [boolean, boolean, boolean, boolean];
  smaliInput: string;
  setSmaliInput: (input: string) => void;
  analyzeSmaliWithGemini: () => void;
  isAnalyzingSmali: boolean;
  smaliAnalysis: string;
  isClientSideGestureDetectionEnabled: boolean;
  setIsClientSideGestureDetectionEnabled: (enabled: boolean) => void;
  gestureThreshold: number;
  setGestureThreshold: (threshold: number) => void;
  clientSideGestureDetected: boolean;
  buttonThresholds: ButtonThresholds[];
  handleReadButtonThresholds: () => void;
  wandConnectionState: ConnectionState;
  queueCommand: (payload: Uint8Array, silent?: boolean) => void;
}

const Diagnostics: React.FC<DiagnosticsProps> = ({ detectedOpCodes, rawPacketLog, bleEventLog, isImuStreaming, toggleImuStream, handleImuCalibrate, latestImuData, buttonState, smaliInput, setSmaliInput, analyzeSmaliWithGemini, isAnalyzingSmali, smaliAnalysis, isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled, gestureThreshold, setGestureThreshold, clientSideGestureDetected, buttonThresholds, handleReadButtonThresholds, wandConnectionState, queueCommand }) => {
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
                             <div className="pt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-semibold text-slate-400">Grip Thresholds</span>
                                    <button onClick={handleReadButtonThresholds} className="px-3 py-1 text-xs rounded bg-slate-600 hover:bg-slate-500 disabled:opacity-50" disabled={!isWandConnected}>
                                        Read Values
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs bg-slate-800 p-2 rounded">
                                    {buttonThresholds.map((t, i) => (
                                        <div key={i} className="text-slate-300">
                                            Button {i+1}: Min={t.min ?? '--'} / Max={t.max ?? '--'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-t border-slate-700 pt-2 mt-2">
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
                                            style={{ right: '0.25rem' }}
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
                </div>
                <div className="flex flex-col gap-4 min-h-0">
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                        <h4 className="font-semibold mb-2">OpCode Discovery</h4>
                        <p className="text-xs text-slate-400 mb-2">Unknown opcodes from CH1/CH2 will appear here.</p>
                        <div className="bg-slate-800 p-2 rounded text-sm font-mono flex flex-wrap gap-2">
                            {sortedOpcodes.length > 0 ? (
                                sortedOpcodes.map(code => (
                                    <span key={code} className="bg-slate-700 px-2 py-1 rounded">0x{code.toString(16).padStart(2, '0')}</span>
                                ))
                            ) : (
                                <span className="text-slate-500">None detected yet.</span>
                            )}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col min-h-0">
                        <h4 className="font-semibold mb-2">Raw Packet Log (CH1/CH2)</h4>
                        <div className="flex-grow bg-slate-950 rounded p-2 text-xs font-mono overflow-y-auto border border-slate-600">
                            {rawPacketLog.map((p: RawPacket) => (
                                <div key={p.id} className="whitespace-nowrap">
                                    <span className="text-slate-500">{p.timestamp} </span>
                                    <span className="text-purple-400">{p.hexData}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col min-h-0">
                         <h4 className="font-semibold mb-2">Smali Analyzer (via Gemini)</h4>
                         <textarea 
                             className={`w-full bg-slate-950 border border-slate-600 rounded p-2 font-mono text-xs transition-all ${smaliAnalysis ? 'flex-shrink h-24' : 'flex-grow'}`}
                             placeholder="Paste smali code here..."
                             value={smaliInput}
                             onChange={(e) => setSmaliInput(e.target.value)}
                         ></textarea>
                         <button onClick={analyzeSmaliWithGemini} disabled={isAnalyzingSmali} className="mt-2 w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 flex-shrink-0">
                             {isAnalyzingSmali ? 'Analyzing...' : 'Analyze Smali'}
                         </button>
                         {smaliAnalysis && (
                             <div className="mt-2 flex-grow bg-slate-950 rounded p-2 text-xs overflow-y-auto border border-slate-600 prose prose-invert prose-sm">
                                 <pre className="whitespace-pre-wrap">{smaliAnalysis}</pre>
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface SpellCompendiumProps {
    spellBook: Spell[];
    onSelectSpell: (spellName: string) => void;
}

const SpellCompendium: React.FC<SpellCompendiumProps> = ({ spellBook, onSelectSpell }) => {
    return (
        <div className="h-full flex flex-col space-y-4">
             <h3 className="text-xl font-semibold">Spell Compendium</h3>
             <p className="text-sm text-slate-400">
                 Explore detailed information about every known spell. Select a spell to view its properties, effects, and cast its unique VFX sequence directly on your wand.
             </p>
             <div className="flex-grow overflow-y-auto pr-2">
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                     {SPELL_LIST.sort().map(spellName => (
                         <button
                             key={spellName}
                             onClick={() => onSelectSpell(spellName)}
                             className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-center hover:bg-slate-700 hover:border-indigo-500 transition-all duration-200"
                         >
                             <span className="font-semibold text-slate-300">{spellName.replace(/_/g, ' ')}</span>
                         </button>
                     ))}
                 </div>
             </div>
        </div>
    )
}

interface BleExplorerProps {
    onScan: () => void;
    isExploring: boolean;
    device: BluetoothDevice | null;
    services: ExplorerService[];
}

const BleExplorer: React.FC<BleExplorerProps> = ({ onScan, isExploring, device, services }) => {
    return (
        <div className="h-full flex flex-col space-y-4">
             <h3 className="text-xl font-semibold">BLE Services Explorer</h3>
             <p className="text-sm text-slate-400">
                 Scan for any nearby BLE device and inspect its services and characteristics. This is a low-level tool for exploring the capabilities of any device, not just the wand.
             </p>
             <button
                onClick={onScan}
                disabled={isExploring}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md disabled:bg-slate-500 disabled:cursor-wait"
            >
                {isExploring ? 'Scanning...' : 'Scan for any BLE Device'}
            </button>
            {device && (
                <div className="flex-grow bg-slate-900/50 p-4 rounded-lg border border-slate-700 overflow-y-auto">
                    <h4 className="font-semibold text-lg mb-2">Device: <span className="text-indigo-400">{device.name || device.id}</span></h4>
                    <div className="space-y-4">
                        {services.length > 0 ? services.map(service => (
                            <div key={service.uuid} className="bg-slate-800 p-3 rounded-lg">
                                <p className="font-semibold text-green-400 font-mono text-sm">Service: {service.uuid}</p>
                                <ul className="mt-2 space-y-1 pl-4">
                                    {service.characteristics.map(char => (
                                        <li key={char.uuid} className="font-mono text-xs text-slate-300">
                                            <p>Characteristic: {char.uuid}</p>
                                            <p className="text-slate-400 pl-2">
                                                Properties: {Object.entries(char.properties)
                                                    .filter(([, value]) => value)
                                                    .map(([key]) => key)
                                                    .join(', ') || 'none'}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )) : <p className="text-slate-500">No services found for this device.</p>}
                    </div>
                </div>
            )}
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
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg border border-slate-700 m-4">
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-indigo-400">{title}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div>{children}</div>
            </div>
        </div>
    );
};