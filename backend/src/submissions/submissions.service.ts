import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubmissionsService {
    constructor(private prisma: PrismaService) { }

    async createSubmission(data: {
        productName: string;
        price: number;
        storeName: string;
        location?: string;
        unit?: string;
    }) {
        // 1. Find or create the product
        let product = await this.prisma.product.findFirst({
            where: { name: { contains: data.productName } },
        });

        if (!product) {
            product = await this.prisma.product.create({
                data: { name: data.productName },
            });
        }

        // 2. Find or create the store
        let store = await this.prisma.store.findFirst({
            where: { name: { contains: data.storeName } },
        });

        if (!store) {
            store = await this.prisma.store.create({
                data: {
                    name: data.storeName,
                    city: data.location || 'غير محدد',
                },
            });
        } else if (store.city === 'غير محدد' && data.location) {
            store = await this.prisma.store.update({
                where: { id: store.id },
                data: { city: data.location }
            });
        }

        // 3. In this MVP, we automatically create a PriceRecord
        return this.prisma.priceRecord.create({
            data: {
                productId: product.id,
                storeId: store.id,
                price: data.price,
                unit: data.unit || 'piece',
                updatedAt: new Date(),
            },
        });
    }

    async getProducts() {
        return this.prisma.product.findMany({
            include: {
                prices: {
                    include: {
                        store: true
                    },
                    orderBy: {
                        updatedAt: 'desc'
                    }
                }
            },
            orderBy: {
                name: 'asc'
            }
        });
    }
}
