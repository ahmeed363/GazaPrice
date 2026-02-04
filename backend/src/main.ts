import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Force restart 2
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // <--- Enable CORS
  await app.listen(process.env.PORT ?? 3003);
  console.log(`Backend is running on: http://localhost:3003`);
}
bootstrap();
