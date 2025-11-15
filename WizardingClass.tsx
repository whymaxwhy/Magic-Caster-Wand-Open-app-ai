import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { WBDLProtocol } from './constants';

// --- TYPES (from parent) ---
interface IMUVector {
    x: number;
    y: number;
    z: number;
}
interface IMUReading {
    chunk_index: number;
    acceleration: IMUVector;
    gyroscope: IMUVector;
}

interface WizardingClassProps {
    isImuStreaming: boolean;
    toggleImuStream: () => void;
    latestImuData: IMUReading[] | null;
    isWandConnected: boolean;
    isBoxConnected: boolean;
    queueCommand: (payload: Uint8Array, silent?: boolean) => void;
    queueBoxCommand: (payload: Uint8Array, silent?: boolean) => void;
}

type Point = { x: number, y: number };

// --- ICONS ---
const LockClosedIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 9V7a5 5 0 0 1 10 0v2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zm8-2v2H7V7a3 3 0 0 1 6 0z" clipRule="evenodd" />
    </svg>
);

const StarIcon: React.FC<{ className?: string }> = ({ className = 'text-yellow-400' }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${className}`} viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
    </svg>
);

const MagicWandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);


// --- TYPES ---
interface SpellChallenge {
  id: string;
  name: string;
  description: string;
  requiredLevel: number;
  difficulty: number; // 1 (easy) to 5 (hard)
  xpReward: number;
  status: 'locked' | 'unlocked' | 'mastered';
  gesturePath: string; // SVG path data string
}

// --- DATA ---
const initialChallenges: SpellChallenge[] = [
  { id: 'lumos', name: 'Lumos', description: 'Creates a small, bright light at the tip of the wand.', requiredLevel: 1, difficulty: 1, xpReward: 10, status: 'unlocked', gesturePath: 'M 50 80 C 30 20, 70 20, 50 80' },
  { id: 'nox', name: 'Nox', description: 'Extinguishes the light created by Lumos.', requiredLevel: 1, difficulty: 1, xpReward: 10, status: 'unlocked', gesturePath: 'M 50 25 L 50 75' },
  { id: 'wingardium_leviosa', name: 'Wingardium Leviosa', description: 'Makes objects float in the air.', requiredLevel: 2, difficulty: 2, xpReward: 25, status: 'locked', gesturePath: 'M 20 70 Q 50 30, 80 70 L 80 80' },
  { id: 'alohomora', name: 'Alohomora', description: 'Unlocks doors and other locked objects.', requiredLevel: 3, difficulty: 2, xpReward: 30, status: 'locked', gesturePath: 'M 30 80 L 30 40 Q 50 20 70 40 L 70 50' },
  { id: 'incendio', name: 'Incendio', description: 'Produces fire from the wand tip.', requiredLevel: 5, difficulty: 3, xpReward: 50, status: 'locked', gesturePath: 'M 50 90 C 40 70, 60 70, 50 50 C 40 30, 60 30, 50 10' },
  { id: 'expelliarmus', name: 'Expelliarmus', description: 'Disarms an opponent, causing their wand to fly out of their hand.', requiredLevel: 7, difficulty: 4, xpReward: 75, status: 'locked', gesturePath: 'M 20 80 L 80 20 M 20 20 L 80 80' },
  { id: 'expecto_patronum', name: 'Expecto Patronum', description: 'Conjures a spirit guardian to repel Dementors.', requiredLevel: 10, difficulty: 5, xpReward: 150, status: 'locked', gesturePath: 'M 50,50 m -30,0 a 30,30 0 1,0 60,0 a 30,30 0 1,0 -60,0' },
];

const LEVEL_XP_BASE = 100;

// --- GESTURE RECOGNITION HELPERS ---
const GESTURE_SAMPLE_POINTS = 64;
const SUCCESS_THRESHOLD = 20; // Lower is better match

const distance = (p1: Point, p2: Point) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

const pathLength = (points: Point[]) => {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += distance(points[i - 1], points[i]);
    }
    return length;
};

const resample = (points: Point[], numPoints: number): Point[] => {
    if (points.length < 2) return points;
    const len = pathLength(points);
    const interval = len / (numPoints - 1);
    const newPoints: Point[] = [points[0]];
    let D = 0;

    for (let i = 1; i < points.length; i++) {
        const d = distance(points[i - 1], points[i]);
        if (D + d >= interval) {
            const qx = points[i - 1].x + ((interval - D) / d) * (points[i].x - points[i - 1].x);
            const qy = points[i - 1].y + ((interval - D) / d) * (points[i].y - points[i - 1].y);
            const q: Point = { x: qx, y: qy };
            newPoints.push(q);
            points.splice(i, 0, q);
            D = 0;
        } else {
            D += d;
        }
    }
    if (newPoints.length < numPoints) {
        newPoints.push(points[points.length - 1]);
    }
    return newPoints.slice(0, numPoints);
};

const normalize = (points: Point[], canvasSize: number): Point[] => {
    if (points.length < 2) return points;
    const minX = Math.min(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxX = Math.max(...points.map(p => p.x));
    const maxY = Math.max(...points.map(p => p.y));

    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width === 0 && height === 0) return points;

    const scale = canvasSize / Math.max(width, height, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    return points.map(p => ({
        x: (p.x - centerX) * scale + (canvasSize / 2),
        y: (p.y - centerY) * scale + (canvasSize / 2)
    }));
};

const svgPathToPoints = (pathData: string, numPoints: number): Point[] => {
    const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathElement.setAttribute('d', pathData);
    const totalLength = pathElement.getTotalLength();
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        const point = pathElement.getPointAtLength((i / (numPoints - 1)) * totalLength);
        points.push({ x: point.x, y: point.y });
    }
    return points;
};

const comparePaths = (pathA: Point[], pathB: Point[]): number => {
    if (pathA.length < 2 || pathB.length < 2) return Infinity;

    const normalizedA = normalize(pathA, 100);
    const normalizedB = normalize(pathB, 100);

    const resampledA = resample(normalizedA, GESTURE_SAMPLE_POINTS);
    const resampledB = resample(normalizedB, GESTURE_SAMPLE_POINTS);

    let totalDist = 0;
    for (let i = 0; i < GESTURE_SAMPLE_POINTS; i++) {
        totalDist += distance(resampledA[i], resampledB[i]);
    }
    return totalDist / GESTURE_SAMPLE_POINTS;
};

// --- CASTING MODAL COMPONENT ---
interface CastingModalProps {
    spell: SpellChallenge;
    onClose: () => void;
    handleCastAttempt: (isSuccess: boolean) => void;
    isImuStreaming: boolean;
    toggleImuStream: () => void;
    latestImuData: IMUReading[] | null;
    drawingSensitivity: number;
    pathSmoothing: number;
}

const CastingModal: React.FC<CastingModalProps> = ({ spell, onClose, handleCastAttempt, isImuStreaming, toggleImuStream, latestImuData, drawingSensitivity, pathSmoothing }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [drawnPath, setDrawnPath] = useState<Point[]>([]);
    const wasStreaming = useRef(false);

    const pointQueueRef = useRef<Point[]>([]);
    const lastPositionRef = useRef<Point>({ x: 50, y: 50 });
    const animationFrameId = useRef<number | null>(null);

    // Effect to process IMU data and add it to a queue for smooth rendering
    useEffect(() => {
        if (!isRecording || !latestImuData || latestImuData.length === 0) {
            return;
        }

        // FIX: The gyroscope integration time step was too small, making wand
        // movements nearly invisible. It has been adjusted to a more realistic
        // value (assuming ~30Hz effective sample rate) to ensure the drawn path is
        // clearly visible and responsive.
        const dt = 1 / 30; 
        let currentPos = lastPositionRef.current;
        const newPoints: Point[] = [];

        for (const reading of latestImuData) {
            const rawX = currentPos.x + reading.gyroscope.y * dt * drawingSensitivity;
            const rawY = currentPos.y - reading.gyroscope.x * dt * drawingSensitivity;
            
            const alpha = 1 - pathSmoothing;
            const smoothedX = alpha * rawX + (1 - alpha) * currentPos.x;
            const smoothedY = alpha * rawY + (1 - alpha) * currentPos.y;

            const nextPoint = {
                x: Math.max(0, Math.min(100, smoothedX)),
                y: Math.max(0, Math.min(100, smoothedY)),
            };
            newPoints.push(nextPoint);
            currentPos = nextPoint;
        }

        pointQueueRef.current.push(...newPoints);
        lastPositionRef.current = currentPos;

    }, [latestImuData, isRecording, drawingSensitivity, pathSmoothing]);

    // Effect to run the animation loop for drawing the path smoothly
    useEffect(() => {
        if (isRecording) {
            const animate = () => {
                if (pointQueueRef.current.length > 0) {
                    const pointsToProcess = Math.min(pointQueueRef.current.length, 3);
                    const pointsToAdd = pointQueueRef.current.splice(0, pointsToProcess);
                    setDrawnPath(prev => [...prev, ...pointsToAdd]);
                }
                animationFrameId.current = requestAnimationFrame(animate);
            };
            animationFrameId.current = requestAnimationFrame(animate);
        }

        return () => {
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [isRecording]);

    const handleToggleRecording = () => {
        if (!isRecording) {
            wasStreaming.current = isImuStreaming;
            if (!isImuStreaming) {
                toggleImuStream();
            }
            const startPoint = { x: 50, y: 50 };
            setDrawnPath([startPoint]);
            lastPositionRef.current = startPoint;
            pointQueueRef.current = [];
            setIsRecording(true);
        } else {
            setIsRecording(false);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (!wasStreaming.current) {
                toggleImuStream();
            }
            
            setTimeout(() => {
                const finalDrawnPath = [...drawnPath, ...pointQueueRef.current];
                const targetPath = svgPathToPoints(spell.gesturePath, GESTURE_SAMPLE_POINTS);
                const score = comparePaths(finalDrawnPath, targetPath);
                handleCastAttempt(score < SUCCESS_THRESHOLD);
            }, 100);
        }
    };

    const drawnPathString = drawnPath.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-lg border border-slate-700 m-4">
                <div className="p-6">
                    <h3 className="text-2xl font-bold text-indigo-400">Cast: {spell.name}</h3>
                    <p className="text-slate-400 mb-4">Trace the gesture with your wand.</p>
                    <div className="relative bg-slate-950 rounded-lg aspect-square w-full border border-slate-600 overflow-hidden">
                        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
                            <defs>
                                <filter id="wand-glow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                                    <feMerge>
                                        <feMergeNode in="blur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            <path d={spell.gesturePath} stroke="#4F46E5" strokeWidth="2" fill="none" strokeDasharray="4" opacity="0.7" />
                            {drawnPath.length > 1 && (
                                <polyline 
                                    points={drawnPathString} 
                                    stroke="#34D399" 
                                    strokeWidth="2" 
                                    fill="none" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    filter="url(#wand-glow)"
                                />
                            )}
                        </svg>
                    </div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-b-lg flex justify-between items-center">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded font-semibold">
                        Cancel
                    </button>
                    <button onClick={handleToggleRecording} className={`px-4 py-2 rounded font-semibold text-white ${isRecording ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>
                        {isRecording ? 'Finish Casting' : 'Start Casting'}
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- FEEDBACK MACROS ---
const SUCCESS_WAND_MACRO = new Uint8Array([
    WBDLProtocol.CMD.MACRO_EXECUTE,
    WBDLProtocol.CMD.HAPTIC_VIBRATE, 0xC8, 0x00, // Buzz 200ms
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 255, 255, 255, 0xC8, 0x00, // White flash 200ms
    WBDLProtocol.INST.MACRO_DELAY, 0xC8, 0x00, // Delay 200ms
    WBDLProtocol.CMD.LIGHT_CLEAR_ALL
]);

const FAILURE_WAND_MACRO = new Uint8Array([
    WBDLProtocol.CMD.MACRO_EXECUTE,
    WBDLProtocol.CMD.HAPTIC_VIBRATE, 0x96, 0x00, // Fizzle buzz 150ms
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 255, 0, 0, 0x96, 0x00, // Red flash 150ms
    WBDLProtocol.INST.MACRO_DELAY, 0x96, 0x00, // Delay 150ms
    WBDLProtocol.CMD.LIGHT_CLEAR_ALL
]);

const SUCCESS_BOX_MACRO = new Uint8Array([
    WBDLProtocol.CMD.MACRO_EXECUTE,
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 100, 100, 255, 0xE8, 0x03, // Blue fade in 1s
    WBDLProtocol.INST.MACRO_DELAY, 0xE8, 0x03, // Delay 1s
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 0, 0, 0, 0xE8, 0x03 // Fade out 1s
]);

const FAILURE_BOX_MACRO = new Uint8Array([
    WBDLProtocol.CMD.MACRO_EXECUTE,
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 150, 0, 0, 0x88, 0x01, // Dim red fade in 400ms
    WBDLProtocol.INST.MACRO_DELAY, 0x88, 0x01, // Delay 400ms
    WBDLProtocol.INST.MACRO_LIGHT_TRANSITION, 0, 0, 0, 0, 0x88, 0x01 // Fade out 400ms
]);


const WizardingClass: React.FC<WizardingClassProps> = ({ isImuStreaming, toggleImuStream, latestImuData, isWandConnected, isBoxConnected, queueCommand, queueBoxCommand }) => {
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [challenges, setChallenges] = useState<SpellChallenge[]>(initialChallenges);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isCastingModalOpen, setIsCastingModalOpen] = useState(false);
  const [drawingSensitivity, setDrawingSensitivity] = useState(15);
  const [pathSmoothing, setPathSmoothing] = useState(0.4);

  const xpToNextLevel = useMemo(() => {
    return Math.floor(LEVEL_XP_BASE * Math.pow(1.5, level - 1));
  }, [level]);

  const addXp = useCallback((amount: number) => {
    let newXp = xp + amount;
    let newLevel = level;
    let requiredXp = xpToNextLevel;

    while (newXp >= requiredXp) {
      newXp -= requiredXp;
      newLevel++;
      requiredXp = Math.floor(LEVEL_XP_BASE * Math.pow(1.5, newLevel - 1));
      setFeedback({ message: `Leveled up to Level ${newLevel}!`, type: 'success' });
    }
    
    setLevel(newLevel);
    setXp(newXp);

    // Unlock new challenges
    setChallenges(prev => 
      prev.map(c => 
        (c.status === 'locked' && newLevel >= c.requiredLevel)
        ? { ...c, status: 'unlocked' }
        : c
      )
    );
  }, [xp, level, xpToNextLevel]);

  const handleCastAttempt = useCallback((isSuccess: boolean) => {
    const challenge = challenges.find(c => c.id === activeChallengeId);
    if (!challenge) return;

    if (isSuccess) {
      setFeedback({ message: `Correct! You earned ${challenge.xpReward} XP.`, type: 'success' });
      addXp(challenge.xpReward);
      if (isWandConnected) queueCommand(SUCCESS_WAND_MACRO);
      if (isBoxConnected) queueBoxCommand(SUCCESS_BOX_MACRO);
      setTimeout(() => setIsCastingModalOpen(false), 1500);
    } else {
      setFeedback({ message: 'Not quite right. Focus and try the incantation again!', type: 'error' });
      if (isWandConnected) queueCommand(FAILURE_WAND_MACRO);
      if (isBoxConnected) queueBoxCommand(FAILURE_BOX_MACRO);
    }
     // Clear feedback after a few seconds
    setTimeout(() => setFeedback(null), 3000);
  }, [addXp, activeChallengeId, challenges, isWandConnected, isBoxConnected, queueCommand, queueBoxCommand]);

  const activeChallenge = useMemo(() => {
    return challenges.find(c => c.id === activeChallengeId);
  }, [activeChallengeId, challenges]);
  
  const xpPercentage = (xp / xpToNextLevel) * 100;

  return (
    <div className="relative h-full flex flex-col items-center justify-center space-y-4">
        {feedback && (
            <div
                key={Date.now()} // Re-trigger animation on new feedback
                className={`absolute inset-0 z-50 pointer-events-none animate-feedback-flash
                    ${feedback.type === 'success' ? 'bg-green-500/30' : 'bg-red-500/30'}`
                }
            />
        )}
        {isCastingModalOpen && activeChallenge && (
            <CastingModal 
                spell={activeChallenge}
                onClose={() => setIsCastingModalOpen(false)}
                handleCastAttempt={handleCastAttempt}
                isImuStreaming={isImuStreaming}
                toggleImuStream={toggleImuStream}
                latestImuData={latestImuData}
                drawingSensitivity={drawingSensitivity}
                pathSmoothing={pathSmoothing}
            />
        )}
        <h3 className="text-3xl font-bold text-indigo-400">Wizarding Class: Spell Challenges</h3>
        <p className="text-slate-400 max-w-2xl text-center">
            Hone your skills by practicing spells. Correctly casting a spell earns you Experience Points (XP).
            Gain enough XP to level up and unlock more powerful and difficult spells to master.
        </p>

        {/* Player Stats */}
        <div className="w-full max-w-2xl bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-lg">Level {level}</span>
                <span className="text-sm font-mono text-slate-400">{xp} / {xpToNextLevel} XP</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-4">
                <div 
                    className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${xpPercentage}%` }}
                ></div>
            </div>
        </div>
        
        {/* Practice Settings */}
        <div className="w-full max-w-2xl bg-slate-900/50 p-4 rounded-lg border border-slate-700">
            <h4 className="font-semibold text-lg mb-2">Practice Settings</h4>
            <div className="space-y-3">
                <div>
                    <label htmlFor="sensitivity-slider" className="block text-sm font-medium text-slate-400">Drawing Sensitivity: {drawingSensitivity}</label>
                    <input 
                        id="sensitivity-slider"
                        type="range" 
                        min="5" 
                        max="30" 
                        step="1"
                        value={drawingSensitivity} 
                        onChange={e => setDrawingSensitivity(Number(e.target.value))} 
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
                <div>
                    <label htmlFor="smoothing-slider" className="block text-sm font-medium text-slate-400">Path Smoothing: {(pathSmoothing * 100).toFixed(0)}%</label>
                    <input 
                        id="smoothing-slider"
                        type="range" 
                        min="0" 
                        max="0.95" 
                        step="0.05"
                        value={pathSmoothing} 
                        onChange={e => setPathSmoothing(Number(e.target.value))} 
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            </div>
        </div>
        
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            {/* Challenges List */}
            <div className="md:col-span-1 bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <h4 className="font-semibold text-xl mb-3">Spellbook</h4>
                <div className="space-y-2">
                    {challenges.map(challenge => (
                        <button 
                            key={challenge.id}
                            disabled={challenge.status === 'locked'}
                            onClick={() => setActiveChallengeId(challenge.id)}
                            className={`w-full text-left p-3 rounded-md transition-colors flex justify-between items-center
                                ${challenge.status === 'locked' ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600'}
                                ${activeChallengeId === challenge.id ? 'ring-2 ring-indigo-500' : ''}
                            `}
                        >
                            <div className="flex flex-col">
                                <span className="font-semibold">{challenge.name}</span>
                                <span className="text-xs text-slate-400">Lvl. {challenge.requiredLevel}</span>
                            </div>
                            {challenge.status === 'locked' && <LockClosedIcon />}
                            {challenge.status === 'mastered' && <StarIcon />}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Challenge */}
            <div className="md:col-span-2 bg-slate-900/50 p-6 rounded-lg border border-slate-700 flex flex-col justify-between">
                {activeChallenge ? (
                    <div>
                        <div className="flex justify-between items-start">
                           <h4 className="font-bold text-2xl text-indigo-300">{activeChallenge.name}</h4>
                           <div className="flex items-center gap-1">
                                {[...Array(5)].map((_, i) => (
                                    <StarIcon key={i} className={i < activeChallenge.difficulty ? 'text-yellow-400' : 'text-slate-600'} />
                                ))}
                           </div>
                        </div>
                        <p className="text-slate-400 mt-2 mb-6">{activeChallenge.description}</p>

                        <button 
                            onClick={() => setIsCastingModalOpen(true)}
                            disabled={!isWandConnected}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center disabled:bg-slate-500 disabled:cursor-not-allowed"
                        >
                           <MagicWandIcon />
                           Practice Spell Gesture
                        </button>
                        {!isWandConnected && <p className="text-xs text-yellow-400 text-center mt-2">Connect a wand to practice spells.</p>}
                    </div>
                ) : (
                    <div className="text-center text-slate-500">
                        <p>Select a spell from your Spellbook to practice.</p>
                    </div>
                )}
                
                {feedback && (
                    <div className={`mt-4 p-3 rounded-md text-center font-semibold animate-fade-in ${feedback.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {feedback.message}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default WizardingClass;
