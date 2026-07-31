export type ZipInventoryFixtureCatalog = {
  name: 'normalized-source' | 'ignored-output' | 'lockfiles' | 'binary-and-large-text';
  purpose: string;
  syntheticOnly: true;
};
