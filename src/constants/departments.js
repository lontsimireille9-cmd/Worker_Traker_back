export const DEPARTMENTS = [
  { value: 'PROJECT', label: 'Département projet', description: 'Projets, sections, tâches et échéances.' },
  { value: 'SALES', label: 'Département de vente', description: 'Ventes, chiffre d’affaires et objectifs commerciaux.' },
  { value: 'MARKETING', label: 'Département marketing', description: 'Prospects, leads, conversions et campagnes.' },
  { value: 'FINANCE', label: 'Département financier', description: 'Chiffre d’affaires, dépenses et résultat.' },
  { value: 'LOGISTICS', label: 'Département logistique', description: 'Commandes, livraisons, délais et incidents.' },
  { value: 'STOCK', label: 'Département stock', description: 'Entrées, sorties, stock disponible et ruptures.' },
  { value: 'PRODUCTION', label: 'Département production', description: 'Production, objectifs, défauts et délais.' },
  { value: 'HR', label: 'Département ressources humaines', description: 'Recrutements, formations, absences et effectifs.' },
  { value: 'CUSTOMER_SERVICE', label: 'Département service client', description: 'Demandes, tickets, résolution et satisfaction.' },
  { value: 'ADMIN', label: 'Département administratif', description: 'Dossiers, traitements, délais et conformité.' },
  { value: 'IT', label: 'Département informatique', description: 'Incidents, développements, corrections et disponibilité.' },
  { value: 'OTHER', label: 'Autre département', description: 'Activité personnalisée.' },
];

export const LEGACY_DEPARTMENT_MAP = {
  'Développement numérique': 'PROJECT',
  'Developpement numerique': 'PROJECT',
  'Développement numérique ': 'PROJECT',
  'Développement': 'PROJECT',
  'Vente': 'SALES',
  'vente': 'SALES',
};

export function normalizeDepartment(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'PROJECT';
  if (LEGACY_DEPARTMENT_MAP[raw]) return LEGACY_DEPARTMENT_MAP[raw];
  if (DEPARTMENTS.some((d) => d.value === raw)) return raw;
  const found = DEPARTMENTS.find((d) => d.label.toLowerCase() === raw.toLowerCase());
  return found?.value || 'OTHER';
}

export function getDepartmentDefinition(value) {
  const key = normalizeDepartment(value);
  return DEPARTMENTS.find((d) => d.value === key) || DEPARTMENTS[DEPARTMENTS.length - 1];
}
