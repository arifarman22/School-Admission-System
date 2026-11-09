import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StudentIdProvider } from './hooks/StudentIdProvider';
import './index.css';
import { createQueryClient } from './utils/queryClient';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found');
}

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <StudentIdProvider>
        <App />
      </StudentIdProvider>
    </QueryClientProvider>
  </StrictMode>,
);
