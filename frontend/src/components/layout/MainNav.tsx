import { NavLink } from 'react-router';
import { routes } from '../../utils/routes';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: 'Student Portal',
    items: [
      { to: routes.classes, label: 'Classes', end: true },
      { to: routes.myApplications, label: 'My applications' },
    ],
  },
  {
    label: 'Admin',
    items: [{ to: routes.createClass, label: 'Create class' }],
  },
];

function linkClass({ isActive }: { isActive: boolean }): string {
  return `rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
    isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`;
}

export function MainNav() {
  return (
    <nav aria-label="Main" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      {sections.map((section) => (
        <div key={section.label} className="flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {section.label}
          </span>
          <ul className="flex gap-1">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end ?? false} className={linkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
