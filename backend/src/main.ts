import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  });

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port);
  console.log(`[RailGeometry] HTTP server listening on port ${port}`);
  console.log(`[RailGeometry] TCP gateway listening on port 8080`);
  console.log(`[RailGeometry] WebSocket gateway ready`);
}

bootstrap();
