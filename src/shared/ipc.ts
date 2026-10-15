import type { Result, ProjectSnapshot, ProjectChange, Scope } from './model';
export type OpenedProject = { handle: string; snapshot: ProjectSnapshot };
export interface DramaAPI {
  initial(): Promise<Result<OpenedProject | null>>;
  create(name: string): Promise<Result<OpenedProject>>;
  open(): Promise<Result<OpenedProject>>;
  recent(): Promise<Result<{ name: string; path: string }[]>>;
  openRecent(path: string): Promise<Result<OpenedProject>>;
  read(handle: string): Promise<Result<ProjectSnapshot>>;
  commit(handle: string, changes: ProjectChange[]): Promise<Result<ProjectSnapshot>>;
  importAssets(handle: string): Promise<Result<ProjectSnapshot>>;
  exportProject(handle: string): Promise<Result<string>>;
  importProject(): Promise<Result<OpenedProject>>;
  backup(handle: string): Promise<Result<string>>;
  backups(handle: string): Promise<Result<{ id: string; createdAt: string }[]>>;
  restore(handle: string, id: string): Promise<Result<ProjectSnapshot>>;
  repair(handle: string, assetId: string): Promise<Result<ProjectSnapshot>>;
  saveText(name: string, text: string): Promise<Result<string>>;
  importMetrics(handle: string): Promise<Result<ProjectSnapshot>>;
  release(handle: string, scope: Scope): Promise<Result<string>>;
  openExternal(url: string): Promise<Result<void>>;
  onCloseRequest(callback: () => Promise<boolean>): () => void;
}
declare global {
  interface Window {
    drama: DramaAPI;
  }
}
