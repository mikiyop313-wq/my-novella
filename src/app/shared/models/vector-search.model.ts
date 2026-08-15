export type VectorSearchSetting = 'global' | 'enabled' | 'disabled';

export function isVectorSearchSetting(value: unknown): value is VectorSearchSetting {
  return value === 'global' || value === 'enabled' || value === 'disabled';
}
