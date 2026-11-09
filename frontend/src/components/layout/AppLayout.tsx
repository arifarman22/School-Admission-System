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

      <StudentIdentityBar />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <Link to={routes.classes} className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="text-lg font-semibold tracking-tight">School Admission</span>
          </Link>
          <MainNav />
        </div>
      </header>

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
