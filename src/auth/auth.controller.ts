import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';

@ApiTags('auth')
@ApiUnauthorizedResponse({ type: ErrorResponseDto })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for an access/refresh token pair' })
  @ApiOkResponse({ type: TokenResponseDto })
  login(@Body() dto: LoginDto): Promise<TokenResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token (the old one is revoked)' })
  @ApiOkResponse({ type: TokenResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the session the refresh token belongs to' })
  @ApiNoContentResponse()
  logout(@CurrentUser() user: AuthUser, @Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(user, dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  me(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.users.findOne(user.id);
  }
}
