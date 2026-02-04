
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const products = await prisma.product.findMany({
        where: {
            name: {
                contains: 'بصل'
            }
        },
        include: {
            prices: {
                include: {
                    store: true
                }
            }
        }
    });

    console.log(JSON.stringify(products, null, 2));
}

main()
    .catch(e => {
        throw e
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
