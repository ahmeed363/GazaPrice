
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const query = "بصل";
    console.log(`DEBUG: Searching DB for '${query}'...`);

    // 1. Direct DB Search
    const products = await prisma.product.findMany({
        where: {
            name: { contains: query }
        },
        include: { prices: { include: { store: true } } }
    });

    console.log("Direct DB Results:", JSON.stringify(products, null, 2));

    // 2. Simulation of findPrices logic (simplified)
    console.log("Simulating findPrices...");
    const searchWhere = {
        product: {
            name: { contains: query }
        }
    };

    const priceRecords = await prisma.priceRecord.findMany({
        where: searchWhere,
        include: {
            product: true,
            store: true
        },
        orderBy: { price: 'asc' },
        take: 5
    });

    console.log("findPrices Simulation Results:", priceRecords.length);
    if (priceRecords.length > 0) {
        console.log(JSON.stringify(priceRecords[0], null, 2));
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
