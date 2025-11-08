/**
 * Centralized variant ID utilities to ensure consistency across the application
 */
export type VariantId = string | number;

/**
 * Normalize variant ID to string for consistent comparisons
 */
export function normalizeVariantId(id: VariantId | undefined | null): string {
  if (id === null || id === undefined) {
    return "";
  }
  return String(id);
}

/**
 * Compare two variant IDs safely
 */
export function compareVariantIds(
  id1: VariantId | undefined | null,
  id2: VariantId | undefined | null,
): boolean {
  return normalizeVariantId(id1) === normalizeVariantId(id2);
}

/**
 * Extract variant ID from variant details object
 * Handles the confusion between mapping.id and variant.id
 */
export function extractVariantId(variantDetail: any): string {
  // Priority: variantId (actual variant) > id (could be mapping ID)
  return normalizeVariantId(variantDetail?.variantId || variantDetail?.id);
}

/**
 * Extract mapping ID from variant details object
 */
export function extractMappingId(variantDetail: any): string {
  // For mapping operations, we need the mapping ID (not the variant ID)
  return normalizeVariantId(variantDetail?.id);
}

/**
* Recursively converts MongoDB ObjectIds to strings.
* Useful before returning data to client or serializing to JSON.
*/
export function normalizeId(id: any): string {
 if (id == null) return id;

 if (typeof id === 'object' && 'buffer' in id && id.buffer instanceof Uint8Array) {
  // build mode: you kept it as an ObjectId
  return Array.from(id.buffer, b => b.toString(16).padStart(2, '0')).join('');
} else if (typeof id === 'string') {
  // dev/watch mode: serialized to string
  return id;
}

 // Primitive types stay the same
 return id;
}