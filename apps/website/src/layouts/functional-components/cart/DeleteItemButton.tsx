import React, { useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { cartOperations } from "@/cartStore";
import LoadingDots from "../loadings/LoadingDots";

interface DeleteItemButtonProps {
  productId: number;
  variantId?: string | number;
}

const DeleteItemButton: React.FC<DeleteItemButtonProps> = ({
  productId,
  variantId,
}) => {
  const [pending, setPending] = useState(false);

  const handleRemove = async () => {
    setPending(true);
    try {
      cartOperations.removeItem(productId, variantId);
    } catch (error) {
      // console.error("Error removing item:", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleRemove}
      disabled={pending}
      aria-label="Remove cart item"
      className="ease flex h-[17px] w-[17px] items-center justify-center rounded-full bg-neutral-500 transition-all duration-200 hover:bg-neutral-600"
    >
      {pending ? (
        <LoadingDots className="bg-white" />
      ) : (
        <FaXmark className="h-4 w-4 text-white" />
      )}
    </button>
  );
};

export default DeleteItemButton;
