import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { routes } from '../../utils/routes';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const icon = (d: string) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className="size-5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const studentItems: NavItem[] = [
  {
    to: routes.classes,
    label: 'Classes',
    end: true,
    icon: icon('M4 6h16M4 12h16M4 18h10'),
  },
  {
    to: routes.myApplications,
    label: 'My applications',
    icon: icon('M9 12h6m-6 4h6M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z'),
  },
];

const adminItem: NavItem = {
  to: routes.createClass,
  label: 'Admin: Create class',
  icon: icon('M12 5v14M5 12h14'),
};

function desktopLink({ isActive }: { isActive: boolean }): string {
  return `inline-flex h-16 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors ${
    isActive
      ? 'border-indigo-600 text-indigo-700'
      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
  }`;
}

function adminLink({ isActive }: { isActive: boolean }): string {
  return `inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
  }`;
}

function mobileLink({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium ${
    isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
  }`;
}

export function MainNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        <ul className="flex items-center gap-6">
          {studentItems.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end ?? false} className={desktopLink}>
                {item.icon}
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <NavLink to={adminItem.to} className={adminLink}>
          {adminItem.icon}
          {adminItem.label}
        </NavLink>
      </nav>

      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        {open ? icon('M6 6l12 12M18 6 6 18') : icon('M4 7h16M4 12h16M4 17h16')}
      </button>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-16 z-40 border-b border-slate-200 bg-white px-4 py-3 shadow-lg md:hidden"
        >
          <ul className="space-y-1">
            {[...studentItems, adminItem].map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end ?? false}
                  className={mobileLink}
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}
