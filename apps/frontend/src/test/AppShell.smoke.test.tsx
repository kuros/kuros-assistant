import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layout/AppShell';

// RequireOnboarding makes a real API call — mock it so the shell renders.
vi.mock('../layout/RequireOnboarding', () => ({
  RequireOnboarding: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('AppShell', () => {
  it('renders all nav groups', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <AppShell mode="light" onToggleMode={() => undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/Today/i)).toBeInTheDocument();
    expect(screen.getByText(/Insights/i)).toBeInTheDocument();
    expect(screen.getByText(/Settings/i)).toBeInTheDocument();
  });
});
