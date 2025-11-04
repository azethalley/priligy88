import type { APIRoute } from "astro";
import { payload } from "@/lib/payload";

export const GET: APIRoute = async ({ params }) => {
  try {
    let { productId } = params;

    console.log(`[API] Received productId param:`, productId, `Type:`, typeof productId);

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
      console.error(`[API] Received "[object Object]" as productId - this indicates the ID wasn't properly serialized`);
      return new Response(JSON.stringify({ error: "Invalid product ID format", variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    productId = String(productId).trim();
    console.log(`[API] Normalized productId:`, productId);
    
    if (!productId) {
      return new Response(JSON.stringify({ error: "Product ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payloadClient = await payload();

    // First get the product to find its variant mappings
    // Use find instead of findByID for better ID format compatibility
    const result = await payloadClient.find({
      collection: "products",
      where: {
        id: { equals: productId },
      },
      select: {
        variantMappings: true,
      },
      limit: 1,
    });

    const product = result?.docs?.[0];

    if (!product) {
      console.warn(`Product with ID ${productId} not found`);
      return new Response(JSON.stringify({ variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!product.variantMappings?.length) {
      console.warn(`Product ${productId} has no variant mappings`);
      return new Response(JSON.stringify({ variants: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the variant mappings with their associated variants
    const mappingIds = product.variantMappings.map((mapping: any) =>
      typeof mapping === "object" ? mapping.id : mapping,
    );

    const mappings = await payloadClient.find({
      collection: "product-variant-mappings",
      where: {
        id: { in: mappingIds },
        isActive: { equals: true },
      },
      depth: 1,
      limit: 100,
    });

    // Transform mappings into frontend-friendly format
    const variants = mappings.docs
      .map((mapping: any) => {
        const variant =
          typeof mapping.variant === "object" ? mapping.variant : null;
        if (!variant) return null;

        const price = Number(mapping.priceOverride || variant.price || 0);
        const stock = Number(mapping.quantity || 0);

        console.log(`Variant mapping for product ${productId}:`, {
          variantId: variant.id,
          variantName: variant.name,
          mappingId: mapping.id,
          stock: stock,
          price: price,
          isDefault: mapping.isDefault,
        });

        return {
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
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ variants }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch product variants" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
