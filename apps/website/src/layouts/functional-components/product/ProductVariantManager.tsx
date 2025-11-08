import React, { useState, useEffect } from "react";
import { ProductVariantSelector } from "./ProductVariantSelector";
import { AddToCart } from "@/functional-components/cart/AddToCart";
import type { Product } from "payload_app";
import type { ProcessedVariant } from "@/lib/shopify/types";
import {
  extractVariantId,
  extractMappingId,
  normalizeVariantId,
  normalizeId,
} from "@/lib/utils/variantId";

interface ProductVariantManagerProps {
  product: Product;
  stylesClass?: string;
}

export function ProductVariantManager({
  product,
  stylesClass,
}: ProductVariantManagerProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedVariant, setSelectedVariant] =
    useState<ProcessedVariant | null>(null);
  const [processedVariants, setProcessedVariants] = useState<
    ProcessedVariant[]
  >([]);

  // Ensure component is mounted before processing variants
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch variants from API endpoint for better performance
  useEffect(() => {
    if (!mounted || !product?.id) return;

    const fetchVariants = async () => {
      try {
        // console.log(`[ProductVariantManager] Product ID before normalization:`, product.id, `Type:`, typeof product.id);
        
        // Normalize product ID to string (handles MongoDB ObjectIds)
        const productId = normalizeId(product.id);
        // console.log(`[ProductVariantManager] Product ID after normalization:`, productId, `Type:`, typeof productId);
        
        if (!productId) {
          // console.warn("Product ID is missing or invalid");
          setProcessedVariants([]);
          setSelectedVariant(null);
          return;
        }
        
        // console.log(`[ProductVariantManager] Fetching variants for product ID:`, productId);
        
        let response;
        try {
          response = await fetch(`/api/product-variants/${productId}`, {
            signal: AbortSignal.timeout(30000), // 30 second timeout
          });
          // console.log(`[ProductVariantManager] Fetch response status:`, response.status, response.statusText);
        } catch (error) {
          // console.error(`[ProductVariantManager] Fetch error:`, error);
          if (error instanceof Error && error.name === 'TimeoutError') {
            // console.error(`[ProductVariantManager] Request timed out after 30 seconds`);
          }
          setProcessedVariants([]);
          setSelectedVariant(null);
          return;
        }
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unable to read error response');
          // console.warn(
          //   `Failed to fetch variants for product ${productId}: ${response.status} ${response.statusText}`,
          //   errorText,
          // );
          setProcessedVariants([]);
          setSelectedVariant(null);
          return;
        }

        let data;
        try {
          data = await response.json();
          // console.log(`[ProductVariantManager] Successfully parsed JSON response`);
        } catch (error) {
          // console.error(`[ProductVariantManager] Error parsing JSON response:`, error);
          const responseText = await response.text().catch(() => 'Unable to read response');
          // console.error(`[ProductVariantManager] Response text:`, responseText);
          setProcessedVariants([]);
          setSelectedVariant(null);
          return;
        }
        // console.log(`[ProductVariantManager] API response:`, data);
        const variants = data.variants || [];
        // console.log(`[ProductVariantManager] Variants array length:`, variants.length);

        if (variants.length > 0) {
          // console.log("Raw variants from API:", JSON.stringify(variants, null, 2));

          const processedVariants: ProcessedVariant[] = variants.map(
            (v: any) => {
              // Use mapping ID as the primary id (needed for validation)
              // The API returns id as mapping ID and variantId as actual variant ID
              const mappingId = extractMappingId(v); // This is v.id from API
              const variantId = normalizeVariantId(v.variantId); // This is the actual variant ID
              
              const processed = {
                id: mappingId, // Use mapping ID for validation purposes
                mappingId: mappingId,
                variantId: variantId,
                name: String(v.name || ""),
                price: Number(v.price || 0),
                stock: Number(v.stock || 0),
                sku: v.sku || undefined,
                isDefault: Boolean(v.isDefault),
                availableForSale: Boolean(v.availableForSale),
                category: String(v.category || "other"),
              };

              return processed;
            },
          );

          // console.log("Final processed variants:", JSON.stringify(processedVariants, null, 2));
          // console.log(`[ProductVariantManager] Setting ${processedVariants.length} variants`);
          setProcessedVariants(processedVariants);

          // Only set default variant if no variant is currently selected
          if (!selectedVariant) {
            const defaultVariant =
              processedVariants.find((v) => v.isDefault) ||
              processedVariants[0];
            // console.log("Setting default variant:", defaultVariant);
            setSelectedVariant(defaultVariant || null);
          }
        } else {
          setProcessedVariants([]);
          setSelectedVariant(null);
        }
      } catch (error) {
        // console.error("[ProductVariantManager] Error fetching variants:", error);
        // console.error("[ProductVariantManager] Error details:", error instanceof Error ? error.stack : String(error));
        setProcessedVariants([]);
        setSelectedVariant(null);
      }
    };

    fetchVariants();
  }, [product?.id, mounted]); // Removed selectedVariant from dependencies

  const handleVariantChange = (variant: ProcessedVariant | null) => {
    // console.log("Variant selected:", variant?.name, "Stock:", variant?.stock);
    setSelectedVariant(variant);
  };

  // Show loading state during hydration to prevent mismatches
  if (!mounted) {
    return (
      <div>
        <div className="mb-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
        <div className="flex gap-4 mt-8 md:mt-10 mb-6">
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
          </div>
        </div>
      </div>
    );
  }

  // Debug logging for render
  // console.log(`[ProductVariantManager] Rendering with ${processedVariants.length} variants`);

  return (
    <div>
      {/* Variant Selector - Display variants between price and Add to Cart */}
      {processedVariants.length > 0 ? (
        <div className="mb-6">
          <ProductVariantSelector
            variants={processedVariants}
            onVariantChange={handleVariantChange}
            selectedVariant={selectedVariant}
          />
        </div>
      ) : (
        <div className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {/* Debug: Show when no variants */}
          {process.env.NODE_ENV === 'development' && (
            <div>No variants available (processedVariants.length = {processedVariants.length})</div>
          )}
        </div>
      )}

      {/* Add to Cart Button */}
      <div className="flex gap-4 mt-6 mb-6">
        <AddToCart
          product={product}
          stylesClass={stylesClass}
          selectedVariant={selectedVariant}
          onVariantChange={handleVariantChange}
        />
      </div>
    </div>
  );
}
