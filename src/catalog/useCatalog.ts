import { useSyncExternalStore } from 'react';
import { allCatalog, catalogVersion, onCatalogChange, type CatalogItem } from './catalog';

/** Re-renders when imported models are added or removed; returns a number that changes each time. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(onCatalogChange, catalogVersion);
}

let listed: { version: number; items: CatalogItem[] } | null = null;
/** Everything that can be placed, imported models included, kept up to date. */
export function useCatalog(): CatalogItem[] {
  const version = useCatalogVersion();
  if (!listed || listed.version !== version) listed = { version, items: allCatalog() };
  return listed.items;
}
