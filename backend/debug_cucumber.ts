
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for products containing 'خيار'...");
    const products = await prisma.product.findMany({
        where: {
            name: { contains: 'خيار' }
        },
        include: { prices: true }
    });
    console.log("Found products:", JSON.stringify(products, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
