import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { WBDLProtocol, WBDLPayloads } from './constants';
import type { LogType } from './types';

interface ScripterProps {
  addLog: (type: LogType, message: string) => void;
}

const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Added spaces around negative numbers in SVG path to prevent JSX parsing issues. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4 -16m4 4l4 4 -4 4M6 16l-4 -4 4 -4" />
    </svg>
);

const ClipboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);


const Scripter: React.FC<ScripterProps> = ({ addLog }) => {
  const [prompt, setPrompt] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleGenerateScript = useCallback(async () => {
    if (!prompt.trim()) {
      addLog('WARNING', 'Please enter a description for the script.');
      return;
    }
    
    setIsLoading(true);
    setGeneratedScript('');
    addLog('INFO', `Sending prompt to Gemini: "${prompt}"`);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const systemInstruction = `You are an expert Python developer specializing in Bluetooth Low Energy (BLE) communication using the 'bleak' library. Your task is to write a Python script to control a specific BLE device, a "Magic Wand".

# Core BLE Protocol Information
- Device Name Prefix: "${WBDLProtocol.TARGET_NAME}"
- Primary Service UUID: "${WBDLProtocol.SERVICE_UUID_WAND_CONTROL}"
- Command Characteristic UUID (for writing commands): "${WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_1}"

# Known Commands & Opcodes
- Simple Commands (sent directly):
${JSON.stringify(WBDLPayloads, (key, value) => key === 'KEEPALIVE_COMMAND' ? undefined : value, 2)}
- Macro Instruction Opcodes (used within a 0x68 MACRO_EXECUTE command):
${JSON.stringify({ INST: WBDLProtocol.INST }, null, 2)}
- Direct Command Opcodes:
${JSON.stringify({ CMD: WBDLProtocol.CMD }, null, 2)}

# The Spell Data Model (from firmware analysis)
The native app uses a complex 'Spell' data model, delivered inside a 'SpellBook' JSON object. The 'SpellBook' simply contains a list of 'Spell' objects under a key named 'spells'. The property names in the JSON are snake_case.

A single 'Spell' object contains:
- General info: 'spell_name', 'description', 'difficulty' (1-5), 'spell_type', 'incantation_name', 'pronunciation'.
- Asset links: 'image_gesture', 'image_pretty', 'video_payoff', 'model3d'.
- 'spell_uses': (List) A list of 'SpellUse' objects, where each object has 'id', 'name', and 'icon' string properties.
- Crucially, it contains configuration objects for different devices using snake_case keys:
  - 'config_wand': This object contains a 'macros_payoff', which is a list of lists of command objects. This is the exact sequence to run on the wand for the spell's effect.
  - 'config_wandbox', 'config_smartlamp', 'config_enchanted_object': Defines spell effects for other compatible devices.

A command object within the 'macros_payoff' can have these properties:
- 'command': (String) The name of the command, like 'LightTransition'.
- 'color': (String) Hex color code.
- 'group': (Integer) An integer ID, possibly for an LED group or effect target.
- 'loops': (Integer) The number of times to repeat the command.
- 'duration': (Double) The duration for the command in milliseconds.

When a user asks to replicate a spell, you should infer what the 'macros_payoff' for the 'config_wand' would look like and generate the Python script to send that sequence.

# Script Generation Rules
Based on the user's request, generate a complete, runnable Python script using 'asyncio' and 'bleak'.
The script MUST:
1. Scan for the wand by its name prefix.
2. Connect to the first found device.
3. Find the correct service and characteristic.
4. Construct the correct byte payload(s) to fulfill the user's request. Use the advanced macro structure if the request implies it (e.g., looping, targeting groups).
5. Write the command bytes to the characteristic. For macros, this means sending a MACRO_EXECUTE (0x68) command followed by the sequence of instruction bytes. For macros that exceed the MTU (20 bytes), the script should split the payload into multiple writes.
6. Disconnect gracefully.
7. Include comments explaining the process, especially the byte payload construction.
8. Handle potential errors using try/except blocks.

# Example
User Request: "Fade the light to red over 2 seconds, then buzz 3 times for 100ms each."
This is a macro. The script should build a byte array starting with MACRO_EXECUTE (0x68).
- LightTransition (0x22): mode=0, r=255, g=0, b=0, duration=2000ms (little-endian: 0xd0 0x07)
- HapticBuzz (0x50): duration=100ms (little-endian: 0x64 0x00). For 3 loops, the script should add this command 3 times to the macro payload.

Your final response must contain ONLY the raw Python code inside a single \`\`\`python ... \`\`\` code block. Do not add any conversational text or explanations outside of the code block.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Write a bleak python script for this request: "${prompt}"`,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      // Clean up the response to get only the code
      const rawText = response.text;
      const codeBlockRegex = /```python\n([\s\S]*?)```/;
      const match = rawText.match(codeBlockRegex);
      const script = match ? match[1] : rawText;

      setGeneratedScript(script);
      addLog('SUCCESS', 'Python script generated successfully.');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('ERROR', `Failed to generate script: ${errorMessage}`);
      setGeneratedScript(`# An error occurred while generating the script:\n# ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [prompt, addLog]);

  const handleCopy = useCallback(() => {
    if (!generatedScript) return;
    navigator.clipboard.writeText(generatedScript).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      addLog('INFO', 'Script copied to clipboard.');
    }, (err) => {
      addLog('ERROR', 'Failed to copy script to clipboard.');
    });
  }, [generatedScript, addLog]);

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div>
        <h3 className="text-xl font-semibold mb-2 flex items-center"><CodeIcon /> Python `bleak` Scripter</h3>
        <p className="text-sm text-slate-400 mb-4">
          Describe a custom effect or sequence, and Gemini will generate a Python script to control the wand. This is a powerful tool for testing undocumented commands and creating complex effects using loops, colors, and haptics.
        </p>
        <div className="space-y-2">
            <label htmlFor="script-prompt" className="block text-sm font-medium text-slate-300">
                Action Description
            </label>
            <textarea
                id="script-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g., "Loop a blue pulse 5 times" or "Vibrate for 1 second then fade to red".'
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <button
                onClick={handleGenerateScript}
                disabled={isLoading}
                className="w-full px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-md disabled:bg-slate-500 disabled:cursor-wait transition-colors"
            >
                {isLoading ? 'Generating...' : 'Generate Script'}
            </button>
        </div>
      </div>

      <div className="flex-grow flex flex-col">
        <div className="flex justify-between items-center mb-2">
            <h4 className="text-lg font-semibold">Generated Script</h4>
            <button 
                onClick={handleCopy}
                disabled={!generatedScript || isLoading}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors text-sm flex items-center gap-2"
            >
                {isCopied ? <><CheckIcon /> Copied!</> : <><ClipboardIcon /> Copy</>}
            </button>
        </div>
        <div className="bg-slate-950 rounded-lg border border-slate-700 flex-grow p-1 overflow-auto">
            <pre className="h-full">
                <code className="text-sm text-slate-300 p-4 block h-full overflow-auto">
                    {isLoading 
                        ? <span className="text-slate-500 animate-pulse">Waiting for Gemini...</span>
                        : generatedScript || <span className="text-slate-500">Your generated script will appear here.</span>
                    }
                </code>
            </pre>
        </div>
      </div>
    </div>
  );
};

export default Scripter;