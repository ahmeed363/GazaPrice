import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ParsedQuery {
    items?: {
        product?: string;
        brand?: string;
        size?: number;
        unit?: string;
    }[];
    location?: string;
    intent?: 'CHEAPEST' | 'CLOSEST' | 'BEST_DEAL' | 'SHOPPING_LIST';
}

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    private openai: OpenAI;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        }
    }

    async search(query: string) {
        this.logger.log(`Received search query: ${query}`);

        const parsed = await this.parseQuery(query);
        this.logger.log(`Parsed query: ${JSON.stringify(parsed)}`);

        if (parsed.intent === 'SHOPPING_LIST' || (parsed.items && parsed.items.length > 1)) {
            return this.handleShoppingList(parsed);
        }

        const item = parsed.items?.[0] || {};
        const results = await this.findPrices(item, parsed.location);
        const analyzedResults = this.detectAnomalies(results);
        const summary = this.generateSummary(parsed, analyzedResults);

        return {
            query: query,
            parsed_query: parsed,
            results: analyzedResults,
            ai_summary: summary,
            confidence: 0.95,
        };
    }

    private async handleShoppingList(parsed: ParsedQuery) {
        const listResults: any[] = [];
        for (const item of parsed.items || []) {
            const itemResults = await this.findPrices(item, parsed.location);
            const analyzed = this.detectAnomalies(itemResults);
            listResults.push({
                item,
                best_deal: analyzed[0] || null,
                alternatives: analyzed.slice(1, 3),
            });
        }

        const totalCost = listResults.reduce((acc, curr) => acc + (Number(curr.best_deal?.price) || 0), 0);

        return {
            parsed_query: parsed,
            type: 'SHOPPING_LIST',
            list: listResults,
            ai_summary: `وجدت لك أفضل الأسعار لكل صنف في قائمتك. إجمالي التكلفة التقديرية: ${totalCost} شيكل.`,
        };
    }

    private async parseQuery(query: string): Promise<ParsedQuery> {
        if (!this.openai) {
            this.logger.warn('OpenAI API key missing, using simple fallback parser');
            return this.fallbackParser(query);
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are a query parser for "GazaPrice AI". 
            Extract structured data from user input. Respond in JSON format.
            CRITICAL: Output 'product' names in ARABIC (e.g. 'خيار' not 'Cucumber').
            Handle multi-item "shopping list" queries by returning an array of items.
            Fields: items (array of {product, brand, size, unit}), location, intent.
            Example: "بدي سكر وكولا" -> {"items": [{"product": "سكر"}, {"product": "كوكاكولا"}], "intent": "SHOPPING_LIST"}`,
                    },
                    { role: 'user', content: query },
                ],
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0].message.content || '{}';
            return JSON.parse(content) as ParsedQuery;
        } catch (error) {
            this.logger.error('AI Parsing failed', error);
            return this.fallbackParser(query);
        }
    }

    private detectAnomalies(results: any[]) {
        if (results.length < 3) return results.map(r => ({ ...r, is_suspicious: false }));

        const prices = results.map(r => Number(r.price));
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

        return results.map(r => {
            const price = Number(r.price);
            // If price is 40% lower than average, mark as suspicious
            const is_suspicious = price < avg * 0.6;
            return { ...r, is_suspicious };
        });
    }

    private fallbackParser(query: string): ParsedQuery {
        const lower = query.trim().toLowerCase();
        const items: any[] = [];

        // Specific keyword matching
        if (lower.includes('كولا')) items.push({ product: 'كوكاكولا' });
        else if (lower.includes('نيدو')) items.push({ product: 'حليب نيدو' });
        else if (lower.includes('سكر')) items.push({ product: 'سكر' });
        else if (lower.includes('رز') || lower.includes('أرز')) items.push({ product: 'أرز' });
        else if (lower.includes('طحين') || lower.includes('دقيق')) items.push({ product: 'طحين' });

        // If no items found, treat the whole (short) query as the product
        if (items.length === 0 && lower.length > 1 && lower.length < 20) {
            items.push({ product: query.trim() });
        }

        // Original fallback had size/unit logic
        if (items.length === 1 && (lower.includes('لتر') || lower.includes('كجم'))) {
            if (lower.includes('1.5') || lower.includes('ونص')) items[0].size = 1.5;
            if (lower.includes('2.5')) items[0].size = 2.5;
        }

        return { items, intent: items.length > 1 ? 'SHOPPING_LIST' : 'CHEAPEST' };
    }

    async chat(message: string) {
        if (!this.openai) return "عذراً، خدمة الذكاء الاصطناعي غير متوفرة حالياً.";

        try {
            // 1. Identify search intent
            const parsed = await this.parseQuery(message);

            let context = "لم يتم العثور على بيانات في قاعدة البيانات لهذا الاستفسار.";

            // 2. Fetch real data if items are identified
            let allResults: any[] = [];

            if (parsed.items && parsed.items.length > 0) {
                for (const item of parsed.items) {
                    const prices = await this.findPrices(item, parsed.location);

                    if (prices.length > 0) {
                        const simplified = prices.map(p => ({
                            type: 'product_price',
                            product: p.product.name,
                            store: p.store.name,
                            location: `${p.store.city} - ${p.store.district || 'غير محدد'}`,
                            price: `${p.price} ${p.unit}`,
                        }));
                        allResults.push(...simplified);
                    }
                }
            }

            // 3. Fallback: Search RAW query if AI missed it (e.g. single word "khayar")
            if (allResults.length === 0) {
                // Try product search using raw message
                const rawProducts = await this.findPrices({ product: message });

                if (rawProducts.length > 0) {
                    allResults = rawProducts.map(p => ({
                        type: 'product_price',
                        product: p.product.name,
                        store: p.store.name,
                        location: `${p.store.city} - ${p.store.district || 'غير محدد'}`,
                        price: `${p.price} ${p.unit}`,
                    }));
                }
            }

            // 4. Fallback: Check if query mentions a store name directly
            if (allResults.length === 0) {
                const stores = await this.prisma.store.findMany({
                    where: {
                        name: { contains: message } // Simple match
                    }
                });
                if (stores.length > 0) {
                    allResults = stores.map(s => ({
                        type: 'store_info',
                        name: s.name,
                        location: `${s.city} - ${s.district || ''}`
                    }));
                }
            }

            if (allResults.length > 0) {
                context = `بيانات المتوفرة (منتجات أو متاجر):\n${JSON.stringify(allResults, null, 2)}`;
            }

            // 3. Generate grounded response
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are 'GazaPrice Assistant'. 
                        CRITICAL INSTRUCTION: Answer based ONLY on the provided Context Data.
                        - If the user asks for a price OR mentions a product name, check the Context. 
                        - MATCHING RULE: strict equality is NOT required. If user asks for "cucumber" and context has "cucumber 1kg", IT IS A MATCH. Report it.
                        - If the data exists, give the price, store name, and location clearly.
                        - If the data DOES NOT exist in Context, say "عذراً، لا تتوفر لدي معلومات عن هذا المنتج حالياً في قاعدة البيانات."
                        - Do NOT make up prices or stores.
                        - Answer in friendly Gaza dialect Arabic.
                        
                        Context Data:
                        ${context}`
                    },
                    { role: 'user', content: message }
                ],
            });
            return response.choices[0].message.content;
        } catch (error) {
            this.logger.error('Chat failed', error);
            return "حدث خطأ في الاتصال، حاول مرة أخرى.";
        }
    }

    async getSuggestions(query: string) {
        if (!query || query.length < 2) return [];

        const products = await this.prisma.product.findMany({
            where: {
                name: {
                    contains: query
                }
            },
            select: {
                name: true
            },
            distinct: ['name'],
            take: 10
        });

        return products.map(p => p.name);
    }

    private async findPrices(item: any, location?: string) {
        const productSearch = item.product || '';
        console.log('DEBUG findPrices item:', JSON.stringify(item));
        console.log('DEBUG findPrices productSearch:', productSearch);

        if (!productSearch) return [];

        const where: any = {
            product: {
                name: {
                    contains: productSearch,
                },
            },
        };

        if (location) {
            where.store = {
                city: {
                    contains: location,
                }
            };
        }

        console.log('Developing finding prices for:', JSON.stringify(where, null, 2));

        return this.prisma.priceRecord.findMany({
            where,
            include: {
                product: true,
                store: true,
            },
            orderBy: {
                price: 'asc',
            },
            take: 5,
        });
    }

    async parseOfferImage(base64Image: string) {
        if (!this.openai) {
            throw new Error('OpenAI API key missing');
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Extract products, prices, and store details from this image. 
                                CRITICAL: 
                                1. Extract the EXACT product name as written in text.
                                2. "جمبري" is Shrimp, "لحم" is Meat. Do not confuse them.
                                3. Identify the store name.
                                4. **LOCATION**: Extract the FULL address/location string found in the image. Do not truncate.
                                5. Handle Gaza dialect prices and units (e.g., "بـ 35" means 35 ILS).
                                6. **QUANTITY LOGIC**: If an offer is for multiple items (e.g., "5 for 10"), CALCULATE the price per single unit (10/5 = 2). Set "price" to 2, and "unit" to "piece (Deal: 5 for 10)".
                                
                                Respond in JSON format only: 
                                {
                                  "storeName": "string or null",
                                  "location": "string or null",
                                  "items": [
                                    {"productName": "string", "price": number, "unit": "string or null"}
                                  ]
                                } 
                                Use Arabic for product, store, and location names.`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`,
                                },
                            },
                        ],
                    },
                ],
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0].message.content || '{}';
            return JSON.parse(content);
        } catch (error) {
            this.logger.error('AI Vision parsing failed', error);
            throw error;
        }
    }

    async parseOfferText(text: string) {
        if (!this.openai) {
            throw new Error('OpenAI API key missing');
        }

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Extract products, prices, and store details from this text offer. 
                                CRITICAL: 
                                1. Extract the EXACT product name.
                                2. Identify the store name.
                                3. **LOCATION**: Extract the FULL address/location string as written (e.g., "Khan Yunis, Sea St, West of Jasser Bldg"). Do not truncate it to just the city.
                                4. Handle Gaza dialect prices (e.g., "بـ 35" means 35 ILS).
                                5. **QUANTITY LOGIC**: If an offer is for multiple items (e.g., "5 for 10"), CALCULATE the price per single unit (10/5 = 2). Set "price" to 2, and "unit" to "piece (Deal: 5 for 10)".
                                
                                Respond in JSON format only: 
                                {
                                  "storeName": "string or null",
                                  "location": "string or null",
                                  "items": [
                                    {"productName": "string", "price": number, "unit": "string or null"}
                                  ]
                                } 
                                Use Arabic for product, store, and location names.`
                    },
                    { role: "user", content: text },
                ],
                response_format: { type: 'json_object' },
            });

            const content = response.choices[0].message.content || '{}';
            return JSON.parse(content);
        } catch (error) {
            this.logger.error('AI Text parsing failed', error);
            throw error;
        }
    }

    private generateSummary(parsed: ParsedQuery, results: any[]) {
        if (results.length === 0) return 'لم أجد نتائج مطابقة لطلبك حالياً.';
        const best = results[0];
        let text = `أفضل سعر متوفر هو ${best.price} شيكل في ${best.store.name} (${best.store.city}).`;
        if (best.is_suspicious) {
            text += ' (تنبيه: هذا السعر يبدو منخفضاً جداً، قد يحتاج لتأكيد)';
        }
        return text;
    }
}
