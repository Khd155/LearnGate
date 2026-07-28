// Display-only "أ | <name>" prefix wherever an admin/supervisor's name is
// shown in this dashboard — never applied to the stored name itself.
export function adminLabel(name: string | null | undefined): string {
  return name ? `أ | ${name}` : (name ?? '');
}
