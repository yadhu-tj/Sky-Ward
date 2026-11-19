/** Track overlapping thumbs; releasing one must not cancel the other. */
export class TouchSteering {
  private pointers = new Map<number, -1 | 1>();

  press(id: number, direction: -1 | 1): -1 | 1 {
    this.pointers.delete(id);
    this.pointers.set(id, direction);
    return direction;
  }

  release(id: number): -1 | 0 | 1 {
    this.pointers.delete(id);
    return Array.from(this.pointers.values()).pop() ?? 0;
  }

  clear() { this.pointers.clear(); }
}
