"use client";

import { useEffect, useState } from "react";
import { LogOut, Settings, User, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { logout } from "@/lib/actions/auth";
import { getCurrentUser } from "@/lib/actions/users/user.actions";
import MobileSidebar from "@/components/shared-ui/MobileSidebar";
import NotificationDropdown from "@/components/shared-ui/NotificationDropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePageHeader } from "@/components/shared-ui/page-heading";
import { UserRole, ROLES, getBaseRoute } from "@/lib/constants/roles";
import { useRouter } from "next/navigation";

interface CurrentUser {
  user_id:       string;
  first_name?:    string;
  last_name?:     string;
  account_name?:  string;
  email:         string;
  profile_image?: string | null;
  role:          { role_name: string } | null;
  userType?:     'staff' | 'consumer';
}

type HeaderProps = {
  role: UserRole | null;
};

const Header = ({ role }: HeaderProps) => {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { title, description } = usePageHeader();

  useEffect(() => {
    const fetchUser = async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = () => {
    if (!currentUser) return "?";

    // For consumers, use account_name
    if (currentUser.userType === 'consumer' && currentUser.account_name) {
      const parts = currentUser.account_name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      if (parts.length === 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }

    // For staff, use first_name and last_name
    if (currentUser.first_name && currentUser.last_name) {
      return `${currentUser.first_name[0]}${currentUser.last_name[0]}`.toUpperCase();
    }

    return "?";
  };

  const getDisplayName = () => {
    if (!currentUser) return "Loading...";

    // For consumers, use account_name
    if (currentUser.userType === 'consumer' && currentUser.account_name) {
      return currentUser.account_name;
    }

    // For staff, use first_name + last_name
    if (currentUser.first_name && currentUser.last_name) {
      return `${currentUser.first_name} ${currentUser.last_name}`;
    }

    return currentUser.email || "User";
  };

  const fullName = getDisplayName();
  const roleName     = currentUser?.role?.role_name ?? "";
  const email        = currentUser?.email ?? "";
  const profileImage = currentUser?.profile_image ?? undefined;
  const baseRoute    = getBaseRoute(role);

  const roleBadgeClass =
    roleName.toLowerCase() === "admin"
      ? "bg-purple-100 text-purple-700 ring-purple-200"
      : roleName.toLowerCase() === "consumer"
      ? "bg-teal-100 text-teal-700 ring-teal-200"
      : roleName.toLowerCase() === "staff"
      ? "bg-blue-100 text-blue-700 ring-blue-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-3 backdrop-blur-md dark:border-border dark:bg-card/80 sm:h-16 sm:px-4 lg:px-6">

      {/* Left: Mobile sidebar + page title */}
      <div className="flex items-center gap-2 flex-1 min-w-0 sm:gap-3">
        <MobileSidebar role={role} />

        {title ? (
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base">{title}</h1>
            {description ? (
              <p className="hidden truncate text-xs text-muted-foreground sm:block">{description}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Right: Notifications + User */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <ThemeToggle />

        {/* Notification bell — role drives all routing internally */}
        <NotificationDropdown role={role} />

        {/* Vertical divider */}
        <div className="hidden h-6 w-px bg-slate-200 mx-1 sm:block" />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-slate-100 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-purple-400 group">
              <div className="relative">
                <Avatar className="h-8 w-8 ring-2 ring-white shadow-sm">
                  <AvatarImage
                    src={profileImage}
                    alt={fullName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-700 text-white text-xs font-bold">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                {/* Online indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              <div className="hidden md:flex flex-col items-start min-w-0">
                <span className="text-sm font-semibold text-slate-800 leading-tight truncate max-w-[120px]">
                  {fullName}
                </span>
                {roleName && (
                  <span
                    className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ring-1 leading-none mt-0.5 ${roleBadgeClass}`}
                  >
                    {roleName}
                  </span>
                )}
              </div>
              <svg
                className="h-3.5 w-3.5 text-slate-400 hidden md:block transition-transform duration-200 group-data-[state=open]:rotate-180"
                viewBox="0 0 12 12"
                fill="none"
              >
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-64 rounded-md border-slate-200 shadow-xl shadow-slate-200/60 p-0 overflow-hidden"
            align="end"
            sideOffset={8}
          >
            {/* User info header */}
            <div className="bg-gradient-to-br from-purple-600 to-purple-800 px-4 py-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 ring-2 ring-white/30 shadow-lg">
                  <AvatarImage
                    src={profileImage}
                    alt={fullName}
                    className="object-cover"
                  />
                  <AvatarFallback className="bg-white/20 text-white font-bold text-sm backdrop-blur-sm">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-white leading-tight truncate">
                    {fullName}
                  </span>
                  <span className="text-xs text-purple-200/80 truncate mt-0.5">
                    {email}
                  </span>
                  {roleName && (
                    <span className="mt-1 inline-flex w-fit items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md bg-white/20 text-white/90 ring-1 ring-white/20">
                      {roleName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <DropdownMenuGroup>

                {/* Profile — routes to /{role}/profile */}
                <DropdownMenuItem
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer group hover:bg-slate-50 focus:bg-slate-50"
                  onClick={() => router.push(`${baseRoute}/profile`)}
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                    <User className="h-3.5 w-3.5 text-slate-500 group-hover:text-purple-600 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Profile</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 ml-auto" />
                </DropdownMenuItem>

                {/* Settings — routes to /{role}/settings */}
                <DropdownMenuItem
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer group hover:bg-slate-50 focus:bg-slate-50"
                  onClick={() => router.push(`${baseRoute}/settings`)}
                >
                  <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                    <Settings className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-600 transition-colors" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">Settings</span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 ml-auto" />
                </DropdownMenuItem>

              </DropdownMenuGroup>

              <DropdownMenuSeparator className="my-1.5 bg-slate-100" />

              <DropdownMenuItem
                className="flex items-center gap-3 rounded-md px-3 py-2.5 cursor-pointer group hover:bg-red-50 focus:bg-red-50 dark:hover:bg-destructive/15 dark:focus:bg-destructive/15 dark:data-[highlighted]:bg-destructive/15"
                onClick={handleLogout}
              >
                <div className="h-7 w-7 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 dark:group-hover:bg-destructive/20 transition-colors">
                  <LogOut className="h-3.5 w-3.5 text-slate-500 group-hover:text-red-500 transition-colors" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  Log out
                </span>
                <kbd className="ml-auto text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded-md">
                  ⇧⌘Q
                </kbd>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;