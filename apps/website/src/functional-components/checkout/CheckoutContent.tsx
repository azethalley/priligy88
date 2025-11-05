import {
  cartItems,
  cartTotal,
  removeInvalidItems,
  cartOperations,
} from "@/cartStore";
import { useStore } from "@nanostores/react";
import { generatPayloadImageUrl } from "@/lib/utils";
import React, { useEffect, useState } from "react";

const CheckoutContent = () => {
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidItems, setInvalidItems] = useState<any[]>([]);
  const [isValidatingCart, setIsValidatingCart] = useState(true);
  const items = useStore(cartItems);
  const total = useStore(cartTotal);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Validate cart items when component mounts
  useEffect(() => {
    if (mounted && items && items.length > 0) {
      validateCartItems();
    }
  }, [mounted, items]);

  const validateCartItems = async () => {
    setIsValidatingCart(true);
    try {
      const response = await fetch("/api/static/products.json");
      const data = await response.json();
      const products = data.products;
      const validProductIds = products.map((p: any) => p.id);

      // Check for missing products
      const missingProducts = items.filter(
        (item) => !validProductIds.includes(item.id),
      );

      // Check for stock issues
      const stockIssues: any[] = [];
      for (const item of items) {
        const product = products.find((p: any) => p.id === item.id);
        if (product && product.stock < item.quantity) {
          stockIssues.push({
            ...item,
            availableStock: product.stock,
            requestedQuantity: item.quantity,
            issue: "insufficient_stock",
          });
        }
      }

      // Combine all invalid items
      const invalid = [
        ...missingProducts.map((item) => ({ ...item, issue: "not_available" })),
        ...stockIssues,
      ];

      setInvalidItems(invalid);

      if (invalid.length > 0) {
        const missingTitles = missingProducts.map((item) => item.title);
        const stockTitles = stockIssues.map(
          (item) =>
            `${item.title} (requested: ${item.requestedQuantity}, available: ${item.availableStock})`,
        );

        let errorMessage = "";
        if (missingTitles.length > 0) {
          errorMessage += `Some items are no longer available: ${missingTitles.join(", ")}. `;
        }
        if (stockTitles.length > 0) {
          errorMessage += `Insufficient stock: ${stockTitles.join(", ")}. `;
        }
        errorMessage += "Please remove or adjust these items to continue.";

        setError(errorMessage);
      }
    } catch (error) {
      // console.error("Error validating cart items:", error);
    } finally {
      setIsValidatingCart(false);
    }
  };

  const handleRemoveInvalidItems = () => {
    if (invalidItems.length > 0) {
      const validProductIds = items
        .filter(
          (item) => !invalidItems.some((invalid) => invalid.id === item.id),
        )
        .map((item) => item.id);

      removeInvalidItems(validProductIds);
      setInvalidItems([]);
      setError(null);
    }
  };

  const handleAdjustQuantity = (itemId: number, newQuantity: number) => {
    cartOperations.updateQuantity(itemId, newQuantity);
    // Re-validate cart after quantity change
    setTimeout(() => {
      validateCartItems();
    }, 100);
  };

  if (!mounted || isValidatingCart) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 dark:from-primary/10 dark:via-transparent dark:to-secondary/10 py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-lg">Validating your cart...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!items || items.length === 0) {
    if (typeof window !== "undefined") {
      window.location.href = "/products";
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 dark:from-primary/10 dark:via-transparent dark:to-secondary/10 py-12">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">結帳</h1>

          {/* Invalid Items Warning */}
          {invalidItems.length > 0 && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Issues with items in your cart
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>The following items have issues:</p>
                    <ul className="mt-2 list-disc list-inside space-y-1">
                      {invalidItems.map((item) => (
                        <li key={item.id} className="font-medium">
                          {item.title}
                          {item.issue === "not_available" && (
                            <span className="text-red-600 ml-2">
                              (No longer available)
                            </span>
                          )}
                          {item.issue === "insufficient_stock" && (
                            <span className="text-orange-600 ml-2">
                              (Requested: {item.requestedQuantity}, Available:{" "}
                              {item.availableStock})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2">
                      {invalidItems.some(
                        (item) => item.issue === "insufficient_stock",
                      ) &&
                      invalidItems.some(
                        (item) => item.issue === "not_available",
                      )
                        ? "Please adjust quantities or remove these items to continue with your checkout."
                        : invalidItems.some(
                              (item) => item.issue === "insufficient_stock",
                            )
                          ? "Please adjust quantities to available stock or remove these items to continue."
                          : "Please remove these items to continue with your checkout."}
                    </p>
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={handleRemoveInvalidItems}
                      className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Remove Invalid Items
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Order Summary */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4">訂單摘要</h2>
              <div className="space-y-4">
                {items.map((item) => {
                  const invalidItem = invalidItems.find(
                    (invalid) => invalid.id === item.id,
                  );
                  const isInvalid = !!invalidItem;
                  const isStockIssue =
                    invalidItem?.issue === "insufficient_stock";
                  const isNotAvailable = invalidItem?.issue === "not_available";

                  return (
                    <div
                      key={item.id}
                      className={`flex gap-4 py-4 border-b border-border last:border-0 ${
                        isInvalid
                          ? isStockIssue
                            ? "opacity-75 bg-orange-50"
                            : "opacity-50 bg-red-50"
                          : ""
                      }`}
                    >
                      <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-md border border-neutral-300 bg-neutral-300">
                        <img
                          className="h-full w-full object-cover"
                          src={generatPayloadImageUrl(item.image)}
                          alt={item.title}
                          width={80}
                          height={80}
                        />
                        {isInvalid && (
                          <div
                            className={`absolute inset-0 flex items-center justify-center ${
                              isStockIssue
                                ? "bg-orange-500 bg-opacity-20"
                                : "bg-red-500 bg-opacity-20"
                            }`}
                          >
                            <span
                              className={`text-xs font-bold ${
                                isStockIssue
                                  ? "text-orange-600"
                                  : "text-red-600"
                              }`}
                            >
                              {isStockIssue ? "LOW STOCK" : "UNAVAILABLE"}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between">
                        <div className="flex justify-between">
                          <div>
                            <h3
                              className={`font-medium ${
                                isInvalid
                                  ? isStockIssue
                                    ? "text-orange-600"
                                    : "text-red-600"
                                  : ""
                              }`}
                            >
                              {item.title}
                              {isNotAvailable && (
                                <span className="text-red-500 text-sm ml-2">
                                  (No longer available)
                                </span>
                              )}
                              {isStockIssue && (
                                <span className="text-orange-500 text-sm ml-2">
                                  (Only {invalidItem.availableStock} available)
                                </span>
                              )}
                            </h3>
                            <div className="text-sm text-muted-foreground">
                              <p>
                                Quantity: {item.quantity}
                                {isStockIssue && (
                                  <span className="text-orange-600 ml-2">
                                    (Available: {invalidItem.availableStock})
                                  </span>
                                )}
                              </p>
                              {isStockIssue && (
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    onClick={() =>
                                      handleAdjustQuantity(
                                        item.id,
                                        invalidItem.availableStock,
                                      )
                                    }
                                    className="bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-1 rounded text-xs font-medium transition-colors"
                                  >
                                    Adjust to {invalidItem.availableStock}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleAdjustQuantity(item.id, 0)
                                    }
                                    className="bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-medium transition-colors"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <p
                            className={`text-right ${
                              isInvalid
                                ? isStockIssue
                                  ? "text-orange-600"
                                  : "text-red-600"
                                : ""
                            }`}
                          >
                            ${(item.price * item.quantity).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4">
                  <div className="flex justify-between text-base font-medium">
                    <p>總計</p>
                    <p>${total.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Checkout Form */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4">訂單資訊</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();

                  // Prevent submission if there are invalid items
                  if (invalidItems.length > 0) {
                    setError(
                      "Please remove invalid items before proceeding with checkout.",
                    );
                    return;
                  }

                  setIsSubmitting(true);
                  setError(null);

                  const formData = new FormData(e.currentTarget);

                  try {
                    const response = await fetch("/api/checkout", {
                      method: "POST",
                      body: formData,
                    });

                    if (response.redirected) {
                      window.location.href = response.url;
                    } else if (response.ok) {
                      const result = await response.json();
                      if (result.error) {
                        setError(result.error);
                      }
                    } else {
                      const result = await response.json();
                      const errorMessage =
                        result.error || "Checkout failed. Please try again.";
                      setError(errorMessage);

                      // If the error is about invalid products, clear them from cart
                      if (errorMessage.includes("no longer available")) {
                        // Extract valid product IDs from the error message or fetch them
                        try {
                          const validProductsResponse = await fetch(
                            "/api/static/products.json",
                          );
                          const validProductsData =
                            await validProductsResponse.json();
                          const validProductIds =
                            validProductsData.products.map((p: any) => p.id);
                          removeInvalidItems(validProductIds);
                          setError(
                            "Some items in your cart are no longer available and have been removed. Please review your cart and try again.",
                          );
                        } catch (fetchError) {
                          // console.error(
                          //   "Error fetching valid products:",
                          //   fetchError,
                          // );
                        }
                      }
                    }
                  } catch (error) {
                    // console.error("Form submission error:", error);
                    setError(
                      "Network error. Please check your connection and try again.",
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium mb-2"
                  >
                    姓名
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-2 rounded-md form-input"
                    placeholder="中文姓名"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium mb-2"
                  >
                    電子郵件
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-2 rounded-md form-input"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium mb-2"
                  >
                    聯絡電話
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    className="w-full px-4 py-2 rounded-md form-input"
                    placeholder="0921-000-000"
                  />
                </div>

                <div>
                  <label
                    htmlFor="address"
                    className="block text-sm font-medium mb-2"
                  >
                    住家或超商門市名稱
                  </label>
                  <textarea
                    id="address"
                    name="address"
                    required
                    rows={3}
                    className="w-full px-4 py-2 rounded-md form-input"
                    placeholder="支持黑貓和7-11"
                  ></textarea>
                </div>

                <div>
                  <label
                    htmlFor="note"
                    className="block text-sm font-medium mb-2"
                  >
                    訂單備註 (選填)
                  </label>
                  <textarea
                    id="note"
                    name="note"
                    rows={2}
                    className="w-full px-4 py-2 rounded-md form-input"
                    placeholder="運送時的特別註記"
                  ></textarea>
                </div>

                <input
                  type="hidden"
                  name="cartItems"
                  value={JSON.stringify(items)}
                />
                <input type="hidden" name="total" value={total} />

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || invalidItems.length > 0}
                  className="w-full bg-primary text-primary-foreground rounded-md py-3 px-4 text-base font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? "處理中..."
                    : invalidItems.length > 0
                      ? "請先移除無效商品"
                      : "下單購買"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutContent;
