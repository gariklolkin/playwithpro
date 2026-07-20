import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Grip,
  Handedness,
  PlayerLevel,
  PlayingStyle,
} from '@playwithpro/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlayersService } from './players.service';

describe('PlayersService', () => {
  let service: PlayersService;

  const prisma = {
    playerProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  const storage = {
    objectUrl: jest.fn((key: string) => `http://s3.local/bucket/${key}`),
  };

  const baseProfile = {
    id: 'profile-1',
    userId: 'user-1',
    level: 'BEGINNER',
    style: null,
    yearsOfExperience: null,
    handedness: null,
    grip: null,
    about: '',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
  });

  describe('getProfile', () => {
    it('creates an empty profile on first access', async () => {
      prisma.playerProfile.findUnique.mockResolvedValue(null);
      prisma.playerProfile.create.mockResolvedValue(baseProfile);

      const profile = await service.getProfile('user-1');

      expect(prisma.playerProfile.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
      expect(profile.level).toBe(PlayerLevel.Beginner);
      expect(profile.about).toBe('');
    });

    it('returns the existing profile without creating', async () => {
      prisma.playerProfile.findUnique.mockResolvedValue({
        ...baseProfile,
        level: 'ADVANCED',
      });

      const profile = await service.getProfile('user-1');

      expect(prisma.playerProfile.create).not.toHaveBeenCalled();
      expect(profile.level).toBe(PlayerLevel.Advanced);
    });
  });

  describe('updateProfile', () => {
    it('maps shared enums to Prisma values and back', async () => {
      prisma.playerProfile.findUnique.mockResolvedValue(baseProfile);
      prisma.playerProfile.update.mockResolvedValue({
        ...baseProfile,
        level: 'INTERMEDIATE',
        style: 'ALL_ROUND',
        yearsOfExperience: 5,
        handedness: 'RIGHT',
        grip: 'SHAKEHAND',
      });

      const profile = await service.updateProfile('user-1', {
        level: PlayerLevel.Intermediate,
        style: PlayingStyle.AllRound,
        yearsOfExperience: 5,
        handedness: Handedness.Right,
        grip: Grip.Shakehand,
      });

      expect(prisma.playerProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: {
          level: 'INTERMEDIATE',
          style: 'ALL_ROUND',
          yearsOfExperience: 5,
          handedness: 'RIGHT',
          grip: 'SHAKEHAND',
          about: undefined,
        },
      });
      expect(profile.level).toBe(PlayerLevel.Intermediate);
      expect(profile.style).toBe(PlayingStyle.AllRound);
      expect(profile.handedness).toBe(Handedness.Right);
      expect(profile.grip).toBe(Grip.Shakehand);
    });

    it('clears nullable fields when null is sent', async () => {
      prisma.playerProfile.findUnique.mockResolvedValue({
        ...baseProfile,
        handedness: 'RIGHT',
      });
      prisma.playerProfile.update.mockResolvedValue(baseProfile);

      await service.updateProfile('user-1', {
        handedness: null,
        yearsOfExperience: null,
      });

      expect(prisma.playerProfile.update).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        data: {
          level: undefined,
          style: undefined,
          yearsOfExperience: null,
          handedness: null,
          grip: undefined,
          about: undefined,
        },
      });
    });
  });

  describe('getPlayerCard', () => {
    it('returns playing details with identity and avatar URL', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'AMATEUR',
        displayName: 'Anna',
        avatarKey: 'avatars/user-1/a.png',
        playerProfile: { ...baseProfile, level: 'COMPETITIVE' },
      });

      const card = await service.getPlayerCard('user-1');

      expect(card.displayName).toBe('Anna');
      expect(card.level).toBe(PlayerLevel.Competitive);
      expect(card.avatarUrl).toBe(
        'http://s3.local/bucket/avatars/user-1/a.png',
      );
    });

    it('lazily creates the profile for a player who never opened theirs', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        role: 'AMATEUR',
        displayName: 'Anna',
        avatarKey: null,
        playerProfile: null,
      });
      prisma.playerProfile.findUnique.mockResolvedValue(null);
      prisma.playerProfile.create.mockResolvedValue(baseProfile);

      const card = await service.getPlayerCard('user-1');

      expect(card.level).toBe(PlayerLevel.Beginner);
      expect(card.avatarUrl).toBeNull();
    });

    it('404s for a non-amateur or unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        role: 'PROFESSIONAL',
        displayName: 'Coach',
        avatarKey: null,
        playerProfile: null,
      });

      await expect(service.getPlayerCard('user-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getPlayerCard('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
