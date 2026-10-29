export interface Project {
  path: string;
  name: string;
}
export interface Remote {
  name: string;
  url: string;
}

export type Forge = 'github' | 'gitlab';
export type RequestState = 'open' | 'merged' | 'closed' | 'all';
export interface ChangeRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'merged' | 'closed' | 'locked';
  draft: boolean;
  sourceBranch: string;
  targetBranch: string;
  updatedAt: string;
  url: string;
  labels: string[];
}
export interface ChangeRequestPage {
  items: ChangeRequest[];
  nextCursor: string | null;
}
export interface RequestDetail {
  request: ChangeRequest;
  headOid: string;
  mergeStatus: string;
}
export interface RequestBranches {
  branches: string[];
  defaultBranch: string | null;
}
export interface RequestFile {
  path: string;
  previousPath: string | null;
  kind: string;
  additions: number;
  deletions: number;
  patch: string | null;
  truncated: boolean;
}
export interface RequestChanges {
  files: RequestFile[];
  headOid: string;
  nextCursor: string | null;
}
export type RequestOperation =
  | 'create'
  | 'comment'
  | 'approve'
  | 'requestChanges'
  | 'unapprove'
  | 'merge'
  | 'close'
  | 'reopen'
  | 'draft'
  | 'ready';
export interface RequestAction {
  operation: RequestOperation;
  number?: number;
  expectedHead?: string;
  expectedState?: string;
  expectedTarget?: string;
  message?: string;
  title?: string;
  sourceBranch?: string;
  targetBranch?: string;
  draft?: boolean;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

export interface OwnershipIssue {
  kind: 'ownership';
  path: string;
  message: string;
}
export type GitOperation =
  | 'stage'
  | 'unstage'
  | 'commit'
  | 'createBranch'
  | 'switchBranch'
  | 'syncBranch'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'addTag'
  | 'checkout'
  | 'cherryPick'
  | 'revert'
  | 'merge'
  | 'rebase'
  | 'reset'
  | 'continueOperation'
  | 'abortOperation'
  | 'stashPush'
  | 'stashApply'
  | 'stashPop'
  | 'stashDrop';
export type CommitOperation =
  'addTag' | 'createBranch' | 'cherryPick' | 'revert' | 'merge' | 'rebase' | 'reset';
export interface GitRequest {
  operation: GitOperation;
  files?: string[];
  message?: string;
  branch?: string;
  remoteBranch?: string;
  oid?: string;
  tag?: string;
  mode?: string;
  checkout?: boolean;
  mainline?: number;
  expectedHead?: string;
  expectedBranch?: string;
  expectedLocalOid?: string;
  stashIndex?: number;
  stashOid?: string;
  includeUntracked?: boolean;
  restoreIndex?: boolean;
}
export interface StashEntry {
  index: number;
  oid: string;
  message: string;
  date: string;
}
export interface Branch {
  name: string;
  oid: string;
  isHead: boolean;
  isRemote: boolean;
  localName?: string | null;
  upstream?: string | null;
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
  isWorktree?: boolean;
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
  stashes?: StashEntry[];
  remotes?: Remote[];
  operationState?: 'clean' | 'merge' | 'cherryPick' | 'revert' | 'rebase' | 'unsupported';
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
  sources?: PatchSource | null;
}
export interface PatchSource {
  oldSource?: string | null;
  newSource?: string | null;
}
