import type { APIRoute } from "astro";
import config from "@/config/config.json";
import { getAllProducts } from "@/lib/payload/products";
import { getAllBlogs } from "@/lib/blog";

const DEFAULT_SITE = "https://examplesite.com/";
const baseUrl = new URL(
  config.site.base_path ?? "/",
  config.site.base_url ?? DEFAULT_SITE,
);
const trailingSlash = Boolean(config.site.trailing_slash);

const staticRoutes: Array<{
  path: string;
  changefreq: string;
  priority: string;
}> = [
  { path: "", changefreq: "daily", priority: "1.0" },
  { path: "about", changefreq: "monthly", priority: "0.6" },
  { path: "contact", changefreq: "monthly", priority: "0.6" },
  { path: "products", changefreq: "weekly", priority: "0.8" },
  { path: "blog", changefreq: "weekly", priority: "0.7" },
  { path: "checkout", changefreq: "weekly", priority: "0.5" },
];

const ensureTrailingSlash = (value: string) =>
  value.endsWith("/") ? value : `${value}/`;
const stripTrailingSlash = (value: string) =>
  value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value;

const sanitizePath = (path: string) => path.replace(/^\//, "");

const formatUrl = (path = "") => {
  const normalized = sanitizePath(path);
  const url = new URL(normalized, baseUrl).toString();
  const isRoot = normalized.length === 0;

  if (trailingSlash) {
    return ensureTrailingSlash(url);
  }

  if (isRoot) {
    return stripTrailingSlash(url);
  }

  return url.endsWith("/") ? url.slice(0, -1) : url;
};

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildUrlEntry = ({
  loc,
  lastmod,
  changefreq,
  priority,
}: {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}) => `
  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const fallbackDate = () => new Date().toISOString();

async function buildProductEntries() {
  try {
    const products = await getAllProducts();
    return products
      .filter((product) => typeof product.slug === "string" && product.slug)
      .map((product) =>
        buildUrlEntry({
          loc: formatUrl(`products/${product.slug}`),
          lastmod:
            (product.updatedAt as string | undefined) ??
            (product.createdAt as string | undefined) ??
            fallbackDate(),
          changefreq: "weekly",
          priority: "0.9",
        }),
      );
  } catch (error) {
    console.error("Failed to build product sitemap entries:", error);
    return [];
  }
}

async function buildBlogEntries() {
  try {
    const blogs = await getAllBlogs();
    return blogs
      .filter((blog) => typeof blog.slug === "string" && blog.slug)
      .map((blog) =>
        buildUrlEntry({
          loc: formatUrl(`blog/${blog.slug}`),
          lastmod:
            (blog.updatedAt as string | undefined) ??
            (blog.createdAt as string | undefined) ??
            fallbackDate(),
          changefreq: "weekly",
          priority: "0.7",
        }),
      );
  } catch (error) {
    console.error("Failed to build blog sitemap entries:", error);
    return [];
  }
}

export const prerender = false;

export const GET: APIRoute = async () => {
  const timestamp = fallbackDate();

  const staticEntries = staticRoutes.map((route) =>
    buildUrlEntry({
      loc: formatUrl(route.path),
      lastmod: timestamp,
      changefreq: route.changefreq,
      priority: route.priority,
    }),
  );

  const [productEntries, blogEntries] = await Promise.all([
    buildProductEntries(),
    buildBlogEntries(),
  ]);

  const urlset = [
    ...staticEntries,
    ...productEntries,
    ...blogEntries,
  ].join("");

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}\n</urlset>`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=UTF-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

