// ============================================================================
// WORKFLOW ENGINE — Exports
// ============================================================================

export { WorkflowEngine } from './WorkflowEngine';
export type { EngineEvent } from './WorkflowEngine';

export { FolderWatcher } from './FolderWatcher';

export { evaluateDecision } from './DecisionEvaluator';
export type { DecisionResult } from './DecisionEvaluator';

export { executeAction, getActionContext } from './ActionExecutor';
export type { ActionResult, ActionContext } from './ActionExecutor';
