// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentsTab } from '../ExperimentsTab';
import { useSettingsStore } from '../../store';

vi.mock('../../api', () => ({
  hanaFetch: vi.fn(async () => new Response(JSON.stringify({ experiments: [] }))),
}));

describe('ExperimentsTab', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
    useSettingsStore.setState({ showToast: vi.fn() } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses cache memory as the section title and keeps the cache intro above the card body', async () => {
    const { container } = render(React.createElement(ExperimentsTab));

    expect(screen.getByText('settings.experiments.memoryTitle')).toBeTruthy();
    expect(screen.getByText('settings.experiments.cacheSnapshot.description')).toBeTruthy();
    expect(screen.queryByText('settings.experiments.description')).toBeNull();

    await waitFor(() => {
      expect(screen.getByText('settings.experiments.empty')).toBeTruthy();
    });

    const body = container.querySelector('[class*="sectionBody"]');
    expect(body?.textContent).toContain('settings.experiments.empty');
    expect(body?.textContent).not.toContain('settings.experiments.cacheSnapshot.description');
  });
});
