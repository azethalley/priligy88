import type { APIRoute } from "astro";
import { payload } from "@/lib/payload";
import type { Product } from "payload_app";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { compareVariantIds, normalizeVariantId, normalizeProductId } from "@/lib/utils/variantId";
import { getVariantPrice, getProductPrice } from "@/lib/utils/pricing";

interface CartItem {
  id: number;
  quantity: number;
  variant?: {
    id: string;
    name: string;
    price: number;
    stock: number;
    sku?: string;
  };
}

interface CheckoutFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  note?: string;
  cartItems: CartItem[];
}

function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

async function validateAndGetProducts(items: CartItem[]) {
  const payloadClient = await payload();
  const productIds = items.map((item) => item.id);

  // Fetch actual products from database with variant mappings
  const { docs: products } = await payloadClient.find({
    collection: "products",
    where: {
      and: [{ id: { in: productIds } }, { published: { equals: true } }],
    },
    depth: 2, // Include variant mappings and their variants
  });

  // Normalize product IDs for comparison (handles MongoDB ObjectIds)
  const normalizedCartIds = productIds.map((id) => normalizeProductId(id));
  const normalizedFoundIds = products.map((p) => normalizeProductId(p.id));
  const missingProductIds = normalizedCartIds.filter(
    (id) => !normalizedFoundIds.includes(id),
  );

  if (missingProductIds.length > 0) {
    throw new Error(
      `Some products in cart are no longer available. Missing product IDs: ${missingProductIds.join(", ")}`,
    );
  }

  // Check stock availability for each item
  const stockIssues: string[] = [];
  for (const item of items) {
    const normalizedItemId = normalizeProductId(item.id);
    const product = products.find((p) => normalizeProductId(p.id) === normalizedItemId);
    if (!product) continue;

    // Check variant stock if item has a variant
    if (item.variant) {
      // Find the variant mapping for this product and variant using robust matching
      // Check both variant.id and variant.mappingId if available
      const variantMapping = findVariantMapping(
        product.variantMappings || [], 
        item.variant.id,
        (item.variant as any).mappingId
      );

      if (!variantMapping || typeof variantMapping === "number") {
        stockIssues.push(
          `${product.title} - ${item.variant.name}: variant no longer available`,
        );
      } else if (
        variantMapping.quantity <= 0 ||
        variantMapping.quantity < item.quantity
      ) {
        stockIssues.push(
          `${product.title} - ${item.variant.name}: requested ${item.quantity}, available ${variantMapping.quantity}`,
        );
      }
    } else {
      // Check product total stock for items without variants
      if (
        (product.totalStock || 0) <= 0 ||
        (product.totalStock || 0) < item.quantity
      ) {
        stockIssues.push(
          `${product.title}: requested ${item.quantity}, available ${product.totalStock || 0}`,
        );
      }
    }
  }

  if (stockIssues.length > 0) {
    throw new Error(
      `Insufficient stock for the following items: ${stockIssues.join(", ")}`,
    );
  }

  return products;
}

// Helper function to normalize mapping ID (handles Buffer objects and ObjectIds)
// Always returns a clean string, never a Buffer or ObjectId
function normalizeMappingId(mapping: any): string {
  if (!mapping) {
    throw new Error("Cannot normalize undefined or null mapping ID");
  }
  
  // Handle Buffer objects first (check for Buffer.isBuffer before type checks)
  if (Buffer.isBuffer(mapping)) {
    return mapping.toString('hex');
  }
  
  // Handle string/number directly
  if (typeof mapping === "string") {
    return mapping;
  }
  if (typeof mapping === "number") {
    return String(mapping);
  }
  
  // Handle objects
  if (typeof mapping === "object" && mapping !== null) {
    // Check if it has a buffer property (nested Buffer)
    if (mapping.buffer && Buffer.isBuffer(mapping.buffer)) {
      return mapping.buffer.toString('hex');
    }
    
    // Check if it's a Buffer-like object with buffer property (serialized Buffer)
    // This handles cases where Buffer is serialized as { buffer: { '0': 105, '1': 9, ... } }
    if (mapping.buffer && typeof mapping.buffer === 'object' && !Buffer.isBuffer(mapping.buffer)) {
      // Check if it has numeric keys (serialized Buffer)
      const keys = Object.keys(mapping.buffer);
      const numericKeys = keys.filter(k => /^\d+$/.test(k));
      if (numericKeys.length > 0) {
        // It's a serialized Buffer - reconstruct it
        try {
          // Extract numeric values in order
          const values = numericKeys
            .map(k => parseInt(k, 10))
            .sort((a, b) => a - b)
            .map(k => mapping.buffer[String(k)])
            .filter(v => typeof v === 'number');
          
          if (values.length > 0) {
            const buffer = Buffer.from(values);
            return buffer.toString('hex');
          }
        } catch (e) {
          // Fall through to other methods
        }
      }
    }
    
    // Extract ID from object
    if (mapping.id !== undefined) {
      const idValue = mapping.id;
      
      // Handle Buffer ID
      if (Buffer.isBuffer(idValue)) {
        return idValue.toString('hex');
      }
      
      // Handle nested buffer property in ID
      if (idValue && typeof idValue === 'object' && idValue.buffer) {
        if (Buffer.isBuffer(idValue.buffer)) {
          return idValue.buffer.toString('hex');
        }
        // Handle serialized Buffer in idValue.buffer
        if (typeof idValue.buffer === 'object' && !Buffer.isBuffer(idValue.buffer)) {
          const keys = Object.keys(idValue.buffer);
          const numericKeys = keys.filter(k => /^\d+$/.test(k));
          if (numericKeys.length > 0) {
            try {
              const values = numericKeys
                .map(k => parseInt(k, 10))
                .sort((a, b) => a - b)
                .map(k => idValue.buffer[String(k)])
                .filter(v => typeof v === 'number');
              
              if (values.length > 0) {
                const buffer = Buffer.from(values);
                return buffer.toString('hex');
              }
            } catch (e) {
              // Fall through
            }
          }
        }
      }
      
      // Handle ObjectId-like objects
      if (typeof idValue === "object" && idValue !== null) {
        if (typeof idValue.toHexString === "function") {
          return idValue.toHexString();
        }
        if (typeof idValue.toString === "function") {
          const str = idValue.toString();
          // Ensure it's a string, not another Buffer
          if (typeof str === 'string') {
            return str;
          }
          if (Buffer.isBuffer(str)) {
            return str.toString('hex');
          }
        }
      }
      
      // Handle string/number ID
      if (typeof idValue === "string") {
        return idValue;
      }
      if (typeof idValue === "number") {
        return String(idValue);
      }
      
      return String(idValue);
    }
    
    // Handle ObjectId-like objects directly
    if (typeof mapping.toHexString === "function") {
      return mapping.toHexString();
    }
    if (typeof mapping.toString === "function") {
      const str = mapping.toString();
      if (typeof str === 'string') {
        return str;
      }
      if (Buffer.isBuffer(str)) {
        return str.toString('hex');
      }
    }
  }
  
  // Fallback: convert to string
  return String(mapping);
}

// Helper function to find variant mapping with robust ID comparison
function findVariantMapping(variantMappings: any[], itemVariantId: any, itemMappingId?: any): any {
  if (!variantMappings || !Array.isArray(variantMappings)) return null;
  
  const normalizedVariantId = normalizeVariantId(itemVariantId);
  const normalizedMappingId = itemMappingId ? normalizeVariantId(itemMappingId) : null;
  
  return variantMappings.find((mapping: any) => {
    // Skip if mapping is just a number (reference)
    if (typeof mapping === "number") return false;
    
    // Normalize mapping ID (handles Buffer objects and ObjectIds)
    const mappingId = normalizeMappingId(mapping);
    const normalizedMappingIdValue = normalizeVariantId(mappingId);
    
    // Normalize actual variant ID if it exists
    let normalizedActualVariantId = "";
    if (mapping.variant?.id !== undefined) {
      if (Buffer.isBuffer(mapping.variant.id)) {
        normalizedActualVariantId = mapping.variant.id.toString('hex');
      } else {
        normalizedActualVariantId = normalizeVariantId(mapping.variant.id);
      }
    }

    // Compare normalized IDs - check both mapping ID and variant ID
    // Also check if item has a mappingId that matches
    return (
      normalizedMappingIdValue === normalizedVariantId ||
      normalizedActualVariantId === normalizedVariantId ||
      (normalizedMappingId && normalizedMappingIdValue === normalizedMappingId) ||
      compareVariantIds(mapping.variant?.id, itemVariantId) ||
      compareVariantIds(mapping.id, itemVariantId) ||
      (itemMappingId && compareVariantIds(mapping.id, itemMappingId))
    );
  });
}

async function deductStockFromOrder(cartItems: CartItem[], products: any[]) {
  const payloadClient = await payload();

  for (const item of cartItems) {
    const normalizedItemId = normalizeProductId(item.id);
    const product = products.find((p) => normalizeProductId(p.id) === normalizedItemId);
    if (!product) continue;

    if (item.variant) {
      // Find the variant mapping for this product and variant using robust matching
      // Check both variant.id and variant.mappingId if available
      const variantMapping = findVariantMapping(
        product.variantMappings, 
        item.variant.id,
        (item.variant as any).mappingId
      );

      if (variantMapping && typeof variantMapping !== "number") {
        // Deduct stock from variant mapping
        const newQuantity = Math.max(
          0,
          variantMapping.quantity - item.quantity,
        );

        // Normalize mapping ID for database operation (handles ObjectIds and Buffers)
        let normalizedMappingId: string;
        try {
          normalizedMappingId = normalizeMappingId(variantMapping);
          // Ensure it's definitely a string (double-check)
          if (typeof normalizedMappingId !== 'string') {
            console.error('normalizeMappingId returned non-string:', typeof normalizedMappingId, normalizedMappingId);
            normalizedMappingId = String(normalizedMappingId);
          }
        } catch (error) {
          console.error('Error normalizing mapping ID:', error, variantMapping);
          throw new Error(`Failed to extract mapping ID: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Create a clean data object with only the quantity field
        // Explicitly construct to avoid any relation fields being included
        const updateData: { quantity: number } = { 
          quantity: newQuantity,
        };

        // Only update quantity field - use overrideAccess to bypass access control
        // This ensures we can update without triggering relation field validations
        await payloadClient.update({
          collection: "product-variant-mappings",
          id: normalizedMappingId,
          data: updateData,
          overrideAccess: true,
        });
      }
    } else {
      // Product without variant selected - deduct from default variant mapping if available
      const defaultMapping = product.variantMappings?.find(
        (mapping: any) => mapping.isDefault,
      );

      if (defaultMapping && typeof defaultMapping !== "number") {
        const newQuantity = Math.max(
          0,
          defaultMapping.quantity - item.quantity,
        );

        // Normalize mapping ID for database operation (handles ObjectIds and Buffers)
        let normalizedMappingId: string;
        try {
          normalizedMappingId = normalizeMappingId(defaultMapping);
          if (typeof normalizedMappingId !== 'string') {
            normalizedMappingId = String(normalizedMappingId);
          }
        } catch (error) {
          console.error('Error normalizing default mapping ID:', error, defaultMapping);
          throw new Error(`Failed to extract default mapping ID: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Create a clean data object with only the quantity field
        const updateData: { quantity: number } = { 
          quantity: newQuantity,
        };

        // Only update quantity field - use overrideAccess to bypass access control
        await payloadClient.update({
          collection: "product-variant-mappings",
          id: normalizedMappingId,
          data: updateData,
          overrideAccess: true,
        });
      }
    }
  }
}

async function restoreStockFromOrder(cartItems: CartItem[], products: any[]) {
  const payloadClient = await payload();

  for (const item of cartItems) {
    const normalizedItemId = normalizeProductId(item.id);
    const product = products.find((p) => normalizeProductId(p.id) === normalizedItemId);
    if (!product) continue;

    if (item.variant) {
      // Find the variant mapping for this product and variant using robust matching
      // Check both variant.id and variant.mappingId if available
      const variantMapping = findVariantMapping(
        product.variantMappings, 
        item.variant.id,
        (item.variant as any).mappingId
      );

      if (variantMapping && typeof variantMapping !== "number") {
        // Restore stock to variant mapping
        const newQuantity = variantMapping.quantity + item.quantity;

        // Normalize mapping ID for database operation (handles ObjectIds and Buffers)
        let normalizedMappingId: string;
        try {
          normalizedMappingId = normalizeMappingId(variantMapping);
          if (typeof normalizedMappingId !== 'string') {
            normalizedMappingId = String(normalizedMappingId);
          }
        } catch (error) {
          console.error('Error normalizing variant mapping ID for restore:', error, variantMapping);
          throw new Error(`Failed to extract mapping ID: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Create a clean data object with only the quantity field
        const updateData: { quantity: number } = { 
          quantity: newQuantity,
        };

        // Only update quantity field - use overrideAccess to bypass access control
        await payloadClient.update({
          collection: "product-variant-mappings",
          id: normalizedMappingId,
          data: updateData,
          overrideAccess: true,
        });
      }
    }
  }
}

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      error: "Method not allowed. Use POST to submit checkout data.",
      message:
        "This endpoint only accepts POST requests for checkout form submissions.",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "POST",
      },
    },
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    // Basic form validation
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    const address = formData.get("address") as string;
    const note = formData.get("note") as string;
    const cartItemsString = formData.get("cartItems") as string;

    if (!name || !email || !phone || !address || !cartItemsString) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!validateEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let cartItems;
    try {
      cartItems = JSON.parse(cartItemsString);
      if (!Array.isArray(cartItems) || cartItems.length === 0) {
        throw new Error("Invalid cart data");
      }
    } catch {
      return new Response(JSON.stringify({ error: "Invalid cart data" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payloadClient = await payload();

    // Fetch and validate products
    const products = await validateAndGetProducts(cartItems);

    // Deduct stock from variant mappings before creating order
    try {
      await deductStockFromOrder(cartItems, products);
    } catch (stockError) {
      console.error("Error in deductStockFromOrder:", stockError);
      const errorMessage = stockError instanceof Error ? stockError.message : "Failed to process stock deduction";
      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create formatted cart items with actual prices from database
    const formattedCartItems = cartItems.map((item) => {
      const normalizedItemId = normalizeProductId(item.id);
      const product = products.find((p) => normalizeProductId(p.id) === normalizedItemId) as Product;
      if (!product) throw new Error(`Product ${item.id} not found`);

      // Determine price based on variant or product
      let priceAtPurchase = getProductPrice(product);
      let variantInfo = null;

      if (item.variant) {
        // Find the variant mapping for this product and variant using robust matching
        // Check both variant.id and variant.mappingId if available
        const variantMapping = findVariantMapping(
          product.variantMappings || [], 
          item.variant.id,
          (item.variant as any).mappingId
        );

        if (variantMapping && typeof variantMapping !== "number") {
          // Use centralized pricing logic
          const variant =
            typeof variantMapping.variant === "object"
              ? variantMapping.variant
              : null;
          priceAtPurchase = getVariantPrice(variantMapping, variant);

          // Only include variant info if we have valid data
          if (variant?.id && variant?.name) {
            variantInfo = {
              id: String(variant.id),
              name: String(variant.name),
              sku: variant.sku || undefined,
            };
          }
        }
      }

      const cartItem: any = {
        product: product.id,
        quantity: item.quantity,
        priceAtPurchase,
      };

      // Only include variant if we have valid variant info
      if (variantInfo) {
        cartItem.variant = variantInfo;
      }

      return cartItem;
    });

    // Calculate total for verification
    const orderTotal = formattedCartItems.reduce(
      (sum, item) => sum + item.priceAtPurchase * item.quantity,
      0,
    );

    // Create order in PayloadCMS
    const orderResponse = await payloadClient.create({
      collection: "orders",
      data: {
        name,
        email,
        phone,
        address,
        note,
        cartItems: formattedCartItems as any,
        totalAmount: orderTotal,
        status: "pending",
        orderDate: new Date().toISOString(),
      },
      depth: 2,
    });

    // Send order confirmation emails
    try {
      await sendOrderConfirmationEmail(orderResponse, products);
    } catch (emailError) {
      console.error("Error sending confirmation email:", emailError);
      // Continue with checkout even if email fails
    }

    // Redirect to success page
    return new Response(null, {
      status: 302,
      headers: {
        Location: "/checkout/success",
      },
    });
  } catch (error) {
    console.error("Error processing checkout:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process checkout" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};
