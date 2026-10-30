import { 
  LayoutDashboard, 
  Users, 
  MapPin, 
  Receipt,
  History,
  AlertCircle,
  Wrench,
  CreditCard,
  BookOpen,
  ScanLine,
  ScrollText,
  BadgeDollarSign,
  Users2,
  BellRing,
  ArrowRightLeft,
  FileWarning, 
  FileDiff,
  ClipboardList,
  Gauge,
  UserCog,
  AlertTriangle,
  Zap,
  WifiOff,
  ClipboardCheck,
  ShieldAlert,
  Droplets,
} from 'lucide-react';
import { ROLES, UserRole } from '@/lib/constants/roles';

export type NavLink = {
  href: string;
  icon: React.ElementType;
  label: string;
};

export type NavSection = {
  title: string;
  navLink: NavLink[];
};

export const getRoleBasedNavigation = (role: UserRole): NavSection[] => {
  const baseRoute = 
    role === ROLES.ADMIN        ? '/admin'        : 
    role === ROLES.CLERK        ? '/clerk'        : 
    role === ROLES.TREASURER    ? '/treasurer'    :
    role === ROLES.PLUMBER      ? '/plumber'      :
    role === ROLES.METER_READER ? '/meter-reader' :
    role === ROLES.CONSULTANT   ? '/consultant'   : 
    role === ROLES.CONSUMER     ? '/'             : 
    '/';

  // ── ADMIN ──────────────────────────────────────────────────────────
  const adminNav: NavSection[] = [
    {
        title: "Overview",
        navLink: [
          { href: `${baseRoute}/dashboard`,       icon: LayoutDashboard, label: "Dashboard"      },
        ]
      },
      {
        title: "Registration",
        navLink: [
          { href: `${baseRoute}/consumers`,        icon: BookOpen,        label: "Consumers"        },
          { href: `${baseRoute}/meter-account`, icon: BadgeDollarSign, label: "Meter Account" },
        ]
      },
      {
        title: "Operations",
        navLink: [
        { href: `${baseRoute}/billing`,              icon: Receipt,         label: "Billing"                 },
         { href: `${baseRoute}/meter-reading`,             icon: ScanLine,      label: "Meter Readings" },
        { href: `${baseRoute}/transactions`,         icon: History,         label: "All Transactions"        },
        { href: `${baseRoute}/adjustments`,          icon: FileDiff,        label: "Adjustment"               },
        { href: `${baseRoute}/job-orders`,           icon: ClipboardList,   label: "Job Order"                },
        { href: `${baseRoute}/job-assignments`, icon: Users2, label: "Job Assignments" },
        { href: `${baseRoute}/request-job-orders`,   icon: ClipboardCheck,  label: "Requests Job Order"       },
        { href: `${baseRoute}/meter-installments`,   icon: Wrench,          label: "Meter Installments"       },
        { href: `${baseRoute}/meter-transfers`,      icon: ArrowRightLeft,  label: "Meter Transfers"          },
        { href: `${baseRoute}/service-reports`, icon: AlertTriangle, label: "Service Reports" },
        { href: `${baseRoute}/notice-disconnection`, icon: BellRing,        label: "Notice of Disconnection"  },
        ]
      },
      {
        title: "Set Up",
        navLink: [
          { href: `${baseRoute}/users`,           icon: Users,           label: "Users"           },
          { href: `${baseRoute}/location`,        icon: MapPin,          label: "Locations"       },
          { href: `${baseRoute}/assignment`,      icon: UserCog,         label: "Assignment"      },
          { href: `${baseRoute}/service-rates`, icon: Gauge, label: "Service Rates" }
        ]
      },
      {
        title: "Logs",
        navLink: [
          { href: `${baseRoute}/audit-logs`,   icon: History,      label: "Audit Logs"        },
          { href: `${baseRoute}/rate-limits`,  icon: ShieldAlert,  label: "Rate Limit Blocks"  },
        ]
      }
    ];

  // ── CLERK ───────────────────────────────────────────────────────────
  const clerkNav: NavSection[] = [
    {
      title: "Overview",
      navLink: [
        { href: `${baseRoute}/dashboard`, icon: LayoutDashboard, label: "Dashboard" },
      ]
    },
    {
      title: "Operations",
      navLink: [
        { href: `${baseRoute}/consumers`,        icon: BookOpen,        label: "Consumers"        },
        { href: `${baseRoute}/meter-account`, icon: BadgeDollarSign, label: "Meter Account" },
        { href: `${baseRoute}/billing`,              icon: Receipt,         label: "Billing"                 },
        { href: `${baseRoute}/adjustments`,            icon: AlertCircle,    label: "Reading Adjustments" },
        { href: `${baseRoute}/leak-bill-adjustments`,  icon: Droplets,       label: "Leak Bill Adjustments" },
        { href: `${baseRoute}/meter-reading`,          icon: ScanLine,       label: "Meter Readings" },
        { href: `${baseRoute}/request-job-orders`,     icon: ClipboardCheck, label: "Requests Job Order" },
        { href: `${baseRoute}/meter-installments`,   icon: Wrench,          label: "Meter Installments"       },
        { href: `${baseRoute}/meter-transfers`,      icon: ArrowRightLeft,  label: "Meter Transfers"          },
        { href: `${baseRoute}/notice-disconnection`, icon: BellRing,        label: "Notice of Disconnection"  },
      ]
    },
  ];

  // ── CONSULTANT ──────────────────────────────────────────────────────
  const consultantNav: NavSection[] = [
    {
      title: "Overview",
      navLink: [
        { href: `${baseRoute}/dashboard`, icon: LayoutDashboard, label: "Dashboard" },
      ]
    },
    {
      title: "Job Orders",
      navLink: [
        { href: `${baseRoute}/job-orders`,         icon: Wrench, label: "Job Order"   },
        { href: `${baseRoute}/job-assignments`, icon: Users2, label: "Job Assignments" },
        { href: `${baseRoute}/service-reports`, icon: AlertTriangle, label: "Service Reports" },
      ]
    },
  ];

  // ── TREASURER ───────────────────────────────────────────────────────
  const treasurerNav: NavSection[] = [
    {
      title: "Overview",
      navLink: [
        { href: `${baseRoute}/dashboard`, icon: LayoutDashboard, label: "Dashboard" },
      ]
    },
    {
      title: "Payments",
      navLink: [
        { href: `${baseRoute}/connection-fee`,      icon: CreditCard, label: "Connection Fees" },
        { href: `${baseRoute}/payment-billing`,  icon: Receipt,    label: "Billing Payment"   },
        { href: `${baseRoute}/reconnection-payment`,      icon: CreditCard, label: "Reconnection Payment" },
      ]
    },
    {
      title: "Records",
      navLink: [
        { href: `${baseRoute}/transactions`, icon: History,     label: "All Transactions"    },
      ]
    },
    {
      title: "Adjustments",
      navLink: [
        { href: `${baseRoute}/adjustments`, icon: FileWarning, label: "Adjustment Requests" },
      ]
    },
  ];
  
  // ── METER READER ────────────────────────────────────────────────────
    const meterReaderNav: NavSection[] = [
      {
        title: "Overview",
        navLink: [
          { href: `${baseRoute}/dashboard`, icon: LayoutDashboard, label: "Dashboard" },
        ]
      },
      {
        title: "Field Work",
        navLink: [
          { href: `${baseRoute}/job-order`,      icon: ScrollText,   label: "Job Orders" },
        ]
      },
      {
          title: "Meter Reading",
          navLink: [
            { href: `${baseRoute}/meter-readings`,             icon: ScanLine,      label: "Meter Readings" },
            { href: `${baseRoute}/reading-adjustment`,   icon: FileDiff,      label: "Reading Adjustments" },
            { href: `${baseRoute}/service-reports`, icon: AlertTriangle, label: "Service Reports" },
          ]
        },
      {
        title: "Information",
        navLink: [
          { href: `${baseRoute}/consumers`, icon: BookOpen, label: "Consumers" },
        ]
      },
    ];

  // ── PLUMBER ─────────────────────────────────────────────────────────
  const plumberNav: NavSection[] = [
    {
      title: "Overview",
      navLink: [
        { href: `${baseRoute}/dashboard`, icon: LayoutDashboard, label: "Dashboard" },
      ]
    },
    {
      title: "Work",
      navLink: [
        { href: `${baseRoute}/job-order`, icon: ScrollText, label: "Job Orders" },
      ]
    },
  ];

  // ── CONSUMER ────────────────────────────────────────────────────────
  const consumerNav: NavSection[] = [
    {
      title: "Overview",
      navLink: [
        { href: `/`, icon: LayoutDashboard, label: "Dashboard" },
      ]
    },
    {
      title: "Services",
      navLink: [
        { href: `/meter-accounts`, icon: BadgeDollarSign, label: "Meter Accounts" },
        { href: `/billing`,           icon: Receipt,    label: "Billing"            },
        { href: `/service-reports`, icon: AlertTriangle, label: "Service Reports" },
        { href: `/payment-history`,   icon: History,    label: "Payment History"    },
      ]
    },
  ];

  switch (role) {
    case ROLES.ADMIN:         return adminNav;
    case ROLES.CLERK:         return clerkNav;
    case ROLES.CONSULTANT:    return consultantNav;
    case ROLES.TREASURER:     return treasurerNav;
    case ROLES.METER_READER:  return meterReaderNav;
    case ROLES.PLUMBER:       return plumberNav;
    case ROLES.CONSUMER:      return consumerNav;
    default:                  return [];
  }
};