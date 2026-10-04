import { NextResponse } from "next/server";

/** GET /api — API index for documentation. */
export async function GET() {
  return NextResponse.json({
    name: "SlotWise API",
    version: "1.3.0",
    auth: "Bearer JWT (Authorization header) — access + refresh token pair",
    endpoints: {
      auth: [
        "POST /api/auth/register",
        "POST /api/auth/login",
        "POST /api/auth/refresh",
        "POST /api/auth/logout",
        "GET  /api/auth/me",
      ],
      services: [
        "GET  /api/services?q=&category=&minPrice=&maxPrice=&provider=&sort=",
        "POST /api/services (admin)",
        "PUT  /api/services/:id (admin)",
        "DELETE /api/services/:id (admin)",
      ],
      providers: [
        "GET  /api/providers?q=",
        "POST /api/providers (admin)",
        "GET  /api/providers/:id",
        "PATCH /api/providers/:id (admin)",
        "GET  /api/providers/:id/slots?date=&serviceId=",
        "GET/PUT /api/providers/me/availability",
        "GET  /api/providers/me/analytics (provider)",
        "GET/POST /api/providers/me/time-off",
        "DELETE /api/providers/me/time-off/:id",
      ],
      bookings: [
        "GET  /api/bookings?status=&from=&to=&q=&upcoming=&sort=",
        "POST /api/bookings (customer)",
        "PATCH /api/bookings/:id (reschedule, customer)",
        "DELETE /api/bookings/:id (cancel)",
        "PATCH /api/bookings/:id/status (provider/admin)",
        "POST /api/bookings/:id/review (customer)",
        "GET  /api/bookings/:id/calendar.ics",
      ],
      waitlist: [
        "GET  /api/waitlist (own watches)",
        "POST /api/waitlist (customer — watch a taken slot)",
        "DELETE /api/waitlist/:id (stop watching)",
      ],
      favorites: [
        "GET  /api/favorites (customer — hearted service IDs)",
        "POST /api/favorites (customer — heart a service)",
        "DELETE /api/favorites/:serviceId (customer — unheart)",
      ],
      notifications: [
        "GET  /api/notifications?limit= (own inbox)",
        "POST /api/notifications/read-all",
        "POST /api/notifications/:id/read (single item)",
      ],
      dashboard: [
        "GET /api/dashboard/summary?range= (admin)",
        "GET /api/dashboard/export?range= (admin, CSV)",
        "GET /api/admin/time-off (admin — closures overview)",
      ],
      misc: [
        "GET /api/categories",
        "GET /api/reviews/recent?limit=",
        "GET /api/activity?limit=",
        "GET /api/health",
      ],
    },
  });
}
