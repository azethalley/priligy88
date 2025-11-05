import React, { useState } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { cartOperations } from "@/cartStore";
import LoadingDots from "../loadings/LoadingDots";

interface EditItemQuantityButtonProps {
  productId: number;
  variantId?: string | number;
  currentQuantity: number;
  type: "plus" | "minus";
}

const EditItemQuantityButton: React.FC<EditItemQuantityButtonProps> = ({
  productId,
  variantId,
  currentQuantity,
  type,
}) => {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    try {
      const newQuantity =
        type === "plus" ? currentQuantity + 1 : currentQuantity - 1;
      cartOperations.updateQuantity(productId, newQuantity, variantId);
    } catch (error) {
      // console.error("Error updating quantity:", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      aria-label={type === "plus" ? "Increase quantity" : "Decrease quantity"}
      className={`ease flex h-full min-w-[36px] max-w-[36px] items-center justify-center rounded-full px-2 transition-all duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
        pending ? "cursor-not-allowed opacity-50" : ""
      }`}
    >
      {pending ? (
        <LoadingDots className="bg-black dark:bg-white" />
      ) : type === "plus" ? (
        <FaPlus className="h-4 w-4" />
      ) : (
        <FaMinus className="h-4 w-4" />
      )}
    </button>
  );
};

export default EditItemQuantityButton;
