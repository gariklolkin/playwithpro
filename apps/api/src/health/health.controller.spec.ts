import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { isHealthy: jest.Mock };

  beforeEach(async () => {
    prisma = { isHealthy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('reports ok when the database is reachable', async () => {
    prisma.isHealthy.mockResolvedValue(true);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
  });

  it('throws ServiceUnavailableException when the database is unreachable', async () => {
    prisma.isHealthy.mockResolvedValue(false);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
