import { slugField } from '../utils/slug';
import { CollectionConfig } from 'payload';

const ProductTags: CollectionConfig = {
    slug: 'product-tags',
    access: {
        read: () => true, // Allow public read access for frontend
    },
    admin: {
        useAsTitle: 'name',
    },
    fields: [
        {
            name: 'name',
            type: 'text',
            required: true,
        },
        slugField("product-tags", "name")
    ],
};

export default ProductTags;
