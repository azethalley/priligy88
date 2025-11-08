import React, { useState, useEffect } from "react";
import { BiLoaderAlt } from "react-icons/bi";
import { cartOperations } from "@/cartStore";
import type { Product } from "payload_app";
import type {
  ProcessedVariant,
  CartItemWithVariant,
} from "@/lib/shopify/types";
import { normalizeVariantId, normalizeId } from "@/lib/utils/variantId";
import { getProductPrice, isValidPrice } from "@/lib/utils/pricing";

interface AddToCartProps {
  product: Product;
  stylesClass?: string;
  selectedVariant?: ProcessedVariant | null;
  onVariantChange?: (variant: ProcessedVariant | null) => void;
}

export function AddToCart({
  product,
  stylesClass,
  selectedVariant,
  onVariantChange,
}: AddToCartProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentVariant, setCurrentVariant] = useState<ProcessedVariant | null>(
    selectedVariant || null,
  );

  // Update current variant when prop changes
  useEffect(() => {
    setCurrentVariant(selectedVariant || null);
    // Clear error when variant changes
    if (error) setError(null);
  }, [selectedVariant, error]);

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      // Normalize product ID to string (handles MongoDB ObjectIds)
      console.log('[Trace] product.id = ', product.id);
      const productId = normalizeId(product.id);
      console.log('[Trace] productId = ', productId);
      if (!productId) {
        setError("Invalid product ID");
        return;
      }
      
      // Server-side validate price/stock
      const res = await fetch("/api/validate-cart-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: productId,
          variantId: currentVariant?.id || currentVariant?.mappingId, // Use mapping ID for validation
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const errorMsg = data?.error || "Validation failed";
        // console.error(errorMsg);
        setError(errorMsg);
        return;
      }

      const validatedPrice = Number(
        data?.variant?.price ?? data?.price ?? getProductPrice(product),
      );

      // Validate the price
      if (!isValidPrice(validatedPrice)) {
        const errorMsg = "Invalid price received from validation";
        // console.error(errorMsg);
        setError(errorMsg);
        return;
      }

      const variantInfo =
        currentVariant && currentVariant.variantId
          ? {
              id: currentVariant.variantId, // Use actual variant ID for checkout matching
              mappingId: currentVariant.id, // Store mapping ID for reference
              name: currentVariant.name,
              price: Number(data?.variant?.price ?? currentVariant.price),
              stock: Number(data?.variant?.stock ?? currentVariant.stock),
              sku: currentVariant.sku || undefined,
            }
          : null;

      // Get image URL safely
      let imageUrl = "";
      if (product.featuredImage) {
        if (typeof product.featuredImage === "object" && product.featuredImage !== null && "url" in product.featuredImage) {
          imageUrl = product.featuredImage.url || "";
        } else if (typeof product.featuredImage === "string") {
          imageUrl = product.featuredImage;
        }
      }

      const item: CartItemWithVariant = {
        id: productId, // Use normalized product ID (string for MongoDB ObjectId)
        title: product.title,
        price: validatedPrice,
        quantity: 1,
        image: imageUrl,
        slug: product.slug || undefined,
        variant: variantInfo,
      };

      cartOperations.addItem(item as any);
      
      // Show success feedback (optional - could be enhanced with toast notification)
      // console.log("Item added to cart successfully:", item);
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to add item to cart";
      // console.error(errorMsg, error);
      setError(errorMsg);
    } finally {
      setPending(false);
    }
  };

  // Determine if product/variant is available
  const isAvailable = currentVariant
    ? currentVariant.stock > 0
    : product.published && (product.totalStock || 0) > 0;
  
  // console.log("[TRACE] product.totalStock = ", product.totalStock)

  const buttonClasses = `${stylesClass} ${
    pending || !isAvailable ? "cursor-not-allowed" : ""
  }`;

  const getButtonText = () => {
    if (pending) return <BiLoaderAlt className="animate-spin" size={24} />;
    if (!isAvailable) return "Not Available";
    return "Add To Cart";
  };

  return (
    <div>
      {error && (
        <div className="mb-2 p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
          {error}
        </div>
      )}
      <button
        onClick={handleAddToCart}
        className={buttonClasses}
        disabled={pending || !isAvailable}
        aria-label="Add to cart"
      >
        {getButtonText()}
      </button>
    </div>
  );
}
