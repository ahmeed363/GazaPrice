import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('ai')
export class SearchController {
    constructor(private readonly searchService: SearchService) { }

    @Get('search')
    async search(@Query('q') query: string) {
        return this.searchService.search(query);
    }

    @Get('suggestions')
    async getSuggestions(@Query('q') query: string) {
        return this.searchService.getSuggestions(query);
    }

    @Post('parse-image')
    async parseImage(@Body('image') base64Image: string) {
        return this.searchService.parseOfferImage(base64Image);
    }

    @Post('parse-text')
    async parseText(@Body('text') text: string) {
        return this.searchService.parseOfferText(text);
    }

    @Post('chat')
    async chat(@Body('message') message: string) {
        return { reply: await this.searchService.chat(message) };
    }
}
