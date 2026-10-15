export class HandlePermissions {
  private owners = new Map<number, Set<string>>();
  grant(windowId: number, handle: string) {
    const set = this.owners.get(windowId) ?? new Set();
    set.add(handle);
    this.owners.set(windowId, set);
  }
  check(windowId: number, handle: string) {
    return this.owners.get(windowId)?.has(handle) ?? false;
  }
  revoke(windowId: number) {
    this.owners.delete(windowId);
  }
}
