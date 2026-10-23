import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/client';

export const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,128}$/;

export class CreateUserDto {
  @ApiProperty({ example: 'jane.doe@inventory.local' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({
    description: '10-128 chars with at least one lower-case, upper-case letter and digit',
    example: 'Str0ngPassword',
  })
  @IsString()
  @MinLength(10)
  @Matches(PASSWORD_RULE, {
    message: 'password must contain upper-case, lower-case letters and a digit',
  })
  password!: string;

  @ApiPropertyOptional({ enum: Role, default: Role.OPERATOR })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
