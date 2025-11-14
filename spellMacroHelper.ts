import type { MacroCommand } from './types';

/**
 * Predefined ambient VFX sequences for the Wand Box to react to spells.
 * These are intended to be more subtle, environmental effects compared to the wand's direct effects.
 */
export const SPELL_REACTION_MACROS: Record<string, MacroCommand[][]> = {
    "Lumos": [
        [
            { command: 'LightTransition', color: '#FFFFE0', duration: 1000, group: 0 }, // Soft white glow
            { command: 'MacroDelay', duration: 5000 },
            { command: 'LightTransition', color: '#000000', duration: 2000, group: 0 }, // Fade out
        ]
    ],
    "Nox": [
        [
            { command: 'LightTransition', color: '#000000', duration: 500, group: 0 }, // Quick fade to black
        ]
    ],
    "Incendio": [
        [
            { command: 'LightTransition', color: '#FF4500', duration: 300, group: 0 }, // Fiery orange
            { command: 'MacroDelay', duration: 200 },
            { command: 'LightTransition', color: '#FF8C00', duration: 300, group: 0 }, // Flickering dark orange
            { command: 'MacroDelay', duration: 200 },
            { command: 'LightTransition', color: '#FF4500', duration: 300, group: 0 },
            { command: 'MacroDelay', duration: 3000 },
            { command: 'LightTransition', color: '#000000', duration: 1000, group: 0 },
        ]
    ],
    "Aguamenti": [
        [
            { command: 'LightTransition', color: '#00BFFF', duration: 500, group: 0 }, // Deep sky blue
            { command: 'MacroDelay', duration: 100 },
            { command: 'LightTransition', color: '#1E90FF', duration: 500, group: 0 }, // Dodger blue
            { command: 'MacroDelay', duration: 3000 },
            { command: 'LightTransition', color: '#000000', duration: 1000, group: 0 },
        ]
    ],
    "Wingardium_Leviosa": [
        [
            { command: 'LightTransition', color: '#E6E6FA', duration: 2000, group: 0 }, // Gentle lavender pulse up
            { command: 'MacroDelay', duration: 1000 },
            { command: 'LightTransition', color: '#000000', duration: 2000, group: 0 }, // Slow fade out
        ]
    ],
    // A default reaction for any spell not explicitly defined.
    "DEFAULT": [
        [
            { command: 'LightTransition', color: '#8A2BE2', duration: 200, group: 0 }, // Quick purple flash of magical energy
            { command: 'MacroDelay', duration: 100 },
            { command: 'LightTransition', color: '#000000', duration: 500, group: 0 },
        ]
    ]
};
