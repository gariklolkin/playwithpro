/**
 * Re-applies executed account deletions after a database restore:
 *
 *   node dist/src/account-data/reapply [saved-user-ids.txt]
 *
 * The optional file lists user ids (one per line) of deletions completed
 * after the backup was taken — saved from the live database before the
 * restore. Deletions the restored database records itself are always
 * included. Runs every erasure hook and the tombstone again; no emails.
 */
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AccountDeletionService } from './account-deletion.service';

async function main(): Promise<void> {
  const file = process.argv[2];
  const saved = file
    ? readFileSync(file, 'utf8')
        .split(/\s+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const applied = await app.get(AccountDeletionService).reapply(saved);
    console.log(`Re-applied ${applied.length} deletion(s).`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
