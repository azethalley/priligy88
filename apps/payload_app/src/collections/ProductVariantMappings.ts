import type { CollectionConfig } from 'payload'
import { calculateTotalStock } from '../utils/stockUtils'
import { debouncedStockUpdate } from '../utils/debouncedStockUpdate'

const ProductVariantMappings: CollectionConfig = {
  slug: 'product-variant-mappings',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['product', 'variant', 'quantity', 'isDefault', 'createdAt'],
    description: 'Maps products to variants with quantities and default selection',
    group: 'Product Management',
    listSearchableFields: ['displayName'],
    pagination: {
      defaultLimit: 25,
      limits: [10, 25, 50],
    },
  },
  access: {
    // Allow delete only when not accessed from product context
    delete: ({ req }) => {
      // Check if the request is coming from a product page context
      const referer = (req.headers as any)?.referer || (req.headers as any)?.referrer || ''
      const isFromProductPage = referer.includes('/admin/collections/products/')

      // Allow deletion only if NOT from product page
      return !isFromProductPage
    },
  },
  fields: [
    {
      name: 'product',
      type: 'relationship',
      relationTo: 'products',
      required: true,
      label: 'Product',
      admin: {
        description:
          'The product this variant is attached to. Cannot be changed after creation to prevent inventory conflicts.',
        allowCreate: false,
      },
      access: {
        update: ({ doc }) => !Boolean(doc?.id), // Prevent updates after creation
      },
    },
    {
      name: 'variant',
      type: 'relationship',
      relationTo: 'product-variants',
      required: true,
      label: 'Variant',
      admin: {
        description: 'The variant being attached to the product. Cannot be changed after creation.',
        allowCreate: false,
      },
      access: {
        update: ({ doc }) => !Boolean(doc?.id), // Prevent updates after creation
      },
    },
    {
      name: 'quantity',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      label: 'Stock Quantity',
      admin: {
        description: 'Available stock for this variant on this product',
      },
    },
    {
      name: 'priceOverride',
      type: 'number',
      label: 'Price Override (optional)',
      admin: {
        description: 'Override the base variant price for this product',
      },
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      defaultValue: false,
      label: 'Default Variant',
      admin: {
        description: 'This variant will be auto-selected for this product',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active',
      admin: {
        description: 'Inactive mappings are not shown to customers',
      },
    },
    {
      name: 'displayName',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'Auto-generated display name: Product + Variant',
      },
      access: {
        create: () => false,
        update: () => false,
      },
    },
  ],
  timestamps: true,
  // Add database indexes for better performance
  indexes: [
    {
      fields: ['product', 'variant'],
      unique: true,
    },
    {
      fields: ['product', 'isActive'],
    },
    {
      fields: ['isActive', 'isDefault'],
    },
    {
      fields: ['product'],
    },
    {
      fields: ['variant'],
    },
  ],
  hooks: {
    // Validate that the same variant isn't mapped twice to the same product
    beforeValidate: [
      async ({ data, req, operation: _operation, originalDoc }) => {
        if (!data || !data.variant || !data.product) return data

        // For updates, prevent changing the product
        if (_operation === 'update' && originalDoc && originalDoc.product !== data.product) {
          throw new Error(
            'Cannot change the product of an existing variant mapping. Each variant mapping is tied to a specific product.',
          )
        }

        // Check if this exact product+variant combination already exists (for creates and updates)
        if (_operation === 'create' || (_operation === 'update' && originalDoc)) {
          const whereCondition: any = {
            and: [{ variant: { equals: data.variant } }, { product: { equals: data.product } }],
          }

          // For updates, exclude the current document
          if (_operation === 'update' && originalDoc?.id) {
            whereCondition.and.push({ id: { not_equals: originalDoc.id } })
          }

          const existingMapping = await req.payload.find({
            collection: 'product-variant-mappings',
            where: whereCondition,
            limit: 1,
          })

          if (existingMapping.docs.length > 0) {
            // Get product name for better error message
            let productName = 'this product'
            try {
              if (typeof data.product === 'object' && data.product.title) {
                productName = data.product.title
              } else if (typeof data.product === 'string' || typeof data.product === 'number') {
                const productDoc = await req.payload.findByID({
                  collection: 'products',
                  id: data.product,
                  select: { title: true },
                })
                productName = productDoc.title || 'this product'
              }
            } catch (error) {
              console.warn('Could not fetch product name for error message:', error)
            }

            // Get variant name for better error message
            let variantName = 'this variant'
            try {
              if (typeof data.variant === 'object' && data.variant.name) {
                variantName = data.variant.name
              } else if (typeof data.variant === 'string' || typeof data.variant === 'number') {
                const variantDoc = await req.payload.findByID({
                  collection: 'product-variants',
                  id: data.variant,
                  select: { name: true },
                })
                variantName = variantDoc.name || 'this variant'
              }
            } catch (error) {
              console.warn('Could not fetch variant name for error message:', error)
            }

            throw new Error(
              `The combination "${productName} + ${variantName}" already exists. Each product can only have one mapping per variant.`,
            )
          }
        }

        return data
      },
    ],
    // Generate display name and update product totalStock when variant mapping is created, updated, or deleted
    beforeChange: [
      async ({ data, req, operation: _operation }) => {
        // Generate display name
        if (data.product && data.variant) {
          const product =
            typeof data.product === 'object'
              ? data.product
              : await req.payload.findByID({
                  collection: 'products',
                  id: data.product,
                  select: { title: true },
                })

          const variant =
            typeof data.variant === 'object'
              ? data.variant
              : await req.payload.findByID({
                  collection: 'product-variants',
                  id: data.variant,
                  select: { name: true },
                })

          data.displayName = `${product.title} - ${variant.name}`
        }
        return data
      },
    ],
    // Generate display name for existing records when reading
    afterRead: [
      async ({ doc, req }) => {
        if (!doc.displayName && doc.product && doc.variant) {
          const product =
            typeof doc.product === 'object'
              ? doc.product
              : await req.payload.findByID({
                  collection: 'products',
                  id: doc.product,
                  select: { title: true },
                })

          const variant =
            typeof doc.variant === 'object'
              ? doc.variant
              : await req.payload.findByID({
                  collection: 'product-variants',
                  id: doc.variant,
                  select: { name: true },
                })

          doc.displayName = `${product.title} - ${variant.name}`
        }
        return doc
      },
    ],
    afterChange: [
      async ({ doc, req, operation: _operation }) => {
        try {
          if (!doc.product) return

          // Extract product ID (handle both populated and unpopulated cases)
          const productId = typeof doc.product === 'object' ? doc.product.id : doc.product
          if (!productId) return

          // Use debounced update to prevent excessive database calls
          debouncedStockUpdate(
            productId,
            async () => {
              // Use a more efficient approach - calculate from the current mapping
              // and get only the necessary data
              const productMappings = await req.payload.find({
                collection: 'product-variant-mappings',
                where: {
                  product: { equals: productId },
                },
                limit: 1000,
                depth: 0,
                select: {
                  quantity: true,
                  isActive: true,
                },
              })

              // Calculate total stock from active mappings using centralized function
              const totalStock = calculateTotalStock(productMappings.docs)

              // Only update if totalStock has changed to avoid unnecessary updates
              const currentProduct = await req.payload.findByID({
                collection: 'products',
                id: productId,
                select: {
                  totalStock: true,
                },
              })

              if (currentProduct.totalStock !== totalStock) {
                await req.payload.update({
                  collection: 'products',
                  id: productId,
                  data: { totalStock },
                  overrideAccess: true,
                })
              }
            },
            500,
          ) // 500ms delay
        } catch (error) {
          console.error('Error updating product totalStock:', error)
        }
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        try {
          if (!id) return

          // Get the mapping to find the product before deletion
          const mapping = await req.payload.findByID({
            collection: 'product-variant-mappings',
            id,
            depth: 0,
          })

          // Find products that reference this mapping in variantMappings
          const productsWithRef = await req.payload.find({
            collection: 'products',
            where: {
              variantMappings: { equals: id },
            },
            limit: 100,
            depth: 0,
          })

          for (const p of productsWithRef.docs || []) {
            const current = Array.isArray(
              (p as { variantMappings?: Array<number | { id: number }> }).variantMappings,
            )
              ? (p as { variantMappings: Array<number | { id: number }> }).variantMappings
              : []
            const filtered = current
              .map((val) =>
                typeof val === 'object' && val !== null ? (val as { id: number }).id : val,
              )
              .filter((val) => String(val) !== String(id))
              .map((val) => Number(val))

            await req.payload.update({
              collection: 'products',
              id: p.id,
              data: { variantMappings: filtered },
              overrideAccess: true,
            })
          }

          // Recalculate totalStock for the product that owned this mapping
          if (mapping?.product) {
            const productId =
              typeof mapping.product === 'object' ? mapping.product.id : mapping.product

            try {
              // Get all remaining mappings for this product (excluding the one being deleted)
              const remainingMappings = await req.payload.find({
                collection: 'product-variant-mappings',
                where: {
                  and: [
                    { product: { equals: productId } },
                    { id: { not_equals: id } }, // Exclude the mapping being deleted
                    { isActive: { equals: true } }, // Only count active mappings
                  ],
                },
                limit: 1000,
                depth: 0,
                select: {
                  quantity: true,
                },
              })

              const totalStock = calculateTotalStock(remainingMappings.docs)

              // Always update totalStock to ensure consistency
              await req.payload.update({
                collection: 'products',
                id: productId,
                data: { totalStock },
                overrideAccess: true,
              })

              console.log(`Updated totalStock for product ${productId}: ${totalStock}`)
            } catch (stockError) {
              console.error('Error updating totalStock after mapping deletion:', stockError)
            }
          }
        } catch (_e) {
          // ignore cleanup failures; deletion should proceed
        }
      },
    ],
  },
}

export default ProductVariantMappings
