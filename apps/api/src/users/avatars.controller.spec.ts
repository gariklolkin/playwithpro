import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StorageService } from '../storage/storage.service';
import { AvatarsController } from './avatars.controller';

describe('AvatarsController', () => {
  const storage = {
    presignGet: jest.fn().mockResolvedValue('https://signed.example/avatar'),
  };
  let controller: AvatarsController;
  const userId = '8f6f2c2e-0c6e-4e1b-9d3f-1a2b3c4d5e6f';
  const file = '0b1c2d3e-4f50-4617-8899-aabbccddeeff.webp';

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AvatarsController],
      providers: [{ provide: StorageService, useValue: storage }],
    }).compile();
    controller = moduleRef.get(AvatarsController);
  });

  it('redirects to a pre-signed URL for a well-formed key', async () => {
    await expect(controller.avatar(userId, file)).resolves.toEqual({
      url: 'https://signed.example/avatar',
    });
    expect(storage.presignGet).toHaveBeenCalledWith(
      `avatars/${userId}/${file}`,
      3600,
    );
  });

  it('rejects keys outside the avatar shape', async () => {
    await expect(
      controller.avatar(userId, '../videos/x.mp4'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.avatar(userId, 'file.exe')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.presignGet).not.toHaveBeenCalled();
  });
});
