// Shared DTO contracts between the API layer and the React client.

export type Role = "ADMIN" | "PROVIDER" | "CUSTOMER";
export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export const ROLES: Role[] = ["ADMIN", "PROVIDER", "CUSTOMER"];
export const BOOKING_STATUSES: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  providerId?: string | null;
  createdAt: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  rating: number;
  reviewCount: number;
}

export interface ServiceDTO {
  id: string;
  name: string;
  category: string;
  description: string;
  durationMin: number;
  price: number;
  isActive: boolean;
  providers: ProviderSummary[];
  rating: number;
  reviewCount: number;
  bookingCount: number;
  nextAvailableAt: string | null;
}

export interface SlotDTO {
  startAt: string;
  endAt: string;
  available: boolean;
  /** Why a slot is unavailable — lets the UI offer waitlist joins on
   *  booking-held slots only ("past" lead-time slots are not watchable). */
  blockedBy?: "booking" | "lead" | "timeoff" | null;
}

/** Provider time-off window (holiday, sick day, partial-day block). */
export interface TimeOffDTO {
  id: string;
  startAt: string;
  endAt: string;
  reason: string;
  /** Number of active bookings falling inside the window (provider view). */
  conflicts: number;
  createdAt: string;
}

/** Mock email outbox entry shown in the header bell. */
export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  bookingId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** A customer's slot watch entry ("tell me when this frees up"). */
export interface WaitlistDTO {
  id: string;
  startAt: string;
  endAt: string;
  serviceId: string;
  serviceName: string;
  category: string;
  providerId: string;
  providerName: string;
  price: number;
  durationMin: number;
  notifiedAt: string | null;
  createdAt: string;
}

export interface ReviewDTO {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
}

export interface BookingDTO {
  id: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  notes: string | null;
  serviceId: string;
  serviceName: string;
  category: string;
  price: number;
  durationMin: number;
  providerId: string;
  providerName: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  review: ReviewDTO | null;
}

export interface AvailabilityWindow {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface AvailabilityDTO extends AvailabilityWindow {
  id: string;
}

export interface ProviderReviewEntry {
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
  serviceName: string;
}

/** Full public profile shown in the provider dialog (email omitted unless admin). */
export interface ProviderProfileDTO {
  id: string;
  userId: string;
  name: string;
  email?: string;
  bio: string;
  specialty: string;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  availability: AvailabilityWindow[];
  reviews: ProviderReviewEntry[];
  services: {
    id: string;
    name: string;
    category: string;
    price: number;
    durationMin: number;
  }[];
}

export interface TestimonialEntry {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
  serviceName: string;
  providerName: string;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
  refreshToken: string;
}

export interface DashboardKPIs {
  totalBookings: number;
  revenue: number;
  expectedRevenue: number;
  noShowRate: number;
  avgRating: number;
  activeCustomers: number;
  upcomingBookings: number;
  cancelRate: number;
  /** Previous-period comparison (same length window before the range). */
  prevRevenue: number;
  prevTotalBookings: number;
  prevNoShowRate: number;
  revenueDeltaPct: number | null;
  bookingsDeltaPct: number | null;
  noShowDeltaPct: number | null;
}

export interface DayPoint {
  date: string;
  label: string;
  bookings: number;
  revenue: number;
}

/** Cumulative completed revenue by day-offset: current range vs the range before it. */
export interface RevenueTrendPoint {
  offset: number;
  label: string;
  current: number;
  previous: number;
}

export interface ServiceRevenuePoint {
  service: string;
  category: string;
  revenue: number;
  bookings: number;
}

export interface HourPoint {
  hour: number;
  label: string;
  bookings: number;
}

export interface ProviderStatPoint {
  providerId: string;
  name: string;
  revenue: number;
  bookings: number;
  rating: number;
}

export interface StatusPoint {
  status: BookingStatus;
  count: number;
}

export interface CategoryPoint {
  category: string;
  revenue: number;
  bookings: number;
}

export interface DashboardDTO {
  range: number;
  kpis: DashboardKPIs;
  bookingsPerDay: DayPoint[];
  revenueTrend: RevenueTrendPoint[];
  revenueByService: ServiceRevenuePoint[];
  peakHours: HourPoint[];
  topProviders: ProviderStatPoint[];
  statusMix: StatusPoint[];
  categoryMix: CategoryPoint[];
  recentBookings: BookingDTO[];
}

/** One week of the provider's performance series (last 8 weeks). */
export interface ProviderWeekPoint {
  label: string;
  startISO: string;
  bookings: number;
  completed: number;
  noShows: number;
  revenue: number;
}

/** Provider's service mix row (top services by completed revenue). */
export interface ProviderServiceMixPoint {
  service: string;
  category: string;
  bookings: number;
  revenue: number;
}

/** Aggregates behind the provider portal's Insights tab. */
export interface ProviderAnalyticsDTO {
  kpis: {
    revenue30: number;
    bookings30: number;
    rating: number;
    reviewCount: number;
    /** Booked minutes / open minutes over the last 30 days (0–100). */
    utilizationPct: number;
    /** Share of distinct customers with 2+ bookings (null when unknown). */
    repeatCustomerPct: number | null;
    upcoming: number;
  };
  weekly: ProviderWeekPoint[];
  serviceMix: ProviderServiceMixPoint[];
  statusMix: StatusPoint[];
}

/** Admin-wide upcoming time-off window (staff view overview). */
export interface AdminTimeOffDTO {
  id: string;
  providerId: string;
  providerName: string;
  specialty: string;
  startAt: string;
  endAt: string;
  reason: string;
  conflicts: number;
}
