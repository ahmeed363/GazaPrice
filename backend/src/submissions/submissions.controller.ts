import { Controller, Post, Get, Body } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';

@Controller('submissions')
export class SubmissionsController {
    constructor(private readonly submissionsService: SubmissionsService) { }

    @Post()
    async create(@Body() body: any) {
        return this.submissionsService.createSubmission(body);
    }

    @Get('products')
    async getProducts() {
        return this.submissionsService.getProducts();
    }
}
