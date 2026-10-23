import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: 'Bearer';
  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;
}
