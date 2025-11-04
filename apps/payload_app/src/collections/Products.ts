import type { CollectionConfig } from 'payload'
import { slugField } from '../utils/slug'
import { calculateTotalStock } from '../utils/stockUtils'

// Helper function to calculate total stock from variant mappings
async function calculateTotalStockFromMappings(
  variantMappings:
    | (number | { id: number; quantity: number; isActive: boolean })[]
    | null
    | undefined,
  req: { payload: any },
): Promise<number> {
  if (!variantMappings || variantMappings.length === 0) {
    return 0
  }

  try {
    // Get the actual mapping documents with quantities
    const mappingIds = variantMappings.map((mapping) =>
      typeof mapping === 'object' ? mapping.id : mapping,
    )

    const mappings = await req.payload.find({
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
        
        // Only calculate if we have variantMappings AND req.payload is available
        if (doc.variantMappings && req?.payload) {
          try {
            // Only calculate total stock - this is lightweight and needed for admin
            const calculatedStock = await calculateTotalStockFromMappings(doc.variantMappings, req)
            
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
          // If no variantMappings or no req.payload, preserve stored value instead of setting to 0
          // Only set to 0 if we explicitly know there are no variant mappings
          if (!doc.variantMappings) {
            doc.totalStock = 0
          } else {
            // variantMappings exists but req.payload is not available - preserve stored value
            doc.totalStock = storedTotalStock
          }
        }
        console.log("[TRACE] doc.totalStock = ", doc.totalStock)
        return doc
      },
    ],
    // Update totalStock when product is created or updated
    afterChange: [
      async ({ doc, req, operation: _operation }) => {
        if (doc.variantMappings) {
          const totalStock = await calculateTotalStockFromMappings(doc.variantMappings, req)

          // Only update if totalStock has changed to avoid infinite loops
          if (doc.totalStock !== totalStock) {
            await req.payload.update({
              collection: 'products',
              id: doc.id,
              data: { totalStock },
              overrideAccess: true,
            })
          }
        }
        console.log("[TRACE] doc.totalStock = ", doc.totalStock)
        return doc
      },
    ],
  },
}

export default Products
