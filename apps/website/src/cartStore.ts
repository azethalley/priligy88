import { atom, computed } from "nanostores";
import type { Product } from "payload_app";
import { compareVariantIds, normalizeVariantId } from "@/lib/utils/variantId";
import type { VariantId } from "@/lib/shopify/types";

// Atom to manage the layout view state (card or list)
export const layoutView = atom<"card" | "list">("card");

// Function to set a new layout view
export function setLayoutView(view: "card" | "list") {
  layoutView.set(view);
}

// Function to get the current layout view
export function getLayoutView() {
  return layoutView.get();
}

export interface CartItem {
  id: string | number; // Support both string (MongoDB ObjectId) and number IDs
  title: string;
  price: number;
  quantity: number;
  image: string;
  slug?: string | null;
  variant?: {
    id: VariantId;
    mappingId?: VariantId;
    name: string;
    price: number;
    stock: number;
    sku?: string;
  } | null;
}

interface CartState {
  items: CartItem[];
}

// Initialize cart store
const cartStore = atom<CartState>({ items: [] });

// Load cart from localStorage on initialization
if (typeof window !== "undefined") {
  const savedCart = localStorage.getItem("cart");
  if (savedCart) {
    cartStore.set(JSON.parse(savedCart));
  }
}

// Save cart to localStorage whenever it changes
cartStore.subscribe((cart) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("cart", JSON.stringify(cart));
  }
});

// Cart operations
export const cartOperations = {
  clearCart: () => {
    cartStore.set({ items: [] });
  },
  addItem: (item: CartItem) => {
    const currentCart = cartStore.get();

    // Find existing item by product ID and variant ID (if variant exists)
    const existingItem = currentCart.items.find((i) => {
      if (i.id !== item.id) return false;

      // If both have variants, compare variant IDs using utility
      if (i.variant && item.variant) {
        return compareVariantIds(i.variant.id, item.variant.id);
      }

      // If neither has variants, it's the same item
      if (!i.variant && !item.variant) {
        return true;
      }

      // One has variant, one doesn't - different items
      return false;
    });

    if (existingItem) {
      cartStore.set({
        items: currentCart.items.map((i) => {
          const isSameItem =
            i.id === item.id &&
            ((i.variant &&
              item.variant &&
              compareVariantIds(i.variant.id, item.variant.id)) ||
              (!i.variant && !item.variant));

          return isSameItem
            ? { ...i, quantity: i.quantity + item.quantity }
            : i;
        }),
      });
    } else {
      cartStore.set({
        items: [...currentCart.items, item],
      });
    }
  },
  removeItem: (id: string | number, variantId?: VariantId) => {
    const currentCart = cartStore.get();
    cartStore.set({
      items: currentCart.items.filter((item) => {
        if (item.id !== id) return true;

        // If variantId is provided, only remove if variant matches
        if (variantId && item.variant) {
          return !compareVariantIds(item.variant.id, variantId);
        }

        // If no variantId provided, remove all items with this product ID
        return false;
      }),
    });
  },
  updateQuantity: (id: string | number, quantity: number, variantId?: VariantId) => {
    const currentCart = cartStore.get();
    if (quantity <= 0) {
      cartStore.set({
        items: currentCart.items.filter((item) => {
          if (item.id !== id) return true;

          // If variantId is provided, only remove if variant matches
          if (variantId && item.variant) {
            return !compareVariantIds(item.variant.id, variantId);
          }

          // If no variantId provided, remove all items with this product ID
          return false;
        }),
      });
    } else {
      cartStore.set({
        items: currentCart.items.map((item) => {
          if (item.id !== id) return item;

          // If variantId is provided, only update if variant matches
          if (variantId && item.variant) {
            return compareVariantIds(item.variant.id, variantId)
              ? { ...item, quantity }
              : item;
          }

          // If no variantId provided, update all items with this product ID
          return { ...item, quantity };
        }),
      });
    }
  },
};

// Computed values
export const cartItems = atom<CartItem[]>([]);
cartStore.subscribe((state) => cartItems.set(state.items));
export const cartTotal = computed(cartStore, (store) =>
  store.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
);
export const cartCount = computed(cartStore, (store) =>
  store.items.reduce((sum, item) => sum + item.quantity, 0),
);
export function resetCart() {
  cartStore.set({ items: [] });
}

// Cart actions
// Helper functions
export function isInCart(productId: string | number) {
  return cartStore.get().items.some((item) => item.id === productId);
}

export function getItemQuantity(productId: string | number) {
  const item = cartStore.get().items.find((item) => item.id === productId);
  return item?.quantity || 0;
}

// Function to remove invalid items from cart
export function removeInvalidItems(validProductIds: (string | number)[]) {
  const currentCart = cartStore.get();
  const validItems = currentCart.items.filter((item) =>
    validProductIds.includes(item.id),
  );
  cartStore.set({ items: validItems });
}
