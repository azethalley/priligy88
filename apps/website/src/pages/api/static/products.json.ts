import { getProducts, getAllProducts } from "@/lib/payload/products";

export async function GET() {
  //@ts-nocheck
  console.log("Database URI:", process.env.DATABASE_URI);

  try {
    // Fetch all products at build time
    const allProducts = await getAllProducts();

    // Return as a static JSON file
    return new Response(JSON.stringify({ products: allProducts }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

// Use SSR for dynamic product data
export const prerender = false;
