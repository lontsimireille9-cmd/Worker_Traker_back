export const ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  EMPLOYEE: "EMPLOYEE",
});

export const ROLE_VALUES = Object.values(ROLES);

export const ROLE_HIERARCHY = Object.freeze({
  SUPER_ADMIN: 4,
  ADMIN: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
});

export function isValidRole(role) {
  return ROLE_VALUES.includes(role);
}
