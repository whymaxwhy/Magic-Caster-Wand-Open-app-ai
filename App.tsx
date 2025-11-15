




import React from 'react';
// FIX: WandTypes is exported from types.ts, not constants.ts.
import { WBDLProtocol, WBDLPayloads, SPELL_LIST, WAND_THRESHOLDS, Houses, WAND_TYPE_IDS, SPELL_BOX_REACTIONS } from './constants';
// FIX: Added RawPacket to the import list from types.ts.
import { WandTypes, RawPacket, ConnectionState } from './types';
import type { LogEntry, LogType, VfxCommand, VfxCommandType, Spell, IMUReading, GestureState, DeviceType, WandType, WandDevice, WandDeviceType, House, SpellDetails, SpellUse, ExplorerService, ExplorerCharacteristic, BleEvent, MacroCommand, ButtonThresholds, CastingHistoryEntry } from './types';
import Scripter from './Scripter';
import { GoogleGenAI, Type } from '@google/genai';
import WizardingClass from './WizardingClass';


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
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4-3 3m0 0-3-3m3 3V4" /></svg>;
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
        <path fillRule="evenodd" d="M3 3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3zm2 12a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v-5a1 1 0 0 1-1-1H6a1 1 0 0 1-1 1v5zm5-8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V7z" clipRule="evenodd" />
    </svg>
);
const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data which could cause parsing errors. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);
const SearchCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
    </svg>
);
const LinkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1" />
    </svg>
);
const LinkBreakIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101m-.758-4.899a4 4 0 0 0 5.656 0l4-4a4 4 0 0 0-5.656-5.656l-1.1 1.1M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
);
const DocumentSearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 21h7a2 2 0 0 0 2-2V9.414a1 1 0 0 0-.293-.707l-5.414-5.414A1 1 0 0 0 12.586 3H7a2 2 0 0 0-2 2v11m0 5 4.879-4.879m0 0a3 3 0 1 0 4.243-4.242 3 3 0 0 0-4.243 4.242Z" />
    </svg>
);
const SpinnerIcon = () => (
  <svg className="animate-spin h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);
const ExclamationCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM9 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1 9a1 1 0 0 0 1-1V6a1 1 0 1 0-2 0v6a1 1 0 0 0 1 1z" clipRule="evenodd" />
    </svg>
);
const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" />
    </svg>
);
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H7v1a1 1 0 01-2 0V6H4a1 1 0 010-2h1V3a1 1 0 011-1zm6 0a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0V6h-1a1 1 0 010-2h1V3a1 1 0 011-1zM9 10a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H7a1 1 0 010-2h1v-1a1 1 0 011-1zm6-5a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0V8h-1a1 1 0 010-2h1V5a1 1 0 011-1zM5 15a1 1 0 011 1v1h1a1 1 0 010 2h-1v1a1 1 0 01-2 0v-1H4a1 1 0 010-2h1v-1a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);
const BookOpenIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);



// --- UI COMPONENTS ---
interface TabButtonProps {
  Icon: React.ElementType;
  label: string;
  onClick: () => void;
  isActive: boolean;
}

const TabButton: React.FC<TabButtonProps> = ({ Icon, label, onClick, isActive }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center p-3 rounded-lg text-left transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white font-semibold shadow-md'
        : 'hover:bg-slate-700'
    }`}
  >
    <Icon />
    <span>{label}</span>
  </button>
);


interface TutorialModalProps {
  onFinish: () => void;
}

const TutorialModal: React.FC<TutorialModalProps> = ({ onFinish }) => {
  const [step, setStep] = React.useState(1);
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

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => {
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in" 
      onClick={handleOverlayClick}
    >
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl border border-slate-700 m-4 overflow-hidden" >
        <div className="flex justify-between items-center p-4 bg-slate-900/50 border-b border-slate-700">
          <h2 className="text-xl font-bold text-indigo-400">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

interface BleExplorerProps {
  onScan: () => void;
  isExploring: boolean;
  device: BluetoothDevice | null;
  services: ExplorerService[];
}

const BleExplorer: React.FC<BleExplorerProps> = ({ onScan, isExploring, device, services }) => {
  return (
    <div className="h-full flex flex-col space-y-4">
      <div>
        <h3 className="text-xl font-semibold">BLE Service Explorer</h3>
        <p className="text-sm text-slate-400">Scan for any nearby BLE device to inspect its services and characteristics.</p>
      </div>
      <div className="flex-shrink-0">
        <button onClick={onScan} disabled={isExploring} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-wait flex items-center justify-center w-full">
          {isExploring ? (
            <>
              <SpinnerIcon />
              Scanning...
            </>
          ) : (
            <>
              <SearchCircleIcon />
              Scan for Any BLE Device
            </>
          )}
        </button>
      </div>
      <div className="flex-grow overflow-y-auto pr-2 -mr-2 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
        {!device && !isExploring && <p className="text-slate-500 text-center">Click scan to begin.</p>}
        {device && (
          <div>
            <h4 className="text-lg font-semibold text-indigo-400">{device.name || 'Unnamed Device'}</h4>
            <p className="text-xs font-mono text-slate-500 mb-4">{device.id}</p>
            <div className="space-y-4">
              {services.length === 0 && <p className="text-slate-400">No services found for this device.</p>}
              {services.map(service => (
                <div key={service.uuid} className="bg-slate-800 p-3 rounded-lg">
                  <h5 className="font-semibold text-green-400 font-mono text-sm">{service.uuid}</h5>
                  <div className="pl-4 mt-2 space-y-1 border-l-2 border-slate-700">
                    {service.characteristics.map(char => (
                      <div key={char.uuid}>
                        <p className="font-mono text-xs text-cyan-400">{char.uuid}</p>
                        <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-400 mt-1">
                          {char.properties.read && <span className="bg-slate-700 px-1.5 py-0.5 rounded-full">READ</span>}
                          {char.properties.write && <span className="bg-slate-700 px-1.5 py-0.5 rounded-full">WRITE</span>}
                          {char.properties.writeWithoutResponse && <span className="bg-slate-700 px-1.5 py-0.5 rounded-full">WRITE_NO_RESP</span>}
                          {char.properties.notify && <span className="bg-slate-700 px-1.5 py-0.5 rounded-full">NOTIFY</span>}
                          {char.properties.indicate && <span className="bg-slate-700 px-1.5 py-0.5 rounded-full">INDICATE</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


interface LogViewProps {
  logs: LogEntry[];
}
const LogView: React.FC<LogViewProps> = ({ logs }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
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

interface StatusBadgeProps {
  state: ConnectionState;
}
const StatusBadge: React.FC<StatusBadgeProps> = ({ state }) => {
  const stateConfig = {
    [ConnectionState.CONNECTED]: {
      icon: <CheckCircleIcon />,
      text: 'Connected',
      className: 'bg-green-500/20 text-green-300',
    },
    [ConnectionState.CONNECTING]: {
      icon: <SpinnerIcon />,
      text: 'Connecting',
      className: 'bg-yellow-500/20 text-yellow-300',
    },
    [ConnectionState.DISCONNECTED]: {
      icon: <LinkBreakIcon />,
      text: 'Disconnected',
      className: 'bg-slate-600/50 text-slate-400',
    },
    [ConnectionState.ERROR]: {
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

const VfxCommandView: React.FC<{ command: VfxCommand; onUpdate: (id: number, params: any) => void; onRemove: (id: number) => void; }> = ({ command, onUpdate, onRemove }) => {
    const paramInputs = () => {
        switch (command.type) {
            case 'LightTransition':
                return (
                    <>
                        <input type="color" value={command.params.hex_color || '#ffffff'} onChange={e => onUpdate(command.id, { hex_color: e.target.value })} className="bg-slate-700 rounded h-8 w-10 cursor-pointer border-2 border-slate-600" />
                        <input type="number" placeholder="Mode" value={command.params.mode ?? 0} onChange={e => onUpdate(command.id, { mode: parseInt(e.target.value) || 0 })} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm" />
                        <input type="number" placeholder="ms" value={command.params.transition_ms ?? 1000} onChange={e => onUpdate(command.id, { transition_ms: parseInt(e.target.value) || 0 })} className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm" />
                    </>
                );
            case 'HapticBuzz':
            case 'MacroDelay':
                return <input type="number" placeholder="ms" value={command.params.duration_ms ?? 500} onChange={e => onUpdate(command.id, { duration_ms: parseInt(e.target.value) || 0 })} className="w-20 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm" />;
            case 'LoopEnd':
                return <input type="number" placeholder="Loops" value={command.params.loops ?? 2} onChange={e => onUpdate(command.id, { loops: parseInt(e.target.value) || 0 })} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm" />;
            default:
                return null;
        }
    };

    return (
        <div className="flex items-center gap-2 p-2 bg-slate-900 rounded-md border border-slate-700 animate-fade-in">
            <span className="font-semibold text-sm text-cyan-400 flex-shrink-0 w-28">{command.type}</span>
            <div className="flex-grow flex items-center gap-2">
                {paramInputs()}
            </div>
            <button onClick={() => onRemove(command.id)} className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-full">
                <TrashIcon />
            </button>
        </div>
    );
};

const VfxEditor: React.FC<{
  sequence: VfxCommand[];
  addCommand: (type: VfxCommandType) => void;
  updateCommand: (id: number, params: any) => void;
  removeCommand: (id: number) => void;
  sendSequence: () => void;
  saveSequence: () => void;
  isSaved: boolean;
  isConnected: boolean;
}> = ({ sequence, addCommand, updateCommand, removeCommand, sendSequence, saveSequence, isSaved, isConnected }) => {
    return (
        <div className="flex flex-col h-full bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h3 className="text-xl font-semibold mb-2">VFX Macro Editor</h3>
            <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2 mb-4">
                {sequence.length > 0 ? (
                    sequence.map(cmd => <VfxCommandView key={cmd.id} command={cmd} onUpdate={updateCommand} onRemove={removeCommand} />)
                ) : (
                    <p className="text-center text-slate-500 pt-8">Add a command to start building a sequence.</p>
                )}
            </div>
            <div className="flex-shrink-0">
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <button onClick={() => addCommand('LightTransition')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Light</button>
                    <button onClick={() => addCommand('HapticBuzz')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Haptic</button>
                    <button onClick={() => addCommand('MacroDelay')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Delay</button>
                    <button onClick={() => addCommand('LightClear')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Clear</button>
                    <button onClick={() => addCommand('LoopStart')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Loop Start</button>
                    <button onClick={() => addCommand('LoopEnd')} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">+ Loop End</button>
                </div>
                <div className="flex gap-2">
                    <button onClick={saveSequence} className={`flex-1 flex items-center justify-center px-4 py-2 rounded font-semibold text-sm ${isSaved ? 'bg-slate-600 text-slate-400' : 'bg-green-600 hover:bg-green-500'}`}>
                        <SaveIcon /> {isSaved ? 'Saved' : 'Save'}
                    </button>
                    <button onClick={sendSequence} disabled={!isConnected} className="flex-1 flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-not-allowed text-sm">
                        <MagicWandIcon /> Send to Wand
                    </button>
                </div>
            </div>
        </div>
    );
};

const SpellDetailsCard: React.FC<{
  spellDetails: SpellDetails | null;
  isLoading: boolean;
  error: string | null;
  onCastOnWand: (details: SpellDetails | null) => void;
  onCastOnBox: (details: SpellDetails | null) => void;
  isWandConnected: boolean;
  isBoxConnected: boolean;
}> = ({ spellDetails, isLoading, error, onCastOnWand, onCastOnBox, isWandConnected, isBoxConnected }) => {
    if (isLoading) {
        return <div className="text-center flex flex-col items-center justify-center h-full"><SpinnerIcon /> <p className="mt-2">Consulting the magical archives...</p></div>;
    }
    if (error) {
        return <div className="text-center flex flex-col items-center justify-center h-full text-red-400"><ExclamationCircleIcon /> <p className="mt-2">{error}</p></div>;
    }
    if (!spellDetails) {
        return <div className="text-center flex flex-col items-center justify-center h-full text-slate-500"><p>Cast a spell with your wand to see its details here.</p></div>;
    }
    
    const spellUsesIcons: Record<string, React.ReactNode> = {
      utility: <PlusCircleIcon />,
      combat: <MagicWandIcon />,
      charm: <SparklesIcon />,
      default: <SparklesIcon />,
    };

    return (
        <div className="p-4 rounded-lg border h-full flex flex-col" style={{ borderColor: spellDetails.spell_background_color || '#4A5568', backgroundColor: `${spellDetails.spell_background_color}1A` }}>
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h4 className="text-2xl font-bold" style={{ color: spellDetails.spell_background_color || '#E2E8F0' }}>{spellDetails.spell_name.replace(/_/g, ' ')}</h4>
                    <p className="font-mono text-sm text-slate-400">{spellDetails.incantation_name}</p>
                </div>
                <div className="text-xs bg-slate-700/50 px-2 py-1 rounded-full">{spellDetails.spell_type}</div>
            </div>
            <p className="text-slate-300 text-sm mb-4">{spellDetails.description}</p>
            <div className="mb-4">
                <h5 className="font-semibold text-slate-400 text-sm mb-2">Difficulty</h5>
                <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className={`w-full h-2 rounded-full ${i < spellDetails.difficulty ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
                    ))}
                </div>
            </div>
            <div className="mb-4">
                <h5 className="font-semibold text-slate-400 text-sm mb-2">Common Uses</h5>
                <ul className="space-y-2">
                    {spellDetails.spell_uses.map(use => (
                        <li key={use.id} className="flex items-center text-sm bg-slate-800/50 p-2 rounded">
                            <div className="text-indigo-400">{spellUsesIcons[use.icon] || spellUsesIcons.default}</div>
                            <span className="ml-2">{use.name}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="mt-auto pt-4 border-t border-slate-700/50 space-y-2">
                 <button onClick={() => onCastOnWand(spellDetails)} disabled={!isWandConnected} className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-not-allowed text-sm">
                    <MagicWandIcon /> Cast on Wand
                </button>
                 <button onClick={() => onCastOnBox(spellDetails)} disabled={!isBoxConnected} className="w-full flex items-center justify-center px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-not-allowed text-sm">
                    <CubeIcon /> Cast on Box
                </button>
            </div>
        </div>
    );
};


const ControlHub: React.FC<{
  lastSpell: string;
  gestureState: GestureState;
  clientSideGestureDetected: boolean;
  spellDetails: SpellDetails | null;
  isFetchingSpellDetails: boolean;
  spellDetailsError: string | null;
  vfxSequence: VfxCommand[];
  addVfxCommand: (type: VfxCommandType) => void;
  updateVfxCommand: (id: number, params: any) => void;
  removeVfxCommand: (id: number) => void;
  sendVfxSequence: () => void;
  saveVfxSequence: () => void;
  isSequenceSaved: boolean;
  wandConnectionState: ConnectionState;
  boxConnectionState: ConnectionState;
  liveEvent: LiveEvent | null;
  onCastOnWand: (details: SpellDetails | null) => void;
  onCastOnBox: (details: SpellDetails | null) => void;
  castingHistory: CastingHistoryEntry[];
}> = ({
  lastSpell, gestureState, clientSideGestureDetected, spellDetails, isFetchingSpellDetails, spellDetailsError,
  vfxSequence, addVfxCommand, updateVfxCommand, removeVfxCommand, sendVfxSequence, saveVfxSequence, isSequenceSaved,
  wandConnectionState, boxConnectionState, liveEvent, onCastOnWand, onCastOnBox, castingHistory
}) => {
    const gestureStatus = () => {
        let text = 'Ready to Cast';
        let color = 'text-slate-400';
        if (gestureState === 'Casting') {
            text = 'Casting...';
            color = 'text-yellow-400 animate-pulse';
        } else if (gestureState === 'Processing') {
            text = 'Processing...';
            color = 'text-blue-400 animate-pulse';
        } else if (clientSideGestureDetected) {
            text = 'Motion Detected!';
            color = 'text-green-400';
        }
        return <span className={color}>{text}</span>;
    };

    return (
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
            {/* Left Column */}
            <div className="flex flex-col space-y-4 overflow-hidden">
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                    <h3 className="text-xl font-semibold mb-2">Wand Status</h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Last Spell:</span>
                            <span className="font-mono text-indigo-300">{lastSpell || 'None'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Gesture State:</span>
                            <span className="font-mono">{gestureStatus()}</span>
                        </div>
                        <div className="h-6 flex items-center justify-center">
                            {liveEvent && (
                                <div className="text-xs font-semibold bg-slate-700 px-3 py-1 rounded-full animate-fade-in">{liveEvent.message}</div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex-grow min-h-0">
                    <SpellDetailsCard 
                        spellDetails={spellDetails}
                        isLoading={isFetchingSpellDetails}
                        error={spellDetailsError}
                        onCastOnWand={onCastOnWand}
                        onCastOnBox={onCastOnBox}
                        isWandConnected={wandConnectionState === ConnectionState.CONNECTED}
                        isBoxConnected={boxConnectionState === ConnectionState.CONNECTED}
                    />
                </div>
            </div>

            {/* Right Column */}
            <div className="overflow-hidden">
                <VfxEditor 
                    sequence={vfxSequence}
                    addCommand={addVfxCommand}
                    updateCommand={updateVfxCommand}
                    removeCommand={removeVfxCommand}
                    sendSequence={sendVfxSequence}
                    saveSequence={saveVfxSequence}
                    isSaved={isSequenceSaved}
                    isConnected={wandConnectionState === ConnectionState.CONNECTED}
                />
            </div>
        </div>
    );
};


const LOCAL_STORAGE_KEY_VFX = 'magicWandVfxSequence';
const LOCAL_STORAGE_KEY_SPELLBOOK = 'magicWandSpellBook';
const LOCAL_STORAGE_KEY_TUTORIAL = 'magicWandTutorialCompleted';
const LOCAL_STORAGE_KEY_CASTING_HISTORY = 'magicWandCastingHistory';


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
        // FIX: Replaced explicit subtraction with unary minus for negation, which is more standard and avoids potential linter issues.
        const accel_y = -(raw_ay * ACCEL_SCALE);
        const accel_z = raw_az * ACCEL_SCALE;

        const gyro_x = raw_gx * GYRO_SCALE;
        const gyro_y = -(raw_gy * GYRO_SCALE);
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

// Type for Live Event state
type LiveEvent = {
  message: string;
  type: 'info' | 'processing' | 'success';
} | null;

interface SpellBookProps {
  spellBook: Spell[];
  discoveredSpells: Set<string>;
  discoveredCount: number;
  totalCount: number;
  spellFilter: string;
  setSpellFilter: (filter: string) => void;
  castingHistory: CastingHistoryEntry[];
}

const SpellBook: React.FC<SpellBookProps> = ({ spellBook, discoveredSpells, discoveredCount, totalCount, spellFilter, setSpellFilter, castingHistory }) => {
    const castCounts = React.useMemo(() => {
        // FIX: The initial value {} is cast to the accumulator's type to resolve a type mismatch that caused inference errors.
        return castingHistory.reduce((acc: Record<string, number>, cast: CastingHistoryEntry) => {
            acc[cast.name] = (acc[cast.name] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [castingHistory]);
    
    const filteredAndSortedSpells = React.useMemo(() => {
        return [...spellBook]
            .filter(spell => spell.name.toLowerCase().replace(/_/g, ' ').includes(spellFilter.toLowerCase()))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [spellBook, spellFilter]);

    const discoveryPercentage = totalCount > 0 ? Math.round((discoveredCount / totalCount) * 100) : 0;

    return (
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 h-full flex flex-col">
            <h2 className="text-lg font-semibold mb-2">Spell Book</h2>
            <div className="mb-4">
                <div className="flex justify-between items-center text-sm text-slate-400 mb-1">
                    <span>Discovery Progress</span>
                    <span>{discoveredCount} / {totalCount}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${discoveryPercentage}%` }}></div>
                </div>
            </div>

            <div className="flex-grow grid grid-rows-2 gap-4 mt-2 overflow-hidden">
                <div className="flex flex-col min-h-0">
                    <input
                        type="text"
                        value={spellFilter}
                        onChange={(e) => setSpellFilter(e.target.value)}
                        placeholder="Filter discovered spells..."
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 mb-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 flex-shrink-0"
                    />
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        {filteredAndSortedSpells.length > 0 ? (
                            <ul className="space-y-2">
                                {filteredAndSortedSpells.map(spell => (
                                    <li key={spell.name} className="flex justify-between items-center bg-slate-700/50 p-2 rounded-md animate-fade-in">
                                        <span className="text-slate-300">{spell.name.replace(/_/g, ' ')}</span>
                                        {castCounts[spell.name] > 0 && (
                                            <span className="text-xs bg-indigo-500/50 text-indigo-300 font-mono px-2 py-0.5 rounded-full">
                                                x{castCounts[spell.name]}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-slate-500 text-sm text-center pt-4">No discovered spells match filter.</p>
                        )}
                    </div>
                </div>
                
                <div className="flex flex-col min-h-0">
                    <h3 className="text-md font-semibold text-slate-400 mb-2 flex-shrink-0">Casting History</h3>
                    <div className="flex-grow overflow-y-auto -mr-2 pr-2">
                        <ul className="space-y-1">
                            {castingHistory.length > 0 ? (
                                castingHistory.map(cast => (
                                    <li key={cast.id} className="flex justify-between items-center bg-slate-900/50 p-1.5 rounded-md text-sm animate-fade-in">
                                        <span className="text-slate-300">{cast.name.replace(/_/g, ' ')}</span>
                                        <span className="text-slate-500 font-mono text-xs">{cast.timestamp}</span>
                                    </li>
                                ))
                            ) : (
                                <p className="text-slate-500 text-sm text-center pt-4">Cast a spell to see history.</p>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface SpellCompendiumProps {
  spellBook: Spell[];
  castingHistory: CastingHistoryEntry[];
  onSelectSpell: (spellName: string) => void;
  onUnlockAll: () => void;
}

const SpellCompendium: React.FC<SpellCompendiumProps> = ({ spellBook, castingHistory, onSelectSpell, onUnlockAll }) => {
    const discoveredSpells = React.useMemo(() => new Set(spellBook.map(s => s.name)), [spellBook]);

    const castCounts = React.useMemo(() => {
        // FIX: The initial value {} is cast to the accumulator's type to resolve a type mismatch that caused inference errors.
        return castingHistory.reduce((acc: Record<string, number>, cast: CastingHistoryEntry) => {
            acc[cast.name] = (acc[cast.name] ?? 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [castingHistory]);

    // FIX: Memoize the sorted spell list to improve performance and avoid potential toolchain errors.
    // FIX: Add explicit compare function to sort to fix type inference issues and ensure correct sorting.
    const sortedSpellList = React.useMemo(() => [...SPELL_LIST].sort((a, b) => a.localeCompare(b)), []);

    return (
        <div className="h-full flex flex-col space-y-4">
            <div className="flex-shrink-0 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-semibold">Spell Compendium</h3>
                    <p className="text-sm text-slate-400">A catalog of all known spells. Cast them to discover them, or click to view details.</p>
                </div>
                <button
                    onClick={onUnlockAll}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-slate-900 rounded font-semibold text-sm flex items-center gap-2"
                >
                    <SparklesIcon />
                    Unlock All Spells (Dev)
                </button>
            </div>
            <div className="flex-grow overflow-y-auto pr-2 -mr-2 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {/* FIX: Avoid mutating the constant SPELL_LIST by creating a copy before sorting. */}
                    {sortedSpellList.map(spellName => {
                        const isDiscovered = discoveredSpells.has(spellName);
                        const count = castCounts[spellName] || 0;
                        return (
                            <button
                                key={spellName}
                                onClick={() => isDiscovered && onSelectSpell(spellName)}
                                disabled={!isDiscovered}
                                className={`p-4 rounded-lg text-center transition-all duration-200 h-28 flex flex-col justify-between ${
                                    isDiscovered
                                    ? 'bg-slate-800 hover:bg-slate-700 hover:scale-105 border border-indigo-500/50 cursor-pointer shadow-lg'
                                    : 'bg-slate-800/50 text-slate-500 border border-slate-700'
                                }`}
                            >
                                <p className={`font-semibold text-sm ${isDiscovered ? 'text-indigo-300' : ''}`}>
                                    {spellName.replace(/_/g, ' ')}
                                </p>
                                {isDiscovered ? (
                                    count > 0 ? (
                                        <div className="mt-2 text-xs font-mono bg-slate-700 inline-block px-2 py-0.5 rounded-full text-slate-300 self-center">
                                            Casted x{count}
                                        </div>
                                    ) : (
                                        <div className="mt-2 text-xs font-mono text-green-400/80 self-center">
                                            Discovered
                                        </div>
                                    )
                                ) : (
                                    <div className="mt-2 text-xs font-mono text-slate-600 self-center">
                                        Undiscovered
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// FIX: Define a props interface for the Diagnostics component to avoid using `any` and fix type errors.
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

const Diagnostics: React.FC<DiagnosticsProps> = ({
  detectedOpCodes, rawPacketLog, bleEventLog, isImuStreaming, toggleImuStream, handleImuCalibrate,
  latestImuData, buttonState, smaliInput, setSmaliInput, analyzeSmaliWithGemini, isAnalyzingSmali,
  smaliAnalysis, isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled,
  gestureThreshold, setGestureThreshold, clientSideGestureDetected, buttonThresholds, handleReadButtonThresholds,
  wandConnectionState, queueCommand
}) => {
    const sortedOpCodes = React.useMemo(() => Array.from(detectedOpCodes).sort((a, b) => a - b), [detectedOpCodes]);
    const isConnected = wandConnectionState === ConnectionState.CONNECTED;

    return (
        <div className="h-full flex flex-col space-y-4">
            <h3 className="text-xl font-semibold">Diagnostics &amp; Raw Data</h3>
            <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden">
                
                {/* Left Column */}
                <div className="flex flex-col space-y-4 overflow-hidden">
                    {/* IMU & Buttons Panel */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         {/* IMU Panel */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                            <h4 className="text-lg font-semibold mb-3">IMU &amp; Sensors</h4>
                             <div className="flex space-x-2 mb-3">
                                <button onClick={toggleImuStream} disabled={!isConnected} className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded font-semibold disabled:bg-slate-500">{isImuStreaming ? 'Stop Stream' : 'Start Stream'}</button>
                                <button onClick={handleImuCalibrate} disabled={!isConnected} className="flex-1 px-3 py-2 text-sm bg-yellow-600 hover:bg-yellow-500 rounded font-semibold disabled:bg-slate-500">Calibrate</button>
                            </div>
                             <div className="font-mono text-xs space-y-1 text-slate-400">
                                {latestImuData ? latestImuData.slice(-1).map(d => (
                                    <div key={d.chunk_index}>
                                        <p>Acc: {d.acceleration.x.toFixed(2)}, {d.acceleration.y.toFixed(2)}, {d.acceleration.z.toFixed(2)}</p>
                                        <p>Gyr: {d.gyroscope.x.toFixed(2)}, {d.gyroscope.y.toFixed(2)}, {d.gyroscope.z.toFixed(2)}</p>
                                    </div>
                                )) : <p>IMU stream is off.</p>}
                            </div>
                        </div>

                        {/* Button Panel */}
                        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                           <div className="flex justify-between items-center mb-2">
                             <h4 className="text-lg font-semibold">Grip &amp; Thresholds</h4>
                             <button onClick={handleReadButtonThresholds} disabled={!isConnected} className="px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Read</button>
                           </div>
                            <div className="flex justify-around items-center h-16">
                                {buttonState.map((pressed, i) => (
                                    <div key={i} className="flex flex-col items-center">
                                        <div className={`w-8 h-8 rounded-full border-2 ${pressed ? 'bg-indigo-500 border-indigo-300' : 'bg-slate-700 border-slate-600'}`}></div>
                                        <span className="text-xs mt-1 text-slate-400">B{i+1}</span>
                                        <span className="text-xs font-mono text-slate-500">
                                            {buttonThresholds[i].min !== null ? `${buttonThresholds[i].min}-${buttonThresholds[i].max}` : 'N/A'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Gesture Detection Panel */}
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                         <div className="relative flex items-start">
                            <div className="flex h-5 items-center">
                                <input id="gesture-toggle" type="checkbox" checked={isClientSideGestureDetectionEnabled} onChange={e => setIsClientSideGestureDetectionEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                            </div>
                            <div className="ml-3 text-sm">
                                <label htmlFor="gesture-toggle" className="font-medium text-slate-300">Client-Side Gesture Detection</label>
                                <p className="text-slate-400">Detect casting motion in the browser based on acceleration magnitude.</p>
                            </div>
                        </div>
                        {isClientSideGestureDetectionEnabled && (
                            <div className="mt-3">
                                <label htmlFor="gesture-threshold" className="block text-sm font-medium text-slate-400">Threshold: {gestureThreshold.toFixed(1)} G</label>
                                <input type="range" id="gesture-threshold" min="0.5" max="5" step="0.1" value={gestureThreshold} onChange={e => setGestureThreshold(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                            </div>
                        )}
                         {clientSideGestureDetected && <p className="text-green-400 text-sm mt-2 animate-pulse">Motion Detected!</p>}
                    </div>
                     {/* Command Test Panel */}
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                         <h4 className="text-lg font-semibold mb-3">Direct Command Tests</h4>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                             <button onClick={() => queueCommand(new Uint8Array([WBDLProtocol.CMD.HAPTIC_VIBRATE, 0x58, 0x02]))} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Buzz (600ms)</button>
                             <button onClick={() => queueCommand(WBDLPayloads.LIGHT_CLEAR_ALL_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Clear Lights</button>
                             <button onClick={() => queueCommand(WBDLPayloads.MACRO_READY_TO_CAST_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Ready FX</button>
                             <button onClick={() => queueCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD)} disabled={!isConnected} className="px-2 py-2 text-xs bg-slate-600 hover:bg-slate-500 rounded disabled:bg-slate-500">Req Firmware</button>
                         </div>
                    </div>
                    {/* Smali Analysis Panel */}
                    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex-grow flex flex-col">
                         <h4 className="text-lg font-semibold mb-2">Smali Analyzer (via Gemini)</h4>
                         <textarea value={smaliInput} onChange={e => setSmaliInput(e.target.value)} placeholder="Paste smali code here..." rows={4} className="w-full bg-slate-950 border border-slate-600 rounded-lg p-2 text-xs font-mono"></textarea>
                         <button onClick={analyzeSmaliWithGemini} disabled={isAnalyzingSmali} className="mt-2 w-full px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded disabled:bg-slate-500">{isAnalyzingSmali ? 'Analyzing...' : 'Analyze'}</button>
                         <div className="mt-2 p-2 bg-slate-950 rounded border border-slate-600 flex-grow overflow-y-auto text-sm prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: smaliAnalysis || '<p class="text-slate-500">Analysis results will appear here.</p>' }}></div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
                    <h4 className="text-lg font-semibold mb-2">Protocol Data Logs</h4>
                    <div className="flex-grow overflow-y-auto">
                        <h5 className="font-semibold text-slate-400 mt-2">Detected Incoming Opcodes:</h5>
                        <div className="flex flex-wrap gap-1 text-xs font-mono mt-1 mb-2">
                            {sortedOpCodes.length > 0 ? sortedOpCodes.map(code => <span key={code} className="bg-slate-700 px-2 py-0.5 rounded-full">0x{code.toString(16).padStart(2, '0')}</span>) : <span className="text-slate-500">None yet</span>}
                        </div>
                         <h5 className="font-semibold text-slate-400 mt-2">Raw Packet Log (Incoming):</h5>
                         <div className="h-32 overflow-y-scroll bg-slate-950 rounded p-2 font-mono text-xs border border-slate-700">
                             {rawPacketLog.map(p => <div key={p.id}><span className="text-slate-500">{p.timestamp}</span> <span className="text-purple-400">{p.hexData}</span></div>)}
                         </div>
                         <h5 className="font-semibold text-slate-400 mt-2">BLE Event Log:</h5>
                         <div className="h-32 overflow-y-scroll bg-slate-950 rounded p-2 font-mono text-xs border border-slate-700">
                             {bleEventLog.map(e => <div key={e.id}><span className="text-slate-500">{e.timestamp}</span> <span className="text-green-400">[{e.event}]</span> <span className="text-slate-300">{e.detail}</span></div>)}
                         </div>
                    </div>
                </div>

            </div>
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
  setHueUsername: (user: string) => void;
  hueLightId: string;
  setHueLightId: (id: string) => void;
  saveHueSettings: () => void;
  negotiatedMtu: number;
  commandDelay_ms: number;
  setCommandDelay_ms: (delay: number) => void;
  onResetTutorial: () => void;
  onSendBoxTestMacro: () => void;
  onRequestBoxAddress: () => void;
}

const DeviceCard: React.FC<{
  title: string,
  icon: React.ReactNode,
  connectionState: ConnectionState,
  onConnect: () => void,
  details: WandDevice | null,
  batteryLevel: number | null,
  rawProductInfo: string | null
}> = ({ title, icon, connectionState, onConnect, details, batteryLevel, rawProductInfo }) => (
  <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
    <div className="flex justify-between items-start mb-3">
      <div className="flex items-center">
        {icon}
        <h3 className="text-xl font-semibold">{title}</h3>
      </div>
      <StatusBadge state={connectionState} />
    </div>
    {connectionState === ConnectionState.DISCONNECTED ? (
      <button onClick={onConnect} className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold">Connect</button>
    ) : (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="font-semibold text-slate-400">Name:</span>
          <span className="font-mono text-slate-300">{details?.bleName}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-semibold text-slate-400">Address:</span>
          <span className="font-mono text-slate-300">{details?.address}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-400">Battery:</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-300">{batteryLevel !== null ? `${batteryLevel}%` : 'N/A'}</span>
            <BatteryIcon level={batteryLevel} />
          </div>
        </div>
        <div className="flex justify-between">
            <span className="font-semibold text-slate-400">Firmware:</span>
            <span className="font-mono text-slate-300">{details?.firmware || '...'}</span>
        </div>
        <div className="flex justify-between">
            <span className="font-semibold text-slate-400">Wand Type:</span>
            <span className="font-mono text-slate-300">{details?.wandType || '...'}</span>
        </div>
        <div className="pt-2">
            <h4 className="text-xs font-semibold text-slate-400 mb-1">Raw Product Info Packets</h4>
            <pre className="bg-slate-950 p-2 rounded text-xs font-mono max-h-24 overflow-y-auto border border-slate-600">{rawProductInfo || 'No product info received yet.'}</pre>
        </div>
      </div>
    )}
  </div>
);

const DeviceManager: React.FC<DeviceManagerProps> = ({
  wandConnectionState, boxConnectionState, wandDetails, boxDetails, wandBatteryLevel, boxBatteryLevel,
  onConnectWand, onConnectBox, rawWandProductInfo, rawBoxProductInfo, isTvBroadcastEnabled,
  setIsTvBroadcastEnabled, userHouse, setUserHouse, userPatronus, setUserPatronus, isHueEnabled,
  setIsHueEnabled, hueBridgeIp, setHueBridgeIp, hueUsername, setHueUsername, hueLightId,
  setHueLightId, saveHueSettings, negotiatedMtu, commandDelay_ms, setCommandDelay_ms, onResetTutorial,
  onSendBoxTestMacro, onRequestBoxAddress
}) => (
  <div className="h-full flex flex-col space-y-4 overflow-y-auto">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <DeviceCard 
        title="Magic Wand"
        icon={<MagicWandIcon />}
        connectionState={wandConnectionState}
        onConnect={onConnectWand}
        details={wandDetails}
        batteryLevel={wandBatteryLevel}
        rawProductInfo={rawWandProductInfo}
      />
      <DeviceCard 
        title="Wand Box"
        icon={<CubeIcon />}
        connectionState={boxConnectionState}
        onConnect={onConnectBox}
        details={boxDetails}
        batteryLevel={boxBatteryLevel}
        rawProductInfo={rawBoxProductInfo}
      />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
        <h3 className="text-xl font-semibold mb-3">Integrations</h3>
         <div className="space-y-4">
            {/* TV Broadcast */}
            <div className="relative flex items-start">
                <div className="flex h-5 items-center"><input id="tv-broadcast" type="checkbox" checked={isTvBroadcastEnabled} onChange={e => setIsTvBroadcastEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></div>
                <div className="ml-3 text-sm"><label htmlFor="tv-broadcast" className="font-medium text-slate-300">Smart TV Broadcast</label><p className="text-slate-400">Simulate sending UDP spell packets to a smart TV.</p></div>
            </div>
             {isTvBroadcastEnabled && <div className="pl-5 space-y-2">
                <div><label className="text-xs font-semibold text-slate-400">House</label><select value={userHouse} onChange={e => setUserHouse(e.target.value as House)} className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1 mt-1 text-sm"><option value="GRYFFINDOR">Gryffindor</option><option value="HUFFLEPUFF">Hufflepuff</option><option value="RAVENCLAW">Ravenclaw</option><option value="SLYTHERIN">Slytherin</option></select></div>
                <div><label className="text-xs font-semibold text-slate-400">Patronus</label><input type="text" value={userPatronus} onChange={e => setUserPatronus(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1 mt-1 text-sm" /></div>
            </div>}
             {/* Hue Integration */}
            <div className="relative flex items-start pt-4 border-t border-slate-700">
                <div className="flex h-5 items-center"><input id="hue-enable" type="checkbox" checked={isHueEnabled} onChange={e => setIsHueEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></div>
                <div className="ml-3 text-sm"><label htmlFor="hue-enable" className="font-medium text-slate-300">Philips Hue Lights</label><p className="text-slate-400">Simulate spell effects on your smart lights.</p></div>
            </div>
             {isHueEnabled && <div className="pl-5 space-y-2">
                <div><label className="text-xs font-semibold text-slate-400">Bridge IP</label><input type="text" value={hueBridgeIp} onChange={e => setHueBridgeIp(e.target.value)} placeholder="192.168.1.100" className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1 mt-1 text-sm" /></div>
                <div><label className="text-xs font-semibold text-slate-400">Username</label><input type="text" value={hueUsername} onChange={e => setHueUsername(e.target.value)} placeholder="Press button on bridge..." className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1 mt-1 text-sm" /></div>
                <div><label className="text-xs font-semibold text-slate-400">Light ID</label><input type="text" value={hueLightId} onChange={e => setHueLightId(e.target.value)} placeholder="1" className="w-full bg-slate-800 border border-slate-600 rounded-md px-2 py-1 mt-1 text-sm" /></div>
                <button onClick={saveHueSettings} className="w-full px-3 py-1 bg-slate-600 hover:bg-slate-500 text-xs rounded">Save Hue Settings</button>
            </div>}
         </div>
      </div>
      <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 space-y-4">
        <h3 className="text-xl font-semibold">Protocol &amp; App Settings</h3>
        <div>
            <label htmlFor="mtu-info" className="block text-sm font-medium text-slate-300">Negotiated MTU Size</label>
            <p className="text-slate-400 text-xs">Maximum packet size for commands. Default is 20.</p>
            <input id="mtu-info" type="text" value={`${negotiatedMtu} bytes`} readOnly className="w-full bg-slate-800 border-slate-600 rounded-md px-3 py-2 mt-1 font-mono text-sm" />
        </div>
        <div>
            <label htmlFor="cmd-delay" className="block text-sm font-medium text-slate-300">Command Delay</label>
            <p className="text-slate-400 text-xs">Delay between queued write commands ({commandDelay_ms}ms).</p>
            <input id="cmd-delay" type="range" min="0" max="200" step="5" value={commandDelay_ms} onChange={e => setCommandDelay_ms(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer mt-1" />
        </div>
        <div className="pt-4 border-t border-slate-700 space-y-2">
            <button onClick={onRequestBoxAddress} className="w-full text-sm px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded font-semibold">Request Box Address</button>
            <button onClick={onSendBoxTestMacro} className="w-full text-sm px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded font-semibold">Send Box Test Macro</button>
            <button onClick={onResetTutorial} className="w-full text-sm px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded font-semibold">Reset Tutorial</button>
        </div>
      </div>
    </div>
  </div>
);


// --- MAIN APP ---
export default function App() {
  const [logs, setLogs] = React.useState<LogEntry[]>([]);
  
  // --- State Refactor: Using centralized WandDevice object inspired by smali analysis ---
  // Wand State
  const [wandConnectionState, setWandConnectionState] = React.useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [wandDetails, setWandDetails] = React.useState<WandDevice | null>(null);
  const [wandBatteryLevel, setWandBatteryLevel] = React.useState<number | null>(null);
  const [rawWandProductInfo, setRawWandProductInfo] = React.useState<string | null>(null);
  
  // Box State
  const [boxConnectionState, setBoxConnectionState] = React.useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [boxDetails, setBoxDetails] = React.useState<WandDevice | null>(null);
  const [boxBatteryLevel, setBoxBatteryLevel] = React.useState<number | null>(null);
  const [rawBoxProductInfo, setRawBoxProductInfo] = React.useState<string | null>(null);
  
  // Control State
  const [buttonState, setButtonState] = React.useState<[boolean, boolean, boolean, boolean]>([false, false, false, false]);
  
  // General State
  const [lastSpell, setLastSpell] = React.useState<{ name: string } | null>(null);
  const [spellDetails, setSpellDetails] = React.useState<SpellDetails | null>(null);
  const [isFetchingSpellDetails, setIsFetchingSpellDetails] = React.useState(false);
  const [spellDetailsError, setSpellDetailsError] = React.useState<string | null>(null);
  const [gestureState, setGestureState] = React.useState<GestureState>('Idle');
  const [activeTab, setActiveTab] = React.useState<'control_hub' | 'device_manager' | 'diagnostics' | 'compendium' | 'explorer' | 'scripter' | 'wizarding_class'>('device_manager');
  const [isScannerOpen, setIsScannerOpen] = React.useState(false);
  const [deviceToScan, setDeviceToScan] = React.useState<DeviceType | null>(null);
  
  const [vfxSequence, setVfxSequence] = React.useState<VfxCommand[]>([]);
  const [isSequenceSaved, setIsSequenceSaved] = React.useState(false);
  const [detectedOpCodes, setDetectedOpCodes] = React.useState<Set<number>>(new Set());
  const [rawPacketLog, setRawPacketLog] = React.useState<RawPacket[]>([]);
  const [spellBook, setSpellBook] = React.useState<Spell[]>([]);
  const [castingHistory, setCastingHistory] = React.useState<CastingHistoryEntry[]>([]);
  const [spellFilter, setSpellFilter] = React.useState('');
  
  const [isImuStreaming, setIsImuStreaming] = React.useState(false);
  const [latestImuData, setLatestImuData] = React.useState<IMUReading[] | null>(null);

  // Smart TV Broadcast State
  const [isTvBroadcastEnabled, setIsTvBroadcastEnabled] = React.useState<boolean>(false);
  const [userHouse, setUserHouse] = React.useState<House>('GRYFFINDOR');
  const [userPatronus, setUserPatronus] = React.useState<string>('Deer');
  
  // Hue Integration State
  const [isHueEnabled, setIsHueEnabled] = React.useState(false);
  const [hueBridgeIp, setHueBridgeIp] = React.useState('');
  const [hueUsername, setHueUsername] = React.useState('');
  const [hueLightId, setHueLightId] = React.useState('1');
  
  // BLE Explorer State
  const [explorerDevice, setExplorerDevice] = React.useState<BluetoothDevice | null>(null);
  const [explorerServices, setExplorerServices] = React.useState<ExplorerService[]>([]);
  const [isExploring, setIsExploring] = React.useState(false);
  
  // Diagnostics State
  const [bleEventLog, setBleEventLog] = React.useState<BleEvent[]>([]);
  const [negotiatedMtu, setNegotiatedMtu] = React.useState<number>(WBDLPayloads.MTU_PAYLOAD_SIZE);
  const [smaliInput, setSmaliInput] = React.useState('');
  const [smaliAnalysis, setSmaliAnalysis] = React.useState('');
  const [isAnalyzingSmali, setIsAnalyzingSmali] = React.useState(false);
  // New: State for Client-Side Gesture Detection, based on n.smali analysis
  const [isClientSideGestureDetectionEnabled, setIsClientSideGestureDetectionEnabled] = React.useState(true);
  const [gestureThreshold, setGestureThreshold] = React.useState(2.0); // Default threshold in G's
  const [clientSideGestureDetected, setClientSideGestureDetected] = React.useState(false);
  const [buttonThresholds, setButtonThresholds] = React.useState<ButtonThresholds[]>([
    { min: null, max: null }, { min: null, max: null },
    { min: null, max: null }, { min: null, max: null },
  ]);
  
  // New: State for Spell Compendium
  const [isCompendiumModalOpen, setIsCompendiumModalOpen] = React.useState(false);
  const [selectedCompendiumSpell, setSelectedCompendiumSpell] = React.useState<string | null>(null);
  const [compendiumSpellDetails, setCompendiumSpellDetails] = React.useState<SpellDetails | null>(null);
  const [isFetchingCompendiumDetails, setIsFetchingCompendiumDetails] = React.useState(false);
  const [compendiumError, setCompendiumError] = React.useState<string | null>(null);

  // New: State for Protocol Settings
  const [commandDelay_ms, setCommandDelay_ms] = React.useState(20);

  // New: State for Tutorial Modal
  const [showTutorial, setShowTutorial] = React.useState(false);

  // New: State for Live Event Indicator, based on SpellGestureHandler.smali analysis
  const [liveEvent, setLiveEvent] = React.useState<LiveEvent>(null);


  // --- Command Queue State ---
  const [writeQueue, setWriteQueue] = React.useState<WriteQueueItem[]>([]);
  const isWriting = React.useRef(false);
  const [boxWriteQueue, setBoxWriteQueue] = React.useState<WriteQueueItem[]>([]);
  const isBoxWriting = React.useRef(false);

  const logCounter = React.useRef(0);
  const bleEventCounter = React.useRef(0);
  const commandIdCounter = React.useRef(0);
  const rawPacketLogCounter = React.useRef(0);
  const castingHistoryCounter = React.useRef(0);
  const keepAliveInterval = React.useRef<number | null>(null);
  const liveEventTimeout = React.useRef<number | null>(null);
  const commandCharacteristic = React.useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const boxCommandCharacteristic = React.useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const isInitialMountSpells = React.useRef(true);
  const isInitialMountHistory = React.useRef(true);
  const discoveredSpells = React.useMemo(() => new Set(spellBook.map(s => s.name.toUpperCase())), [spellBook]);

  // New: Ref to store macro indices, based on smali reverse engineering
  const macroIndexes = React.useRef<Record<string, number>>({});


  const addLog = React.useCallback((type: LogType, message: string) => {
    setLogs(prev => [...prev, { id: logCounter.current++, timestamp: getTimestamp(), type, message }]);
  }, []);
  
  const addBleEvent = React.useCallback((event: string, detail: string = '') => {
      setBleEventLog(prev => {
          const newEntry = { id: bleEventCounter.current++, timestamp: getTimestamp(), event, detail };
          const newLog = [newEntry, ...prev];
          return newLog.slice(0, 50); 
      });
  }, []);

  // Effect to load data from localStorage on initial render
  React.useEffect(() => {
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
      addLog('ERROR', `Failed to load sequence from storage: ${String(error)}`);
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
    } catch (error) {
      addLog('ERROR', `Failed to load spell book: ${String(error)}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_SPELLBOOK);
    }

    // Load Casting History
    try {
        const savedHistoryJSON = localStorage.getItem(LOCAL_STORAGE_KEY_CASTING_HISTORY);
        if (savedHistoryJSON) {
            const savedHistory: CastingHistoryEntry[] = JSON.parse(savedHistoryJSON);
            if (Array.isArray(savedHistory)) {
                setCastingHistory(savedHistory);
                if (savedHistory.length > 0) {
                    castingHistoryCounter.current = Math.max(...savedHistory.map(h => h.id)) + 1;
                }
                addLog('INFO', 'Loaded casting history from storage.');
            }
        }
    } catch (error) {
        addLog('ERROR', `Failed to load casting history: ${String(error)}`);
        localStorage.removeItem(LOCAL_STORAGE_KEY_CASTING_HISTORY);
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
  React.useEffect(() => {
    try {
      const tutorialCompleted = localStorage.getItem(LOCAL_STORAGE_KEY_TUTORIAL);
      if (tutorialCompleted !== 'true') {
        setShowTutorial(true);
      }
    } catch (error) {
      addLog('ERROR', `Could not read tutorial status from storage: ${String(error)}`);
      setShowTutorial(true); // Show tutorial if storage fails
    }
  }, [addLog]);

  
  // Effect to auto-save Spell Book when it changes
  React.useEffect(() => {
    if (isInitialMountSpells.current) {
        isInitialMountSpells.current = false;
        return;
    }
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_SPELLBOOK, JSON.stringify(spellBook));
    } catch (error) {
        addLog('ERROR', `Failed to save spell book: ${String(error)}`);
    }
  }, [spellBook, addLog]);

  // New: Effect to auto-save Casting History when it changes
  React.useEffect(() => {
      if (isInitialMountHistory.current) {
          isInitialMountHistory.current = false;
          return;
      }
      try {
          localStorage.setItem(LOCAL_STORAGE_KEY_CASTING_HISTORY, JSON.stringify(castingHistory));
      } catch (error) {
          addLog('ERROR', `Failed to save casting history: ${String(error)}`);
      }
  }, [castingHistory, addLog]);

  // Effect to save TV Broadcast settings
  React.useEffect(() => {
    try {
        localStorage.setItem('magicWandTvBroadcastEnabled', JSON.stringify(isTvBroadcastEnabled));
        localStorage.setItem('magicWandUserHouse', userHouse);
        localStorage.setItem('magicWandUserPatronus', userPatronus);
    } catch (error) {
        addLog('ERROR', `Failed to save TV Broadcast settings: ${String(error)}`);
    }
  }, [isTvBroadcastEnabled, userHouse, userPatronus, addLog]);
  
  // Effect to save Hue settings
  const saveHueSettings = React.useCallback(() => {
    try {
        localStorage.setItem('magicWandHueEnabled', JSON.stringify(isHueEnabled));
        localStorage.setItem('magicWandHueIp', hueBridgeIp);
        localStorage.setItem('magicWandHueUser', hueUsername);
        localStorage.setItem('magicWandHueLightId', hueLightId);
        addLog('SUCCESS', 'Hue settings saved.');
    } catch (error) {
        addLog('ERROR', `Failed to save Hue settings: ${String(error)}`);
    }
  }, [isHueEnabled, hueBridgeIp, hueUsername, hueLightId, addLog]);


  // Effect to close scanner modal on successful connection
  React.useEffect(() => {
    if (!isScannerOpen) {
      return;
    }

    if (deviceToScan === 'wand' && wandConnectionState === ConnectionState.CONNECTED) {
      setIsScannerOpen(false);
      setDeviceToScan(null);
    } else if (deviceToScan === 'box' && boxConnectionState === ConnectionState.CONNECTED) {
      setIsScannerOpen(false);
      setDeviceToScan(null);
    }
  }, [wandConnectionState, boxConnectionState, isScannerOpen, deviceToScan]);

  const macroSchema = {
    type: Type.ARRAY,
    description: "A list of command groups. Each group is a list of command objects to be executed in sequence for the device's VFX.",
    items: {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                command: {
                    type: Type.STRING,
                    description: "Command name. Must be one of: 'LightTransition', 'HapticBuzz', 'MacroDelay', 'LightClear'."
                },
                color: { type: Type.STRING, description: "Hex color (#RRGGBB) for 'LightTransition'." },
                duration: { type: Type.INTEGER, description: "Duration in milliseconds for 'LightTransition', 'HapticBuzz', and 'MacroDelay'." },
                group: { type: Type.INTEGER, description: "LED group to target for 'LightTransition'. Usually 0." },
                loops: { type: Type.INTEGER, description: "Number of times to repeat this command. Defaults to 1." }
            },
            required: ["command"]
        }
    }
  };


  const fetchSpellDetails = React.useCallback(async (spellName: string) => {
    if (!spellName) return;

    setIsFetchingSpellDetails(true);
    setSpellDetailsError(null);
    setSpellDetails(null);
    addLog('INFO', `Fetching details for spell: ${spellName}...`);

    try {
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
              },
              config_wand: { type: Type.OBJECT, properties: { macros_payoff: macroSchema } },
              config_wandbox: { type: Type.OBJECT, properties: { macros_payoff: macroSchema } },
          },
          required: ["spell_name", "incantation_name", "description", "spell_type", "difficulty", "spell_background_color", "spell_uses", "config_wand", "config_wandbox"]
      };

      const systemInstruction = `You are a magical archivist providing data about spells from a wizarding world. For a given spell name, you must return a single, valid JSON object with details about that spell, conforming to the provided schema. The 'spell_name' in the response should be the same as the input spell name, formatted in uppercase. You must generate plausible 'macros_payoff' sequences for both 'config_wand' and 'config_wandbox'. Remember, \`macros_payoff\` is a list of variations (a list of lists of commands). To make the spell effects more dynamic, please generate between 1 and 3 distinct variations for each spell. The wand's effect should be direct and active (e.g., quick flashes, haptics). The wand box's effect should be more ambient and secondary (e.g., a slow glow, a color shift).`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide the details for the spell: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const jsonText = response.text;
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

  React.useEffect(() => {
    if (lastSpell?.name) {
      fetchSpellDetails(lastSpell.name);
    } else {
      setSpellDetails(null);
      setSpellDetailsError(null);
      setIsFetchingSpellDetails(false);
    }
  }, [lastSpell, fetchSpellDetails]);


  const clearKeepAlive = React.useCallback(() => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = null;
    }
  }, []);
  
  const sendTvBroadcast = React.useCallback((spellName: string) => {
    if (!isTvBroadcastEnabled) return;
    
    // Sanitize inputs as per smali analysis (remove spaces, lowercase house)
    const sanitizedSpell = spellName.replace(/\s/g, '');
    const sanitizedHouse = userHouse.toLowerCase();
    const sanitizedPatronus = userPatronus.replace(/\s/g, '');

    const payload = `spell:${sanitizedSpell}:${sanitizedHouse}:${sanitizedPatronus}`;

    addLog('INFO', `Smart TV Broadcast (Simulated): Would send UDP packet to port 8888 with payload: "${payload}"`);

  }, [isTvBroadcastEnabled, userHouse, userPatronus, addLog]);
  
  const handleHueSpell = React.useCallback((spellName: string) => {
    if (!isHueEnabled || !hueBridgeIp || !hueUsername || !hueLightId) {
        if (isHueEnabled) {
            addLog('WARNING', 'Hue integration is enabled, but settings are incomplete.');
        }
        return;
    }

    let payload: object | null = null;
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

  const handleDisconnect = React.useCallback(() => {
    if (!wandDetails) return;
    addLog('INFO', `Wand disconnected: ${wandDetails.bleName}`);
    addBleEvent('GATT', 'Disconnected');
    setWandConnectionState(ConnectionState.DISCONNECTED);
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
    setLiveEvent(null);
    if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
  }, [addLog, clearKeepAlive, wandDetails, addBleEvent]);
  
  const handleBoxDisconnect = React.useCallback(() => {
    if (!boxDetails) return;
    addLog('INFO', `Wand Box disconnected: ${boxDetails.bleName}`);
    addBleEvent('GATT', 'Box Disconnected');
    setBoxConnectionState(ConnectionState.DISCONNECTED);
    setBoxDetails(null);
    setBoxBatteryLevel(null);
    setRawBoxProductInfo(null);
    boxCommandCharacteristic.current = null;
    setBoxWriteQueue([]);
    isBoxWriting.current = false;
  }, [addLog, boxDetails, addBleEvent]);

  const queueCommand = React.useCallback((payload: Uint8Array, silent: boolean = false) => {
    setWriteQueue(prev => [...prev, { payload, silent }]);
  }, []);

  const processWriteQueue = React.useCallback(async () => {
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
            addLog('DATA_OUT', `Sent to Wand: ${bytesToHex(itemToWrite.payload)}`);
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
  React.useEffect(() => {
    if (wandConnectionState === ConnectionState.CONNECTED) {
        processWriteQueue();
    }
  }, [writeQueue, wandConnectionState, processWriteQueue]);

  const queueBoxCommand = React.useCallback((payload: Uint8Array, silent: boolean = false) => {
    setBoxWriteQueue(prev => [...prev, { payload, silent }]);
  }, []);

  const processBoxWriteQueue = React.useCallback(async () => {
      if (isBoxWriting.current || boxWriteQueue.length === 0) {
          return;
      }
  
      isBoxWriting.current = true;
      const itemToWrite = boxWriteQueue[0];
  
      if (!boxCommandCharacteristic.current) {
          addLog('ERROR', 'Cannot process box write queue: characteristic not available.');
          addBleEvent('Error', 'Box write failed: No characteristic');
          isBoxWriting.current = false;
          setBoxWriteQueue([]);
          return;
      }
  
      try {
          addBleEvent('Characteristic', `Box writeValueWithResponse`);
          await boxCommandCharacteristic.current.writeValueWithResponse(itemToWrite.payload);
          if (!itemToWrite.silent) {
              addLog('DATA_OUT', `Sent to Box: ${bytesToHex(itemToWrite.payload)}`);
          }
          
          setTimeout(() => {
              setBoxWriteQueue(prev => prev.slice(1));
              isBoxWriting.current = false;
          }, commandDelay_ms);
  
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog('ERROR', `Failed to write command to box: ${errorMessage}. Clearing command queue.`);
          addBleEvent('Error', `Box write failed: ${errorMessage}`);
          setBoxWriteQueue([]);
          isBoxWriting.current = false;
      }
  }, [boxWriteQueue, addLog, addBleEvent, commandDelay_ms]);
  
  // Effect to drive the box write queue
  React.useEffect(() => {
      if (boxConnectionState === ConnectionState.CONNECTED) {
          processBoxWriteQueue();
      }
  }, [boxWriteQueue, boxConnectionState, processBoxWriteQueue]);

  // New: Parser for individual product info packets, based on `h0.smali` analysis.
  // This replaces the old TLV parser.
  const handleProductInfoPacket = React.useCallback((data: Uint8Array, forDevice: 'wand' | 'box') => {
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
          addLog('ERROR', `Failed to parse Product Info packet for ${forDevice} (type 0x${infoType.toString(16)}): ${String(e)}`);
      }
  }, [addLog]);

  // FIX: Moved `sendMacroSequence` before its first use to resolve a "used before its declaration" error.
  const sendMacroSequence = React.useCallback((commands: MacroCommand[], target: 'wand' | 'box') => {
    const isWand = target === 'wand';
    const connectionState = isWand ? wandConnectionState : boxConnectionState;
    const char = isWand ? commandCharacteristic.current : boxCommandCharacteristic.current;
    const queueFn = isWand ? queueCommand : queueBoxCommand;
    const mtu = isWand ? negotiatedMtu : WBDLPayloads.MTU_PAYLOAD_SIZE;
    const deviceName = isWand ? "Wand" : "Wand Box";

    if (connectionState !== ConnectionState.CONNECTED || !char) {
        addLog('ERROR', `Cannot send macro sequence: ${deviceName} not connected.`);
        return;
    }

    addLog('INFO', `Building and sending VFX macro sequence to ${deviceName}...`);
    // Assumption: The box uses the same MACRO_EXECUTE command prefix as the wand.
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
    
    if (finalPayload.length > mtu) {
        addLog('INFO', `Macro size (${finalPayload.length} bytes) exceeds MTU (${mtu} bytes) for ${deviceName}. Splitting into chunks.`);
        for (let i = 0; i < finalPayload.length; i += mtu) {
            const chunk = finalPayload.slice(i, i + negotiatedMtu);
            queueFn(chunk);
        }
    } else {
        queueFn(finalPayload);
    }
  }, [wandConnectionState, boxConnectionState, queueCommand, queueBoxCommand, negotiatedMtu, addLog]);

  const reactToSpellOnBoxFromWand = React.useCallback((spellName: string) => {
    if (boxConnectionState !== ConnectionState.CONNECTED) {
        return; 
    }
    
    const canonicalSpellName = spellName.toUpperCase();
    const macros_payoff = SPELL_BOX_REACTIONS[canonicalSpellName];

    if (!macros_payoff || macros_payoff.length === 0) {
        addLog('INFO', `No local box reaction macro found for spell ${spellName}.`);
        return;
    }

    const deviceType = 'BOX';

    const currentIndex = macroIndexes.current[deviceType] ?? -1;
    const nextIndex = (currentIndex + 1) % macros_payoff.length;
    macroIndexes.current[deviceType] = nextIndex;
    const macroVariation = macros_payoff[nextIndex];

    addLog('INFO', `Activating local box reaction for '${spellName}'. Executing macro variation ${nextIndex + 1}/${macros_payoff.length}.`);

    sendMacroSequence(macroVariation, 'box');
  }, [addLog, boxConnectionState, sendMacroSequence]);

  const parseStreamData = React.useCallback((event: Event) => {
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
                    // FIX: Changed multiplication to Math.pow to resolve a potential TypeScript type inference issue with the '*' operator.
                    const magnitude = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2) + Math.pow(z, 2));
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
                // New: Live Event based on SpellGestureHandler.smali confirmation
                if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
                setLiveEvent({ message: "Gesture Started. Sending 'Ready to Cast' macro.", type: 'info' });
                // Automatically trigger "Ready to Cast" effect, based on smali analysis of WandHelper
                addLog('INFO', 'Automatically triggering "Ready to Cast" light effect.');
                queueCommand(WBDLPayloads.MACRO_READY_TO_CAST_CMD);
            } else if (data[1] === 0x00) { // Gesture Stop
                setGestureState('Processing');
                setClientSideGestureDetected(false); // Reset client-side detector on official stop signal
                addLog('SUCCESS', 'Gesture stopped. Processing spell...');
                // New: Live Event based on SpellGestureHandler.smali confirmation
                if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
                setLiveEvent({ message: 'Gesture Stopped. Awaiting spell result...', type: 'processing' });
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

          // New: Live Event for spell decoding and payoff trigger
          if (liveEventTimeout.current) clearTimeout(liveEventTimeout.current);
          setLiveEvent({ message: `Spell Decoded! Triggering payoffs.`, type: 'success' });
          liveEventTimeout.current = window.setTimeout(() => setLiveEvent(null), 4000); // Clear after 4s

          addLog('SUCCESS', `SPELL DETECTED: *** ${finalSpellName} *** (Raw: "${cleanedSpellName}", Header: ${headerHex})`);
          
          setLastSpell({ name: finalSpellName });
          if (boxConnectionState === ConnectionState.CONNECTED) {
            reactToSpellOnBoxFromWand(finalSpellName);
          }
          
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

          // Add to casting history
          const newHistoryEntry: CastingHistoryEntry = {
            id: castingHistoryCounter.current++,
            name: finalSpellName,
            timestamp: getTimestamp(),
          };
          setCastingHistory(prev => [newHistoryEntry, ...prev].slice(0, 100)); // Prepend and cap at 100


        } catch (e) {
          addLog('ERROR', `Error decoding spell packet. Header: ${headerHex}, Packet: ${hexData}, Error: ${String(e)}`);
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
  }, [addLog, isImuStreaming, queueCommand, sendTvBroadcast, handleHueSpell, addBleEvent, isClientSideGestureDetectionEnabled, gestureState, clientSideGestureDetected, gestureThreshold, boxConnectionState, reactToSpellOnBoxFromWand]);
  
  const parseControlData = React.useCallback((event: Event) => {
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

    // New: Handle box address response based on smali analysis
    if (data.length === 7 && data[0] === WBDLProtocol.INCOMING_OPCODE.BOX_ADDRESS_RESPONSE) {
        const addressBytes = data.slice(1); // Get the 6 address bytes
        const macAddress = Array.from(addressBytes)
            .reverse() // Smali shows address is reversed in payload
            .map(b => b.toString(16).padStart(2, '0'))
            .join(':')
            .toUpperCase();
        
        setWandDetails(prev => prev ? { ...prev, companionAddress: macAddress } : prev);
        addLog('SUCCESS', `Received Companion Box Address: ${macAddress}`);
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
  
  const parseBoxData = React.useCallback((event: Event) => {
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


  const handleBatteryLevel = React.useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    addBleEvent('Event', `characteristicvaluechanged (Battery: ${target.uuid.substring(4, 8)})`);
    const value = target.value;
    if (!value) return;
    const level = value.getUint8(0);
    setWandBatteryLevel(level);
    addLog('INFO', `Wand Battery Level: ${level}%`);
  }, [addLog, addBleEvent]);
  
  const handleBoxBatteryLevel = React.useCallback((event: Event) => {
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


  const connectToWand = React.useCallback(async () => {
    if (!navigator.bluetooth) {
      addLog('ERROR', 'Web Bluetooth API is not available on this browser.');
      addBleEvent('Error', 'Web Bluetooth not available');
      setWandConnectionState(ConnectionState.ERROR);
      return;
    }
    setWandConnectionState(ConnectionState.CONNECTING);
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

      setWandConnectionState(ConnectionState.CONNECTED);
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
      setWandConnectionState(ConnectionState.ERROR);
      setWandDetails(null);
    }
  }, [addLog, handleDisconnect, parseControlData, parseStreamData, handleBatteryLevel, queueCommand, addBleEvent]);

  const connectToBox = React.useCallback(async () => {
    if (!navigator.bluetooth) {
      addLog('ERROR', 'Web Bluetooth API is not available on this browser.');
      addBleEvent('Error', 'Web Bluetooth not available');
      setBoxConnectionState(ConnectionState.ERROR);
      return;
    }
    setBoxConnectionState(ConnectionState.CONNECTING);
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
      const commChar = await service.getCharacteristic(WBDLProtocol.WAND_BOX.CHAR_UUID_COMM);
      boxCommandCharacteristic.current = commChar;
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
      
      // New: Subscribe to battery notifications as per WandBoxHelper.smali
      if (batteryChar.properties.notify) {
        addLog('INFO', 'Subscribing to Box battery notifications...');
        await batteryChar.startNotifications();
        batteryChar.addEventListener('characteristicvaluechanged', handleBoxBatteryLevel);
        addLog('SUCCESS', 'Notifications enabled for Box Battery.');
      } else {
        addLog('WARNING', 'Box battery characteristic does not support notifications.');
      }
      
      if (batteryChar.properties.read) {
        addLog('INFO', 'Reading initial Box battery level...');
        const initialBattery = await batteryChar.readValue();
        const level = initialBattery.getUint8(0);
        setBoxBatteryLevel(level); // Set initial level
        addLog('SUCCESS', `Initial Box Battery Level: ${level}%`);
      } else {
        addLog('INFO', 'Cannot read initial Box battery level (property not supported). Waiting for notification.');
      }

      setBoxConnectionState(ConnectionState.CONNECTED);
      addLog('SUCCESS', 'Wand Box connection fully established!');
      
      // New: Request info from the box, as confirmed by smali analysis of WandBoxHelper's `subscribeToBoxInfo`
      addLog('INFO', 'Requesting firmware and product info from Wand Box...');
      queueBoxCommand(WBDLPayloads.FIRMWARE_REQUEST_CMD);
      queueBoxCommand(WBDLPayloads.PRODUCT_INFO_REQUEST_CMD);

    } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('ERROR', `Box Connection failed: ${errorMessage}`);
      addBleEvent('Error', `Box connection failed: ${errorMessage}`);
      setBoxConnectionState(ConnectionState.ERROR);
      setBoxDetails(null);
    }
  }, [addLog, handleBoxDisconnect, parseBoxData, addBleEvent, queueBoxCommand, handleBoxBatteryLevel]);

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
      addLog('ERROR', `Failed to save sequence: ${String(error)}`);
    }
  };
  
  const sendVfxSequence = React.useCallback(() => {
    if (wandConnectionState !== ConnectionState.CONNECTED || !commandCharacteristic.current) {
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
          payload.push(WBDLProtocol.CMD.HAPTIC_VIBRATE, duration & 0xFF, (duration >> 8) & 0xFF);
          break;
        }
        case 'MacroDelay': {
          const duration = cmd.params.duration_ms ?? 100;
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
    if (wandConnectionState !== ConnectionState.CONNECTED) {
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
  
  const handleImuCalibrate = React.useCallback(() => {
    if (wandConnectionState !== ConnectionState.CONNECTED) {
      addLog('ERROR', 'Wand not connected.');
      return;
    }
    addLog('INFO', 'Sending IMU calibration sequence...');
    // New: Sequence from WandHelper.smali analysis. Send unlock, then calibrate.
    queueCommand(WBDLPayloads.FACTORY_UNLOCK_CMD);
    queueCommand(WBDLPayloads.IMU_CALIBRATE_CMD);
  }, [wandConnectionState, addLog, queueCommand]);
  
  const sendButtonThresholds = React.useCallback((wandType: WandType) => {
    if (wandConnectionState !== ConnectionState.CONNECTED) {
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
  
  const handleReadButtonThresholds = React.useCallback(() => {
    if (wandConnectionState !== ConnectionState.CONNECTED) {
        addLog('ERROR', 'Wand not connected.');
        return;
    }
    addLog('INFO', 'Requesting button thresholds for all 4 buttons...');
    for (let i = 0; i < 4; i++) {
        queueCommand(new Uint8Array([WBDLProtocol.CMD.READ_BUTTON_THRESHOLD, i]));
    }
  }, [wandConnectionState, addLog, queueCommand]);

  // When wand type is discovered, automatically send the appropriate thresholds
  React.useEffect(() => {
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

  const startBleExplorerScan = React.useCallback(async () => {
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
  
  const castSpellOnWand = React.useCallback((spellDetails: SpellDetails | null) => {
    if (wandConnectionState !== ConnectionState.CONNECTED) {
        addLog('ERROR', 'Wand not connected.');
        return;
    }
    if (!spellDetails || !spellDetails.config_wand?.macros_payoff || spellDetails.config_wand.macros_payoff.length === 0) {
        addLog('WARNING', `No wand macro found for spell ${spellDetails?.spell_name}.`);
        return;
    }

    const deviceType = 'WAND';

    const currentIndex = macroIndexes.current[deviceType] ?? -1;
    const nextIndex = (currentIndex + 1) % spellDetails.config_wand.macros_payoff.length;
    macroIndexes.current[deviceType] = nextIndex;

    const macroVariation = spellDetails.config_wand.macros_payoff[nextIndex];

    addLog('INFO', `Casting '${spellDetails.spell_name}' on Wand. Executing macro variation ${nextIndex + 1}/${spellDetails.config_wand.macros_payoff.length}.`);

    sendMacroSequence(macroVariation, 'wand');
  }, [addLog, wandConnectionState, sendMacroSequence]);

  // This function acts as the `reactToSpell` method for the "WandBoxHelper".
  // It uses the "spellMacroHelper" logic to select and send a predefined
  // sequence of commands to the box in reaction to a spell.
  const reactToSpellOnBoxFromUI = React.useCallback((spellDetails: SpellDetails | null) => {
    if (boxConnectionState !== ConnectionState.CONNECTED) {
        addLog('ERROR', 'Wand Box not connected.');
        return;
    }
     if (!spellDetails || !spellDetails.config_wandbox?.macros_payoff || spellDetails.config_wandbox.macros_payoff.length === 0) {
        addLog('WARNING', `No box macro found for spell ${spellDetails?.spell_name}.`);
        return;
    }

    const deviceType = 'BOX';

    const currentIndex = macroIndexes.current[deviceType] ?? -1;
    const nextIndex = (currentIndex + 1) % spellDetails.config_wandbox.macros_payoff.length;
    macroIndexes.current[deviceType] = nextIndex;

    const macroVariation = spellDetails.config_wandbox.macros_payoff[nextIndex];

    addLog('INFO', `Activating '${spellDetails.spell_name}' on Box. Executing macro variation ${nextIndex + 1}/${spellDetails.config_wandbox.macros_payoff.length}.`);

    sendMacroSequence(macroVariation, 'box');
  }, [addLog, boxConnectionState, sendMacroSequence]);


  const fetchCompendiumDetails = React.useCallback(async (spellName: string) => {
    if (!spellName) return;
    setIsFetchingCompendiumDetails(true);
    setCompendiumError(null);
    setCompendiumSpellDetails(null);
    addLog('INFO', `Compendium: Fetching details for ${spellName}...`);
    try {
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
                config_wand: { type: Type.OBJECT, properties: { macros_payoff: macroSchema } },
                config_wandbox: { type: Type.OBJECT, properties: { macros_payoff: macroSchema } },
           },
           required: ["spell_name", "incantation_name", "description", "spell_type", "difficulty", "spell_background_color", "spell_uses", "config_wand", "config_wandbox"]
       };

      const systemInstruction = `You are a magical archivist. Based on the provided spell name, return a complete JSON object representing the spell's data, conforming to the schema. You must generate plausible 'macros_payoff' sequences for both 'config_wand' and 'config_wandbox'. Remember, \`macros_payoff\` is a list of variations (a list of lists of commands). To make the spell effects more dynamic, please generate between 1 and 3 distinct variations for each spell. The wand's effect should be direct and active (e.g., quick flashes, haptics). The wand box's effect should be more ambient and secondary (e.g., a slow glow, a color shift).`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: `Provide the full spell data object for: "${spellName}".`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const jsonText = response.text;
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

  React.useEffect(() => {
    if (selectedCompendiumSpell) {
        fetchCompendiumDetails(selectedCompendiumSpell);
    }
  }, [selectedCompendiumSpell, fetchCompendiumDetails]);
  
  const handleFinishTutorial = React.useCallback(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_TUTORIAL, 'true');
      setShowTutorial(false);
      addLog('INFO', 'Tutorial completed. Welcome!');
    } catch (error) {
      addLog('ERROR', `Failed to save tutorial status: ${String(error)}`);
      setShowTutorial(false); // Hide it anyway
    }
  }, [addLog]);

  const handleResetTutorial = React.useCallback(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_TUTORIAL);
      setShowTutorial(true);
      addLog('INFO', 'Tutorial has been reset and will show again.');
    } catch (error) {
      addLog('ERROR', `Failed to reset tutorial status: ${String(error)}`);
    }
  }, [addLog]);
  
  const handleUnlockAllSpells = React.useCallback(() => {
    addLog('INFO', 'Unlocking all spells...');
    const discoveredNames = new Set(spellBook.map(s => s.name));
    const spellsToUnlock = SPELL_LIST
        .filter(name => !discoveredNames.has(name))
        .map(name => ({ name, firstSeen: new Date().toISOString() }));

    if (spellsToUnlock.length > 0) {
        setSpellBook(prevBook => [...prevBook, ...spellsToUnlock]);
        addLog('SUCCESS', `Unlocked ${spellsToUnlock.length} new spells!`);
    } else {
        addLog('INFO', 'All spells were already unlocked.');
    }
  }, [spellBook, addLog]);
  
  const handleSendBoxTestMacro = React.useCallback(() => {
    addLog('INFO', 'Sending test macro to Wand Box...');
    const testMacro: MacroCommand[] = [
        { command: 'LightTransition', color: '#0000FF', duration: 500, group: 0 },
        { command: 'MacroDelay', duration: 200 },
        { command: 'LightTransition', color: '#000000', duration: 500, group: 0 },
    ];
    sendMacroSequence(testMacro, 'box');
  }, [addLog, sendMacroSequence]);

  const handleRequestBoxAddress = React.useCallback(() => {
    if (wandConnectionState !== ConnectionState.CONNECTED) {
        addLog('ERROR', 'Wand not connected.');
        return;
    }
    addLog('INFO', 'Requesting companion box address from wand...');
    queueCommand(WBDLPayloads.BOX_ADDRESS_REQUEST_CMD);
  }, [wandConnectionState, addLog, queueCommand]);



  // --- RENDER ---
  
  const renderTab = () => {
    switch (activeTab) {
      case 'control_hub': return <ControlHub 
        lastSpell={lastSpell?.name || ''} 
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
        boxConnectionState={boxConnectionState}
        liveEvent={liveEvent}
        castingHistory={castingHistory}
        onCastOnWand={castSpellOnWand}
        onCastOnBox={reactToSpellOnBoxFromUI}
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
          onSendBoxTestMacro={handleSendBoxTestMacro}
          onRequestBoxAddress={handleRequestBoxAddress}
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
          castingHistory={castingHistory}
          onSelectSpell={(spell) => {
              setSelectedCompendiumSpell(spell);
              setIsCompendiumModalOpen(true);
          }}
          onUnlockAll={handleUnlockAllSpells}
      />;
      case 'explorer': return <BleExplorer 
          onScan={startBleExplorerScan}
          isExploring={isExploring}
          device={explorerDevice}
          services={explorerServices}
      />;
      case 'scripter': return <Scripter addLog={addLog} />;
      case 'wizarding_class': return <WizardingClass 
        isImuStreaming={isImuStreaming}
        toggleImuStream={toggleImuStream}
        latestImuData={latestImuData}
        isWandConnected={wandConnectionState === ConnectionState.CONNECTED}
        isBoxConnected={boxConnectionState === ConnectionState.CONNECTED}
        queueCommand={queueCommand}
        queueBoxCommand={queueBoxCommand}
      />;
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
              onCastOnWand={castSpellOnWand}
              onCastOnBox={reactToSpellOnBoxFromUI}
              isWandConnected={wandConnectionState === ConnectionState.CONNECTED}
              isBoxConnected={boxConnectionState === ConnectionState.CONNECTED}
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
                    <TabButton key="control_hub" Icon={MagicWandIcon} label="Control Hub" onClick={() => setActiveTab('control_hub')} isActive={activeTab === 'control_hub'} />
                    <TabButton key="device_manager" Icon={CubeIcon} label="Device Manager" onClick={() => setActiveTab('device_manager')} isActive={activeTab === 'device_manager'} />
                    <TabButton key="diagnostics" Icon={ChartBarIcon} label="Diagnostics" onClick={() => setActiveTab('diagnostics')} isActive={activeTab === 'diagnostics'} />
                    <TabButton key="compendium" Icon={DocumentSearchIcon} label="Spell Compendium" onClick={() => setActiveTab('compendium')} isActive={activeTab === 'compendium'} />
                    <TabButton key="explorer" Icon={SearchCircleIcon} label="BLE Explorer" onClick={() => setActiveTab('explorer')} isActive={activeTab === 'explorer'} />
                    <TabButton key="scripter" Icon={CodeIcon} label="Python Scripter" onClick={() => setActiveTab('scripter')} isActive={activeTab === 'scripter'} />
                    <TabButton key="wizarding_class" Icon={BookOpenIcon} label="Wizarding Class" onClick={() => setActiveTab('wizarding_class')} isActive={activeTab === 'wizarding_class'} />
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
                    castingHistory={castingHistory}
                 />
            </div>
        </div>
        
        <div className="flex-grow bg-slate-800 p-4 rounded-lg border border-slate-700 min-w-0 min-h-0">
          {renderTab()}
        </div>
        
        <div className="flex-shrink-0 md:w-1/3 flex flex-col gap-4">
          <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex-grow">
            <h2 className="text-lg font-semibold mb-2">Logs</h2>
            <LogView logs={logs} />
          </div>
        </div>
      </main>
    </div>
  );
}