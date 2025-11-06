import type { APIRoute } from "astro";
import { payload } from "@/lib/payload";
import type { Product } from "payload_app";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { compareVariantIds, normalizeVariantId } from "@/lib/utils/variantId";
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

  // Check which products are missing
  const foundProductIds = products.map((p) => p.id);
  const missingProductIds = productIds.filter(
    (id) => !foundProductIds.includes(id),
  );

  if (missingProductIds.length > 0) {
    throw new Error(
      `Some products in cart are no longer available. Missing product IDs: ${missingProductIds.join(", ")}`,
    );
  }

  // Check stock availability for each item
  const stockIssues: string[] = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.id);
    if (!product) continue;

    // Check variant stock if item has a variant
    if (item.variant) {
      // Find the variant mapping for this product and variant
      const variantMapping = product.variantMappings?.find((mapping: any) => {
        const mappingVariantId = mapping.variant?.id;
        const itemVariantId = item.variant?.id;
        // Use consistent comparison utility
        return compareVariantIds(mappingVariantId, itemVariantId);
      });

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

async function deductStockFromOrder(cartItems: CartItem[], products: any[]) {
  const payloadClient = await payload();

  for (const item of cartItems) {
    const product = products.find((p) => p.id === item.id);
    if (!product) continue;

    if (item.variant) {
      // Find the variant mapping for this product and variant
      const variantMapping = product.variantMappings?.find((mapping: any) => {
        const mappingVariantId = mapping.variant?.id;
        const itemVariantId = item.variant?.id;
        // Use consistent comparison utility (same as validation)
        return compareVariantIds(mappingVariantId, itemVariantId);
      });

      if (variantMapping && typeof variantMapping !== "number") {
        // Deduct stock from variant mapping
        const newQuantity = Math.max(
          0,
          variantMapping.quantity - item.quantity,
        );

        await payloadClient.update({
          collection: "product-variant-mappings",
          id: variantMapping.id,
          data: { quantity: newQuantity },
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

        await payloadClient.update({
          collection: "product-variant-mappings",
          id: defaultMapping.id,
          data: { quantity: newQuantity },
        });
      }
    }
  }
}

async function restoreStockFromOrder(cartItems: CartItem[], products: any[]) {
  const payloadClient = await payload();

  for (const item of cartItems) {
    const product = products.find((p) => p.id === item.id);
    if (!product) continue;

    if (item.variant) {
      // Find the variant mapping for this product and variant
      const variantMapping = product.variantMappings?.find((mapping: any) => {
        const mappingVariantId = mapping.variant?.id;
        const itemVariantId = item.variant?.id;
        // Use consistent comparison utility
        return compareVariantIds(mappingVariantId, itemVariantId);
      });

      if (variantMapping && typeof variantMapping !== "number") {
        // Restore stock to variant mapping
        const newQuantity = variantMapping.quantity + item.quantity;

        await payloadClient.update({
          collection: "product-variant-mappings",
          id: variantMapping.id,
          data: { quantity: newQuantity },
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
      return new Response(
        JSON.stringify({ error: "Failed to process stock deduction" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create formatted cart items with actual prices from database
    const formattedCartItems = cartItems.map((item) => {
      const product = products.find((p) => p.id === item.id) as Product;
      if (!product) throw new Error(`Product ${item.id} not found`);

      // Determine price based on variant or product
      let priceAtPurchase = getProductPrice(product);
      let variantInfo = null;

      if (item.variant) {
        // Find the variant mapping for this product and variant
        const variantMapping = product.variantMappings?.find((mapping: any) => {
          const mappingVariantId = mapping.variant?.id;
          const itemVariantId = item.variant?.id;
          // Use consistent comparison utility
          return compareVariantIds(mappingVariantId, itemVariantId);
        });

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
