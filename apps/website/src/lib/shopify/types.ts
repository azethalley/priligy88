// Centralized product variant types for the e-commerce system
export type VariantId = string | number;

export interface ProductVariant {
  id: VariantId;
  name: string;
  description?: string;
  price: number;
  sku?: string;
  category: "size" | "quantity" | "color" | "material" | "other";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantMapping {
  id: VariantId;
  product: VariantId;
  variant: VariantId | ProductVariant;
  quantity: number;
  priceOverride?: number;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductOption {
  id: string;
  name: string;
  values: string[];
}

// Extended product interface with variant mappings
export interface ProductWithVariants {
  id: number;
  title: string;
  originalPrice: number;
  discountedPrice?: number;
  totalStock: number;
  variantMappings?: ProductVariantMapping[];
  featuredImage: any;
  images?: any[];
  slug?: string;
  published?: boolean;
}

// Processed variant for frontend display
export interface ProcessedVariant {
  id: VariantId;
  mappingId?: VariantId; // ID of the variant mapping record
  variantId?: VariantId; // ID of the actual variant
  name: string;
  price: number;
  stock: number;
  sku?: string;
  isDefault: boolean;
  availableForSale: boolean;
  category: string;
}

// Cart item with variant support
export interface CartItemWithVariant {
  id: string | number; // Support both string (MongoDB ObjectId) and number IDs
  title: string;
  price: number;
  quantity: number;
  image: string;
  slug?: string;
  variant?: {
    id: VariantId;
    mappingId?: VariantId;
    name: string;
    price: number;
    stock: number;
    sku?: string;
  } | null;
}
