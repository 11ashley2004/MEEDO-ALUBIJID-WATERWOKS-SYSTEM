'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { getRoleBasedNavigation } from '@/config/nav.links';
import { UserRole } from '@/lib/constants/roles';
import { cn } from '@/lib/utils';
import Image from "next/image";

type SidebarProps = {
  role: UserRole | null;
};

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

const Sidebar = ({ role }: SidebarProps) => {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const navigation = useMemo(() => {
    if (!role) return [];
    return getRoleBasedNavigation(role);
  }, [role]);

  if (!role || !mounted) return null;

  return (
    <aside className="hidden lg:flex flex-col w-[218px] h-screen flex-shrink-0 bg-white border-r border-gray-100 dark:bg-card dark:border-border z-40 select-none pb-8">

      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-100" style={{ padding: '16px 14px 14px' }}>
        <Link href="/" className="flex items-center gap-[10px]">
          <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center ring-1 ring-purple-100 flex-shrink-0">
            <Image
              src="/meedo-logo-removebg.png"
              alt="Logo"
              width={22}
              height={22}
              className="object-contain"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-gray-900 dark:text-foreground font-extrabold tracking-tight" style={{ fontSize: '13px' }}>MEEDO</span>
            <span className="text-gray-400 dark:text-muted-foreground font-medium uppercase" style={{ fontSize: '9px', letterSpacing: '1.6px' }}>Waterworks</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          'flex-1 overflow-y-auto py-2',
          '[&::-webkit-scrollbar]:w-[5px]',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:bg-gray-200',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          '[&::-webkit-scrollbar-thumb]:hover:bg-gray-300',
        )}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#e5e7eb transparent' }}
      >
        {navigation.map((section, idx) => (
          <div key={section.title}>

            {idx !== 0 && <div className="h-px bg-gray-100 mx-3 my-1" />}

            <p
              className="text-gray-400 dark:text-muted-foreground font-extrabold uppercase"
              style={{ fontSize: '9px', letterSpacing: '1.6px', padding: '13px 12px 2px' }}
            >
              {section.title}
            </p>

            <ul>
              {section.navLink.map((link) => {
                const active = matchesPath(pathname, link.href);

                return (
                  <li key={link.href} style={{ margin: '1px 6px' }}>
                    <Link
                      href={link.href}
                      className={`flex items-center gap-2 rounded-md transition-colors ${
                        active
                          ? 'bg-purple-600 text-white font-semibold'
                          : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700 dark:text-muted-foreground dark:hover:bg-accent dark:hover:text-accent-foreground'
                      }`}
                      style={{ padding: '7px 11px', fontSize: '12.5px' }}
                    >
                      <link.icon
                        className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-500 dark:text-muted-foreground'}`}
                        style={{ width: '15px', height: '15px' }}
                      />
                      <span className="truncate whitespace-nowrap">
                        {link.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

          </div>
        ))}
      </nav>

    </aside>
  );
};

export default Sidebar;