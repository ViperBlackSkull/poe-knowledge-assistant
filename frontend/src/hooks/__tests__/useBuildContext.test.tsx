/**
 * Unit tests for the useBuildContext hook.
 *
 * Covers:
 *   - Default state (empty context)
 *   - Setting each build context value
 *   - Label generation for each context
 *   - hasContext derived state
 *   - localStorage persistence
 *   - localStorage read on initialization
 *   - Removing context (empty string)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBuildContext, getBuildContextLabel } from '../useBuildContext';

describe('useBuildContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns empty context by default', () => {
      const { result } = renderHook(() => useBuildContext());

      expect(result.current.buildContext).toBe('');
      expect(result.current.buildContextLabel).toBe('No Context');
      expect(result.current.hasContext).toBe(false);
    });

    it('reads initial context from localStorage', () => {
      localStorage.setItem('poe-knowledge-assistant-build-context', 'standard');

      const { result } = renderHook(() => useBuildContext());

      expect(result.current.buildContext).toBe('standard');
      expect(result.current.buildContextLabel).toBe('Standard');
      expect(result.current.hasContext).toBe(true);
    });

    it('ignores invalid localStorage values', () => {
      localStorage.setItem('poe-knowledge-assistant-build-context', 'invalid_value');

      const { result } = renderHook(() => useBuildContext());

      expect(result.current.buildContext).toBe('');
      expect(result.current.hasContext).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // setBuildContext
  // -------------------------------------------------------------------------

  describe('setBuildContext', () => {
    it('sets context to standard', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('standard'); });

      expect(result.current.buildContext).toBe('standard');
      expect(result.current.buildContextLabel).toBe('Standard');
      expect(result.current.hasContext).toBe(true);
    });

    it('sets context to budget', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('budget'); });

      expect(result.current.buildContext).toBe('budget');
      expect(result.current.buildContextLabel).toBe('Budget');
    });

    it('sets context to hc', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('hc'); });

      expect(result.current.buildContext).toBe('hc');
      expect(result.current.buildContextLabel).toBe('Hardcore');
    });

    it('sets context to ssf', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('ssf'); });

      expect(result.current.buildContext).toBe('ssf');
      expect(result.current.buildContextLabel).toBe('SSF');
    });

    it('sets context to ruthless', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('ruthless'); });

      expect(result.current.buildContext).toBe('ruthless');
      expect(result.current.buildContextLabel).toBe('Ruthless');
    });

    it('sets context to pvp', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('pvp'); });

      expect(result.current.buildContext).toBe('pvp');
      expect(result.current.buildContextLabel).toBe('PvP');
    });

    it('clears context with empty string', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('standard'); });
      expect(result.current.hasContext).toBe(true);

      act(() => { result.current.setBuildContext(''); });

      expect(result.current.buildContext).toBe('');
      expect(result.current.buildContextLabel).toBe('No Context');
      expect(result.current.hasContext).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // localStorage persistence
  // -------------------------------------------------------------------------

  describe('localStorage persistence', () => {
    it('persists context to localStorage', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('hc'); });

      expect(localStorage.getItem('poe-knowledge-assistant-build-context')).toBe('hc');
    });

    it('removes localStorage key when context is cleared', () => {
      const { result } = renderHook(() => useBuildContext());

      act(() => { result.current.setBuildContext('standard'); });
      expect(localStorage.getItem('poe-knowledge-assistant-build-context')).toBe('standard');

      act(() => { result.current.setBuildContext(''); });

      expect(localStorage.getItem('poe-knowledge-assistant-build-context')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getBuildContextLabel helper
  // -------------------------------------------------------------------------

  describe('getBuildContextLabel', () => {
    it('returns correct labels for all known contexts', () => {
      expect(getBuildContextLabel('standard')).toBe('Standard');
      expect(getBuildContextLabel('budget')).toBe('Budget');
      expect(getBuildContextLabel('hc')).toBe('Hardcore');
      expect(getBuildContextLabel('ssf')).toBe('SSF');
      expect(getBuildContextLabel('ruthless')).toBe('Ruthless');
      expect(getBuildContextLabel('pvp')).toBe('PvP');
      expect(getBuildContextLabel('')).toBe('No Context');
    });
  });
});
