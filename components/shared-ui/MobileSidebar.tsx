'use client';

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { getRoleBasedNavigation } from "@/config/nav.links";
import { UserRole } from "@/lib/constants/roles";
import { Button } from "../ui/button";
import Image from "next/image";
import { cn } from "@/lib/utils";

type MobileSidebarProps = {
  role: UserRole | null;
};

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

export default function MobileSidebar({ role }: MobileSidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const navigation = role ? getRoleBasedNavigation(role) : [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild className="lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl hover:bg-purple-50 transition-all duration-150 group"
        >
          <div className="flex flex-col items-center justify-center gap-[5px]">
            <span className="block h-[2px] w-5 rounded-full bg-gray-600 transition-all duration-300 group-hover:w-4 group-hover:bg-purple-600" />
            <span className="block h-[2px] w-3.5 rounded-full bg-gray-400 transition-all duration-300 group-hover:w-5 group-hover:bg-purple-500" />
            <span className="block h-[2px] w-5 rounded-full bg-gray-600 transition-all duration-300 group-hover:w-3 group-hover:bg-purple-600" />
          </div>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="p-0 w-64 flex flex-col bg-white border-r border-gray-100">
        <VisuallyHidden>
          <SheetTitle>Navigation Menu</SheetTitle>
        </VisuallyHidden>

        {/* Header - Matches web sidebar exactly */}
        <div className="flex h-16 items-center border-b border-gray-100 px-3 flex-shrink-0">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-[10px]">
            <div className="w-8 h-8 rounded-md bg-purple-50 flex items-center justify-center ring-1 ring-purple-100 flex-shrink-0">
              <Image
                src="/meedo-logo-removebg.png"
                alt="MEEDO Waterworks"
                width={22}
                height={22}
                className="object-contain"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-gray-900 font-extrabold tracking-tight" style={{ fontSize: '13px' }}>
                MEEDO
              </span>
              <span className="text-gray-400 font-medium uppercase" style={{ fontSize: '9px', letterSpacing: '1.6px' }}>
                Waterworks
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation - Matches web sidebar exactly */}
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
                className="text-gray-400 font-extrabold uppercase"
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
                        onClick={() => setOpen(false)}
                        className={`flex items-center gap-2 rounded-md transition-colors ${
                          active
                            ? 'bg-purple-600 text-white font-semibold'
                            : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                        }`}
                        style={{ padding: '7px 11px', fontSize: '12.5px' }}
                      >
                        <link.icon
                          className={`flex-shrink-0 ${active ? 'text-white' : 'text-gray-500'}`}
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
      </SheetContent>
    </Sheet>
  );
}