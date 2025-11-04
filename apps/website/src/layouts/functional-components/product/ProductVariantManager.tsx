import React, { useState, useEffect } from "react";
import { ProductVariantSelector } from "./ProductVariantSelector";
import { AddToCart } from "@/functional-components/cart/AddToCart";
import type { Product } from "payload_app";
import type { ProcessedVariant } from "@/lib/shopify/types";
import {
  extractVariantId,
  extractMappingId,
  normalizeVariantId,
  normalizeProductId,
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

    // Normalize product ID to string (handles MongoDB ObjectId objects)
    const normalizedProductId = normalizeProductId(product.id);

    const fetchVariants = async () => {
      try {
        const response = await fetch(`/api/product-variants/${normalizedProductId}`);
        if (!response.ok) {
          console.warn(
            `Failed to fetch variants for product ${normalizedProductId}: ${response.status}`,
          );
          setProcessedVariants([]);
          setSelectedVariant(null);
          return;
        }

        const data = await response.json();
        const variants = data.variants || [];

        if (variants.length > 0) {
          console.log("Raw variants from API:", variants);

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

          console.log("Final processed variants:", processedVariants);
          setProcessedVariants(processedVariants);

          // Only set default variant if no variant is currently selected
          if (!selectedVariant) {
            const defaultVariant =
              processedVariants.find((v) => v.isDefault) ||
              processedVariants[0];
            console.log("Setting default variant:", defaultVariant);
            setSelectedVariant(defaultVariant || null);
          }
        } else {
          setProcessedVariants([]);
          setSelectedVariant(null);
        }
      } catch (error) {
        console.error("Error fetching variants:", error);
        setProcessedVariants([]);
        setSelectedVariant(null);
      }
    };

    fetchVariants();
  }, [product?.id, mounted]); // Removed selectedVariant from dependencies

  const handleVariantChange = (variant: ProcessedVariant | null) => {
    console.log("Variant selected:", variant?.name, "Stock:", variant?.stock);
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

  return (
    <div>
      {/* Variant Selector - Display variants between price and Add to Cart */}
      {processedVariants.length > 0 && (
        <div className="mb-6">
          <ProductVariantSelector
            variants={processedVariants}
            onVariantChange={handleVariantChange}
            selectedVariant={selectedVariant}
          />
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
