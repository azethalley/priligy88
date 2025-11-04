import type { CollectionConfig } from 'payload'
import { slugField } from '../utils/slug'
import { calculateTotalStock } from '../utils/stockUtils'

// Helper function to normalize IDs (handles Buffer/ObjectId, string, number, or object with id)
function normalizeId(id: any): string | number {
  // Handle Buffer (MongoDB ObjectId binary format)
  if (Buffer.isBuffer(id)) {
    return id.toString('hex')
  }
  
  // Handle object with id property
  if (typeof id === 'object' && id !== null && 'id' in id) {
    return normalizeId(id.id)
  }
  
  // Handle string or number
  if (typeof id === 'string' || typeof id === 'number') {
    return id
  }
  
  // Fallback: try to convert to string
  return String(id)
}

// Helper function to calculate total stock from variant mappings
async function calculateTotalStockFromMappings(
  variantMappings:
    | (number | string | { id: number | string; quantity?: number; isActive?: boolean })[]
    | null
    | undefined,
  payloadInstance: any, // Accept payload instance directly instead of req
): Promise<number> {
  if (!variantMappings || variantMappings.length === 0) {
    return 0
  }

  if (!payloadInstance) {
    console.warn('Payload instance not available for totalStock calculation')
    return 0
  }

  try {
    // Check if variantMappings are already populated with quantity and isActive
    // If they are, we can calculate directly without fetching
    const firstMapping = variantMappings[0]
    if (
      typeof firstMapping === 'object' &&
      firstMapping !== null &&
      'quantity' in firstMapping &&
      'isActive' in firstMapping
    ) {
      // Already populated - calculate directly
      // Filter to only objects with quantity and isActive, then cast for calculateTotalStock
      const populatedMappings = variantMappings
        .filter((m) => typeof m === 'object' && m !== null && 'quantity' in m && 'isActive' in m)
        .map((m) => m as { quantity?: number; isActive?: boolean })
      return calculateTotalStock(populatedMappings as any[])
    }

    // Need to fetch mapping documents - extract and normalize IDs
    const mappingIds = variantMappings.map((mapping) => normalizeId(mapping)).filter(Boolean)

    const mappings = await payloadInstance.find({
      collection: 'product-variant-mappings',
      where: {
        id: { in: mappingIds },
      },
      limit: 1000,
      depth: 0,
    })

    // Use the centralized calculation function
    return calculateTotalStock(mappings.docs)
  } catch (error) {
    console.error('Error calculating total stock:', error)
    return 0
  }
}

const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'originalPrice', 'totalStock', 'published'],
    group: 'Product Management',
    listSearchableFields: ['title', 'slug'],
    pagination: {
      defaultLimit: 25,
      limits: [10, 25, 50],
    },
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      label: 'Featured Image',
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
      hasMany: false,
    },
    slugField('products', 'title'),
    {
      name: 'description',
      type: 'richText',
    },
    {
      name: 'discountedPrice',
      type: 'number',
      required: false,
    },
    {
      name: 'originalPrice',
      type: 'number',
      required: true,
    },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'media',
      required: false,
      hasMany: true,
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'product-categories',
      required: true,
    },

    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'product-tags',
      hasMany: true,
    },
    {
      name: 'brand',
      type: 'relationship',
      relationTo: 'brands',
    },
    {
      name: 'additionalData',
      type: 'richText',
      label: 'Additional Information (optional)',
    },
    // Virtual/computed on read – see collection afterRead hook
    {
      name: 'variantDetails',
      type: 'array',
      admin: {
        readOnly: true,
        description: 'Computed from active variant mappings. Not persisted.',
      },
      access: {
        create: () => false,
        update: () => false,
      },
      fields: [
        { name: 'id', type: 'text' },
        { name: 'variantId', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'price', type: 'number' },
        { name: 'stock', type: 'number' },
        { name: 'sku', type: 'text' },
        { name: 'isDefault', type: 'checkbox' },
        { name: 'availableForSale', type: 'checkbox' },
        { name: 'category', type: 'text' },
        { name: 'active', type: 'checkbox' },
      ],
    },
    {
      name: 'variantMappings',
      type: 'relationship',
      relationTo: 'product-variant-mappings',
      hasMany: true,
      label: 'Attached Variants',
      admin: {
        description:
          'Variants attached to this product with quantities. Use the Product Variant Mappings collection to manage these.',
      },
      filterOptions: ({ id }) => {
        // Only show product variant mappings that belong to the current product
        // This prevents users from adding mappings that belong to other products
        if (id) {
          return {
            product: {
              equals: id,
            },
          }
        }
        // For new products (no ID yet), show no options until product is saved
        return false
      },
    },

    {
      name: 'totalStock',
      type: 'number',
      admin: {
        readOnly: true,
        description: 'Auto-calculated: sum of all variant quantities',
      },
    },

    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
  hooks: {
    // Only calculate totalStock when reading products - no expensive variant population
    afterRead: [
      async ({ doc, req }) => {
        // Preserve the stored totalStock value as fallback
        const storedTotalStock = doc.totalStock ?? 0
        
        // Get payload instance - try req.payload first, then req if it's a payload instance
        const payloadInstance = req?.payload || req
        
        // Only calculate if we have variantMappings AND payload instance is available
        if (doc.variantMappings && payloadInstance) {
          try {
            // Only calculate total stock - this is lightweight and needed for admin
            const calculatedStock = await calculateTotalStockFromMappings(doc.variantMappings, payloadInstance)
            
            // Always use calculated value when calculation succeeds (even if 0, as that's accurate)
            doc.totalStock = calculatedStock

            // Don't populate variantDetails here - use API endpoint instead for better performance
            doc.variantDetails = []
          } catch (error) {
            console.error('Error calculating totalStock in afterRead hook:', error)
            // Preserve stored value if calculation fails
            doc.totalStock = storedTotalStock
            doc.variantDetails = []
          }
        } else {
          doc.variantDetails = []
          // If no variantMappings or no payload instance, preserve stored value instead of setting to 0
          // Only set to 0 if we explicitly know there are no variant mappings
          if (!doc.variantMappings || doc.variantMappings.length === 0) {
            doc.totalStock = 0
          } else {
            // variantMappings exists but payload instance is not available - preserve stored value
            // This can happen when fetching via payloadClient.find() without req context
            // However, if stored value is 0 but mappings exist, this might be a data inconsistency
            // In production, we rely on the stored value which should be updated via afterChange hook
            if (storedTotalStock === 0 && doc.variantMappings.length > 0) {
              console.warn(
                `Product ${doc.id} has variantMappings but totalStock is 0. This may indicate a calculation issue.`,
              )
            }
            doc.totalStock = storedTotalStock
          }
        }
        return doc
      },
    ],
    // Update totalStock when product is created or updated
    afterChange: [
      async ({ doc, req, operation: _operation }) => {
        if (doc.variantMappings) {
          const payloadInstance = req?.payload || req
          if (payloadInstance) {
            const totalStock = await calculateTotalStockFromMappings(doc.variantMappings, payloadInstance)

            // Only update if totalStock has changed to avoid infinite loops
            if (doc.totalStock !== totalStock) {
              await payloadInstance.update({
                collection: 'products',
                id: doc.id,
                data: { totalStock },
                overrideAccess: true,
              })
            }
          }
        }
        return doc
      },
    ],
  },
}

export default Products
