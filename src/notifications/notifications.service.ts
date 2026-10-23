import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate, type Paginated } from '../common/dto/paginated.dto';
import type { Notification, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListNotificationsQueryDto): Promise<Paginated<Notification>> {
    const where: Prisma.NotificationWhereInput = query.unread ? { readAt: null } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async markRead(id: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.readAt) {
      return notification;
    }
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }
}
