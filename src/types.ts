export interface Project {
  path: string;
  name: string;
}
export interface Branch {
  name: string;
  oid: string;
  isHead: boolean;
  isRemote: boolean;
}
export interface Commit {
  oid: string;
  shortId: string;
  author: string;
  email: string;
  date: string;
  message: string;
  fullMessage: string;
  parents: string[];
}
export interface Cell {
  kind: string;
  color: number;
  secondary: number;
}
export interface Row {
  commit: Commit | null;
  branches: string[];
  tags: string[];
  isHead: boolean;
  cells: Cell[];
}
export interface WorkingFile {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflict: boolean;
}
export interface Snapshot {
  project: Project;
  head: string | null;
  headOid: string | null;
  branches: Branch[];
  rows: Row[];
  maxLane: number;
  workingFiles: WorkingFile[];
  hasMore: boolean;
  commitCount: number;
  upstream: string | null;
  ahead: number;
  behind: number;
}
export interface ChangedFile {
  path: string;
  kind: string;
  insertions: number;
  deletions: number;
  binary: boolean;
}
export interface CommitDetail {
  commit: Commit;
  files: ChangedFile[];
  totalFiles: number;
}
export interface PatchLine {
  kind: string;
  oldLine: number | null;
  newLine: number | null;
  text: string;
}
export interface FilePatch {
  lines: PatchLine[];
  binary: boolean;
  truncated: boolean;
}
