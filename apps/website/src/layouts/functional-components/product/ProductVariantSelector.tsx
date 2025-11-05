import React, { useState, useEffect } from "react";
import type { ProcessedVariant } from "@/lib/shopify/types";
import { formatPrice } from "@/lib/utils/pricing";

interface ProductVariantSelectorProps {
  variants: ProcessedVariant[];
  onVariantChange: (variant: ProcessedVariant | null) => void;
  selectedVariant?: ProcessedVariant | null;
}

export function ProductVariantSelector({
  variants,
  onVariantChange,
  selectedVariant,
}: ProductVariantSelectorProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<ProcessedVariant | null>(null);

  // Ensure component is mounted before processing variants
  useEffect(() => {
    setMounted(true);
  }, []);

  // Set default variant on mount with error handling
  useEffect(() => {
    if (!mounted) return;

    if (variants.length > 0 && !selected) {
      // console.log("Setting up variants for first time");

      try {
        const defaultVariant = variants.find((v) => v.isDefault) || variants[0];
        // Validate variant has required fields
        if (
          defaultVariant &&
          defaultVariant.name &&
          typeof defaultVariant.price === "number"
        ) {
          // console.log("Setting default variant:", defaultVariant.name);
          setSelected(defaultVariant);
          onVariantChange(defaultVariant);
        } else {
          // console.warn("Invalid variant data:", defaultVariant);
        }
      } catch (error) {
        // console.error("Error setting default variant:", error);
      }
    }
  }, [variants, mounted]); // Removed onVariantChange and selected dependencies

  // Update selected when prop changes
  useEffect(() => {
    if (!mounted) return;

    if (selectedVariant) {
      setSelected(selectedVariant);
    }
  }, [selectedVariant, mounted]);

  const handleVariantChange = (variant: ProcessedVariant) => {
    setSelected(variant);
    onVariantChange(variant);
    setIsOpen(false);
  };

  // Use centralized formatting

  const getVariantDisplayText = (variant: ProcessedVariant) => {
    return `${variant.name} - ${formatPrice(variant.price)}`;
  };

  if (!mounted) {
    return (
      <div className="mb-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!variants || variants.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        選擇選項:
      </label>
      <div className="relative">
        <button
          type="button"
          className="relative w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="block truncate text-gray-900 dark:text-gray-100">
            {selected ? getVariantDisplayText(selected) : "請選擇選項"}
          </span>
          <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg
              className={`h-5 w-5 text-gray-400 transform transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </button>

        {isOpen && (
          <ul
            className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
            role="listbox"
            aria-labelledby="variant-selector"
          >
            {variants.map((variant) => {
              const isSelected = selected?.id === variant.id;

              return (
                <li
                  key={variant.id}
                  className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    isSelected
                      ? "bg-primary text-white"
                      : "text-gray-900 dark:text-gray-100"
                  } ${!variant.availableForSale ? "opacity-50 cursor-not-allowed" : ""}`}
                  onClick={() => {
                    // console.log(
                    //   "Clicked on variant:",
                    //   variant.name,
                    //   "ID:",
                    //   variant.id,
                    // );
                    if (variant.availableForSale) {
                      handleVariantChange(variant);
                    }
                  }}
                  role="option"
                  aria-selected={selected?.id === variant.id}
                >
                  <div className="flex items-center justify-between">
                    <span className="block truncate font-normal">
                      {variant.name}
                    </span>
                    <span className="block truncate ml-2">
                      {formatPrice(variant.price)}
                    </span>
                  </div>
                  {!variant.availableForSale && (
                    <span className="text-xs text-red-500 ml-2">
                      (不可用)
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                      <svg
                        className="h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div key={selected.id} className="mt-3 flex items-center gap-2">
          {selected.stock > 0 ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              {selected.stock} 件現貨
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
              <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
              缺貨
            </span>
          )}
        </div>
      )}
    </div>
  );
}
