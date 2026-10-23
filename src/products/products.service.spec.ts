import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from './products.service';

/** BOM graph: parent -> components */
function setup(graph: Record<string, string[]>, activeIds: string[]) {
  const tx = {
    product: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.filter((id) => activeIds.includes(id)).map((id) => ({ id }))),
      ),
    },
    bomItem: {
      findMany: jest.fn(({ where }: { where: { productId: { in: string[] } } }) =>
        Promise.resolve(
          where.productId.in.flatMap((parent) =>
            (graph[parent] ?? []).map((componentId) => ({ componentId })),
          ),
        ),
      ),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };
  const prisma = {
    product: { findUnique: jest.fn().mockResolvedValue({ id: 'A' }) },
    bomItem: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { service: new ProductsService(prisma as unknown as PrismaService), tx };
}

describe('ProductsService.setBom', () => {
  const item = (componentId: string) => ({ componentId, quantity: 1 });

  it('replaces the BOM when components are valid', async () => {
    const { service, tx } = setup({}, ['B', 'C']);
    await service.setBom('A', { items: [item('B'), item('C')] });
    expect(tx.bomItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 'A' } });
    expect(tx.bomItem.createMany).toHaveBeenCalled();
  });

  it('rejects a product listed as its own component', async () => {
    const { service } = setup({}, ['A']);
    await expect(service.setBom('A', { items: [item('A')] })).rejects.toThrow(
      'A product cannot be a component of itself',
    );
  });

  it('rejects duplicate components', async () => {
    const { service } = setup({}, ['B']);
    await expect(service.setBom('A', { items: [item('B'), item('B')] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects inactive or unknown components', async () => {
    const { service } = setup({}, ['B']);
    await expect(service.setBom('A', { items: [item('B'), item('Z')] })).rejects.toThrow(
      'All components must be existing, active products',
    );
  });

  it('rejects an indirect cycle (A -> B -> C -> A)', async () => {
    const { service, tx } = setup({ B: ['C'], C: ['A'] }, ['B']);
    await expect(service.setBom('A', { items: [item('B')] })).rejects.toThrow(
      'BOM would create a cycle',
    );
    expect(tx.bomItem.createMany).not.toHaveBeenCalled();
  });
});
