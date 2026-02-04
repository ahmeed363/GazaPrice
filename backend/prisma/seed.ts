import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Start seeding...');

    // Clean data
    await prisma.priceRecord.deleteMany();
    await prisma.productAlias.deleteMany();
    await prisma.product.deleteMany();
    await prisma.store.deleteMany();

    // Create Stores
    const s1 = await prisma.store.create({ data: { name: 'سوبر ماركت أبو طلال', city: 'خانيونس' } });
    const s2 = await prisma.store.create({ data: { name: 'محلات الأمل', city: 'غزة' } });
    const s3 = await prisma.store.create({ data: { name: 'بقالة الياسمين', city: 'رفح' } });

    // Create Products
    const p1 = await prisma.product.create({
        data: {
            name: 'كوكاكولا',
            brand: 'Coca-Cola',
            aliases: { create: [{ alias: 'كولا' }] }
        }
    });

    const p2 = await prisma.product.create({
        data: {
            name: 'حليب نيدو 2.5 كجم',
            brand: 'Nestle',
            aliases: { create: [{ alias: 'نيدو' }] }
        }
    });

    const p3 = await prisma.product.create({
        data: {
            name: 'سكر 1 كجم',
            brand: 'العائلة',
        }
    });

    // Create Prices
    await prisma.priceRecord.createMany({
        data: [
            { productId: p1.id, storeId: s1.id, price: 6.0, unit: 'L' },
            { productId: p1.id, storeId: s2.id, price: 6.5, unit: 'L' },
            { productId: p2.id, storeId: s1.id, price: 120.0, unit: 'KG' },
            { productId: p3.id, storeId: s2.id, price: 5.0, unit: 'KG' },
        ]
    });

    console.log('Seeding finished.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
