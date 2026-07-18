import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProsController } from './pros.controller';
import { ProsService } from './pros.service';

@Module({
  imports: [AuthModule],
  controllers: [ProsController],
  providers: [ProsService],
  exports: [ProsService],
})
export class ProsModule {}
