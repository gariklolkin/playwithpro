// Smoke-session seed for production/staging verification. Plain JS on purpose:
// runs inside the prod api image (no ts-node there):
//
//   kubectl -n playwithpro exec deploy/api -- node prisma/seed-smoke.js
//
// Idempotent. Creates:
//   - smoke-player@playwithpro.dev / Smoke-test-1  (AMATEUR, email-verified)
//   - smoke-coach@playwithpro.dev  / Smoke-test-1  (PROFESSIONAL, VERIFIED profile,
//     video-analysis service)
//   - a 2-minute test video object in S3 (videos/smoke/smoke.mp4, ffmpeg testsrc)
//   - a PAID_ESCROW video-analysis session (starts +24h) with HELD mock payment
//
// Open the room immediately after with: infra/scripts/room-window.sh --k8s open
const { PrismaClient } = require('@prisma/client');
const {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const argon2 = require('argon2');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const prisma = new PrismaClient();

const SMOKE_KEY = 'videos/smoke/smoke.mp4';
const PASSWORD = 'Smoke-test-1';

async function upsertUser(email, role, displayName) {
  const passwordHash = await argon2.hash(PASSWORD);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      role,
      displayName,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
}

async function ensureFixtureObject() {
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
  });
  const Bucket = process.env.S3_BUCKET;
  try {
    await s3.send(new HeadObjectCommand({ Bucket, Key: SMOKE_KEY }));
    console.log('fixture video already in bucket');
    return;
  } catch {
    /* missing — generate and upload */
  }
  console.log('generating 2-minute test video with ffmpeg...');
  const tmp = '/tmp/smoke.mp4';
  execFileSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=120:size=1280x720:rate=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp,
  ], { stdio: 'inherit' });
  await s3.send(new PutObjectCommand({
    Bucket,
    Key: SMOKE_KEY,
    Body: fs.readFileSync(tmp),
    ContentType: 'video/mp4',
  }));
  fs.unlinkSync(tmp);
  console.log('fixture video uploaded to bucket');
}

async function main() {
  const player = await upsertUser('smoke-player@playwithpro.dev', 'AMATEUR', 'Smoke Player');
  const coach = await upsertUser('smoke-coach@playwithpro.dev', 'PROFESSIONAL', 'Smoke Coach');

  const profile = await prisma.proProfile.upsert({
    where: { userId: coach.id },
    update: { status: 'VERIFIED' },
    create: {
      userId: coach.id,
      status: 'VERIFIED',
      bio: 'Smoke-test coach fixture.',
      languages: ['en'],
    },
  });

  const service = await prisma.proService.upsert({
    where: { profileId_type: { profileId: profile.id, type: 'VIDEO_ANALYSIS' } },
    update: { active: true },
    create: {
      profileId: profile.id,
      type: 'VIDEO_ANALYSIS',
      priceMinor: 3000,
      currency: 'EUR',
    },
  });

  await ensureFixtureObject();

  let video = await prisma.video.findFirst({
    where: { ownerId: player.id, originalKey: SMOKE_KEY },
  });
  if (!video) {
    video = await prisma.video.create({
      data: {
        ownerId: player.id,
        title: 'Smoke test video',
        status: 'READY',
        originalKey: SMOKE_KEY,
        playbackKey: SMOKE_KEY,
        durationSeconds: 120,
        width: 1280,
        height: 720,
        fps: 30,
        codec: 'h264',
        container: 'mp4',
      },
    });
  }

  const existing = await prisma.session.findFirst({
    where: {
      playerId: player.id,
      proProfileId: profile.id,
      status: { in: ['PAID_ESCROW', 'IN_PROGRESS', 'AWAITING_CONFIRMATION'] },
    },
  });
  if (existing) {
    console.log(`smoke session already active: ${existing.id} (room ${existing.roomSlug})`);
    return;
  }

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startsAt.setUTCMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

  const session = await prisma.$transaction(async (tx) => {
    const slot = await tx.availabilitySlot.upsert({
      where: { profileId_startsAt: { profileId: profile.id, startsAt } },
      update: { status: 'BOOKED' },
      create: {
        profileId: profile.id,
        startsAt,
        endsAt,
        status: 'BOOKED',
        source: 'MANUAL',
      },
    });
    const feeMinor = Math.round(service.priceMinor * 0.1);
    const created = await tx.session.create({
      data: {
        playerId: player.id,
        proProfileId: profile.id,
        serviceType: 'VIDEO_ANALYSIS',
        priceMinor: service.priceMinor,
        currency: service.currency,
        platformFeeMinor: feeMinor,
        slotId: slot.id,
        videoId: video.id,
        status: 'PAID_ESCROW',
        startsAt,
        endsAt,
        roomSlug: crypto.randomBytes(9).toString('hex'),
      },
    });
    await tx.payment.create({
      data: {
        sessionId: created.id,
        provider: 'mock',
        providerRef: `smoke-${created.id}`,
        amountMinor: service.priceMinor,
        currency: service.currency,
        feeMinor,
        status: 'HELD',
      },
    });
    return created;
  });

  console.log(`smoke session created: ${session.id}`);
  console.log(`room slug: ${session.roomSlug}, starts ${session.startsAt.toISOString()}`);
  console.log('force the join window open with: infra/scripts/room-window.sh --k8s open');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
