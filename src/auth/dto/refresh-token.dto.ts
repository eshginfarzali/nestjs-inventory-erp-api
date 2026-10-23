import { ApiProperty } from '@nestjs/swagger';
import { IsJWT } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned by /auth/login or /auth/refresh' })
  @IsJWT()
  refreshToken!: string;
}
