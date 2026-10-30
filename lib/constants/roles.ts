// Role definitions
export const ROLES = {
  ADMIN: 'admin',
  CLERK: 'clerk',
  METER_READER: 'meter-reader',
  TREASURER: 'treasurer',
  PLUMBER: 'plumber',
  CONSULTANT: 'consultant',
  CONSUMER: 'consumer', // NEW: Public user (not in users table)
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

// Role-based route mapping
export const ROLE_ROUTES: Record<UserRole, string> = {
  [ROLES.ADMIN]: '/admin/dashboard',
  [ROLES.CLERK]: '/clerk/dashboard',
  [ROLES.METER_READER]: '/meter-reader/dashboard',
  [ROLES.TREASURER]: '/treasurer/dashboard',
  [ROLES.PLUMBER]: '/plumber/dashboard',
  [ROLES.CONSULTANT]: '/consultant/dashboard',
  [ROLES.CONSUMER]: '/', // NEW: Consumer dashboard
};

// Is user a staff member? (has roles in users table)
export const STAFF_ROLES: UserRole[] = [
  ROLES.ADMIN,
  ROLES.CLERK,
  ROLES.METER_READER,
  ROLES.TREASURER,
  ROLES.PLUMBER,
  ROLES.CONSULTANT,
];

// Is user a consumer/public?
export const PUBLIC_ROLES: UserRole[] = [ROLES.CONSUMER];

export const isStaffRole = (role: UserRole | null): boolean => {
  return role ? STAFF_ROLES.includes(role) : false;
};

export const isConsumerRole = (role: UserRole | null): boolean => {
  return role === ROLES.CONSUMER;
};


export function getBaseRoute(role: UserRole | null): string {
  switch (role) {
    case ROLES.ADMIN:        return "/admin";
    case ROLES.CLERK:        return "/clerk";
    case ROLES.CONSULTANT:   return "/consultant";
    case ROLES.TREASURER:    return "/treasurer";
    case ROLES.PLUMBER:      return "/plumber";
    case ROLES.METER_READER: return "/meter-reader";
    case ROLES.CONSUMER:     return "";
    default:                 return "";
  }
}
