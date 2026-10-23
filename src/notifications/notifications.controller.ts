import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import type { Paginated } from '../common/dto/paginated.dto';
import { type Notification, Role } from '../generated/prisma/client';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@ApiForbiddenResponse({ type: ErrorResponseDto })
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List low-stock notifications (admin, manager)' })
  @ApiPaginatedResponse(NotificationResponseDto)
  findAll(@Query() query: ListNotificationsQueryDto): Promise<Paginated<Notification>> {
    return this.notifications.findAll(query);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (admin, manager)' })
  @ApiOkResponse({ type: NotificationResponseDto })
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<Notification> {
    return this.notifications.markRead(id);
  }
}
