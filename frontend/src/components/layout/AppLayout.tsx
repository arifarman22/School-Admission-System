import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router';
import { routes } from '../../utils/routes';
import { StudentIdentityBar } from '../admission/StudentIdentityBar';
import { MainNav } from './MainNav';

export function AppLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to={routes.classes} className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="size-5">
                <path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3Zm-6.82 9.16L5 15.5C5 17.43 8.13 19 12 19s7-1.57 7-3.5l-.18-3.34L12 15.83l-6.82-3.67Z" />
              </svg>
            </span>
            <span className="leading-tight">
              <span className="block text-base font-semibold tracking-tight text-slate-900">
                School Admission
              </span>
              <span className="block text-xs text-slate-500">Online admission portal</span>
            </span>
          </Link>
          <MainNav />
        </div>
      </header>

      <StudentIdentityBar />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children ?? <Outlet />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">
          School Admission System
        </div>
      </footer>
    </div>
  );
}
