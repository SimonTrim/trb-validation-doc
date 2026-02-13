// ============================================================================
// USE UNDO REDO — Historique d'actions pour le workflow designer
// Gère un stack undo/redo générique sur un snapshot d'état
// ============================================================================

import { useCallback, useRef, useState } from 'react';

export interface UndoRedoState<T> {
  current: T;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
}

const MAX_HISTORY = 50;

export function useUndoRedo<T>(initialState: T) {
  const [current, setCurrent] = useState<T>(initialState);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const [, forceUpdate] = useState(0);

  /** Push a new state (clears redo stack) */
  const push = useCallback((newState: T) => {
    undoStack.current.push(current);
    if (undoStack.current.length > MAX_HISTORY) {
      undoStack.current.shift();
    }
    redoStack.current = [];
    setCurrent(newState);
    forceUpdate((n) => n + 1);
  }, [current]);

  /** Undo — go back one step */
  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(current);
    setCurrent(prev);
    forceUpdate((n) => n + 1);
  }, [current]);

  /** Redo — go forward one step */
  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(current);
    setCurrent(next);
    forceUpdate((n) => n + 1);
  }, [current]);

  /** Reset history entirely */
  const reset = useCallback((newState: T) => {
    undoStack.current = [];
    redoStack.current = [];
    setCurrent(newState);
    forceUpdate((n) => n + 1);
  }, []);

  return {
    current,
    push,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    undoCount: undoStack.current.length,
    redoCount: redoStack.current.length,
  };
}
