import type { Bootstrap, OrderDetail } from "./api";
import type { ArchiveEntityType } from "./workshop-api";

export type ArchiveRecord = { entityType: ArchiveEntityType; id: string };

function ids(records: ArchiveRecord[], type: ArchiveEntityType) {
  return new Set(records.filter((record) => record.entityType === type).map((record) => record.id));
}

export function filterBootstrap(data: Bootstrap, records: ArchiveRecord[]): Bootstrap {
  const customerIds = ids(records, "CUSTOMER");
  const productIds = ids(records, "PRODUCT");
  const materialIds = ids(records, "MATERIAL");
  const orderIds = ids(records, "ORDER");
  return {
    ...data,
    customers: data.customers.filter((row) => !customerIds.has(row.id)),
    products: data.products.filter((row) => !productIds.has(row.id)),
    materials: data.materials.filter((row) => !materialIds.has(row.id)),
    orders: data.orders.filter((row) => !orderIds.has(row.id)),
    dashboard: {
      ...data.dashboard,
      lateOrders: data.dashboard.lateOrders.filter((row) => !orderIds.has(row.id)),
      dueSoon: data.dashboard.dueSoon.filter((row) => !orderIds.has(row.id))
    }
  };
}

export function filterOrderDetail(order: OrderDetail, records: ArchiveRecord[]): OrderDetail {
  const paymentIds = ids(records, "PAYMENT");
  return { ...order, payments: order.payments.filter((payment) => !paymentIds.has(payment.id)) };
}
