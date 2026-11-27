type Listener = (isLocked: boolean, count: number) => void;

const activeTokens = new Set<symbol>();
const listeners = new Set<Listener>();

function emit(): void {
  const count = activeTokens.size;
  const locked = count > 0;
  listeners.forEach((fn) => {
    try {
      fn(locked, count);
    } catch {
      // ignore subscriber error
    }
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('themaster:fullscreen-change', {
          detail: { locked, count },
        })
      );
    } catch {
      // ignore custom event failure in constrained envs
    }
  }
}

export function acquireFullscreenLock(): symbol {
  const token = Symbol('fullscreen-lock');
  activeTokens.add(token);
  emit();
  return token;
}

export function releaseFullscreenLock(token: symbol | null | undefined): void {
  if (!token) return;
  if (activeTokens.delete(token)) {
    emit();
  }
}

export function isFullscreenLocked(): boolean {
  return activeTokens.size > 0;
}

export function getFullscreenLockCount(): number {
  return activeTokens.size;
}

export function subscribeFullscreenLock(listener: Listener): () => void {
  listeners.add(listener);
  listener(activeTokens.size > 0, activeTokens.size);
  return () => {
    listeners.delete(listener);
  };
}
