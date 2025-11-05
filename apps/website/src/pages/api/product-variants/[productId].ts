import type { APIRoute } from "astro";
import { payload } from "@/lib/payload";

export const GET: APIRoute = async ({ params }) => {
  try {
    let { productId } = params;

    // console.log(`[API] Received productId param:`, productId, `Type:`, typeof productId);

    if (!productId) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Normalize productId to handle string format variations
    // MongoDB ObjectIds from URL params are already strings, but ensure consistency
    // Handle the case where productId might be "[object Object]" string
    if (String(productId) === "[object Object]") {
      // console.error(`[API] Received "[object Object]" as productId - this indicates the ID wasn't properly serialized`);
      return new Response(JSON.stringify({ error: "Invalid product ID format", variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    productId = String(productId).trim();
    // console.log(`[API] Normalized productId:`, productId);
    
    if (!productId) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payloadClient = await payload();
    // console.log(`[API] Payload client initialized, querying product...`);

    // First get the product to find its variant mappings
    // Use find instead of findByID for better ID format compatibility
    // Remove select to get all fields - variantMappings might need related fields
    // console.log(`[API] Starting product query with ID: ${productId}`);
    let result;
    try {
      // Use Promise.race to add a timeout
      const queryPromise = payloadClient.find({
        collection: "products",
        where: {
          id: { equals: productId },
        },
        // Don't use select - it might be causing issues with relationships
        limit: 1,
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout after 20 seconds')), 20000)
      );
      
      result = await Promise.race([queryPromise, timeoutPromise]) as any;
      // console.log(`[API] Product query completed, found ${result?.docs?.length || 0} products`);
    } catch (error) {
      // console.error(`[API] Error querying product:`, error);
      // console.error(`[API] Error message:`, error instanceof Error ? error.message : String(error));
      // console.error(`[API] Error stack:`, error instanceof Error ? error.stack : String(error));
      return new Response(
        JSON.stringify({ error: "Database query failed or timed out", variants: [] }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const product = result?.docs?.[0];

    if (!product) {
      // console.warn(`[API] Product with ID ${productId} not found`);
      return new Response(JSON.stringify({ variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // console.log(`[API] Product found: ${(product as any).title || product.id}`);
    // console.log(`[API] Product variantMappings:`, product.variantMappings);
    // console.log(`[API] Product variantMappings type:`, typeof product.variantMappings);
    // console.log(`[API] Product variantMappings length:`, product.variantMappings?.length);

    if (!product.variantMappings?.length) {
      // console.warn(`[API] Product ${productId} has no variant mappings`);
      return new Response(JSON.stringify({ variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the variant mappings with their associated variants
    // Normalize mapping IDs to handle Buffer objects (raw MongoDB ObjectIds), ObjectId objects, and string/number IDs
    const mappingIds = product.variantMappings.map((mapping: any) => {
      // Handle Buffer objects (raw MongoDB ObjectId in binary format)
      if (Buffer.isBuffer(mapping)) {
        // Convert Buffer to hex string (24 character ObjectId)
        const hexString = mapping.toString('hex');
        // console.log(`[API] Converted Buffer to hex string: ${hexString}`);
        return hexString;
      }
      
      // Handle populated objects with id property
      if (typeof mapping === "object" && mapping !== null) {
        // If it has an id property, check what type it is
        if (mapping.id !== undefined) {
          // Handle Buffer in id property
          if (Buffer.isBuffer(mapping.id)) {
            const hexString = mapping.id.toString('hex');
            // console.log(`[API] Converted Buffer id to hex string: ${hexString}`);
            return hexString;
          }
          // Handle ObjectId objects (they have toString method)
          if (typeof mapping.id === "object" && mapping.id !== null && typeof mapping.id.toString === "function") {
            // Try toHexString first (MongoDB ObjectId method)
            if (typeof mapping.id.toHexString === "function") {
              return mapping.id.toHexString();
            }
            // Fallback to toString
            return mapping.id.toString();
          }
          // Already a string or number
          return String(mapping.id);
        }
        // Object without id property - might be the ObjectId itself
        if (Buffer.isBuffer(mapping)) {
          return mapping.toString('hex');
        }
        // Try toString if available
        if (typeof mapping.toString === "function") {
          const str = mapping.toString();
          // If toString() gives us a hex-like string, use it; otherwise might be ObjectId
          if (/^[0-9a-fA-F]{24}$/.test(str)) {
            return str;
          }
          // Might be ObjectId.toString() which returns hex
          return str;
        }
        return String(mapping);
      }
      
      // Handle string or number directly
      return String(mapping);
    }).filter(Boolean);
    
    // console.log(`[API] Extracted ${mappingIds.length} mapping IDs:`, mappingIds);
    
    // Validate all IDs are 24-character hex strings
    const invalidIds = mappingIds.filter((id: string) => !/^[0-9a-fA-F]{24}$/.test(String(id)));
    if (invalidIds.length > 0) {
      // console.error(`[API] Invalid ObjectId formats detected:`, invalidIds);
      // Filter out invalid IDs to prevent query errors
      const validIds = mappingIds.filter((id: string) => /^[0-9a-fA-F]{24}$/.test(String(id)));
      // console.log(`[API] Filtered to ${validIds.length} valid ObjectIds`);
      if (validIds.length === 0) {
        return new Response(JSON.stringify({ variants: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Use only valid IDs
      mappingIds.length = 0;
      mappingIds.push(...validIds);
    }

    if (mappingIds.length === 0) {
      // console.warn(`[API] No mapping IDs found for product ${productId}`);
      return new Response(JSON.stringify({ variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const mappings = await payloadClient.find({
      collection: "product-variant-mappings",
      where: {
        id: { in: mappingIds },
        isActive: { equals: true },
      },
      depth: 1, // Populate the variant relationship
      limit: 100,
    });
    
    // console.log(`[API] Query result: Found ${mappings.docs.length} active mappings`);

    // console.log(`[API] Found ${mappings.docs.length} variant mappings for product ${productId}`);
    
    // Debug: Log first mapping to see structure
    // if (mappings.docs.length > 0) {
    //   console.log(`[API] First mapping structure:`, JSON.stringify(mappings.docs[0], null, 2));
    //   console.log(`[API] First mapping variant type:`, typeof mappings.docs[0]?.variant);
    //   console.log(`[API] First mapping variant:`, mappings.docs[0]?.variant);
    // }

    // Transform mappings into frontend-friendly format
    const variants = mappings.docs
      .map((mapping: any) => {
        // Check if variant is populated (object) or just an ID
        let variant = null;
        if (mapping.variant) {
          if (typeof mapping.variant === "object" && mapping.variant !== null) {
            variant = mapping.variant;
          } else {
            // Variant is just an ID, we need to fetch it
            // console.warn(`[API] Variant mapping ${mapping.id} has variant as ID (${mapping.variant}), not populated. This should not happen with depth: 1`);
            return null;
          }
        }
        
        if (!variant) {
          // console.warn(`[API] Variant mapping ${mapping.id} has no variant object or ID`);
          return null;
        }

        const price = Number(mapping.priceOverride || variant.price || 0);
        const stock = Number(mapping.quantity || 0);

        const variantData = {
          id: String(mapping.id),
          variantId: String(variant.id),
          name: variant.name || "",
          price,
          stock: stock,
          sku: variant.sku || "",
          isDefault: mapping.isDefault || false,
          availableForSale: stock > 0,
          category: variant.category || "other",
          active: mapping.isActive || false,
        };

        // console.log(`[API] Variant mapping for product ${productId}:`, {
        //   variantId: variant.id,
        //   variantName: variant.name,
        //   mappingId: mapping.id,
        //   stock: stock,
        //   price: price,
        //   isDefault: mapping.isDefault,
        //   variantData,
        // });

        return variantData;
      })
      .filter(Boolean);

    // console.log(`[API] Returning ${variants.length} variants for product ${productId}`);
    // console.log(`[API] Variants data:`, JSON.stringify(variants, null, 2));

    return new Response(JSON.stringify({ variants }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // console.error("Error fetching product variants:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch product variants" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
