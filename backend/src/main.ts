import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Force restart 2
  const app = await NestFactory.create(AppModule);
  app.enableCors(); // <--- Enable CORS
  const port = process.env.PORT || 3003;
  await app.listen(port);
  console.log(`Backend is running on port: ${port}`);
}
bootstrap();
