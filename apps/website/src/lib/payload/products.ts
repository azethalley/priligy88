import type { Product } from "payload_app";
import { payload } from "../payload";

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ProductQuery {
  price?: {
    min: number;
    max: number;
  };
  brands?: string[];
  search?: string;
  categories?: string[];
}

interface ProductsResponse {
  products: any[];
  pageInfo: PageInfo;
  totalPages: number;
  totalDocs: number;
}

export async function getProducts({
  sortKey = "createdAt",
  reverse = false,
  query = {}, // Default to an empty object
  cursor,
}: {
  sortKey?: string;
  reverse?: boolean;
  query?: ProductQuery | null;
  cursor?: string;
}): Promise<ProductsResponse> {
  const payloadClient = await payload();
  // Base 'where' clause for all queries
  const where: any = {
    and: [{ published: { equals: true } }],
  };

  // --- Handle Relationship Queries (Brands and Categories) ---
  // If brand slugs are provided, find their IDs first.
  if (query?.brands && query.brands.length > 0) {
    const brandDocs = await payloadClient.find({
      collection: "brands",
      where: {
        slug: {
          in: query.brands,
        },
      },
      limit: query.brands.length,
      select: {
        slug: true,
      }, // Only fetch the ID
    });

    const brandIds = brandDocs.docs.map((doc) => doc.id);

    if (brandIds.length > 0) {
      where.and.push({
        brand: {
          in: brandIds,
        },
      });
    }
  }

  // If category slugs are provided, find their IDs first.
  if (query?.categories && query.categories.length > 0) {
    const categoryDocs = await payloadClient.find({
      collection: "product-categories",
      where: {
        slug: {
          in: query.categories,
        },
      },
      limit: query.categories.length,
      select: {
        slug: true,
      }, // Only fetch the ID
    });

    const categoryIds = categoryDocs.docs.map((doc) => doc.id);

    if (categoryIds.length > 0) {
      where.and.push({
        category: {
          in: categoryIds,
        },
      });
    }
  }

  // --- Handle Direct Field Queries ---

  // Handle price filter
  if (query?.price) {
    where.and.push({
      originalPrice: {
        greater_than_equal: query.price.min,
        less_than_equal: query.price.max,
      },
    });
  }

  // Handle search query for title and description
  if (query?.search) {
    where.and.push({
      or: [{ title: { contains: query.search } }],
    });
  }

  // If 'and' only contains the default published filter, we can remove it to avoid empty queries.
  if (where.and.length === 1 && where.and[0].published) {
    // Or just set it to a simpler object if no other filters are applied
    delete where.and;
    where.published = { equals: true };
  }

  try {
    const result = await payloadClient.find({
      collection: "products",
      where,
      sort: `${reverse ? "-" : ""}${sortKey}`,
      depth: 2, // Using depth 2 to populate brand, category, etc.
      limit: 12,
      page: cursor ? parseInt(cursor, 10) : 1, // Use 'page' for pagination
    });

    return {
      products: result.docs as Product[],
      pageInfo: {
        hasNextPage: result.hasNextPage,
        endCursor: result.nextPage ? result.nextPage.toString() : null,
      },
      totalPages: result.totalPages,
      totalDocs: result.totalDocs,
    };
  } catch (error) {
    console.error("Error fetching products:", error);
    return {
      products: [],
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
      totalPages: 0,
      totalDocs: 0,
    };
  }
}
export async function getCollectionProducts({
  collection,
  sortKey = "createdAt",
  reverse = false,
}: {
  collection: string;
  sortKey?: string;
  reverse?: boolean;
}) {
  const payloadClient = await payload();

  const products = await payloadClient.find({
    collection: "products",
    where: {
      published: {
        equals: true,
      },
      "category.slug": {
        equals: collection,
      },
    },
    sort: reverse ? `-${sortKey}` : sortKey,
    depth: 2,
  });

  return {
    products: products.docs,
    pageInfo: {
      hasNextPage: products.hasNextPage,
      endCursor: products.nextPage?.toString(),
    } as PageInfo,
  };
}

export async function getHighestProductPrice() {
  const payloadClient = await payload();

  const products = await payloadClient.find({
    collection: "products",
    where: {
      published: {
        equals: true,
      },
    },
    sort: "-originalPrice",
    limit: 1,
  });

  return products.docs[0]?.originalPrice || 0;
}

export async function getCollections() {
  const payloadClient = await payload();

  const categories = await payloadClient.find({
    collection: "product-categories",
  });

  return categories.docs;
}

export async function getVendors() {
  const payloadClient = await payload();

  const brands = await payloadClient.find({
    collection: "brands",
  });

  return brands.docs;
}

export async function getTags() {
  const payloadClient = await payload();

  const tags = await payloadClient.find({
    collection: "product-tags",
  });

  return tags.docs;
}

export async function getAllProducts() {
  const payloadClient = await payload();

  try {
    // First, get the total count to determine if we need pagination
    const countResult = await payloadClient.count({
      collection: "products",
      where: {
        published: {
          equals: true,
        },
      },
    });

    console.log(
      `Found ${countResult.totalDocs} published products in database`,
    );

    // If we have more than 1000 products, we need to paginate
    if (countResult.totalDocs <= 1000) {
      const { docs } = await payloadClient.find({
        collection: "products",
        where: {
          published: {
            equals: true,
          },
        },
        depth: 2,
        limit: 1000,
      });
      return docs;
    } else {
      // Handle pagination for large datasets
      const allProducts: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const result = await payloadClient.find({
          collection: "products",
          where: {
            published: {
              equals: true,
            },
          },
          depth: 2,
          limit: 1000,
          page: page,
        });

        allProducts.push(...result.docs);
        hasMore = result.hasNextPage;
        page++;

        console.log(
          `Fetched page ${page - 1}, total products so far: ${allProducts.length}`,
        );
      }

      return allProducts;
    }
  } catch (error) {
    console.error("Error in getAllProducts:", error);
    console.error(
      "This might be a database connectivity issue. Check your DATABASE_URI.",
    );

    // Return empty array instead of throwing to prevent build failures
    return [];
  }
}

export async function getProductBySlug(slug: string) {
  const payloadClient = await payload();

  try {
    console.log(`Searching for product with slug: "${slug}"`);

    // First, try exact match
    const { docs } = await payloadClient.find({
      collection: "products",
      where: {
        slug: { equals: slug },
        published: { equals: true },
      },
      depth: 2,
    });

    if (docs.length > 0) {
      console.log(`✅ Found product with slug: "${slug}" - ${docs[0].title}`);
      return docs[0];
    }

    // If not found, try to find by similar pattern (auto-correct slug)
    console.log(`❌ Product "${slug}" not found. Trying auto-correction...`);

    // Extract base parts for smart matching
    const slugParts = slug.split("-");
    const baseProduct = slugParts.slice(0, -1).join("-"); // Remove last part (usually number)

    const { docs: similarDocs } = await payloadClient.find({
      collection: "products",
      where: {
        and: [
          { published: { equals: true } },
          { slug: { contains: baseProduct } },
        ],
      },
      depth: 2,
      limit: 1, // Get the first match
    });

    if (similarDocs.length > 0) {
      const foundProduct = similarDocs[0];
      console.log(
        `🔄 Auto-corrected slug from "${slug}" to "${foundProduct.slug}"`,
      );
      console.log(`✅ Found product: ${foundProduct.title}`);
      return foundProduct;
    }

    // If still not found, try broader search
    const productName = slugParts[0]; // First part (e.g., "cialis")
    const { docs: broadDocs } = await payloadClient.find({
      collection: "products",
      where: {
        and: [
          { published: { equals: true } },
          {
            or: [
              { slug: { contains: productName } },
              { title: { contains: productName } },
            ],
          },
        ],
      },
      depth: 2,
      limit: 3,
    });

    if (broadDocs.length > 0) {
      console.log(
        `🔍 Found ${broadDocs.length} similar products for "${slug}":`,
      );
      broadDocs.forEach((product) => {
        console.log(`  - "${product.slug}" - ${product.title}`);
      });

      // Return the first match as fallback
      const fallbackProduct = broadDocs[0];
      console.log(`🎯 Using fallback: "${fallbackProduct.slug}"`);
      return fallbackProduct;
    }

    console.error(`❌ No products found matching "${slug}"`);
    return null;
  } catch (error) {
    console.error(`Error fetching product by slug "${slug}":`, error);
    return null;
  }
}

export async function getRelatedProducts(
  currentProductId: number,
  categoryId: number,
) {
  const payloadClient = await payload();
  const { docs } = await payloadClient.find({
    collection: "products",
    where: {
      "category.id": {
        equals: categoryId,
      },
      id: {
        not_equals: currentProductId,
      },
      published: {
        equals: true,
      },
    },
    limit: 8, // Fetch up to 4 related products
    depth: 2,
  });
  return docs;
}
