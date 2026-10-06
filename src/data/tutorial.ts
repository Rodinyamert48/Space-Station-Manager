import type { ModuleType } from './modules';
import type { TechId } from './research';

export type TutorialStepId = 'power' | 'lifeSupport' | 'quarters' | 'dock' | 'trade' | 'research' | 'unlock';

export interface TutorialStepDef {
  id: TutorialStepId;
  /** Module the step asks the player to build; the objective card can start its placement. */
  module?: ModuleType;
  /** Window that helps complete the step. */
  window?: 'ships' | 'research';
  /** Technology the step suggests researching (highlighted in the tree). */
  tech?: TechId;
}

/** The first-session walkthrough, in order. Each step completes once its goal is met. */
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  { id: 'power', module: 'power' },
  { id: 'lifeSupport', module: 'lifeSupport' },
  { id: 'quarters', module: 'quarters' },
  { id: 'dock', window: 'ships' },
  { id: 'trade', window: 'ships' },
  { id: 'research', window: 'research', tech: 'basicPower' },
  { id: 'unlock', window: 'research', tech: 'improvedLifeSupport' },
];

/** Credits HQ grants when the walkthrough is finished. */
export const TUTORIAL_REWARD = 1000;
