import { IsUUID } from 'class-validator';
import type { LeaveRoomRequest } from '@playwithpro/shared';

export class LeaveRoomDto implements LeaveRoomRequest {
  @IsUUID()
  attendanceId: string;
}
