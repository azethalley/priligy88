// storage-adapter-import-placeholder
import { postgresAdapter } from '@payloadcms/db-postgres'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig, SharpDependency } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import Products from './collections/Products'
import Orders from './collections/Orders'
import ProductCategories from './collections/ProductCategories'
import ProductTags from './collections/ProductTags'
import Brands from './collections/Brands'
import BlogTags from './collections/BlogTags'
import BlogCategories from './collections/BlogCategories'
import Blogs from './collections/Blogs'
import ProductVariants from './collections/ProductVariants'
import ProductVariantMappings from './collections/ProductVariantMappings'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { uploadthingStorage } from '@payloadcms/storage-uploadthing'
import HeroSlides from './collections/HeroSlider'
import 'dotenv/config'

console.log(process.env.DATABASE_URI)
const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Determine which database adapter to use based on environment variable
const useMongoDB = process.env.USE_MONGODB === 'true'
const databaseAdapter = useMongoDB 
  ? mongooseAdapter({
      url: process.env.DATABASE_URI || '',
    })
  : postgresAdapter({
      pool: {
        connectionString: process.env.DATABASE_URI || '',
        max: 20, // Maximum number of connections in pool
        min: 2, // Minimum number of connections in pool
        idleTimeoutMillis: 10000, // Close connections after 10 seconds of inactivity
        connectionTimeoutMillis: 30000, // Maximum time to get connection before throwing error
      },
    })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    ProductCategories,
    ProductTags,
    Brands,
    Products,
    Orders,
    BlogTags,
    BlogCategories,
    Blogs,
    HeroSlides,
    ProductVariants,
    ProductVariantMappings,
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: databaseAdapter,
  sharp: sharp as SharpDependency,
  plugins: [
    payloadCloudPlugin(),
    // Only enable uploadthing if token is provided
    ...(process.env.UPLOADTHING_TOKEN
      ? [
          uploadthingStorage({
            collections: {
              media: true,
            },
            options: {
              token: process.env.UPLOADTHING_TOKEN,
              acl: 'public-read',
            },
          }),
        ]
      : []),
    seoPlugin({
      collections: ['blogs', 'products'],
      uploadsCollection: 'media',
      fields: ({ defaultFields }) => [
        ...defaultFields,
        {
          name: 'jsonLD',
          type: 'json',
          label: 'JSON LD Data',
          required: false,
        },
        {
          name: 'canonical',
          type: 'text',
          label: 'Canonical URL',
          required: false,
        },
      ],
    }),
    // storage-adapter-placeholder
  ],
})
