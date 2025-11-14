import { SPELL_REACTION_MACROS } from './spellMacroHelper';
import type { MacroCommand } from './types';

type SendMacroCallback = (commands: MacroCommand[], target: 'box') => void;

/**
 * Manages the Wand Box's reactions to spell casts.
 */
export class WandBoxHelper {
    private sendMacro: SendMacroCallback;
    private macroIndexes: Record<string, number> = {};

    constructor(sendMacroCallback: SendMacroCallback) {
        this.sendMacro = sendMacroCallback;
    }

    /**
     * Triggers a predefined ambient VFX sequence on the wand box in reaction to a spell.
     * @param spellName The canonical name of the spell that was cast.
     */
    public reactToSpell(spellName: string): void {
        // Find the macro for the spell, falling back to a default if not found.
        const macroVariations = SPELL_REACTION_MACROS[spellName] || SPELL_REACTION_MACROS['DEFAULT'];

        if (!macroVariations || macroVariations.length === 0) {
            // This case should ideally not happen with a DEFAULT fallback, but it's good practice.
            console.warn(`[WandBoxHelper] No reaction macro found for spell: ${spellName}`);
            return;
        }

        // Cycle through variations if multiple are defined for the spell.
        // This allows for more dynamic reactions on repeated casts of the same spell.
        const currentIndex = this.macroIndexes[spellName] ?? -1;
        const nextIndex = (currentIndex + 1) % macroVariations.length;
        this.macroIndexes[spellName] = nextIndex;

        const macroToExecute = macroVariations[nextIndex];

        // Use the callback provided during construction to send the sequence to the box.
        this.sendMacro(macroToExecute, 'box');
    }
}
