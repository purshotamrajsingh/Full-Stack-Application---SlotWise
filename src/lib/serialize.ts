import { Prisma } from "@prisma/client";
import type { BookingDTO, Role, ReviewDTO } from "@/lib/types";

export const bookingInclude = {
  service: true,
  provider: { include: { user: { select: { name: true } } } },
  customer: { select: { id: true, name: true } },
  review: { include: { author: { select: { name: true } } } },
} satisfies Prisma.BookingInclude;

export type BookingFull = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

/** Maps a fully-included Prisma booking to the client-facing DTO. */
export function toBookingDTO(b: BookingFull): BookingDTO {
  const review: ReviewDTO | null = b.review
    ? {
        rating: b.review.rating,
        comment: b.review.comment,
        createdAt: b.review.createdAt.toISOString(),
        authorName: b.review.author.name,
      }
    : null;

  return {
    id: b.id,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    status: b.status as BookingDTO["status"],
    notes: b.notes,
    serviceId: b.serviceId,
    serviceName: b.service.name,
    category: b.service.category,
    price: b.service.price,
    durationMin: b.service.durationMin,
    providerId: b.providerId,
    providerName: b.provider.user.name,
    customerId: b.customerId,
    customerName: b.customer.name,
    createdAt: b.createdAt.toISOString(),
    review,
  };
}

export function assertRole(value: string): Role {
  if (value !== "ADMIN" && value !== "PROVIDER" && value !== "CUSTOMER") {
    throw new Error(`Invalid role: ${value}`);
  }
  return value;
}
