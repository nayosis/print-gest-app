import { Project } from "../model/project";

export function displayName(p: Project): string {
  return p.title ?? p.name;
}

export function toCamelCasePreview(s: string): string {
  const words = s.trim().split(/\s+/);
  if (!words[0]) return "";
  return (
    words[0].toLowerCase() +
    words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("")
  );
}

export function toolName(path: string): string {
  return path.split(/[\\/]/).at(-1)?.replace(/\.[^.]+$/, "") ?? path;
}

export function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sortedInsert(list: Project[], project: Project): Project[] {
  return [...list.filter((p) => p.path !== project.path), project].sort((a, b) =>
    displayName(a).toLowerCase().localeCompare(displayName(b).toLowerCase())
  );
}
