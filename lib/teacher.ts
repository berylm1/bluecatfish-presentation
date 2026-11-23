// The lesson's teacher's name, for the parts of the page that show it (the class chat, the overlays): set by the lesson
// page from the lesson's profile (lib/canvas/profile.ts). Not set: Professor Marine
let name = 'Professor Marine';
export const teacherName = (): string => name;
export function setTeacherName(n: string): void { if (n.trim()) name = n.trim(); }
/** Initials for an avatar without a picture ("Professor Marine": PM) */
export const teacherInitials = (): string => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'T';
