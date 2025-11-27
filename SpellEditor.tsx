
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SpellDetails, MacroCommand } from './types';

interface SpellEditorProps {
    spells: Record<string, SpellDetails>;
    onSave: (spellKey: string, data: SpellDetails) => void;
    onDelete: (spellKey: string) => void;
    wandConnected: boolean;
    boxConnected: boolean;
    testMacro: (macro: MacroCommand[], target: 'wand' | 'box') => void;
}

const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>;
const SaveIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4-3 3m0 0-3-3m3 3V4" /></svg>;

const MacroRow: React.FC<{
    cmd: MacroCommand;
    onChange: (cmd: MacroCommand) => void;
    onDelete: () => void;
}> = ({ cmd, onChange, onDelete }) => {
    return (
        <div className="flex items-center gap-2 bg-slate-800 p-2 rounded text-xs mb-2">
            <select
                value={cmd.command}
                onChange={e => onChange({ ...cmd, command: e.target.value })}
                className="bg-slate-700 rounded px-1 py-1 w-28"
            >
                <option value="LightTransition">Light Color</option>
                <option value="HapticBuzz">Haptic Buzz</option>
                <option value="MacroDelay">Wait (Delay)</option>
                <option value="LightClear">Clear Light</option>
            </select>

            {cmd.command === 'LightTransition' && (
                <>
                    <input
                        type="color"
                        value={cmd.color || '#ffffff'}
                        onChange={e => onChange({ ...cmd, color: e.target.value })}
                        className="h-6 w-8 bg-transparent cursor-pointer"
                    />
                    <input
                        type="number"
                        placeholder="ms"
                        value={cmd.duration || 500}
                        onChange={e => onChange({ ...cmd, duration: parseInt(e.target.value) || 0 })}
                        className="w-14 bg-slate-700 rounded px-1"
                    />
                </>
            )}
            
            {(cmd.command === 'HapticBuzz' || cmd.command === 'MacroDelay') && (
                 <input
                    type="number"
                    placeholder="ms"
                    value={cmd.duration || 200}
                    onChange={e => onChange({ ...cmd, duration: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-slate-700 rounded px-1"
                />
            )}

            <button onClick={onDelete} className="ml-auto text-slate-500 hover:text-red-400">
                <TrashIcon />
            </button>
        </div>
    );
};


export const SpellEditor: React.FC<SpellEditorProps> = ({ spells, onSave, onDelete, wandConnected, boxConnected, testMacro }) => {
    const spellKeys = Object.keys(spells).sort();
    const [selectedKey, setSelectedKey] = useState<string | null>(spellKeys[0] || null);
    const [editData, setEditData] = useState<SpellDetails | null>(null);
    const [isDirty, setIsDirty] = useState(false);

    // Gesture Drawing State
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [pathPoints, setPathPoints] = useState<{ x: number, y: number }[]>([]);

    useEffect(() => {
        if (selectedKey && spells[selectedKey]) {
            setEditData(JSON.parse(JSON.stringify(spells[selectedKey])));
            setPathPoints([]); // Reset drawing points until loaded or redrawn
            setIsDirty(false);
        } else if (!selectedKey) {
            setEditData(null);
        }
    }, [selectedKey, spells]);

    // Handle Path Drawing (Mouse/Touch)
    const getPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        const pt = getPoint(e);
        setPathPoints([pt]);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        e.preventDefault(); // Stop scrolling on touch
        const pt = getPoint(e);
        setPathPoints(prev => [...prev, pt]);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        if (pathPoints.length > 5) {
            // Simplify and Convert to SVG Path String
            const pathStr = pointsToSvgPath(pathPoints);
            setEditData(prev => prev ? { ...prev, gesturePath: pathStr } : null);
            setIsDirty(true);
        }
    };

    // Helper: Convert points to SVG path 'M x y L x y ...'
    // Also normalizes to 100x100 coordinate space
    const pointsToSvgPath = (points: {x:number, y:number}[]) => {
        if (points.length === 0 || !canvasRef.current) return '';
        
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;

        // Simple normalization to 0-100 range
        const normalized = points.map(p => ({
            x: (p.x / width) * 100,
            y: (p.y / height) * 100
        }));

        const d = normalized.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        return d;
    };

    // Render Canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Match render size to display size
        const rect = canvas.parentElement?.getBoundingClientRect();
        if (rect && (canvas.width !== rect.width || canvas.height !== rect.height)) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 1. Draw Saved Path (if exists and not currently drawing)
        if (editData?.gesturePath && !isDrawing && pathPoints.length === 0) {
            ctx.strokeStyle = '#6366f1'; // Indigo
            ctx.lineWidth = 4;
            ctx.globalAlpha = 0.5;
            
            // Need to parse SVG path back to canvas instructions or use Path2D
            const p = new Path2D(editData.gesturePath);
            // The path is 0-100. We need to scale it to canvas size.
            ctx.save();
            ctx.scale(canvas.width / 100, canvas.height / 100);
            ctx.stroke(p);
            ctx.restore();
            ctx.globalAlpha = 1.0;
        }

        // 2. Draw Current Drawing Stroke
        if (pathPoints.length > 1) {
            ctx.strokeStyle = '#38bdf8'; // Sky blue
            ctx.lineWidth = 4;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            for (let i = 1; i < pathPoints.length; i++) {
                ctx.lineTo(pathPoints[i].x, pathPoints[i].y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }, [pathPoints, isDrawing, editData?.gesturePath]);


    const handleSave = () => {
        if (!editData || !selectedKey) return;
        // Ensure colors are saved
        onSave(selectedKey, editData);
        setIsDirty(false);
    };

    const handleCreateNew = () => {
        const name = prompt("Enter new spell name (e.g., FLIPENDO):");
        if (name) {
            const key = name.toUpperCase().replace(/\s/g, '_');
            const newSpell: SpellDetails = {
                spell_name: key,
                incantation_name: name,
                description: 'A custom spell.',
                spell_type: 'Custom',
                difficulty: 1,
                spell_background_color: '#ffffff',
                spell_uses: [],
                config_wand: { macros_payoff: [[{ command: 'HapticBuzz', duration: 200 }]] },
                config_wandbox: { macros_payoff: [[{ command: 'LightTransition', color: '#ffffff', duration: 500 }]] }
            };
            onSave(key, newSpell);
            setSelectedKey(key);
        }
    };

    const updateMacro = (target: 'wand' | 'box', index: number, newCmd: MacroCommand) => {
        if (!editData) return;
        const configKey = target === 'wand' ? 'config_wand' : 'config_wandbox';
        const updatedData = { ...editData };
        if (!updatedData[configKey]) updatedData[configKey] = { macros_payoff: [[]] };
        if (!updatedData[configKey]!.macros_payoff![0]) updatedData[configKey]!.macros_payoff![0] = [];
        
        updatedData[configKey]!.macros_payoff![0][index] = newCmd;
        setEditData(updatedData);
        setIsDirty(true);
    };

    const addMacro = (target: 'wand' | 'box') => {
        if (!editData) return;
        const configKey = target === 'wand' ? 'config_wand' : 'config_wandbox';
        const updatedData = { ...editData };
        if (!updatedData[configKey]) updatedData[configKey] = { macros_payoff: [[]] };
        // Ensure the array exists
        const currentMacros = updatedData[configKey]!.macros_payoff![0] || [];
        updatedData[configKey]!.macros_payoff![0] = [...currentMacros, { command: 'LightTransition', color: '#ffffff', duration: 500 }];
        setEditData(updatedData);
        setIsDirty(true);
    };

    const deleteMacro = (target: 'wand' | 'box', index: number) => {
         if (!editData) return;
        const configKey = target === 'wand' ? 'config_wand' : 'config_wandbox';
        const updatedData = { ...editData };
        if (!updatedData[configKey]?.macros_payoff?.[0]) return;
        
        updatedData[configKey]!.macros_payoff![0] = updatedData[configKey]!.macros_payoff![0].filter((_, i) => i !== index);
        setEditData(updatedData);
        setIsDirty(true);
    };


    return (
        <div className="h-full flex gap-4 overflow-hidden">
            {/* Sidebar List */}
            <div className="w-1/4 bg-slate-900/50 rounded-lg border border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                    <h3 className="font-semibold text-lg">Spells</h3>
                    <button onClick={handleCreateNew} className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded"><PlusIcon /></button>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    {spellKeys.map(key => (
                        <button
                            key={key}
                            onClick={() => setSelectedKey(key)}
                            className={`w-full text-left px-3 py-2 rounded text-sm ${selectedKey === key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                        >
                            {spells[key].incantation_name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Editor Area */}
            <div className="flex-grow bg-slate-900/50 rounded-lg border border-slate-700 flex flex-col overflow-hidden">
                {editData ? (
                    <div className="flex flex-col h-full">
                        {/* Header / Basic Info */}
                        <div className="p-4 border-b border-slate-700 flex justify-between items-start bg-slate-800/30">
                            <div className="flex gap-4 w-full">
                                <div className="flex-grow">
                                    <label className="block text-xs text-slate-500 uppercase font-bold">Incantation Name</label>
                                    <input 
                                        type="text" 
                                        value={editData.incantation_name} 
                                        onChange={e => { setEditData({...editData, incantation_name: e.target.value}); setIsDirty(true); }}
                                        className="w-full bg-transparent text-xl font-bold text-white border-b border-slate-600 focus:border-indigo-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 uppercase font-bold">Theme Color</label>
                                    <input 
                                        type="color" 
                                        value={editData.spell_background_color || '#ffffff'}
                                        onChange={e => { setEditData({...editData, spell_background_color: e.target.value}); setIsDirty(true); }}
                                        className="h-8 w-full bg-transparent cursor-pointer"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                                <button 
                                    onClick={handleSave} 
                                    disabled={!isDirty}
                                    className={`px-4 py-2 rounded font-bold flex items-center ${isDirty ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-slate-700 text-slate-400'}`}
                                >
                                    <SaveIcon /> Save
                                </button>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-4 grid grid-cols-2 gap-6">
                            {/* Left Column: Gesture */}
                            <div className="flex flex-col gap-4">
                                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                    <h4 className="font-semibold text-indigo-300 mb-2">Motion Gesture</h4>
                                    <p className="text-xs text-slate-400 mb-2">Draw the shape required to cast this spell. Start and end points matter.</p>
                                    
                                    <div className="relative w-full aspect-square bg-slate-900 rounded border border-slate-600 overflow-hidden touch-none">
                                        <canvas 
                                            ref={canvasRef}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            className="w-full h-full cursor-crosshair"
                                        />
                                        <button 
                                            onClick={() => { setEditData({...editData, gesturePath: undefined}); setPathPoints([]); setIsDirty(true); }}
                                            className="absolute top-2 right-2 text-xs bg-slate-700 hover:bg-red-600 text-white px-2 py-1 rounded"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="mt-2 text-center text-xs text-slate-500">
                                        {editData.gesturePath ? "Gesture Saved" : "No Gesture Recorded"}
                                    </div>
                                </div>

                                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                    <h4 className="font-semibold text-slate-300 mb-2">Description</h4>
                                    <textarea 
                                        value={editData.description}
                                        onChange={e => { setEditData({...editData, description: e.target.value}); setIsDirty(true); }}
                                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm h-24"
                                    />
                                </div>
                            </div>

                            {/* Right Column: Reactions */}
                            <div className="flex flex-col gap-4">
                                {/* Wand Reaction */}
                                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-semibold text-indigo-300">Wand Reaction</h4>
                                        <button onClick={() => addMacro('wand')} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded">+ Step</button>
                                    </div>
                                    <div className="flex-grow space-y-1">
                                        {(editData.config_wand?.macros_payoff?.[0] || []).map((cmd, idx) => (
                                            <MacroRow 
                                                key={idx} 
                                                cmd={cmd} 
                                                onChange={(newCmd) => updateMacro('wand', idx, newCmd)}
                                                onDelete={() => deleteMacro('wand', idx)}
                                            />
                                        ))}
                                        {(editData.config_wand?.macros_payoff?.[0]?.length || 0) === 0 && <p className="text-xs text-slate-500 italic">No reaction defined.</p>}
                                    </div>
                                    <button 
                                        onClick={() => wandConnected && editData.config_wand?.macros_payoff?.[0] && testMacro(editData.config_wand.macros_payoff[0], 'wand')}
                                        disabled={!wandConnected}
                                        className="mt-2 text-xs w-full py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                        <PlayIcon /> Test on Wand
                                    </button>
                                </div>

                                {/* Box Reaction */}
                                <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 flex flex-col">
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-semibold text-indigo-300">Box Reaction</h4>
                                        <button onClick={() => addMacro('box')} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded">+ Step</button>
                                    </div>
                                    <div className="flex-grow space-y-1">
                                        {(editData.config_wandbox?.macros_payoff?.[0] || []).map((cmd, idx) => (
                                            <MacroRow 
                                                key={idx} 
                                                cmd={cmd} 
                                                onChange={(newCmd) => updateMacro('box', idx, newCmd)}
                                                onDelete={() => deleteMacro('box', idx)}
                                            />
                                        ))}
                                         {(editData.config_wandbox?.macros_payoff?.[0]?.length || 0) === 0 && <p className="text-xs text-slate-500 italic">No reaction defined.</p>}
                                    </div>
                                    <button 
                                        onClick={() => boxConnected && editData.config_wandbox?.macros_payoff?.[0] && testMacro(editData.config_wandbox.macros_payoff[0], 'box')}
                                        disabled={!boxConnected}
                                        className="mt-2 text-xs w-full py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                                    >
                                        <PlayIcon /> Test on Box
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        Select a spell to edit or create a new one.
                    </div>
                )}
            </div>
        </div>
    );
};
