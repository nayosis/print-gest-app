import { PrintSession } from "./session";

export interface Project {
  name: string;
  title: string | null;
  tags: string[];
  path: string;
  f3d_files: string[];
  files_3mf: string[];
  stl_files: string[];
  mp4_files: string[];
  markdown_content: string | null;
  status: string;
  sessions: PrintSession[];
  quantity: number;
  design_time_h: number;
  design_rate: number;
  selling_price: number;
}

export interface FolderNode {
  name: string;
  path: string;
  project: Project | null;
  children: FolderNode[];
}

export function flattenProjects(node: FolderNode): Project[] {
  const result: Project[] = [];
  if (node.project) result.push(node.project);
  for (const child of node.children) result.push(...flattenProjects(child));
  return result;
}

export function updateProjectInTree(node: FolderNode, updated: Project): FolderNode {
  if (node.project?.path === updated.path) return { ...node, project: updated };
  return { ...node, children: node.children.map(c => updateProjectInTree(c, updated)) };
}

export interface PrintInfo {
  print_time: string | null;
  weight_g: number | null;
}

export interface ThumbnailMap {
  [filename: string]: string | null;
}
