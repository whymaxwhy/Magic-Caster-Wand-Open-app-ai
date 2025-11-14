import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { WBDLProtocol, WBDLPayloads } from './constants';
import type { LogType } from './types';

interface ScripterProps {
  addLog: (type: LogType, message: string) => void;
}

const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {/* FIX: Corrected malformed SVG path data which could cause parsing errors. */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
);

const ClipboardIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
);


const Scripter: React.FC<ScripterProps> = ({ addLog }) => {
  const [prompt, setPrompt] = useState('');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [wasCopied, setWasCopied] = useState(false);

  const generateScript = useCallback(async () => {
    if (!prompt.trim()) {
      addLog('WARNING', 'Prompt is empty.');
      return;
    }
    setIsGenerating(true);
    setGeneratedScript('');
    addLog('INFO', 'Generating Python script with Gemini...');

    const protocolSummary = `
      - Service UUID: ${WBDLProtocol.SERVICE_UUID_WAND_CONTROL}
      - Characteristic for Write/Notify: ${WBDLProtocol.CHAR_UUID_WAND_COMM_CHANNEL_1}
      - Opcodes (Hex):
        - HAPTIC_VIBRATE: 0x${WBDLProtocol.CMD.HAPTIC_VIBRATE.toString(16)}
        - LIGHT_CLEAR_ALL: 0x${WBDLProtocol.CMD.LIGHT_CLEAR_ALL.toString(16)}
        - MACRO_EXECUTE: 0x${WBDLProtocol.CMD.MACRO_EXECUTE.toString(16)}
      - Macro Instructions (inside a MACRO_EXECUTE payload):
        - MACRO_DELAY: 0x${WBDLProtocol.INST.MACRO_DELAY.toString(16)}
        - MACRO_LIGHT_TRANSITION: 0x${WBDLProtocol.INST.MACRO_LIGHT_TRANSITION.toString(16)}
    `;

    const systemInstruction = `You are a Python code generation assistant. Your task is to write a Python script that uses the 'bleak' library to interact with a Magic Wand BLE device. The user will provide a high-level goal, and you must generate a complete, runnable Python script to achieve it.

      **Key requirements:**
      1.  The script must use 'asyncio' and the 'bleak' library.
      2.  The target device has the service and characteristic UUIDs provided in the context.
      3.  You must use the provided opcodes and instruction constants to build command payloads.
      4.  The script should define the necessary UUIDs and the characteristic to write to.
      5.  It should include a 'main' async function that scans for the device (by name prefix "MCW"), connects, performs the requested action, and then disconnects.
      6.  Include comments explaining the structure of the command payloads you construct.
      7.  Wrap the code in a markdown block for Python. Do not add any conversational text outside the code block.
    `;
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Generate a Python script for this task: "${prompt}". Use this protocol information as context:\n${protocolSummary}`,
        config: {
            systemInstruction: systemInstruction,
        },
      });

      const script = response.text;
      // Clean up the response, removing the markdown backticks
      const cleanedScript = script.replace(/^```python\n|```$/g, '');
      setGeneratedScript(cleanedScript);
      addLog('SUCCESS', 'Python script generated.');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setGeneratedScript(`# An error occurred: ${errorMessage}`);
      addLog('ERROR', `Script generation failed: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }

  }, [prompt, addLog]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedScript).then(() => {
        setWasCopied(true);
        setTimeout(() => setWasCopied(false), 2000);
    });
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div>
        <h3 className="text-xl font-semibold">Python Scripter (via Gemini)</h3>
        <p className="text-sm text-slate-400">Describe a desired wand behavior, and Gemini will generate a Python script using the 'bleak' library to control it.</p>
      </div>
      
      <div className="flex flex-col space-y-2">
        <label htmlFor="prompt-input" className="font-semibold text-slate-300">Your Goal:</label>
        <textarea
          id="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., 'Make the wand vibrate for 1 second, then flash red, then turn off'"
          rows={3}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={generateScript}
          disabled={isGenerating}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-semibold disabled:bg-slate-500 disabled:cursor-wait flex items-center justify-center"
        >
          <CodeIcon />
          {isGenerating ? 'Generating...' : 'Generate Script'}
        </button>
      </div>

      <div className="flex-grow flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-slate-300">Generated Python Script:</h4>
            <button
                onClick={copyToClipboard}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-sm rounded flex items-center gap-2"
                disabled={!generatedScript}
            >
                {wasCopied ? <CheckIcon /> : <ClipboardIcon />}
                {wasCopied ? 'Copied!' : 'Copy'}
            </button>
        </div>
        <pre className="flex-grow bg-slate-950 p-4 rounded-lg border border-slate-700 overflow-auto text-sm">
          <code className="language-python">
            {isGenerating ? 'Gemini is writing your script...' : (generatedScript || '# Your script will appear here...')}
          </code>
        </pre>
      </div>
    </div>
  );
};

export default Scripter;
