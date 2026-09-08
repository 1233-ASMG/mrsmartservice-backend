import { toLegacyProduct } from '../../../src/modules/products/application/mappers/product.mapper.js';

describe('ProductMapper', () => {
  it('maps prisma product to legacy shape', () => {
    const p: any = {
      productId: 7,
      name: 'X',
      description: 'D',
      techSheet: null,
      price: 12345,
      stock: 3,
      discountPercent: 10,
      category: 'Cat',
      imageUrl: '/uploads/a.png',
      videoUrl: null,
      active: true,
      discountStart: null,
      discountEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const out = toLegacyProduct(p);
    expect(out.product_id).toBe(7);
    expect(out.discount_percent).toBe(10);
    expect(out.image_url).toBe('/uploads/a.png');
  });

  it('fills nulls when optional prisma fields are missing', () => {
    const out = toLegacyProduct({
      productId: 1,
      name: 'Y',
      price: 10,
      stock: 1,
      active: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(out.description).toBeNull();
    expect(out.tech_sheet).toBeNull();
    expect(out.category).toBeNull();
    expect(out.image_url).toBeNull();
    expect(out.video_url).toBeNull();
    expect(out.active).toBe(false);
  });
});
