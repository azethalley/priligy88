import type { Blog } from "payload_app";
import { payload } from "@/lib/payload";

export const getBlogs = async () => {
  const payloadClient = await payload();
  const blogs = await payloadClient.find({
    collection: "blogs",
    limit: 10,
    sort: "-publishedDate",
  });
  return blogs;
};

export const getBlog = async (slug: string) => {
  const payloadClient = await payload();
  const blog = await payloadClient.find({
    collection: "blogs",
    where: {
      slug: {
        equals: slug,
      },
    },
  });
  return blog;
};

export const getAllBlogs = async (): Promise<Blog[]> => {
  const payloadClient = await payload();

  try {
    const { docs } = await payloadClient.find({
      collection: "blogs",
      where: {
        published: {
          equals: true,
        },
      },
      limit: 1000,
      sort: "-updatedAt",
    });

    return docs as Blog[];
  } catch (error) {
    console.error("Error fetching blogs for sitemap:", error);
    return [];
  }
};
