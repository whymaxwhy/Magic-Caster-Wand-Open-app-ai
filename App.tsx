
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { WAND_GATT } from './constants';
import type { LogEntry, LogType, VfxCommand, OpCodes, VfxCommandType } from './types';

// FIX: Add minimal type definitions for Web Bluetooth API to resolve TypeScript errors.
// This is a workaround for the environment not having these types available.
// In a real project, this would be handled by including `@types/web-bluetooth`
// or adding "web-bluetooth" to the "lib" array in tsconfig.json.
declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
    };
  }
}

interface BluetoothDevice extends EventTarget {
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface RequestDeviceOptions {
  filters: any[];
  optionalServices?: string[];
}

// --- HELPER FUNCTIONS ---
const getTimestamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
const textDecoder = new TextDecoder('ascii');

// --- ICONS ---
const MagicWandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);
const StatusOnlineIcon = () => <svg className="h-4 w-4 text-green-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const StatusOfflineIcon = () => <svg className="h-4 w-4 text-red-400" fill="currentColor" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" /></svg>;
const BatteryIcon = ({ level }: { level: number | null }) => {
  if (level === null) return null;
  const levelClass = level > 20 ? (level > 50 ? 'text-green-400' : 'text-yellow-400') : 'text-red-400';
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${levelClass}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm12 1H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1z" clipRule="evenodd" />
      {level > 10 && <rect x="5" y="7" width={(level/100)*10} height="6" rx="0.5" />}
    </svg>
  );
};
const PlusCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>;
const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>;
const FolderOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" /></svg>;
const HelpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
const AiIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;


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

const LOCAL_STORAGE_KEY_VFX = 'magicWandVfxSequence';
const LOCAL_STORAGE_KEY_OPCODES = 'magicWandOpCodes';

interface RawPacket {
  id: number;
  timestamp: string;
  hexData: string;
}

// Simple markdown parser for AI response
const AITextParser: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements = lines.map((line, index) => {
    if (line.startsWith('* ')) {
      return <li key={index} className="ml-4 list-disc">{line.substring(2)}</li>;
    }
    if (line.startsWith('### ')) {
       return <h3 key={index} className="text-lg font-semibold mt-4 mb-2 text-indigo-300">{line.substring(4)}</h3>;
    }
    line = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-100">$1</strong>');
    return <p key={index} dangerouslySetInnerHTML={{ __html: line }} />;
  });
  return <div className="space-y-2">{elements}</div>;
};


// --- MAIN APP ---
export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [device, setDevice] = useState<BluetoothDevice | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isGripped, setIsGripped] = useState(false);
  const [lastSpell, setLastSpell] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'standard' | 'opcode'>('standard');
  
  const [opCodes, setOpCodes] = useState<OpCodes>({ ClearLeds: 0xAA, Buzz: 0xBB, ChangeLed: 0xCC });
  const [currentOpCodeTest, setCurrentOpCodeTest] = useState(1);
  const [testPayload, setTestPayload] = useState('00');
  const [vfxSequence, setVfxSequence] = useState<VfxCommand[]>([]);
  const [isSequenceSaved, setIsSequenceSaved] = useState(false);
  const [detectedOpCodes, setDetectedOpCodes] = useState<Set<number>>(new Set());
  const [rawPacketLog, setRawPacketLog] = useState<RawPacket[]>([]);
  
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiHelpResponse, setAiHelpResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const logCounter = useRef(0);
  const commandIdCounter = useRef(0);
  const rawPacketLogCounter = useRef(0);
  const keepAliveInterval = useRef<number | null>(null);
  const writeCharacteristic = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const isInitialMountOpCodes = useRef(true);
  const ai = useMemo(() => process.env.API_KEY ? new GoogleGenAI({ apiKey: process.env.API_KEY }) : null, []);


  const addLog = useCallback((type: LogType, message: string) => {
    setLogs(prev => [...prev, { id: logCounter.current++, timestamp: getTimestamp(), type, message }]);
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

    // Load OpCodes
    try {
      const savedOpCodesJSON = localStorage.getItem(LOCAL_STORAGE_KEY_OPCODES);
      if (savedOpCodesJSON) {
        const savedOpCodes: Partial<OpCodes> = JSON.parse(savedOpCodesJSON);
        if (savedOpCodes.Buzz != null && savedOpCodes.ChangeLed != null && savedOpCodes.ClearLeds != null) {
          setOpCodes(savedOpCodes as OpCodes);
          addLog('INFO', 'Loaded saved OpCodes from storage.');
        } else {
            addLog('WARNING', 'Found corrupt OpCodes in storage, using defaults.');
        }
      }
    } catch (error) {
      addLog('ERROR', `Failed to load OpCodes from storage: ${error}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_OPCODES);
    }
  }, [addLog]);

  // Effect to auto-save OpCodes when they change
  useEffect(() => {
    if (isInitialMountOpCodes.current) {
      isInitialMountOpCodes.current = false;
      return;
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_OPCODES, JSON.stringify(opCodes));
      addLog('INFO', 'OpCodes have been auto-saved.');
    } catch (error) {
      addLog('ERROR', `Failed to auto-save OpCodes: ${error}`);
    }
  }, [opCodes, addLog]);


  const clearKeepAlive = useCallback(() => {
    if (keepAliveInterval.current) {
      clearInterval(keepAliveInterval.current);
      keepAliveInterval.current = null;
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    if (!device) return;
    addLog('INFO', `Wand disconnected: ${device.name}`);
    setIsConnected(false);
    setDevice(null);
    setBatteryLevel(null);
    setIsGripped(false);
    clearKeepAlive();
    writeCharacteristic.current = null;
  }, [addLog, clearKeepAlive, device]);

  const sendRawCommand = useCallback(async (data: Uint8Array, log: boolean = true) => {
    if (!writeCharacteristic.current) {
      addLog('ERROR', 'Cannot send command: Write characteristic not available.');
      return;
    }
    try {
      await writeCharacteristic.current.writeValueWithoutResponse(data);
      if(log) addLog('DATA_OUT', `Sent: ${bytesToHex(data)}`);
    } catch (error) {
      addLog('ERROR', `Failed to send command: ${error}`);
    }
  }, [addLog]);

  const parseWandData = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    const data = new Uint8Array(value.buffer);
    const hexData = bytesToHex(data);
    addLog('DATA_IN', `Received: ${hexData}`);

    if (data.length > 0) {
      if (data[0] === 0x10) { // Grip/Release
        const wasGripped = isGripped;
        if (data.length === 2 && data[1] === 0x00) { // Release
          if(wasGripped) {
            addLog('INFO', 'Wand Released. Stopping stream.');
            sendRawCommand(WAND_GATT.CMD_STOP_STREAM);
            setIsGripped(false);
          }
        } else { // Grip
          if(!wasGripped) {
            addLog('INFO', 'Wand Gripped. Starting stream.');
            sendRawCommand(WAND_GATT.CMD_START_STREAM);
            setIsGripped(true);
          }
        }
      } else if (data[0] === 0x24) { // Spell packet candidate
        const header = data.slice(0, 4);
        const headerHex = bytesToHex(header);

        // Basic validation: packet must be long enough for a header.
        if (data.length < 4) {
          addLog('WARNING', `Runt spell packet received: ${hexData}`);
          return;
        }

        const spellLength = data[3];
        const remainingDataLength = data.length - 4;

        // Sanity check 1: The declared length must not exceed the remaining packet data.
        if (spellLength > remainingDataLength) {
          addLog('WARNING', `Corrupt spell packet: Declared length (${spellLength}) is greater than available data (${remainingDataLength}). Header: ${headerHex}, Full packet: ${hexData}`);
          return;
        }

        // It's possible for a spell packet to be sent with no spell name yet.
        if (spellLength === 0) {
          addLog('INFO', `Ignoring spell packet with zero length (likely pre-spell data). Header: ${headerHex}`);
          return;
        }

        try {
          const spellNameBytes = data.slice(4, 4 + spellLength);
          const rawSpellName = textDecoder.decode(spellNameBytes);
          
          if (!/^[ -~]+$/.test(rawSpellName)) {
              addLog('WARNING', `Spell name contains non-printable characters. Raw: "${rawSpellName}", Header: ${headerHex}`);
              return;
          }

          const cleanedSpellName = rawSpellName.trim();

          if (cleanedSpellName.length === 0 || !/[a-zA-Z]/.test(cleanedSpellName)) {
              addLog('INFO', `Ignoring empty or symbolic-only spell name. Cleaned: "${cleanedSpellName}", Header: ${headerHex}`);
              return;
          }
          
          addLog('SUCCESS', `SPELL DETECTED: *** ${cleanedSpellName.toUpperCase()} *** (Header: ${headerHex})`);
          setLastSpell(cleanedSpellName.toUpperCase());

        } catch (e) {
          addLog('ERROR', `Error decoding spell packet. Header: ${headerHex}, Packet: ${hexData}, Error: ${e}`);
        }
      } else {
         addLog('INFO', `Unknown Packet: ${hexData}`);
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
  }, [addLog, sendRawCommand, isGripped]);

  const handleBatteryLevel = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    const level = value.getUint8(0);
    setBatteryLevel(level);
    addLog('INFO', `Battery Level: ${level}%`);
  }, [addLog]);

  const analyzeWithAI = useCallback(async (initialError?: any) => {
    if (!ai) {
      setAiHelpResponse("AI Assistant is not available. API_KEY is missing.");
      setIsAiAssistantOpen(true);
      return;
    }

    setIsAiLoading(true);
    if (!isAiAssistantOpen) setIsAiAssistantOpen(true);
    setAiHelpResponse('');

    const recentLogs = logs.slice(-20).map(l => `${l.timestamp} [${l.type}] ${l.message}`).join('\n');
    const browserSupport = navigator.bluetooth ? "Available" : "Not Available";
    
    let context = `
### Current Application State:
* **Connection Status:** ${isLoading ? 'Connecting' : (isConnected ? 'Connected' : 'Disconnected')}
* **Device Name:** ${device?.name ?? 'N/A'}
* **Browser BLE Support:** ${browserSupport}
* **Configured OpCodes:** 
  * ClearLeds: 0x${opCodes.ClearLeds.toString(16).toUpperCase()}
  * Buzz: 0x${opCodes.Buzz.toString(16).toUpperCase()}
  * ChangeLed: 0x${opCodes.ChangeLed.toString(16).toUpperCase()}
* **Detected Unknown OpCodes:** ${Array.from(detectedOpCodes).map(c => `0x${c.toString(16).toUpperCase()}`).join(', ') || 'None'}

### Recent Activity Log (last 20 entries):
\`\`\`
${recentLogs}
\`\`\`
`;
    if (initialError) {
        context += `\n### Initial Connection Error:\n\`\`\`\n${initialError}\n\`\`\``
    }

    const prompt = `You are an expert AI assistant embedded in a Web Bluetooth application for a 'Magic Wand' device. Your role is to help users diagnose and solve connectivity issues and debug wand behavior based on the application's current state and logs. Be concise, helpful, and provide actionable advice. Format your response in simple markdown with bolding for emphasis and bullet points for steps.

Based on the state and logs below, analyze the situation and provide the most likely problem and a solution. If multiple issues seem possible, list them. If everything looks okay, say so and offer a general tip.

${context}
`;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt
      });
      // FIX: The error "Expected 0 arguments, but got 1" suggests `response.text` is a function
      // that is being passed to the state setter, which React then calls with an argument.
      // Calling the function directly provides the expected string value.
      setAiHelpResponse(response.text());
    } catch (error) {
        console.error("AI analysis failed:", error);
        setAiHelpResponse(`Sorry, I encountered an error while analyzing the situation. Please check the browser console for details. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setIsAiLoading(false);
    }
  }, [ai, logs, isConnected, isLoading, device, opCodes, detectedOpCodes, isAiAssistantOpen]);

  const connectToWand = useCallback(async () => {
    if (!navigator.bluetooth) {
      addLog('ERROR', 'Web Bluetooth API is not available on this browser.');
      analyzeWithAI('Web Bluetooth API is not available on this browser.');
      return;
    }
    setIsLoading(true);
    addLog('INFO', 'Requesting Bluetooth device...');
    try {
      const bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [WAND_GATT.SERVICE_UUID] }],
        optionalServices: [WAND_GATT.BATTERY_SERVICE_UUID]
      });

      addLog('INFO', `Found device: ${bleDevice.name}. Connecting...`);
      setDevice(bleDevice);

      bleDevice.addEventListener('gattserverdisconnected', handleDisconnect);

      const server = await bleDevice.gatt?.connect();
      if (!server) throw new Error("GATT Server not found");

      addLog('INFO', 'Connected to GATT Server. Getting services...');
      const service = await server.getPrimaryService(WAND_GATT.SERVICE_UUID);
      const batteryService = await server.getPrimaryService(WAND_GATT.BATTERY_SERVICE_UUID).catch(() => null);

      addLog('INFO', 'Getting characteristics...');
      writeCharacteristic.current = await service.getCharacteristic(WAND_GATT.WRITE_UUID);
      const notifyCharacteristic = await service.getCharacteristic(WAND_GATT.NOTIFY_UUID);
      
      addLog('INFO', 'Starting notifications...');
      await notifyCharacteristic.startNotifications();
      notifyCharacteristic.addEventListener('characteristicvaluechanged', parseWandData);

      if (batteryService) {
        try {
          const batteryLevelChar = await batteryService.getCharacteristic(WAND_GATT.BATTERY_LEVEL_UUID);
          await batteryLevelChar.startNotifications();
          batteryLevelChar.addEventListener('characteristicvaluechanged', handleBatteryLevel);
          const initialBatteryValue = await batteryLevelChar.readValue();
          setBatteryLevel(initialBatteryValue.getUint8(0));
          addLog('INFO', `Initial Battery: ${initialBatteryValue.getUint8(0)}%`);
        } catch(e) {
          addLog('WARNING', `Could not subscribe to battery notifications: ${e}`);
        }
      }

      addLog('SUCCESS', 'Wand connected and ready!');
      setIsConnected(true);

      keepAliveInterval.current = window.setInterval(() => {
        sendRawCommand(WAND_GATT.KEEPALIVE_COMMAND, false);
      }, WAND_GATT.KEEPALIVE_INTERVAL);

    } catch (error) {
      addLog('ERROR', `Connection failed: ${error}`);
      analyzeWithAI(error); // Proactively call AI on failure
      setDevice(null);
    } finally {
      setIsLoading(false);
    }
  }, [addLog, handleDisconnect, parseWandData, handleBatteryLevel, sendRawCommand, analyzeWithAI]);

  const disconnectFromWand = useCallback(async () => {
    if (device && device.gatt?.connected) {
      addLog('INFO', 'Disconnecting from wand...');
      device.gatt.disconnect();
    }
    handleDisconnect(); // Force UI update immediately
  }, [device, handleDisconnect]);
  
  const sendVfxMacro = useCallback(async (commands: VfxCommand[]) => {
    if(commands.length === 0) {
      addLog('WARNING', 'Cannot send macro: No commands in sequence.');
      return;
    }
    addLog('INFO', 'Building VFX macro...');
    const commandBytes: number[] = [];
    
    for (const cmd of commands) {
      try {
        switch (cmd.type) {
          case 'ClearLeds':
            commandBytes.push(opCodes.ClearLeds);
            break;
          case 'Buzz': {
            const duration = Math.min(cmd.params.duration_ms ?? 500, 32767);
            const durationBytes = [duration & 0xff, (duration >> 8) & 0xff]; // little-endian
            commandBytes.push(opCodes.Buzz, ...durationBytes);
            break;
          }
          case 'ChangeLed': {
            const groupId = cmd.params.group_id ?? 0;
            const hex = (cmd.params.hex_color ?? 'FFFFFF').replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            const duration = Math.min(cmd.params.duration_ms ?? 1000, 32767);
            const durationBytes = [duration & 0xff, (duration >> 8) & 0xff]; // little-endian
            commandBytes.push(opCodes.ChangeLed, groupId, r, g, b, ...durationBytes);
            break;
          }
        }
      } catch (e) {
        addLog('ERROR', `Error building command ${cmd.type}: ${e}`);
        return;
      }
    }

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < commandBytes.length; i += WAND_GATT.MTU_PAYLOAD_SIZE) {
      chunks.push(new Uint8Array(commandBytes.slice(i, i + WAND_GATT.MTU_PAYLOAD_SIZE)));
    }

    addLog('INFO', `Sending macro in ${chunks.length} packet(s)...`);
    for (const chunk of chunks) {
      await sendRawCommand(chunk);
      await new Promise(resolve => setTimeout(resolve, 20)); // Small delay between packets
    }
    addLog('SUCCESS', 'VFX macro sent.');

  }, [addLog, opCodes, sendRawCommand]);
  
  const testMacro: VfxCommand[] = useMemo(() => [
    { id: 1, type: 'ChangeLed', params: { group_id: 0, hex_color: '#FF8000', duration_ms: 1000 } },
    { id: 2, type: 'Buzz', params: { duration_ms: 500 } },
    { id: 3, type: 'ClearLeds', params: {} }
  ], []);

  const addVfxCommand = (type: VfxCommandType) => {
    const newCommand: VfxCommand = {
      id: commandIdCounter.current++,
      type,
      params: type === 'ChangeLed' ? { group_id: 0, hex_color: '#FFFFFF', duration_ms: 1000 } : 
              type === 'Buzz' ? { duration_ms: 500 } : 
              {}
    };
    setVfxSequence(prev => [...prev, newCommand]);
  };

  const updateVfxCommand = (id: number, newParams: Partial<VfxCommand['params']>) => {
    setVfxSequence(prev => prev.map(cmd => 
      cmd.id === id ? { ...cmd, params: { ...cmd.params, ...newParams } } : cmd
    ));
  };

  const removeVfxCommand = (id: number) => {
    setVfxSequence(prev => prev.filter(cmd => cmd.id !== id));
  };

  const saveVfxSequence = useCallback(() => {
    try {
      if (vfxSequence.length === 0) {
        localStorage.removeItem(LOCAL_STORAGE_KEY_VFX);
        setIsSequenceSaved(false);
        addLog('INFO', 'Cleared saved sequence from storage.');
      } else {
        localStorage.setItem(LOCAL_STORAGE_KEY_VFX, JSON.stringify(vfxSequence));
        setIsSequenceSaved(true);
        addLog('SUCCESS', 'VFX sequence saved successfully.');
      }
    } catch (error) {
      addLog('ERROR', `Failed to save sequence: ${error}`);
    }
  }, [vfxSequence, addLog]);

  const loadVfxSequence = useCallback(() => {
    try {
      const savedSequenceJSON = localStorage.getItem(LOCAL_STORAGE_KEY_VFX);
      if (savedSequenceJSON) {
        const savedSequence: VfxCommand[] = JSON.parse(savedSequenceJSON);
        if (Array.isArray(savedSequence)) {
           // Restore command IDs to avoid key collisions
           const restoredSequence = savedSequence.map(cmd => ({
            ...cmd,
            id: commandIdCounter.current++
          }));
          setVfxSequence(restoredSequence);
          addLog('SUCCESS', 'Loaded VFX sequence from storage.');
        }
      } else {
        addLog('INFO', 'No saved sequence found in storage.');
      }
    } catch (error) {
      addLog('ERROR', `Failed to load sequence from storage: ${error}`);
      localStorage.removeItem(LOCAL_STORAGE_KEY_VFX);
    }
  }, [addLog]);


  const handleOpCodeTest = async () => {
    try {
      const payloadBytes = testPayload.split(' ').filter(s => s.length > 0).map(hex => parseInt(hex, 16));
      const finalPayload = new Uint8Array([currentOpCodeTest, ...payloadBytes]);
      addLog('INFO', `Testing OpCode 0x${currentOpCodeTest.toString(16).padStart(2, '0')} with payload: ${bytesToHex(new Uint8Array(payloadBytes))}`);
      await sendRawCommand(finalPayload);
    } catch (e) {
      addLog('ERROR', `Invalid payload format: ${e}`);
    }
  };

  const StatusDisplay = () => (
    <div className="flex items-center space-x-4 p-4 bg-slate-800 rounded-lg border border-slate-700">
      <div className="flex items-center">
        {isConnected ? <StatusOnlineIcon /> : <StatusOfflineIcon />}
        <span className="ml-2">{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      {isConnected && device && <div className="text-slate-400">{device.name}</div>}
      {isConnected && (
        <div className="flex items-center" title={`Battery: ${batteryLevel}%`}>
          <BatteryIcon level={batteryLevel} />
          <span className="ml-1">{batteryLevel ?? 'N/A'}%</span>
        </div>
      )}
      {isConnected && (
        <div className={`px-2 py-1 rounded ${isGripped ? 'bg-green-500/20 text-green-300' : 'bg-slate-700 text-slate-400'}`}>
          {isGripped ? 'Gripped' : 'Released'}
        </div>
      )}
    </div>
  );
  
  const VfxCommandEditor: React.FC<{ command: VfxCommand }> = ({ command }) => (
    <div className="p-3 bg-slate-900/70 rounded-lg flex items-center gap-4 border border-slate-700">
      <div className="flex-grow">
        <div className="font-bold text-slate-300">{command.type}</div>
        {command.type === 'ChangeLed' && (
          <div className="flex items-center gap-3 mt-2 text-sm">
            <label>Color:</label>
            <input 
              type="color" 
              value={command.params.hex_color}
              onChange={(e) => updateVfxCommand(command.id, { hex_color: e.target.value })}
              className="w-8 h-8 p-0 border-none bg-transparent" 
            />
            <label>Duration (ms):</label>
            <input 
              type="number" 
              value={command.params.duration_ms}
              onChange={(e) => updateVfxCommand(command.id, { duration_ms: parseInt(e.target.value) || 0 })}
              className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1"
            />
          </div>
        )}
        {command.type === 'Buzz' && (
          <div className="flex items-center gap-3 mt-2 text-sm">
            <label>Duration (ms):</label>
            <input 
              type="number" 
              value={command.params.duration_ms}
              onChange={(e) => updateVfxCommand(command.id, { duration_ms: parseInt(e.target.value) || 0 })}
              className="w-20 bg-slate-800 border border-slate-600 rounded px-2 py-1"
            />
          </div>
        )}
      </div>
      <button onClick={() => removeVfxCommand(command.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors">
        <TrashIcon />
      </button>
    </div>
  );

  const AiAssistantPanel = () => (
    <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4" onClick={() => setIsAiAssistantOpen(false)}>
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-slate-600 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2"><AiIcon /> AI Assistant</h2>
          <button onClick={() => setIsAiAssistantOpen(false)} className="text-slate-400 hover:text-white">&times;</button>
        </header>
        <div className="p-6 overflow-y-auto flex-grow">
          {isAiLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400"></div>
              <p className="mt-4">Analyzing state and logs...</p>
            </div>
          ) : (
            aiHelpResponse ? <AITextParser text={aiHelpResponse} /> : <p className="text-slate-400">Click the button below to analyze the application state for potential issues.</p>
          )}
        </div>
        <footer className="p-4 border-t border-slate-600">
          <button onClick={() => analyzeWithAI()} disabled={isAiLoading} className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md disabled:bg-slate-500 disabled:cursor-wait transition-colors">
            {isAiLoading ? 'Analyzing...' : 'Analyze Current State'}
          </button>
        </footer>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 space-y-4">
      <header className="flex flex-col md:flex-row justify-between items-center pb-4 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center">
          <MagicWandIcon /> Magic Wand BLE Controller
        </h1>
        {!isConnected ? (
          <button
            onClick={() => connectToWand()}
            disabled={isLoading}
            className="mt-4 md:mt-0 w-full md:w-auto px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md disabled:bg-slate-500 disabled:cursor-wait transition-colors"
          >
            {isLoading ? 'Connecting...' : 'Connect to Wand'}
          </button>
        ) : (
          <button
            onClick={() => disconnectFromWand()}
            className="mt-4 md:mt-0 w-full md:w-auto px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg shadow-md transition-colors"
          >
            Disconnect
          </button>
        )}
      </header>

      <main className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ gridTemplateRows: 'auto 1fr' }}>
        <div className="lg:col-span-2">
           <StatusDisplay />
        </div>

        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 flex flex-col">
            <div className="flex border-b border-slate-600 mb-4">
                <button onClick={() => setActiveTab('standard')} className={`px-4 py-2 text-lg font-semibold ${activeTab === 'standard' ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-400'}`}>Controller</button>
                <button onClick={() => setActiveTab('opcode')} className={`px-4 py-2 text-lg font-semibold ${activeTab === 'opcode' ? 'border-b-2 border-indigo-500 text-white' : 'text-slate-400'}`}>OpCode Discovery</button>
            </div>
            
            {activeTab === 'standard' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Spell Status</h3>
                  <div className="h-16 w-full bg-slate-900 rounded flex items-center justify-center text-2xl font-bold tracking-widest text-yellow-300">
                    {lastSpell || '...'}
                  </div>
                </div>
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold">Custom VFX Sequence</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {vfxSequence.length > 0 ? (
                      vfxSequence.map(cmd => <VfxCommandEditor key={cmd.id} command={cmd} />)
                    ) : (
                      <div className="text-center text-slate-500 py-4">Add a command to start building your sequence.</div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <button onClick={() => addVfxCommand('ChangeLed')} className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors flex items-center justify-center">Change LED</button>
                    <button onClick={() => addVfxCommand('Buzz')} className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors flex items-center justify-center">Buzz</button>
                    <button onClick={() => addVfxCommand('ClearLeds')} className="p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors flex items-center justify-center">Clear LEDs</button>
                  </div>
                   <div className="flex flex-wrap gap-2">
                      <button onClick={() => sendVfxMacro(vfxSequence)} disabled={!isConnected || vfxSequence.length === 0} className="flex-grow p-2 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-50 transition-colors">Send Sequence</button>
                      <button onClick={() => saveVfxSequence()} disabled={!isConnected} className="flex-grow p-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors flex items-center justify-center"><SaveIcon /> Save</button>
                      <button onClick={() => loadVfxSequence()} disabled={!isConnected || !isSequenceSaved} className="flex-grow p-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors flex items-center justify-center"><FolderOpenIcon /> Load</button>
                      <button onClick={() => setVfxSequence([])} disabled={vfxSequence.length === 0} className="p-2 text-slate-300 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors"><TrashIcon /></button>
                   </div>
                </div>
                 <div className="border-t border-slate-700 pt-4 space-y-2">
                    <h3 className="text-xl font-semibold mb-2">Quick Actions</h3>
                    <button onClick={() => sendVfxMacro(testMacro)} disabled={!isConnected} className="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors">
                      Run Test Macro <span className="text-xs text-slate-400">(Orange Light & Buzz)</span>
                    </button>
                     <p className="text-xs text-slate-500 text-center">Note: Macros require correct OpCodes to be set in the Discovery tab.</p>
                  </div>
              </div>
            )}

            {activeTab === 'opcode' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2">OpCode Settings</h3>
                  <p className="text-sm text-slate-400 mb-4">Update the placeholder OpCodes below once you discover them. Changes are saved automatically.</p>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.keys(opCodes).map((key) => (
                      <div key={key}>
                        <label className="text-xs font-bold text-slate-400">{key}</label>
                        <input type="text" value={`0x${opCodes[key as keyof OpCodes].toString(16).toUpperCase()}`}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 16);
                            if (!isNaN(val)) setOpCodes(prev => ({ ...prev, [key]: val }));
                          }}
                          className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                 <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-semibold">OpCode Tester</h3>
                    <div className="relative group cursor-pointer">
                        <HelpIcon />
                        <div className="absolute bottom-full z-10 mb-2 w-80 p-3 bg-slate-950 border border-slate-600 rounded-lg text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <p className="font-bold mb-2 text-slate-100">How to Test Commands:</p>
                            <ul className="list-disc list-inside space-y-2">
                                <li><strong>1-Byte (e.g., ClearLeds):</strong> Leave the `payload` field empty. The command is just the OpCode itself.</li>
                                <li><strong>3-Byte (e.g., Buzz):</strong> The payload is a 2-byte duration in milliseconds (little-endian).<br/>Example: <code className="bg-slate-700 px-1 rounded text-cyan-300">f4 01</code> for 500ms.</li>
                                <li><strong>7-Byte (e.g., ChangeLed):</strong> The payload is 6 bytes: `[Group] [R] [G] [B] [Duration]`.<br/>Example: <code className="bg-slate-700 px-1 rounded text-cyan-300">00 00 ff 00 e8 03</code> for a 1000ms green light.</li>
                            </ul>
                        </div>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-none w-28">
                      <label className="text-xs font-bold text-slate-400">OpCode to test</label>
                       <input type="text" value={`0x${currentOpCodeTest.toString(16).toUpperCase()}`}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 16);
                            if (!isNaN(val)) setCurrentOpCodeTest(val);
                          }}
                          className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 font-mono"
                        />
                    </div>
                    <div className="flex-grow">
                      <label className="text-xs font-bold text-slate-400">Payload (hex, space separated)</label>
                      <input type="text" value={testPayload} onChange={e => setTestPayload(e.target.value)} placeholder="e.g. f4 01" className="w-full mt-1 bg-slate-900 border border-slate-600 rounded px-2 py-1 font-mono"/>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleOpCodeTest()} disabled={!isConnected} className="w-full p-2 bg-indigo-600 hover:bg-indigo-500 rounded disabled:opacity-50 transition-colors">Send Test Command</button>
                    {/* FIX: The arithmetic type errors on this line are likely due to the type checker being
                        confused by the redundant Number() call. Removing it simplifies the expression. */}
                    <button onClick={() => setCurrentOpCodeTest(c => (c + 1) % 256)} disabled={!isConnected} className="w-full p-2 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors">Next OpCode</button>
                  </div>
                 </div>
                 <div>
                    <h3 className="text-xl font-semibold mb-2">Detected OpCodes Log</h3>
                    <p className="text-sm text-slate-400 mb-2">The first byte of any unknown data packets received from the wand will appear here. Click to test.</p>
                    <div className="bg-slate-900 rounded-lg p-3 border border-slate-700 min-h-[6rem] max-h-48 overflow-y-auto">
                        {detectedOpCodes.size === 0 ? (
                        <p className="text-slate-500 text-center py-4">No unknown OpCodes detected yet. Interact with the wand to populate this log.</p>
                        ) : (
                        <div className="flex flex-wrap gap-2 font-mono">
                            {Array.from(detectedOpCodes).sort((a, b) => a - b).map(code => (
                            <span key={code} className="bg-slate-700 px-2 py-1 rounded text-cyan-300 cursor-pointer hover:bg-slate-600 transition-colors" title={`Click to test OpCode 0x${code.toString(16).toUpperCase()}`} onClick={() => setCurrentOpCodeTest(code)}>
                                0x{code.toString(16).toUpperCase().padStart(2, '0')}
                            </span>
                            ))}
                        </div>
                        )}
                    </div>
                 </div>
                 <div className="mt-6">
                    <h3 className="text-xl font-semibold mb-2">Raw Unknown Packet Log</h3>
                    <p className="text-sm text-slate-400 mb-2">A chronological log of all unrecognized packets received from the wand. Helps provide context for the detected OpCodes above.</p>
                    <div className="bg-slate-950 rounded-lg p-3 border border-slate-700 h-48 overflow-y-auto font-mono text-sm">
                        {rawPacketLog.length === 0 ? (
                        <p className="text-slate-500 text-center py-4">Waiting for unknown packets...</p>
                        ) : (
                          rawPacketLog.map(entry => ( 
                              <div key={entry.id}>
                                  <span className="text-slate-500">{entry.timestamp} </span>
                                  <span className="text-purple-400">{entry.hexData}</span>
                              </div>
                          ))
                        )}
                    </div>
                    {rawPacketLog.length > 0 && (
                      <button 
                          onClick={() => setRawPacketLog([])}
                          className="w-full mt-2 p-2 bg-slate-700 hover:bg-slate-600 rounded transition-colors text-sm">
                          Clear Raw Packet Log
                      </button>
                    )}
                 </div>
              </div>
            )}
        </div>

        <div className="row-start-3 lg:row-start-2 lg:col-start-2">
          <LogView logs={logs} />
        </div>
      </main>

      {!isAiAssistantOpen && (
        <button 
          onClick={() => setIsAiAssistantOpen(true)}
          className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-500 transition-colors z-50"
          aria-label="Open AI Assistant"
        >
          <AiIcon />
        </button>
      )}

      {isAiAssistantOpen && <AiAssistantPanel />}

    </div>
  );
}
